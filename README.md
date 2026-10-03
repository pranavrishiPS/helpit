# Helpit

Your daily command center — tasks, Slack follow-ups, mail, release planning, resources, team outings.

Built for game producers at PlaySimple Games.

## Quick start

**Prerequisite:** [Node.js 20+](https://nodejs.org/)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first run, `data/store.json` is created automatically.

## Modules

| Module | Description |
|--------|-------------|
| **Home** | Today's overview, stats, overdue alerts |
| **Tasks** | Full task list with filters |
| **Slack** | Track follow-ups, mark done, MCP import |
| **Mail** | Gmail inbox, sprint approvals, reminders |
| **Planning** | Release tracker, function costing, deadlines |
| **Feature tracker** | Feature specs, status, and delivery |
| **Resources** | Project docs, Figma links, references |
| **Outings** | Budget, attendance, expenses |
| **Settings** | Profile, Gmail/Slack OAuth, env help |

## Scripts

```bash
npm run dev      # Dev server
npm run build    # Production build
npm run lint     # ESLint
npm test         # Vitest unit tests
```

## Security

Locally (dev/test/`next build`) everything is open by default. **In production (Vercel or `NODE_ENV=production`, including `next start`) Helpit fails closed**: it returns 503 "Auth not configured" unless site sign-in is configured. `HELPIT_API_KEY` alone is not accepted, because the browser authenticates with the site-auth session and never sends the key.

- **Site sign-in (for the browser) — required in production** — set `SITE_AUTH_ALLOWED_EMAILS` and `SITE_AUTH_SECRET`. Only Google accounts with a verified email on the allow-list get a session cookie. `SITE_AUTH_SECRET` is required; it does not fall back to `GOOGLE_CLIENT_SECRET`. Setting the allow-list without the secret is treated as misconfigured (503 in production).
- **`HELPIT_API_KEY` (server-only, optional)** — for non-browser callers (scripts, curl) via the `x-helpit-api-key` header or `Authorization: Bearer`. Compared in constant time. Requests with a valid site-auth session skip this check, so setting it never locks the browser out. Do **not** create a `NEXT_PUBLIC_` copy: it would be bundled into browser JS.

OAuth flows use CSRF `state` cookies. Callback routes stay public.

## Data

- `data/store.json` — dashboard state (gitignored)
- `data/slack.json`, `data/gmail.json` — OAuth tokens (gitignored)

**Local and production data are separate.** Local dev and `next build` read/write `data/store.json`. Production reads/writes the private Vercel Blob store. The storage layer switches to Blob whenever `BLOB_READ_WRITE_TOKEN` is set (or `VERCEL=1`), so:

- Never put the production Blob token in `.env.local` under the name `BLOB_READ_WRITE_TOKEN`. Keep it under another name (e.g. `HELPIT_PROD_BLOB_TOKEN`) so a local run can't touch live data.
- After `vercel env pull`, remove/rename `BLOB_READ_WRITE_TOKEN` again.
- A failed or empty read of the production store is treated as an error, never as "missing" — the app will not re-seed defaults over live data.

## Integrations

- **Gmail** — Connect in Settings, sync from Mail
- **Slack** — OAuth + MCP import (`/api/slack/import`); background auto-sync is currently disabled in code (manual sync from Settings)

Copy `.env.example` → `.env.local` to configure.

## Hosting (Vercel)

Next.js deploys natively. Dashboard/OAuth data cannot live on the function filesystem, so production uses a **private Vercel Blob** store (`store.json`, `gmail.json`, `slack.json`).

After deploy:

1. Set `NEXT_PUBLIC_APP_URL` (and Gmail/Slack redirect URIs) to the production URL.
2. Add the same callback URLs in Google Cloud and the Slack app.
3. Set `SITE_AUTH_ALLOWED_EMAILS` and `SITE_AUTH_SECRET` (required; optionally also the server-only `HELPIT_API_KEY` for scripts) — production returns 503 without site auth.

### Deploy flow

Local → GitHub → Vercel is automatic:

1. Work on `master` locally; run `npm run lint`, `npm test` and `npm run build` (all use local data).
2. `git push origin master` — GitHub Actions (`.github/workflows/ci.yml`) runs lint, tests and build, and the Vercel Git integration deploys to production.
3. Check the **Vercel** status on the commit (or the Vercel dashboard) shows *Ready* before testing the live app. Hard-refresh (Ctrl+Shift+R) to pick up the new client bundle.

Data migrations in `src/lib/db.ts` run on the first store read after a deploy and are written back to the production store.
