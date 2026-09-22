# Helpit

Daily command center for game producers at PlaySimple Games — tasks, Slack follow-ups, mail, release planning, feature tracking, resources, team outings. Next.js 15 (App Router) + TypeScript + Tailwind, single-user local-first app with a JSON store (`data/store.json`) that can back onto Vercel Blob in production.

See [README.md](README.md) for setup, modules, and hosting. See [TEAM.md](TEAM.md) for the Cryptogram team roster (roles, Slack IDs, mention defaults) — always use it for MoMs, Slack @mentions, owners, and CC; never mix in people from other PlaySimple games.

## No dummy data — ask first, todo what's missing

For **any** Helpit data change (releases, tasks, outings, mail, slack items, dashboard seeds, `store.json`, `db.ts`, etc.):

1. **Never invent placeholder values** — no fake dates, effort, names, statuses, copy, or example content.
2. **Ask first** — if the user didn't provide a field, batch the missing questions in one message before editing data.
3. **Todo fallback** — if you must proceed without an answer (user said "add it anyway", partial request, or they'll fill in later), **do not guess**. Instead add a **todo** on the **Tasks tab**:
   - `source: "manual"`, `status: "todo"`, `priority: "medium"`
   - Title: what info is needed (e.g. `Fill effort for Android 1.182 — Devs, QA`)
   - `description`: context (entity, field, link to release/item name)
   - `tags`: relevant area (`release`, `planning`, `outing`, etc.)
   - Leave optional fields unset — don't backfill with defaults unless the user gave them.

**Releases (when asked)** — ask for: platform + build, planned date, scope/items, status, spec %, effort per function (Product, UX, GD, Art, Tech Art, Devs, QA), blockers, actual date if shipped. Missing pieces → todos, not guesses.

**Other entities:**
- **Tasks** — title required; ask for due date, owner, priority if relevant.
- **Outings / events** — ask date, attendees, location, notes.
- **Imports (Slack, mail)** — only real extracted content; don't fabricate messages or follow-ups.
- **Any new list/card/seed** — empty state or real user data only.

Never silently default to 100% spec, sample effort tables, or lorem-style text.

## Minutes of Meeting (MoM)

When asked for any MoM, minutes, or meeting recap:

1. **Ask first** — batch every missing field in one message. Do not invent people, times, agenda, or action items.
2. **Use only what they give.** If they skip a field, leave it blank (or TBD only if they say so).
3. Also ask **channel** if unclear (Slack vs email vs Helpit).
4. Output in exactly this structure — no Topic section, no Notes section:

```
Minutes of Meeting

Agenda - 
Date and Time - 
Participants - 

Action items
• @Owner — task
• @Owner — task

CC:@Person @Person
```

Format rules: Participants are `@handles`/names space-separated on one line. Action items use `•` bullets with `@Owner — task` (em dash); multiple owners comma-separated. CC line starts with `CC:` then @handles, no space after the colon unless the user prefers otherwise. Keep tone professional but friendly.
