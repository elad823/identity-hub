// Opens SQLite, creates the tables and holds every SQL statement the app uses.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Repo root, the same whether running from src (tsx) or dist (built).
export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let db: Database.Database;

export type User = { id: string; email: string; password_hash: string };

export function initDb(path: string): void {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
  `);
}

export function createUser(email: string, passwordHash: string): User {
  const user = { id: randomUUID(), email, password_hash: passwordHash };
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    user.id,
    email,
    passwordHash,
    new Date().toISOString(),
  );
  return user;
}

export function findUserByEmail(email: string): User | undefined {
  return db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?').get(email) as User | undefined;
}

export function createSession(idHash: string, userId: string, expiresAt: number): void {
  db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)').run(idHash, userId, expiresAt);
}

// Returns the user for a live session, or undefined if the session is unknown or expired.
export function findSessionUser(idHash: string, now: number): { id: string; email: string } | undefined {
  return db
    .prepare(
      `SELECT users.id AS id, users.email AS email FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id_hash = ? AND sessions.expires_at > ?`,
    )
    .get(idHash, now) as { id: string; email: string } | undefined;
}

export function deleteSession(idHash: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash);
}

export function deleteExpiredSessions(now: number): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}
