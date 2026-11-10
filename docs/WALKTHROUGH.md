# Walkthrough

Plain-language notes for each phase. Check out a tag (for example `git checkout phase-1`) to see the app at that step.

## Phase 1: skeleton, register, login, logout

**Added**
- `server/src/index.ts`: loads `.env`, opens the database, starts the server.
- `server/src/app.ts`: builds the Fastify app (cookies, rate limit, JSON-only rule, routes, serves the built client).
- `server/src/db.ts`: opens SQLite, creates `users` and `sessions`, holds all SQL.
- `server/src/auth.ts`: starts and ends sessions, `requireUser` guard.
- `server/src/crypto.ts`: scrypt password hashing, SHA-256, random tokens.
- `server/src/errors.ts`: `AppError` and the single error handler.
- `server/src/routes/auth.ts`: register, login, logout, me.
- `client/src/*`: `api.ts` fetch wrapper, `App.tsx`, `LoginForm.tsx`, plain CSS.
- `server/test/app.test.ts`: auth tests including two users not seeing each other.

**One request: `POST /api/auth/login`**
1. The browser sends JSON through `api.ts`. In dev, Vite proxies `/api` to the server.
2. A hook in `app.ts` rejects anything that is not `application/json`.
3. The route validates email and password with Zod, looks the user up in `db.ts`, and checks the password with `verifyPassword` (scrypt, constant-time compare).
4. `startSession` makes a random ID, stores only its SHA-256 in `sessions` with the user ID and an 8 hour expiry, and sets the ID as an HttpOnly cookie.
5. Later requests send the cookie. `requireUser` hashes it, looks up an unexpired row and returns the user, or throws 401.
6. Logout deletes the row, so a copied cookie stops working immediately.

**Explain it in the interview**
Passwords are hashed with scrypt, and the session cookie is just a random ID whose hash lives in a SQLite table, so logout really revokes it on the server. Every failure goes through one error handler, so the client always gets the same JSON shape and never a stack trace.

**Run and try**
`npm run dev`, open http://localhost:5173, register, reload (still signed in), log out.
Failure case: log in with a wrong password and see "Email or password is incorrect".

## Phase 2: connect Jira and pick a project

**Added**
- `server/src/crypto.ts`: `encrypt` / `decrypt` with AES-256-GCM (key from `ENCRYPTION_KEY`, checked at startup).
- `server/src/db.ts`: `jira_connections` table, `saveConnection`, `getConnection`.
- `server/src/jira.ts`: site URL check, `verify` (`GET /rest/api/3/myself`), `listProjects` (`GET /rest/api/3/project/search`), no redirects, 10 second timeout, error mapping.
- `server/src/routes/jira.ts`: `GET/PUT /api/jira/connection`, `GET /api/jira/projects`.
- `client/src/components/ConnectJira.tsx`: connect form, connected summary, project picker (`<input list>` plus `<datalist>`).

**One request: `PUT /api/jira/connection`**
1. `requireUser` finds the signed-in user from the cookie.
2. Zod checks the body. `normalizeSite` accepts only `https://<name>.atlassian.net`.
3. `verify` calls Jira `/myself` with Basic auth (email and token). Jira says 401 gives "Jira did not accept this email and token".
4. The token is encrypted (random IV, auth tag) and saved with the user ID. The response has the site, email and display name, never the token.
5. `GET /api/jira/projects` later decrypts the token on the server and asks Jira for the project list. The browser never talks to Jira.

**Explain it in the interview**
The Jira API token is encrypted with AES-256-GCM before it touches the database, and it is only decrypted in memory when the server calls Jira. The site URL must match `*.atlassian.net` and redirects are refused, so a user cannot make the server call another host.

**Run and try**
`npm run gen:key`, put the value in `.env` as `ENCRYPTION_KEY`, `npm run dev`, then use the Connect Jira card.
Failure case: enter `http://x.com` as the site and see the Jira Cloud URL message.

## Phase 3: create tickets and see recent ones

**Added**
- `server/src/jira.ts`: `ticketInput` (Zod, strict project key regex), `createTicket` (`POST /rest/api/3/issue`, ADF description built as an object, labels `identityhub-nhi` and `severity-<level>`, issue type `Task`).
- `server/src/db.ts`: `tickets` table, `insertTicket`, `listTickets` (always filtered by `user_id`, newest 10).
- `server/src/routes/tickets.ts`: `POST /api/tickets`, `GET /api/tickets?projectKey=`.
- `client/src/components/TicketForm.tsx`: the form with busy, field-error and banner states, disabled when Jira is not connected.
- `client/src/components/RecentTickets.tsx`: skeleton rows, empty state, error that keeps the old rows, Refresh button, links open in a new tab.

