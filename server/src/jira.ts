// Every call to Jira Cloud lives here: site check, verify, project list, and error mapping.
import { z } from 'zod';
import { getConnection } from './db.js';
import { decrypt } from './crypto.js';
import { AppError } from './errors.js';

export type JiraCreds = { siteUrl: string; email: string; token: string };

// Only https://<name>.atlassian.net is accepted, so a user cannot point the server at another host.
const SITE_RE = /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/i;

export function normalizeSite(input: string): string {
  const url = input.trim().replace(/\/+$/, '');
  if (!SITE_RE.test(url)) {
    throw new AppError(400, 'JIRA_SITE_INVALID', 'Use your Jira Cloud URL, like https://yourteam.atlassian.net');
  }
  return url.toLowerCase();
}

// Loads and decrypts the user's saved Jira credentials.
export function loadCreds(userId: string): JiraCreds {
  const c = getConnection(userId);
  if (!c) throw new AppError(409, 'JIRA_NOT_CONNECTED', 'Connect your Jira account first');
  return { siteUrl: c.site_url, email: c.email, token: decrypt(c.token_enc) };
}

// Sends one request. Redirects are never followed. Only network problems and 3xx/5xx are thrown here;
// other statuses are returned so each caller can map them.
export async function jiraFetch(
  creds: JiraCreds,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${creds.siteUrl}${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new AppError(504, 'JIRA_TIMEOUT', 'Jira is not responding. Try again.');
    }
    throw new AppError(502, 'JIRA_UNAVAILABLE', 'Jira is not responding. Try again.');
  }
  if (res.status >= 300 && res.status < 400) {
    throw new AppError(502, 'JIRA_UNAVAILABLE', 'Jira is not responding. Try again.');
  }
  if (res.status >= 500) throw new AppError(502, 'JIRA_UNAVAILABLE', 'Jira is not responding. Try again.');
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

function unexpected(): AppError {
  return new AppError(502, 'JIRA_UNAVAILABLE', 'Jira is not responding. Try again.');
}

// Checks the credentials with GET /rest/api/3/myself and returns the person's display name.
export async function verify(creds: JiraCreds): Promise<string> {
  const { status, json } = await jiraFetch(creds, 'GET', '/rest/api/3/myself');
  if (status === 401 || status === 403) {
    throw new AppError(400, 'JIRA_AUTH_FAILED', 'Jira did not accept this email and token');
  }
  const parsed = z.object({ displayName: z.string() }).safeParse(json);
  if (status !== 200 || !parsed.success) throw unexpected();
  return parsed.data.displayName;
}

const projectPage = z.object({
  values: z.array(z.object({ key: z.string(), name: z.string() })),
  isLast: z.boolean().optional(),
});

// Lists projects with GET /rest/api/3/project/search (100 per page, at most 3 pages).
export async function listProjects(creds: JiraCreds): Promise<{ key: string; name: string }[]> {
  const projects: { key: string; name: string }[] = [];
  for (let startAt = 0; startAt < 300; startAt += 100) {
    const { status, json } = await jiraFetch(
      creds,
      'GET',
      `/rest/api/3/project/search?orderBy=key&maxResults=100&startAt=${startAt}`,
    );
    if (status === 401 || status === 403) {
      throw new AppError(409, 'JIRA_RECONNECT_REQUIRED', 'Jira rejected your saved credentials. Reconnect Jira.');
    }
    const parsed = projectPage.safeParse(json);
    if (status !== 200 || !parsed.success) throw unexpected();
    projects.push(...parsed.data.values);
    if (parsed.data.isLast !== false) break;
  }
  return projects;
}
