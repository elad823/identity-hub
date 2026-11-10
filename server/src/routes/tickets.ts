// HTTP routes for creating a ticket and listing the signed-in user's recent tickets.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listTickets } from '../db.js';
import { requireUser } from '../auth.js';
import { createTicket, PROJECT_KEY_RE, ticketInput } from '../jira.js';

const listQuery = z.object({ projectKey: z.string().toUpperCase().regex(PROJECT_KEY_RE, 'Invalid project key').optional() });

function toJson(t: ReturnType<typeof listTickets>[number]) {
  return { id: t.id, projectKey: t.project_key, issueKey: t.issue_key, issueUrl: t.issue_url, title: t.title, severity: t.severity, createdAt: t.created_at };
}

export default async function ticketRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const user = requireUser(req);
    const ticket = await createTicket(user.id, ticketInput.parse(req.body));
    return reply.status(201).send({ ticket: toJson(ticket) });
  });

  app.get('/', async (req) => {
    const user = requireUser(req);
    const { projectKey } = listQuery.parse(req.query);
    return { tickets: listTickets(user.id, projectKey).map(toJson) };
  });
}
