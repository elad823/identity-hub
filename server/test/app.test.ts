// Tests for the whole server, using Fastify's inject() so no real port is opened.
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initDb } from '../src/db.js';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
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
