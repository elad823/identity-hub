// HTTP routes for register, login, logout and "who am I".
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUser, findUserByEmail } from '../db.js';
import { hashPassword, verifyPassword } from '../crypto.js';
import { endSession, requireUser, startSession } from '../auth.js';
import { AppError } from '../errors.js';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

// Tests run many requests from one address, so the limit is only strict outside tests.
const limit = { config: { rateLimit: { max: process.env.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } } };

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', limit, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    if (findUserByEmail(email)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    const user = createUser(email, await hashPassword(password));
    startSession(reply, user.id);
    return reply.status(201).send({ user: { id: user.id, email: user.email } });
  });

  app.post('/login', limit, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    const user = findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    startSession(reply, user.id);
    return { user: { id: user.id, email: user.email } };
  });

  app.post('/logout', async (req, reply) => {
    endSession(req, reply);
    return { ok: true };
  });

  app.get('/me', async (req) => ({ user: requireUser(req) }));
}
