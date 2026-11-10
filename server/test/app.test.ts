// Tests for the whole server, using Fastify's inject() so no real port is opened.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { findUserIdByApiKeyHash, getConnection, initDb } from '../src/db.js';
import { sha256 } from '../src/crypto.js';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  initDb(':memory:');
  app = await buildApp();
});

function cookieFrom(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'ih_session');
  return c ? `ih_session=${c.value}` : '';
}

async function register(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, password: 'password123' } });
  return { res, cookie: cookieFrom(res) };
}

describe('auth', () => {
  it('registers, reads me, logs out and the old cookie stops working', async () => {
    const { res, cookie } = await register('a@example.com');
    expect(res.statusCode).toBe(201);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.email).toBe('a@example.com');
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie }, payload: {} });
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects a wrong password with a clear message', async () => {
    await register('b@example.com');
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'b@example.com', password: 'wrong-password' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('Email or password is incorrect');
  });

  it('rejects non-JSON bodies on mutating routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'text/plain' }, payload: 'x' });
    expect(res.statusCode).toBe(415);
  });

  it('keeps two users separate', async () => {
    const a = await register('u1@example.com');
    const b = await register('u2@example.com');
    const meA = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: a.cookie } });
    const meB = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: b.cookie } });
    expect(meA.json().user.email).toBe('u1@example.com');
    expect(meB.json().user.email).toBe('u2@example.com');
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function connect(cookie: string, siteUrl = 'https://acme.atlassian.net', apiToken = 'secret-jira-token') {
  return app.inject({ method: 'PUT', url: '/api/jira/connection', headers: { cookie }, payload: { siteUrl, email: 'dana@acme.com', apiToken } });
}

describe('jira connection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stores the token encrypted and never returns it', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { displayName: 'Dana' }));
    vi.stubGlobal('fetch', fetchMock);
    const { cookie } = await register('jira1@example.com');
    const res = await connect(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('secret-jira-token');
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const stored = getConnection(me.json().user.id);
    expect(stored?.token_enc).toBeTruthy();
    expect(stored?.token_enc).not.toContain('secret-jira-token');
    expect(fetchMock).toHaveBeenCalledWith('https://acme.atlassian.net/rest/api/3/myself', expect.objectContaining({ redirect: 'manual' }));
  });

  it('rejects site URLs that are not https://name.atlassian.net without calling out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { cookie } = await register('jira2@example.com');
    for (const url of ['http://x.com', 'https://acme.atlassian.net.evil.com', 'http://acme.atlassian.net']) {
      const res = await connect(cookie, url);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('JIRA_SITE_INVALID');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a clear message when Jira rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, {})));
    const { cookie } = await register('jira3@example.com');
    const res = await connect(cookie);
    expect(res.json().error.message).toBe('Jira did not accept this email and token');
  });

  it('keeps each user connection private', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { displayName: 'Dana' })));
    const a = await register('jira4@example.com');
    const b = await register('jira5@example.com');
    await connect(a.cookie);
    const connB = await app.inject({ method: 'GET', url: '/api/jira/connection', headers: { cookie: b.cookie } });
    expect(connB.json()).toEqual({ connected: false });
    const projB = await app.inject({ method: 'GET', url: '/api/jira/projects', headers: { cookie: b.cookie } });
    expect(projB.json().error.code).toBe('JIRA_NOT_CONNECTED');
  });

  it('refuses to follow a redirect from Jira', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://evil.com' } })));
    const { cookie } = await register('jira6@example.com');
    const res = await connect(cookie);
    expect(res.statusCode).toBe(502);
  });
});

