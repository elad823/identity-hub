// HTTP routes for the signed-in user to see and (re)generate their API key. The key is shown once.
import type { FastifyInstance } from 'fastify';
import { getApiKeyInfo, saveApiKey } from '../db.js';
import { randomToken, sha256 } from '../crypto.js';
import { requireUser } from '../auth.js';

export default async function apiKeyRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const info = getApiKeyInfo(requireUser(req).id);
    return info ? { exists: true, prefix: info.prefix, createdAt: info.created_at } : { exists: false };
  });

  app.post('/', async (req, reply) => {
    const user = requireUser(req);
    const apiKey = `ihk_${randomToken(32)}`;
    const prefix = apiKey.slice(0, 8);
    saveApiKey(user.id, sha256(apiKey), prefix);
    return reply.status(201).send({ apiKey, prefix });
  });
}
