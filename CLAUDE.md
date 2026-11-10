# IdentityHub PoC: rules for Claude Code

Read this file, then `IMPLEMENTATION_PLAN.md`.

## What this is
A **3-hour interview proof of concept**, not a production system. Logged-in users connect their own Jira Cloud account, create "NHI finding" tickets, and see their recent tickets. External systems can create tickets through an API-key-protected endpoint.

Priorities, in order:
1. The owner can **follow and explain every file**.
2. Every requirement in the plan is met.
3. **The app runs and shows something new after every phase.**
4. Production-readiness does not matter. Do not add it.

## Keep it small (hard rules)
- Target about 27 source files in total. If a design needs more, simplify the design.
- No monorepo, no shared package, no ORM, no migrations tool, no dependency injection, no repository/service/gateway layers, no classes where a function will do.
- Only the dependencies listed in the plan (including `@anthropic-ai/sdk` and `cheerio` for the digest). Ask before adding any other.
- Use plain SQL with `better-sqlite3` and `CREATE TABLE IF NOT EXISTS`.
- Frontend: React with `useState` and `useEffect` and plain CSS. No router, no state library, no UI kit.
- Every component that loads or submits data shows a loading state, an empty state and an error state with a clear, human message. Never show raw error codes or stack traces.
- Each file starts with a 1 to 2 line comment saying what it is for. Add comments only where the code is not obvious.
- No `any`. No commented-out code. No TODO comments (put unfinished work in the "Not done" section of `DECISIONS.md`).

## Structure
```
server/src: index.ts, app.ts, db.ts, auth.ts, jira.ts, crypto.ts, errors.ts, routes/*.ts
server/scripts: digest.ts (bonus: NHI Blog Digest)
client/src: main.tsx, App.tsx, api.ts, styles.css, components/*.tsx
```
- Routes only handle HTTP (read input, call helpers, return JSON).
- `db.ts` holds all SQL. `jira.ts` holds all calls to Jira. `crypto.ts` holds encryption and hashing.
- The browser never talks to Jira. Only the server does.

## Security musts (small list, do all of them)
1. Every query on user data includes `user_id`. Another user's resource returns 404.
2. Passwords hashed with `crypto.scrypt`. Never store or log plaintext secrets.
3. Jira tokens encrypted at rest with AES-256-GCM. Never sent to the browser or logged.
4. API keys stored as a SHA-256 hash and shown once.
5. The Jira site URL must match `https://<name>.atlassian.net` and requests must not follow redirects (SSRF).
6. Project keys validated with a strict regex before use. Jira descriptions built as ADF objects, never string-concatenated.
7. Session cookie: HttpOnly, SameSite=Lax, Secure in production. Mutating routes accept JSON only.
8. Error responses never include stack traces or raw Jira responses.

## Jira rules
- Verify every Atlassian endpoint against the current docs at developer.atlassian.com before coding it. Do not rely on memory.
- If a search endpoint is ever used, it is `POST /rest/api/3/search/jql` (the old `/search` was removed).

## Build workflow (all phases in one run)
The owner approves once, at the start. After that, build all phases in order without waiting between them. The phases still matter: each one is a separate commit and tag so the owner can read the history and run every step.

**Step 0: one approval, before any change.**
Read both files and inspect the repository. Reading is fine; creating, editing, deleting or installing is not yet. Then output, in under 15 lines: what you will build, anything unclear, and, if the repo already has code from an earlier plan, a list of what you would delete and what you would keep. Ask for the GitHub repository URL. Stop and wait for the owner to say "go".

**Step 1: for each phase (1, 2, 3, 4a, 4b), in order, without stopping:**
1. Print 2 to 3 lines saying what you are about to build. Do not wait for a reply.
2. Implement it.
3. Verify it: run the tests, start the app, and smoke-test the new feature (for example with `curl`). Fix failures before moving on.
4. Append a section to `docs/WALKTHROUGH.md` (see below).
5. Commit as `phase N: <short title>`, tag it `phase-N` (`phase-4a`, `phase-4b`), and push the commit and the tag to `origin`.
6. Move straight on to the next phase.
Every tag must leave the app runnable, so the owner can `git checkout phase-2` and see the app as it was after Phase 2.

**What each `docs/WALKTHROUGH.md` section contains** (plain language, short):
- what the phase added and which files it touched, one line each
- how one request flows through the code, step by step
- 2 to 3 sentences the owner can use to explain the phase in the interview
- how to run and try it, and one failure case to try

**Stop and ask the owner only if:**
- pushing to GitHub fails (authentication or permissions)
- two requirements conflict, or a choice would be expensive to reverse
- an action is needed that the owner did not approve in Step 0 (for example deleting something not on the list)
Otherwise keep going and record assumptions in `DECISIONS.md`.

**Secrets and real services.**
Never ask for or print secrets in chat. If `.env` already has real Jira or Anthropic values, you may verify against the real services. If it does not, test with fakes, keep going, and list every feature that was **not verified against the real service** in the final report. Never claim something works against Jira or the Anthropic API unless you actually ran it.

**Step 2: Finish (after Phase 4b). All of this is required.**
1. Run `npm test`, `npm run build`, and start the built app with `npm start`; smoke-test it.
2. Clone the pushed repository into a fresh temporary folder and follow the README exactly (install, create `.env` from `.env.example`, run the tests, build). Fix the README or the code if anything fails.
3. Scan for secrets: confirm `.env`, `data/` and `*.zip` are in `.gitignore`, and search tracked files and git history for keys, tokens and passwords. Report the result.
4. Check `README.md` and `DECISIONS.md` against the plan (sections 9 and 11 of `IMPLEMENTATION_PLAN.md`), including the **Not done** list and which source (feed or HTML) the digest used.
5. Create the compressed file with `git archive -o ../identityhub.zip HEAD`. List its contents and confirm it contains the README, `DECISIONS.md`, `docs/WALKTHROUGH.md` and `.env.example`, and does not contain `node_modules`, `.env`, `data/` or the `.git` folder.
6. Push the final commit and tag it `submission`.
7. Write the final report (format in section 11 of the plan) and stop.

## Commands (create these)
- `npm run dev`: server and client together (Vite proxies `/api` to the server)
- `npm test`, `npm run build`, `npm start` (one process serving the built client)
- `npm run digest`: the bonus NHI Blog Digest script (Phase 4b)
- `npm run gen:key`: prints a random base64 32-byte value for env keys
