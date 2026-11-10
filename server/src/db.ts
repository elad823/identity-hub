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
    CREATE TABLE IF NOT EXISTS jira_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      site_url TEXT NOT NULL,
      email TEXT NOT NULL,
      token_enc TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      key_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_key TEXT NOT NULL,
      issue_key TEXT NOT NULL,
      issue_url TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  // Databases created before descriptions were stored get the column added once.
  const cols = db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'description')) {
    db.exec("ALTER TABLE tickets ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
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

export type JiraConnection = { site_url: string; email: string; token_enc: string; display_name: string };

// One connection per user; saving again replaces it.
export function saveConnection(userId: string, c: JiraConnection): void {
  db.prepare(
    `INSERT INTO jira_connections (user_id, site_url, email, token_enc, display_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET site_url = excluded.site_url, email = excluded.email,
       token_enc = excluded.token_enc, display_name = excluded.display_name, created_at = excluded.created_at`,
  ).run(userId, c.site_url, c.email, c.token_enc, c.display_name, new Date().toISOString());
}

export function getConnection(userId: string): JiraConnection | undefined {
  return db
    .prepare('SELECT site_url, email, token_enc, display_name FROM jira_connections WHERE user_id = ?')
    .get(userId) as JiraConnection | undefined;
}

export type Ticket = {
  id: string;
  project_key: string;
  issue_key: string;
  issue_url: string;
  title: string;
  description: string;
  severity: string;
  created_at: string;
};

export function insertTicket(userId: string, t: Omit<Ticket, 'id' | 'created_at'>): Ticket {
  const ticket = { ...t, id: randomUUID(), created_at: new Date().toISOString() };
  db.prepare(
    `INSERT INTO tickets (id, user_id, project_key, issue_key, issue_url, title, description, severity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ticket.id, userId, ticket.project_key, ticket.issue_key, ticket.issue_url, ticket.title, ticket.description, ticket.severity, ticket.created_at);
  return ticket;
}

// One page of this user's tickets, newest first, optionally for one project.
export function listTickets(userId: string, projectKey: string | undefined, limit: number, offset: number): Ticket[] {
  return db
    .prepare(
      `SELECT id, project_key, issue_key, issue_url, title, description, severity, created_at FROM tickets
       WHERE user_id = ? AND (? IS NULL OR project_key = ?)
       ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, projectKey ?? null, projectKey ?? null, limit, offset) as Ticket[];
}

export function countTickets(userId: string, projectKey?: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND (? IS NULL OR project_key = ?)')
    .get(userId, projectKey ?? null, projectKey ?? null) as { n: number };
  return row.n;
}

// The project keys this user has tickets in, for the list filter.
export function listTicketProjects(userId: string): string[] {
  const rows = db.prepare('SELECT DISTINCT project_key FROM tickets WHERE user_id = ? ORDER BY project_key').all(userId) as {
    project_key: string;
  }[];
  return rows.map((r) => r.project_key);
}

// One key per user; saving a new one replaces (and so revokes) the old one.
export function saveApiKey(userId: string, keyHash: string, prefix: string): void {
  db.prepare(
    `INSERT INTO api_keys (user_id, key_hash, prefix, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET key_hash = excluded.key_hash, prefix = excluded.prefix, created_at = excluded.created_at`,
  ).run(userId, keyHash, prefix, new Date().toISOString());
}

export function getApiKeyInfo(userId: string): { prefix: string; created_at: string } | undefined {
  return db.prepare('SELECT prefix, created_at FROM api_keys WHERE user_id = ?').get(userId) as
    | { prefix: string; created_at: string }
    | undefined;
}

export function findUserIdByApiKeyHash(keyHash: string): string | undefined {
  const row = db.prepare('SELECT user_id FROM api_keys WHERE key_hash = ?').get(keyHash) as { user_id: string } | undefined;
  return row?.user_id;
}
