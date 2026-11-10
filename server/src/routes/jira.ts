// HTTP routes for the user's Jira connection and project list.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getConnection, saveConnection } from '../db.js';
import { encrypt } from '../crypto.js';
import { requireUser } from '../auth.js';
import { listProjects, loadCreds, normalizeSite, verify } from '../jira.js';

const connectBody = z.object({
  siteUrl: z.string().min(1, 'Enter your Jira site URL'),
  email: z.string().trim().email('Enter the email of your Atlassian account'),
  apiToken: z.string().trim().min(1, 'Enter your Jira API token').max(500),
});

export default async function jiraRoutes(app: FastifyInstance) {
  // The token is never part of any response.
  app.get('/connection', async (req) => {
    const c = getConnection(requireUser(req).id);
    return c
      ? { connected: true, siteUrl: c.site_url, email: c.email, displayName: c.display_name }
      : { connected: false };
  });

  app.put('/connection', async (req) => {
    const user = requireUser(req);
    const body = connectBody.parse(req.body);
    const siteUrl = normalizeSite(body.siteUrl);
    const displayName = await verify({ siteUrl, email: body.email, token: body.apiToken });
    saveConnection(user.id, { site_url: siteUrl, email: body.email, token_enc: encrypt(body.apiToken), display_name: displayName });
    return { connected: true, siteUrl, email: body.email, displayName };
  });

  app.get('/projects', async (req) => ({ projects: await listProjects(loadCreds(requireUser(req).id)) }));
}
