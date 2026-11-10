// The public REST endpoint for external systems: create a finding ticket with an X-API-Key header.
import type { FastifyInstance } from 'fastify';
import { requireApiKey } from '../auth.js';
import { createTicket, ticketInput } from '../jira.js';

export default async function publicApiRoutes(app: FastifyInstance) {
  app.post('/findings', async (req, reply) => {
    const userId = requireApiKey(req);
    const { ticket, prioritySet } = await createTicket(userId, ticketInput.parse(req.body));
    return reply
      .status(201)
      .header('Location', ticket.issue_url)
      .send({ finding: { issueKey: ticket.issue_key, issueUrl: ticket.issue_url, projectKey: ticket.project_key, title: ticket.title, severity: ticket.severity, prioritySet } });
  });
}