**One request: `POST /api/tickets`**
1. `requireUser` identifies the user. Zod validates and normalizes the body (project key must match `^[A-Z][A-Z0-9_]{1,9}$`).
2. `createTicket` loads and decrypts this user's Jira credentials (409 if none).
3. The server builds the issue JSON, with the description as ADF paragraph objects, and posts it to Jira.
4. Jira answers are mapped: 401 reconnect, 403 permission, 400 with a `project` error becomes 404 "Project not found, or you do not have access to it".
5. On success the title, key and link are saved in `tickets` with the user ID. The description is not stored. The route returns 201.
6. The list route reads only this user's rows, so another user's tickets are never visible.

**Explain it in the interview**
The UI route and (later) the public API share one `createTicket` function, so validation, Jira mapping and storage live in one place. User text only enters Jira as ADF nodes and strict-regex project keys, never as concatenated strings.

**Run and try**
Connect Jira, choose a project, fill the form, submit, open the link. Use Refresh in the list.
Failure case: type a project key that does not exist and submit. You should see "Project not found, or you do not have access to it".

## Phase 4a: REST API with an API key

**Added**
- `server/src/db.ts`: `api_keys` table (one key per user), `saveApiKey`, `getApiKeyInfo`, `findUserIdByApiKeyHash`.
- `server/src/auth.ts`: `requireApiKey` (hashes the `X-API-Key` header and looks it up).
- `server/src/routes/apiKey.ts`: `GET /api/api-key` (status and prefix only), `POST /api/api-key` (generate or replace, returns the key once).
- `server/src/routes/publicApi.ts`: `POST /api/v1/findings`.
- `client/src/components/ApiKeyPanel.tsx`: generate, show once, copy button.

**One request: `POST /api/v1/findings`**
1. The caller sends JSON and an `X-API-Key` header (no cookie).
2. `requireApiKey` computes SHA-256 of the header and finds the owner in `api_keys`. No match gives 401 "Invalid API key".
3. The same `ticketInput` Zod schema as the UI validates the body (400 with field messages).
4. The same `createTicket` function runs as for the UI, using the key owner's saved Jira connection. A missing project gives 404.
5. The server answers `201 Created` with a `Location` header pointing to the Jira issue.

**Explain it in the interview**
The API key is a random value shown once. Only its SHA-256 hash is stored, so a database leak does not leak working keys. The public endpoint and the UI share the same validation and ticket function, so there is one behavior to test.

**Run and try**
Generate a key in the UI, then:
```
curl -i -X POST http://localhost:3000/api/v1/findings \
  -H 'Content-Type: application/json' -H 'X-API-Key: <your key>' \
  -d '{"projectKey":"SEC","title":"Stale service account","description":"Unused for 400 days","severity":"LOW"}'
```
Failure cases: no key or a wrong key gives 401, a short title gives 400 with field messages, an unknown project gives 404.

## Phase 4b: NHI Blog Digest, tests and docs

**Added**
- `server/scripts/digest.ts`: the digest script (`npm run digest`).
- `server/test/app.test.ts`: now covers auth, isolation, Jira connection, tickets, public API and the digest parsers.
- `README.md`, `DECISIONS.md`, `.env.example` with the digest settings.

**One run of `npm run digest`**
1. Check that `ANTHROPIC_API_KEY`, `DIGEST_API_KEY` and `DIGEST_PROJECT_KEY` are set, or print one clear line and exit with code 1.
2. Fetch the blog page. `findFeedLink` looks for an RSS or Atom link; if there is one, `firstFeedEntry` reads its first entry. Otherwise `firstPostLink` takes the first `/blog/<slug>` link. (The Oasis blog has no feed, so the fallback is what runs.)
3. If the URL equals the one in `data/digest-last-url.txt`, print "Already processed, nothing to do" and stop.
4. Read the post (title from `<h1>`, text from `<p>`, at most 12,000 characters) and ask `claude-haiku-5-5` for a summary of at most 120 words. The system prompt says the article is untrusted.
5. POST the title and `summary + URL` to our own `/api/v1/findings` with the API key, severity `LOW`. Save the URL and print the Jira key and link.

**Explain it in the interview**
The digest is a separate script that uses the same public API as any outside system, so it proves the API works end to end. It does not trust the blog text: the model is told to ignore instructions in it, and the result goes to Jira only as plain text.

**Run and try**
Start the app, put the three settings in `.env`, run `npm run digest`, then run it again.
Failure case: stop the app and run it, or remove `DIGEST_API_KEY`. You get a single clear line and a non-zero exit code.
