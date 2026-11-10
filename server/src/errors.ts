// AppError and the one error handler that turns every failure into the JSON shape from the plan.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'body';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

function send(reply: FastifyReply, status: number, code: string, message: string, fields?: Record<string, string>) {
  return reply.status(status).send({ error: { code, message, ...(fields ? { fields } : {}) } });
}

export function errorHandler(err: unknown, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof AppError) return send(reply, err.status, err.code, err.message, err.fields);
  if (err instanceof ZodError) return send(reply, 400, 'VALIDATION_FAILED', 'Fix the highlighted fields.', zodFields(err));
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 429) return send(reply, 429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.');
  if (status === 400 || status === 413 || status === 415) {
    return send(reply, 400, 'VALIDATION_FAILED', 'The request body must be valid JSON.');
  }
  req.log.error(err);
  return send(reply, 500, 'INTERNAL', 'Something went wrong');
}