describe('tickets', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function connectedUser(email: string) {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { displayName: 'Dana' })));
    const u = await register(email);
    await connect(u.cookie);
    return u.cookie;
  }

  function createTicket(cookie: string, payload: object) {
    return app.inject({ method: 'POST', url: '/api/tickets', headers: { cookie }, payload });
  }

  it('creates a ticket with an ADF description and labels, then lists it', async () => {
    const cookie = await connectedUser('t1@example.com');
    const fetchMock = vi.fn(async () => jsonResponse(201, { id: '1', key: 'SEC-7' }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await createTicket(cookie, { projectKey: 'sec', title: 'Leaked service token', description: 'Line one\nLine two', severity: 'HIGH' });
    expect(res.statusCode).toBe(201);
    expect(res.json().ticket.issueUrl).toBe('https://acme.atlassian.net/browse/SEC-7');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue');
    const sent = JSON.parse(init.body).fields;
    expect(sent.project.key).toBe('SEC');
    expect(sent.labels).toEqual(['identityhub-nhi', 'severity-high']);
    expect(sent.description.type).toBe('doc');
    expect(sent.description.content).toHaveLength(2);
    const list = await app.inject({ method: 'GET', url: '/api/tickets?projectKey=SEC', headers: { cookie } });
    expect(list.json().tickets[0].title).toBe('Leaked service token');
  });

  it('answers 404 when the project does not exist', async () => {
    const cookie = await connectedUser('t2@example.com');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { errors: { project: 'valid project is required' } })));
    const res = await createTicket(cookie, { projectKey: 'NOPE', title: 'Some finding', description: 'Details' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('Project not found, or you do not have access to it');
  });

  it('validates the body and asks to connect Jira first', async () => {
    const cookie = await connectedUser('t3@example.com');
    const bad = await createTicket(cookie, { projectKey: 'SEC; DROP', title: 'abc', description: '' });
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().error.fields)).toEqual(['projectKey', 'title', 'description']);
    const { cookie: other } = await register('t4@example.com');
    const res = await createTicket(other, { projectKey: 'SEC', title: 'Some finding', description: 'Details' });
    expect(res.json().error.code).toBe('JIRA_NOT_CONNECTED');
  });

  it('does not show one user tickets to another', async () => {
    const a = await connectedUser('t5@example.com');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(201, { id: '2', key: 'SEC-8' })));
    await createTicket(a, { projectKey: 'SEC', title: 'Only for user A', description: 'Details' });
    const { cookie: b } = await register('t6@example.com');
    const list = await app.inject({ method: 'GET', url: '/api/tickets', headers: { cookie: b } });
    expect(list.json().tickets).toEqual([]);
  });
});

describe('public API', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function userWithKey(email: string) {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { displayName: 'Dana' })));
    const { cookie } = await register(email);
    await connect(cookie);
    const res = await app.inject({ method: 'POST', url: '/api/api-key', headers: { cookie }, payload: {} });
    return { cookie, apiKey: res.json().apiKey as string };
  }

  function post(apiKey: string | undefined, payload: object) {
    return app.inject({ method: 'POST', url: '/api/v1/findings', headers: apiKey ? { 'x-api-key': apiKey } : {}, payload });
  }

  it('creates a finding with a valid key and returns 201 with Location', async () => {
    const { apiKey } = await userWithKey('p1@example.com');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(201, { id: '9', key: 'SEC-9' })));
    const res = await post(apiKey, { projectKey: 'SEC', title: 'Stale service account', description: 'Unused for 400 days', severity: 'LOW' });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe('https://acme.atlassian.net/browse/SEC-9');
  });

  it('stores only a hash of the key', async () => {
    const { apiKey } = await userWithKey('p2@example.com');
    expect(findUserIdByApiKeyHash(apiKey)).toBeUndefined();
    expect(findUserIdByApiKeyHash(sha256(apiKey))).toBeTruthy();
  });

  it('returns 401 for a missing or wrong key', async () => {
    const body = { projectKey: 'SEC', title: 'Some finding', description: 'Details' };
    const missing = await post(undefined, body);
    const wrong = await post('ihk_wrong', body);
    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe('Invalid API key');
  });

  it('returns 400 with field messages for a bad body and 404 for a missing project', async () => {
    const { apiKey } = await userWithKey('p3@example.com');
    const bad = await post(apiKey, { projectKey: 'SEC', title: 'abc' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.fields.title).toBe('Title must be at least 5 characters');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, { errors: { project: 'valid project is required' } })));
    const missing = await post(apiKey, { projectKey: 'NOPE', title: 'Some finding', description: 'Details' });
    expect(missing.statusCode).toBe(404);
  });

  it('stops the old key working after it is replaced', async () => {
    const { cookie, apiKey } = await userWithKey('p4@example.com');
    await app.inject({ method: 'POST', url: '/api/api-key', headers: { cookie }, payload: {} });
    const res = await post(apiKey, { projectKey: 'SEC', title: 'Some finding', description: 'Details' });
    expect(res.statusCode).toBe(401);
  });
});
