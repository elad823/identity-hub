# Decisions

(Completed in Phase 4b. Notes are added as they come up.)

## Change from the plan: server-side sessions
The plan used a stateless encrypted cookie (`@fastify/secure-session`). This app uses a `sessions` table instead. The cookie holds only a random 32-byte session ID. The table stores its SHA-256 hash, the user ID and an expiry time (8 hours). Logout deletes the row, so a session can be revoked on the server. `@fastify/cookie` replaces `@fastify/secure-session`, and `SESSION_KEY` is no longer needed.
