// Starts the server: loads .env, opens the database and listens.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { initDb, rootDir } from './db.js';

const envFile = join(rootDir, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { buildApp } = await import('./app.js');
initDb(resolve(rootDir, process.env.DATABASE_PATH ?? './data/app.db'));
const app = await buildApp();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' });
