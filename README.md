# identity-hub

A small proof of concept. A logged-in user connects their own Jira Cloud account, creates "NHI finding" tickets, and sees their recent tickets. External systems can create tickets through an API-key endpoint. A bonus script turns the latest NHI blog post into a ticket.

Stack: Node 22, TypeScript, Fastify, SQLite (`better-sqlite3`), React and Vite.

## Setup (4 commands)

```bash
git clone https://github.com/elad823/identity-hub.git && cd identity-hub
npm install
cp .env.example .env        # then put the output of `npm run gen:key` into ENCRYPTION_KEY
npm run dev
```

Open http://localhost:5173. The server runs on port 3000 and Vite proxies `/api` to it.

Other commands: `npm test`, `npm run build`, `npm start` (one process serving the built client on http://localhost:3000), `npm run digest`, `npm run gen:key`.

## Create a Jira API token

1. Open https://id.atlassian.com/manage-profile/security/api-tokens and choose **Create API token**.
2. Copy the token. You will paste it into the app (it is stored encrypted and never shown again).
3. You also need your Jira site URL (`https://yourteam.atlassian.net`) and the email of your Atlassian account.

## Try the UI

1. Register, then log in.
2. On the **Jira** tab enter the site URL, email and token. A wrong token shows "Jira did not accept this email and token".
3. On the **Create** tab pick a project from the list, or type a project key.
4. Fill in the form and submit. Open the link in the success message.
5. The **Tickets** tab lists your tickets (10 per page) with a project filter and a Refresh button.
6. The **API key** tab creates the key for the REST API.

## REST API

Generate a key on the **API key** tab (shown once), then:

```bash
curl -i -X POST http://localhost:3000/api/v1/findings \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <your key>' \
  -d '{"projectKey":"SEC","title":"Stale service account","description":"Unused for 400 days","severity":"LOW"}'
```

| Result | Status |
|---|---|
| Ticket created (`Location` header points to the Jira issue) | 201 |
| Invalid body (field messages in `error.fields`) | 400 |
| Missing or wrong key | 401 |
| Project not found, or no access | 404 |
| Jira not connected for the key owner | 409 |

`severity` is `LOW`, `MEDIUM` (default), `HIGH` or `CRITICAL`. Every error looks like `{"error":{"code":"...","message":"...","fields":{...}}}`.

## NHI Blog Digest (bonus)

Reads the latest post on https://www.oasis.security/blog, summarizes it with `claude-haiku-5-5`, and creates a ticket through the REST API above.

1. Start the app (`npm run dev` or `npm start`).
2. Generate an API key in the app and connect Jira.
3. Put `ANTHROPIC_API_KEY`, `DIGEST_API_KEY` and `DIGEST_PROJECT_KEY` in `.env`.
4. Run `npm run digest`. A second run prints "Already processed, nothing to do" until a new post appears (the last URL is kept in `data/digest-last-url.txt`).

To run it every Monday at 09:00:

```
0 9 * * 1 cd /path/to/identity-hub && npm run digest
```

## Tests

`npm test` runs the Vitest suite (auth, tenant isolation, Jira connection, tickets, public API, digest parsing). Jira is faked in the tests.

## More

- `DECISIONS.md`: scope decisions, assumptions and what is not done.
- `docs/WALKTHROUGH.md`: a plain-language tour of each phase. Check out a tag such as `phase-2` to see the app at that step.
