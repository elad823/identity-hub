# Decisions

## Change from the plan: server-side sessions
The plan used a stateless encrypted cookie (`@fastify/secure-session`). This app uses a `sessions` table instead. The cookie holds only a random 32-byte session ID. The table stores its SHA-256 hash, the user ID and an expiry time (8 hours). Logout deletes the row, so a session can be revoked on the server. `@fastify/cookie` replaces `@fastify/secure-session`, and `SESSION_KEY` is no longer needed. The cookie is HttpOnly, SameSite=Lax, and Secure when `NODE_ENV=production`.

## Security notes
- **Tenant = user.** Every table that holds user data has `user_id` and every query uses it. Another user's resource is never returned. A production design would add an organization above the user.
- **Sessions:** server-side table (see above). Expired rows are removed on each login.
- **CSRF:** SameSite=Lax cookie plus JSON-only mutating routes (anything that is not `application/json` gets 415). A production design would add an explicit CSRF token.
- **Jira auth:** per-user API token, encrypted at rest with AES-256-GCM. The production path is OAuth 2.0 (3LO), which avoids users handling tokens.
- **SSRF:** the Jira site must match `https://<name>.atlassian.net`; Jira requests do not follow redirects and time out after 10 seconds. Project keys must match `^[A-Z][A-Z0-9_]{1,9}$`. Descriptions are built as ADF objects.
- **API keys:** random, shown once, stored as a SHA-256 hash. One key per user; replacing it revokes the old one.
- **Not production-ready by design:** no email verification, no password reset, no audit log, SQLite, single instance, in-memory rate limiting (10 login or register attempts per minute per IP).

## Scope decisions
- Jira Cloud only; any project the account can access (first 300 listed, any key can be typed); issue type `Task`; severity is a label (`severity-<level>`) plus the label `identityhub-nhi`; the ticket description is not stored locally.
- The list shows the 10 most recent tickets (no paging) from our own `tickets` table, so it only contains tickets created through this app.
- Wireframe: severity, title, created time and a Refresh button are built. The Status column, column sorting, Previous/Next and the "of N" count are not.
- Frontend state: plain React state and effects, no state library, because only the signed-in user, the connection state and the selected project are shared. Each component owns its loading, empty and error states.
- Jira answers 400 both for a missing project and for a project the user cannot create issues in, so both map to 404 "Project not found, or you do not have access to it".
- The public endpoint and the UI share one `createTicket` function and one Zod schema.
- Passwords need at least 8 characters. Emails are stored lowercase.

## Digest decisions
- Runs as a script (`npm run digest`) that calls our own `POST /api/v1/findings`.
- **Source used: the HTML fallback.** On 2026-11-10 the blog page had no RSS or Atom `<link rel="alternate">` and common feed paths (`/blog/rss.xml`, `/rss.xml`, `/feed`, `/blog/feed`, `/feed.xml` and others) returned 404. The script still tries the feed first, then takes the first `/blog/<slug>` link on the page.
- The title comes from the post's `<h1>` and the text from its `<p>` elements, capped at 12,000 characters (the page has no `<article>` or `<main>` tag).
- The article is treated as untrusted input: the system prompt tells the model to ignore instructions inside it and write at most 120 words of plain text.
- Duplicates are avoided with `data/digest-last-url.txt`. It is written only after the ticket was created.
- Scheduling is documented (cron line in the README), not built in.

## Assumptions
- A single local instance on one machine; the server listens on 127.0.0.1.
- Node 22 (uses `process.loadEnvFile` and built-in `fetch`).
- The owner enters Jira details in the app; only the digest needs values in `.env`.

## Not done
- Status column, column sorting, Previous/Next paging and the "of N" count in the ticket list.
- Live Jira status in the list (stretch goal).
- Dockerfile and GitHub Actions schedule (stretch goals).
- OAuth 2.0 (3LO) for Jira, organizations above users, email verification, password reset, audit log, explicit CSRF token.
- Automated tests for the React components. The digest summary call and the Jira and Anthropic calls are not tested against the real services in the automated tests (Jira is faked).
- No real Jira or Anthropic credentials were available while building, so connecting to a real Jira site, creating a real issue, and a real summary have not been verified (see the final report).
