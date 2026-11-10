// Session helpers: the cookie holds a random ID, the sessions table holds its hash. requireUser guards routes.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createSession, deleteExpiredSessions, deleteSession, findSessionUser } from './db.js';
import { randomToken, sha256 } from './crypto.js';
import { AppError } from './errors.js';

const COOKIE = 'ih_session';
const SESSION_SECONDS = 8 * 60 * 60;

export function startSession(reply: FastifyReply, userId: string): void {
  deleteExpiredSessions(Date.now());
  const sessionId = randomToken();
  createSession(sha256(sessionId), userId, Date.now() + SESSION_SECONDS * 1000);
  reply.setCookie(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export function endSession(req: FastifyRequest, reply: FastifyReply): void {
  const sessionId = req.cookies[COOKIE];
  if (sessionId) deleteSession(sha256(sessionId));
  reply.clearCookie(COOKIE, { path: '/' });
}

export function requireUser(req: FastifyRequest): { id: string; email: string } {
  const sessionId = req.cookies[COOKIE];
  const user = sessionId ? findSessionUser(sha256(sessionId), Date.now()) : undefined;
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
  return user;
}
