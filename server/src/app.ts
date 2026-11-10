// Builds the Fastify app: plugins, JSON-only rule, routes, error handler and the built client.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rootDir } from './db.js';
import { AppError, errorHandler } from './errors.js';
import authRoutes from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.'),
  });

  // Mutating routes accept JSON only, which blocks cross-site form posts.
  app.addHook('preValidation', async (req) => {
    if (req.method !== 'GET' && !req.headers['content-type']?.startsWith('application/json')) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request as JSON.');
    }
  });

  app.setErrorHandler(errorHandler);
  await app.register(authRoutes, { prefix: '/api/auth' });

  const clientDir = join(rootDir, 'client', 'dist');
  const hasClient = existsSync(clientDir);
  if (hasClient) await app.register(fastifyStatic, { root: clientDir });

  app.setNotFoundHandler((req, reply) => {
    if (hasClient && req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  return app;
}
