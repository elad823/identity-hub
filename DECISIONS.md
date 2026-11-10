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
- Jira Cloud only; any project the account can access (first 300 listed, any key can be typed); issue type `Task`; severity is sent as Jira's Priority field (LOW=Low, MEDIUM=Medium, HIGH=High, CRITICAL=Highest) and also as a label (`severity-<level>`) plus the label `identityhub-nhi`. If a project does not accept Priority (not on its create screen, or renamed priorities), the ticket is created without it and the UI and API say so (`prioritySet: false`); the ticket description is stored in our `tickets` table (added after the first version) so the list can show it.
- The Tickets tab lists tickets from our own `tickets` table (so only tickets created through this app), newest first, 10 per page, with a project filter and Previous/Next/page numbers. The server returns the total, so the UI shows "Showing 11-20 of 34".
- Wireframe: severity, title, created time, a Refresh button, Previous/Next paging and the "of N" count are built. The Status column and column sorting are not.
- Frontend: four tabs (Create, Tickets, Jira, API key) with plain React state, no router and no state library. Panels stay mounted and are only hidden, so the selected project and loaded lists survive tab switches. Only the signed-in user, the connection state and the selected project are shared. Each component owns its loading, empty and error states.
- Jira answers 400 both for a missing project and for a project the user cannot create issues in, so both map to 404 "Project not found, or you do not have access to it".
- The public endpoint and the UI share one `createTicket` function and one Zod schema.
- Passwords need at least 8 characters. Emails are stored lowercase.

## UI behavior beyond the happy path
- **Expired session:** `api.ts` tells `App` when a data call returns "please log in". The app returns to the login screen with the message "Your session ended" and forgets the old session's state (project, connection, API key shown on screen).
- **Timeouts and offline:** every request times out after 30 seconds with a clear message; a network failure says the server cannot be reached.
- **Unknown Jira connection:** the connection state is true, false or unknown. If the check fails, the Create tab says it is still checking instead of wrongly saying "not connected".
- **Replacing the API key** asks for confirmation (it breaks existing integrations and the digest) and the new key can be dismissed after copying.
- **Pagination** returns to the last existing page if the list shrinks, and a stale response never overwrites a newer one.
- **Forms** ignore a second submit while busy, clear old errors when switching between login and register, set browser autofill hints and mark invalid fields for screen readers.

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
- Status column and column sorting in the ticket list.
- Live Jira status in the list (stretch goal).
- Dockerfile and GitHub Actions schedule (stretch goals).
- OAuth 2.0 (3LO) for Jira, organizations above users, email verification, password reset, audit log, explicit CSRF token.
- Automated tests for the React components. The digest summary call and the Jira and Anthropic calls are not tested against the real services in the automated tests (Jira is faked).
- No real Jira or Anthropic credentials were available while building, so connecting to a real Jira site, creating a real issue, and a real summary have not been verified (see the final report).
