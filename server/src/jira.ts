// Every call to Jira Cloud lives here: site check, verify, project list, and error mapping.
import { z } from 'zod';
import { getConnection, insertTicket, type Ticket } from './db.js';
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

// Strict key format, checked before the key is used in any Jira request.
export const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]{1,9}$/;

// The one input shape for creating a ticket, used by the UI route and the public API.
export const ticketInput = z.object({
  projectKey: z.string('Project key is required').trim().toUpperCase().regex(PROJECT_KEY_RE, 'Project key looks like ABC (2 to 10 letters or digits)'),
  title: z.string('Title is required').trim().min(5, 'Title must be at least 5 characters').max(255, 'Title must be at most 255 characters'),
  description: z.string('Description is required').trim().min(1, 'Add a description').max(10_000, 'Description must be at most 10000 characters'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'Severity must be LOW, MEDIUM, HIGH or CRITICAL').default('MEDIUM'),
});
export type TicketInput = z.infer<typeof ticketInput>;

// ADF is built as an object, one paragraph per non-empty line. The text is never put into a string template.
function toAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  };
}

// Jira's default priority names. A site that renamed them, or a project without Priority on its create screen,
// makes Jira reject the field; createTicket then retries without it.
const PRIORITY: Record<TicketInput['severity'], string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Highest' };

function issueBody(input: TicketInput, withPriority: boolean) {
  return {
    fields: {
      project: { key: input.projectKey },
      summary: input.title,
      issuetype: { name: 'Task' },
      description: toAdf(input.description),
      labels: ['identityhub-nhi', `severity-${input.severity.toLowerCase()}`],
      ...(withPriority ? { priority: { name: PRIORITY[input.severity] } } : {}),
    },
  };
}

function fieldErrors(json: unknown): Record<string, string> {
  const parsed = z.object({ errors: z.record(z.string(), z.string()) }).safeParse(json);
  return parsed.success ? parsed.data.errors : {};
}

// Creates the issue with POST /rest/api/3/issue, then records it in our tickets table.
// prioritySet is false when Jira would not accept the Priority field and the ticket was created without it.
export async function createTicket(userId: string, input: TicketInput): Promise<{ ticket: Ticket; prioritySet: boolean }> {
  const creds = loadCreds(userId);
  let prioritySet = true;
  let { status, json } = await jiraFetch(creds, 'POST', '/rest/api/3/issue', issueBody(input, true));
  if (status === 400 && 'priority' in fieldErrors(json)) {
    prioritySet = false;
    ({ status, json } = await jiraFetch(creds, 'POST', '/rest/api/3/issue', issueBody(input, false)));
  }

  if (status === 401) {
    throw new AppError(409, 'JIRA_RECONNECT_REQUIRED', 'Jira rejected your saved credentials. Reconnect Jira.');
  }
  if (status === 403) {
    throw new AppError(403, 'JIRA_PERMISSION_DENIED', 'Your Jira account cannot create issues in this project');
  }
  // Jira answers 400 for a missing project and for a project the user cannot create issues in.
  if (status === 404 || (status === 400 && 'project' in fieldErrors(json))) {
    throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found, or you do not have access to it');
  }
  if (status === 400 || status === 422) {
    throw new AppError(400, 'JIRA_REJECTED', 'Jira did not accept this ticket. Check the project and try again.');
  }
  const created = z.object({ key: z.string() }).safeParse(json);
  if (status !== 201 || !created.success) throw unexpected();

  const ticket = insertTicket(userId, {
    project_key: input.projectKey,
    issue_key: created.data.key,
    issue_url: `${creds.siteUrl}/browse/${created.data.key}`,
    title: input.title,
    description: input.description,
    severity: input.severity,
  });
  return { ticket, prioritySet };
}
