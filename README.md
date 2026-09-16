# Helpit

Your daily command center — tasks, Slack follow-ups, mail, release planning, resources, team outings, and a context-aware assistant.

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

For localhost, API routes are open by default. When exposing Helpit beyond your machine:

```env
HELPIT_API_KEY=your-secret-key
NEXT_PUBLIC_HELPIT_API_KEY=your-secret-key
```

OAuth flows use CSRF `state` cookies. Callback routes stay public.

## Data

- `data/store.json` — dashboard state (gitignored)
- `data/slack.json`, `data/gmail.json` — OAuth tokens (gitignored)

## Integrations

- **Gmail** — Connect in Settings, sync from Mail
- **Slack** — OAuth + MCP import (`/api/slack/import`); background auto-sync is currently disabled in code (manual sync from Settings)
- **OpenAI** — Optional assistant (`OPENAI_API_KEY`)

Copy `.env.example` → `.env.local` to configure.

## Hosting (Vercel)

Next.js deploys natively. Dashboard/OAuth data cannot live on the function filesystem, so production uses a **private Vercel Blob** store (`store.json`, `gmail.json`, `slack.json`).

After deploy:

1. Set `NEXT_PUBLIC_APP_URL` (and Gmail/Slack redirect URIs) to the production URL.
2. Add the same callback URLs in Google Cloud and the Slack app.
3. Set `HELPIT_API_KEY` and `NEXT_PUBLIC_HELPIT_API_KEY` so APIs are not public.
