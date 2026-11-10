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
