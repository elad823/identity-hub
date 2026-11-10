// HTTP routes for creating a ticket and listing the signed-in user's tickets, one page at a time.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { countTickets, listTicketProjects, listTickets, type Ticket } from '../db.js';
import { requireUser } from '../auth.js';
import { createTicket, PROJECT_KEY_RE, ticketInput } from '../jira.js';

const listQuery = z.object({
  projectKey: z.string().toUpperCase().regex(PROJECT_KEY_RE, 'Invalid project key').optional(),
  page: z.coerce.number('Page must be a number').int().min(1, 'Page starts at 1').default(1),
  pageSize: z.coerce.number('Page size must be a number').int().min(1).max(50, 'Page size is at most 50').default(10),
});

function toJson(t: Ticket) {
  return { id: t.id, projectKey: t.project_key, issueKey: t.issue_key, issueUrl: t.issue_url, title: t.title, description: t.description, severity: t.severity, createdAt: t.created_at };
}

export default async function ticketRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    const user = requireUser(req);
    const { ticket, prioritySet } = await createTicket(user.id, ticketInput.parse(req.body));
    return reply.status(201).send({ ticket: toJson(ticket), prioritySet });
  });

  app.get('/', async (req) => {
    const user = requireUser(req);
    const { projectKey, page, pageSize } = listQuery.parse(req.query);
    return {
      tickets: listTickets(user.id, projectKey, pageSize, (page - 1) * pageSize).map(toJson),
      total: countTickets(user.id, projectKey),
      page,
      pageSize,
      projects: listTicketProjects(user.id),
    };
  });
}
