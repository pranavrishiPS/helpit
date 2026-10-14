# Release Calendar (from Google Sheet)

Source: Google Sheet "Cryptogram 6 WP", id `1r7M2HRio4Kg4dUIzPu_nkYqoO8N2rR5fqtnw8ehGQM8`, tab "Calendar" (gid `1763731072`). Read-only.

## 1. Problem
The real release calendar lives in the "Cryptogram 6 WP" sheet. Helpit's Planning tab is a separate, hand-entered copy (`store.releases`), so it drifts out of date and is entered twice. Other teams have no clean read-only view.

## 2. Goal
One "Release Calendar" tab that mirrors the sheet's Calendar tab exactly. It syncs when someone opens it, loads instantly from the last snapshot, and can be shared through a public read-only link. The hand-entered releases go away.

## 3. Scope
**In:** rename and move the route, a read-only sheet sync that reuses the Scrum Attendance Google OAuth tokens, a cached snapshot, the owner page, the public share page, Home dashboard widgets moved to sheet data, and removal of the old releases data, UI and API.
**Out:** writing to the sheet, background cron, cell colors and formatting, editing entries in Helpit, other tabs of the WP sheet, linking entries to Features or Tasks.

## 4. Routing and nav
- Nav label "Planning" becomes **"Release Calendar"**, with href `/release-calendar` (`src/lib/navigation.ts`). Keep the internal `ModuleId` `planning` and its icon (`src/lib/modules.ts`) to limit churn. The page header title is "Release Calendar".
- Move `src/app/planning` to `src/app/release-calendar`. `/planning` and `/planning/*` redirect to `/release-calendar` (non-permanent, in `next.config`).
- The 2027 Planning group (`/lrp-2027`) is unchanged.
- Home's "Planning" card link points to `/release-calendar`.

## 5. User flow
**Owner (signed in)**
1. Open Release Calendar. The last snapshot renders immediately: the current month in work-week rows (Week label plus Mon–Fri, the same layout as the sheet), with today highlighted.
2. If Google Sheets is connected, a sync starts automatically, once per page open (the same pattern as `src/app/mail/page.tsx`). The header shows "Syncing…". When it finishes, the view updates and shows "Synced <date, time>".
3. The header also has a **Sync now** button, an **Open sheet** link (new tab, the gid URL), and **Copy share link** (only when sharing is enabled, §9).
4. Prev / Today / Next moves between months. Navigation is limited to the months present in the snapshot.
5. Each day cell lists its entries in sheet order. A release heading (e.g. "Release 1.204") appears as a bold group title with its items beneath it. Other lines ("Holiday", "Outing", "LRP Brainstorming", "Skipped build by devs, no release") appear as plain lines.

**Shared viewer (no login)**
1. Open `/share/release-calendar/<token>`. The page has no sidebar, no app nav and no links into Helpit. It shows a title "Cryptogram Release Calendar", "Synced <time>" and the same read-only calendar.
2. The page renders the stored snapshot on the server, then fires one throttled sync (§7). If the sync returns newer data, the view updates.
3. There is no Sync now button, no Open sheet link and no account details.

## 6. Parsing rules (`src/lib/release-calendar-parse.ts`, a pure function with unit tests)
1. **Locate the tab by gid.** Call `spreadsheets.get` (fields `sheets.properties`) and find `sheetId == 1763731072`, then read `<title>!A:Z` with `values.get` (FORMATTED_VALUE). This keeps working if the tab is renamed.
2. **Header row:** any row where at least one cell in column B onward matches `^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), <MonthName> <1–31>$` (trimmed, case-insensitive month). Column A is the week label ("Week 42") and can be blank (the first block is). The header's day columns are the columns whose cell matched. Other columns in that block are ignored.
3. **Block:** the header row plus every following row up to the next header row. Rows before the first header are ignored.
4. **Cells:** for each day column, take the non-empty cells top to bottom. Split each cell on line breaks. Trim each line and drop empty lines. Keep the text verbatim (no case changes, no renaming).
5. **Grouping within a day column:** a line matching `^(iOS |Android )?Release\b` (case-insensitive) starts a group with that line as its `heading`. Following lines are that group's `items` until the next heading. Lines before the first heading form a group with no heading. Lines such as "Android 1.202 Catchup" are therefore items under the preceding heading.
6. **Column A text in non-header rows**, if present, is kept as a week note (shown under the week label).
7. **Year inference:** walk the headers in sheet order. Assign years monotonically: start at a candidate year Y0, and add one year whenever a header's first date is not later than the previous header's. Try Y0 from (current year − 5) to (current year + 1). Pick the Y0 where every parsed date's weekday matches its label. If several Y0 values match, pick the one whose range includes or is closest to today. This handles the Week 52/53 to Week 1 rollover and leap days. Check: "Wed, October 14" in Week 42 must resolve to 2026-10-14.
8. **Unresolvable dates:** if no Y0 gives zero mismatches, use the Y0 with the fewest mismatches. Add a warning for each mismatched header (`"Week 42: 'Wed, October 14' does not match weekday"`). Still show the block. Never drop data silently.
9. **Week number:** parse `Week (\d+)` from column A when present. It is for display only and is never computed or filled in.

## 7. Data and sync
**Snapshot file** (not in `store.json`, which keeps the main store small and keeps share responses isolated): `release-calendar.json` via `json-persist` (local file, Blob in production), like `scrum-sheet-oauth.json`.

```
ReleaseCalendarEntryGroup { heading?: string; items: string[] }
ReleaseCalendarDay  { date: "yyyy-MM-dd"; label: string /* raw "Mon, October 12" */; groups: ReleaseCalendarEntryGroup[] }
ReleaseCalendarWeek { label: string /* raw col A, may be "" */; weekNumber?: number; note?: string; days: ReleaseCalendarDay[] }
ReleaseCalendarSnapshot {
  spreadsheetId: string; sheetGid: number; sheetTitle: string;
  syncedAt?: string;        // last successful sync
  lastAttemptAt?: string; lastError?: string;
  weeks: ReleaseCalendarWeek[]; warnings: string[];
}
```
Add these types to `src/lib/types.ts`. Put the spreadsheet id and gid in one constants module, not env vars.

**Sync (`src/lib/release-calendar-sync.ts`)**
- Tokens come from `readScrumSheetTokens()`, with the refresh logic reused from `src/lib/scrum-sheet.ts`. Tokens are only used on the server and are never sent to the client. The scrum `spreadsheetId` setting is not used or changed.
- Read only (`values.get`). No write calls anywhere in this feature.
- **Throttle:** skip the sheet read and return the cached snapshot if a sync succeeded less than 5 minutes ago, or if an attempt is already running (in-process promise plus `lastAttemptAt` less than 60s ago). Owner **Sync now** skips the 5-minute rule but not the in-flight guard.
- **On failure:** keep the previous `weeks` and `syncedAt`, and set `lastError` and `lastAttemptAt`. If a read parses to 0 weeks while the previous snapshot had weeks, treat it as an error (`"Calendar tab returned no weeks"`) and keep the old data.

**APIs**
- `GET /api/release-calendar`: snapshot plus status (`configured`, `connected`, `sharePath`). Session-protected. It never returns the connected Google account's email (AC: no email in any client response).
- `POST /api/release-calendar/sync` (body `{ force?: boolean }`): uses `guardMutation`, the same as Gmail sync.
- `POST /api/share/release-calendar/[token]/sync`: throttled and never forced. Returns only `{ weeks, syncedAt, warnings }`. Errors return a generic message with no email, no error detail and no `connected` flag.

## 8. States (owner page / share page)
| State | Owner | Share |
|---|---|---|
| Not connected, no snapshot | EmptyState "Connect Google Sheets to load the release calendar" with a button that starts the existing Scrum sheet OAuth (`/api/scrum-attendance/sheet/auth`) | "Release calendar isn't available yet." |
| Not connected, snapshot exists | Snapshot plus Alert "Google Sheets disconnected. Showing data synced <time>." with a Connect button | Snapshot plus "Last updated <time>" |
| Syncing | Snapshot stays visible. Header shows a spinner and "Syncing…". The first load with no snapshot uses `PageSkeleton` (week rows, 5 columns) | Same, with no button |
| Sync error | Snapshot plus Alert `lastError` and Retry. For a 403/404: "The connected Google account can't open Cryptogram 6 WP. Ask the sheet owner for view access." (no email) | Snapshot plus "Couldn't refresh. Showing data from <time>." |
| Empty (0 weeks ever) | EmptyState "No weeks found in the Calendar tab" plus Open sheet | "No calendar entries yet." |
| Parse warnings | Collapsed "<n> dates couldn't be matched" disclosure that lists the warnings | Hidden |
| Empty day | Blank cell, no placeholder text | Same |

## 9. Share link
- Use the simplest safe option: the env var `RELEASE_CALENDAR_SHARE_TOKEN`, at least 32 random characters. If it is unset or too short, sharing is off and every share URL returns 404. To regenerate, change the env var and redeploy (documented in README). Nothing is stored or generated in the app.
- Settings gets a "Release Calendar share link" row. When the token is set, it shows the full URL with Copy. When it isn't, it shows "Set RELEASE_CALENDAR_SHARE_TOKEN to enable." The token is only shown to signed-in users.
- **Middleware/auth (`src/lib/auth.ts`):** add prefix-based public paths for exactly `/share/release-calendar/` and `/api/share/release-calendar/`. They skip the site-auth session and the API key. Nothing else is opened. The handler or page compares the token with `timingSafeEqualStrings`. A wrong token returns `notFound()` (404, same response as when sharing is off).
- The share page renders outside `AppShell` (its own layout). It sets `robots: noindex, nofollow`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. It reads only the snapshot file, never `readStore()`, and imports no store or client store hooks.

## 10. Remove the old releases
- **Delete:** `src/app/api/releases/route.ts`, `src/components/planning/NewReleaseDialog.tsx`, `ReleaseCard.tsx`, the release functions in `api-client.ts`, the release schemas in `validation.ts`, `release-lifecycle.ts`, `release-sort.ts`, the release-only helpers in `release-utils.ts`/`release-constants.ts`/`release-calendar.ts`, and their tests (`release-lifecycle`, `release-sort`, `release-calendar`, and the release parts of `release-utils` and `db` tests).
- `ReleaseCalendar.tsx` is rewritten to render the snapshot. The work-week layout (`buildWorkWeeks`) can stay.
- **Types:** remove `Release`, `ReleaseStatus`, `ReleasePhase` and `DashboardStore.releases`. **Keep** `ReleaseFunctionCost` and `ReleasePlatform` (Features and sprint approvals use them). Keep `SprintApproval.releaseId` as an optional, ignored legacy field so existing approvals load unchanged.
- **Store migration (`db.ts`):** `readStore` drops any `releases` key and the next write omits it. Remove the release-id remap migration and the "releases changed" re-save check. A production store that still has `releases` must load with no errors.
- `utils.ts` `activeReleases` stat: replace it with the count of release headings dated in the current Mon–Fri week from the snapshot, or remove it if nothing displays it.
- Update README (Modules, env vars).

## 11. Home dashboard
Replace "Releases in flight" with **"Upcoming releases"** (link to `/release-calendar`). Show the next 5 release headings dated today or later, each with its date and its items as a one-line muted list. Data comes from `GET /api/release-calendar` (no sync from Home). Empty: "No upcoming releases in the calendar." Not connected with no snapshot: "Connect Google Sheets on Release Calendar."

## 12. Edge cases
- Large data (about 1090 rows, about 130 weeks): parse on the server only and render one month at a time.
- Week 53 / Week 1 and Dec/Jan rollover, and Feb 29: handled by the year inference in §6.7.
- Cells with several lines, and many items in one day: the day cell grows. No truncation on desktop. On phones, show the days as a vertical list per week.
- Holidays, outings and "no release" notes are shown as written, never hidden or restyled into a status.
- "Today" uses the viewer's local date for highlighting.
- If the tab with gid 1763731072 is missing, the error reads "Calendar tab not found in Cryptogram 6 WP."
- If the share URL is opened while the owner is disconnected, the last snapshot is still shown.

## 13. Acceptance criteria
- [ ] The sidebar shows "Release Calendar". `/release-calendar` loads and `/planning` redirects to it. 2027 Planning is unaffected.
- [ ] Opening the tab triggers exactly one sync. Reopening within 5 minutes does not call Google (check the server logs). Sync now forces a read.
- [ ] Week 42 shows Mon 2026-10-12 to Fri 2026-10-16, Wed 14 Oct is highlighted as today, and the entries match the sheet cell by cell.
- [ ] A "Release X" / "iOS Release X" cell starts a group, and the lines under it appear as its items in order. Holiday, Outing and other lines appear verbatim.
- [ ] The earliest weeks (Aug 2024) and the latest (Jan 2027) resolve to the correct years. Parser unit tests cover year rollover, a blank column A in the first header, multi-line cells and a weekday mismatch warning.
- [ ] With the network or token broken, the page still shows the last snapshot with "Synced <time>" and an error Alert.
- [ ] No Google token, refresh token or connected email appears in any client response or page HTML (owner or share).
- [ ] Without a session, `/share/release-calendar/<valid token>` renders the calendar. A wrong token or an unset env var gives 404. Every other route still redirects to `/login` or returns 401.
- [ ] The share page has no nav and no links into Helpit, and no store data appears in its payload.
- [ ] No Google Sheets write API is called anywhere in this feature.
- [ ] A store JSON containing a legacy `releases` array loads without errors, and the key is gone after the next save. The `/api/releases` route returns 404.
- [ ] The Home "Upcoming releases" card shows sheet data only. `npm run build`, lint and tests pass.

## 14. Decisions (resolved open questions)
1. Throttle stays at **5 minutes** (§7).
2. "Android X Catchup" lines stay **items under the release heading above** them (§6.5).
3. **Text only.** No sheet colors, strikethrough or formatting.
4. **Full history** is browsable (owner and share), but both pages **open on the current month**.

## 15. UX

### 15.1 Owner page layout (laptop)
Reuses the Planning page shell (`PageHeader` + one `Card`) and the Mail sync pattern (auto-sync once per open, "Synced <time>" + `RefreshCw` button).
```
+--------------------------------------------------------------------------+
| Release Calendar                  Synced <date, time>  [Sync now]        |
|                                   [Open sheet ↗]  [Copy share link]      |
+--------------------------------------------------------------------------+
| [Alert slot: disconnected / sync error — only when present]              |
+--------------------------------------------------------------------------+
| [<] [>]  <Month yyyy>                                         [Today]    |
+------+------------+------------+------------+------------+---------------+
|  Wk  |    Mon     |    Tue     |    Wed     |    Thu     |    Fri        |
+------+------------+------------+------------+------------+---------------+
| <nn> | <MMM d>    | <MMM d>    | (<MMM d>)  | <MMM d>    | <MMM d>       |
|<note>| RELEASE    | <line>     |  today     | RELEASE    |               |
|      | <heading>  |            | <line>     | <heading>  |               |
|      |  · <item>  |            |            |  · <item>  |               |
|      |  · <item>  |            |            |            |               |
+------+------------+------------+------------+------------+---------------+
| <n> dates couldn't be matched  [v]   (only when warnings exist)          |
+--------------------------------------------------------------------------+
```
- **What's seen first:** the current month with today's cell highlighted (existing `aria-current="date"` + today styling). If today is in the second half of the month, scroll today's week into view on load.
- **Hierarchy inside a day cell** (sheet order is never re-sorted):
  1. Release group: heading in bold (the group title), items below as an indented list. No truncation, no "+n more".
  2. Ungrouped lines (Holiday, Outing, LRP Brainstorming, "no release" notes): plain text, same size as items, no bold, no icon, no badge.
  Release groups stand out by weight only; UI decides the treatment, but must not add colors that imply platform or status (text only, §14.3).
- **Week column:** week number (from column A) on top, week note below in muted text. Blank label shows nothing.
- **Remove** from the old component: legend (Android / iOS / Shipped), Unscheduled strip, release/day selection and the side detail panel. Cells are not clickable; nothing opens on click.
- **Month nav:** Prev / Next disabled at the first/last snapshot month. Today is pressed-state when on the current month (existing pattern). Keyboard: `←` / `→` prev/next month, `T` today (ignored while focus is in an input).

### 15.2 Header actions
| Action | When shown | Feedback |
|---|---|---|
| Sync now | Connected | Button disables, icon spins, label "Syncing…"; then "Synced <time>" updates. On failure, Alert appears (§8). |
| Open sheet | Always (owner) | New tab to the gid URL. |
| Copy share link | Share token set | Copies full URL; label changes to "Copied" for 2 s, plus a toast "Share link copied". Clipboard blocked: show the URL in a small popover with the text pre-selected. |
| Connect Google Sheets | Not connected | Primary button (in EmptyState or the disconnected Alert). |

Phone width: "Synced <time>" moves under the title; Sync now becomes icon-only (with `aria-label`); Open sheet and Copy share link move into a `⋯` overflow menu.

### 15.3 Phone layout (< sm)
Weeks become a vertical list; each week is a block with the week label, then one row per weekday. Empty days are collapsed into the week header (e.g. hidden rows), so only days with entries show; today's row is always shown, even if empty.
```
Week <nn>   <week note>
  <Mon, MMM d>   RELEASE <heading>
                   · <item>
  <Wed, MMM d>   (today) <line>
```

### 15.4 First-time "Connect Google" (owner, no snapshot)
```
+---------------------------------------------+
|        Connect Google Sheets                |
|  Release Calendar reads the "Calendar" tab  |
|  of Cryptogram 6 WP. View access only.      |
|        [Connect Google Sheets]              |
+---------------------------------------------+
```
- Button starts the Scrum sheet OAuth and returns to `/release-calendar`; the page then auto-syncs and shows the `PageSkeleton` (week rows × 5 columns) until the first snapshot lands.
- If Scrum Attendance is already connected, this state never appears (same tokens).
- If the first sync fails, keep the EmptyState and show the error Alert with Retry above it.

### 15.5 Share link copy flow (owner)
1. Owner clicks **Copy share link** (header) or **Copy** (Settings row).
2. Toast "Share link copied". No dialog, no confirm.
3. Sharing off: the header button is hidden; Settings shows "Set RELEASE_CALENDAR_SHARE_TOKEN to enable." (no button).

### 15.6 Public share viewer
```
+--------------------------------------------------------------+
| Cryptogram Release Calendar          Last updated <time>     |
+--------------------------------------------------------------+
| [notice slot: "Couldn't refresh. Showing data from <time>."] |
+--------------------------------------------------------------+
| [<] [>]  <Month yyyy>                               [Today]  |
|  ... same read-only grid as owner (§15.1) ...                |
+--------------------------------------------------------------+
```
- Opens on the current month; Prev/Next go through full history.
- No sidebar, no Sync now, no Open sheet, no warnings disclosure, no account details.
- Background refresh is silent: a small "Updating…" next to "Last updated" while the throttled sync runs; the grid swaps in place with no scroll jump and keeps the viewed month.
- Bad/disabled token: plain 404, no Helpit branding or login link.

### 15.7 Sync status line (both pages)
| Status | Owner header | Share header |
|---|---|---|
| Idle, synced | "Synced <date, time>" | "Last updated <date, time>" |
| Syncing | Spinner + "Syncing…" (grid stays) | "Updating…" (grid stays) |
| Throttled (synced < 5 min) | Same as idle; no spinner flash | Same as idle |
| Error | "Synced <time>" + error Alert with Retry | Muted notice (§8) |
| Disconnected | "Synced <time>" + Alert with Connect | "Last updated <time>" |

Times use the viewer's locale (`dateStyle: "medium", timeStyle: "short"`, as in Mail).

## 16. UI

Existing tokens and components only (`src/components/ui`, `Menu.tsx`, `Popover.tsx`). No new design-system pieces, no hex values, no platform/status colors (§14.3).

### 16.1 Nav icon
Keep **`CalendarRange`** for `planning` in `MODULE_ICONS` (already the module icon; no churn, and it stays distinct from Outings `Users` and 2027 Planning `Table2`). `PageHeader module="planning"`.

### 16.2 Grid (rewrite of `ReleaseCalendar.tsx`)
- Keep the shell: `Card className="overflow-hidden p-0"`, month toolbar row (`border-b border-border px-3 py-2.5 sm:px-4`), ghost `size="icon"` prev/next (`disabled` at snapshot bounds), `h2 font-display text-base font-semibold`, ghost `size="sm"` Today with `aria-pressed` + `bg-surface-3 text-foreground`.
- **Delete:** legend, Unscheduled strip, `releaseBannerClass`, all chip/button styling inside cells, `truncate`, `slice(0, 3)` / "+n more", `cursor-pointer`/hover on cells.
- Columns: `grid-cols-[4.5rem_repeat(5,minmax(0,1fr))]` (wider week column for the note), inside `scroll-fade-x overflow-x-auto` with `min-w-[40rem]` on sm+. Header row unchanged (`bg-surface-2`, 11px uppercase muted).
- **Week cell:** `bg-surface-2/60 border-r border-border p-2`; number `text-[11px] font-semibold tabular-nums text-foreground`; note below `mt-1 text-[11px] leading-4 text-muted break-words`. Blank label renders nothing.
- **Day cell:** plain `div` (not interactive), `flex flex-col gap-1.5 border-r border-border p-2 last:border-r-0 bg-card min-h-[4.5rem]`. Out-of-month days: `bg-surface-2/40`, date in `text-subtle`. Today: existing `aria-current="date"`, cell `bg-pop-soft/50`, date pill `rounded-full bg-accent px-1.5 font-semibold text-on-fill` (unchanged). Date label `text-[11px] leading-4 font-medium text-foreground`.
- **Release group:** `<div>` per group, `space-y-1.5` between groups. Heading `text-xs font-semibold leading-4 text-foreground break-words`. Items `<ul className="mt-0.5 space-y-0.5 border-l border-border pl-2">`, each `<li className="text-xs leading-4 text-foreground break-words">`. Weight + left rule only; no fill, no badge.
- **Ungrouped lines** (Holiday, Outing, LRP Brainstorming, "Skipped build…"): same `text-xs leading-4 text-foreground break-words`, no indent, no bold, no icon. Shown verbatim.
- All text wraps (`break-words`), never truncates; rows grow with content.

### 16.3 Header + sync status line (owner)
- `PageHeader action` = `flex flex-wrap items-center gap-2 sm:gap-3`, same as Mail:
  - Status: `text-xs text-muted` "Synced <time>". While syncing: `RefreshCw animate-spin` (h-3.5) + "Syncing…" in the same span, `aria-live="polite"`. Throttled: no spinner flash (only show spinner if the request is still pending after ~300 ms).
  - Sync now: `Button variant="secondary" size="sm"` + `RefreshCw` (spins, `disabled` while syncing, label "Syncing…").
  - Open sheet: `<a target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost", size: "sm" })}>` + `ExternalLink`.
  - Copy share link: `Button variant="ghost" size="sm"` + `Link2`; on success swaps to `Check` + "Copied" for 2 s. No toast component exists, so announce via an `sr-only` `aria-live="polite"` "Share link copied" instead of a toast. Clipboard blocked: existing `Popover` holding a read-only `Input size="sm"` with the URL pre-selected.
- Alert slot under the header, above the Card, `mb-4`: disconnected = `Alert tone="caution"` + `action={<Button size="sm">Connect</Button>}`; sync error = `Alert tone="danger" role="alert"` + `Button variant="secondary" size="sm"` "Retry".
- Parse warnings: under the grid inside the Card, `border-t border-border bg-surface-2/60 px-4 py-2.5`; native `<details>` with `summary` `text-xs font-semibold text-muted hover:text-foreground` + `ChevronDown` (rotates when open); list `mt-2 space-y-1 text-xs text-muted`.

### 16.4 Connect state (owner, no snapshot)
Inside the Card: `EmptyState icon={Sheet}` (lucide) title "Connect Google Sheets", description per §15.4, `action={<Button>Connect Google Sheets</Button>}` (primary, `md`). Error on first sync: danger Alert above the Card. Loading first snapshot: `Skeleton` rows inside the Card (toolbar `h-8 w-40`, then 4× `grid-cols-[4.5rem_repeat(5,1fr)] gap-2` of `h-20 rounded-lg`) instead of the generic three-tile `PageSkeleton`; keep `role="status"` + sr-only label.

### 16.5 Share-link card (Settings)
Reuse the existing Settings row/Card pattern: `CardHeader title="Release Calendar share link" icon={Link2}`. Enabled: read-only `Input size="sm" className="font-mono text-xs"` (`flex-1 min-w-0`) + `Button variant="secondary" size="sm"` Copy (same "Copied" swap + sr-only live text), in `flex gap-2`; helper `mt-2 text-xs text-muted` "Anyone with this link can view the calendar. Change the env var to revoke." Disabled: only `text-sm text-muted` "Set `RELEASE_CALENDAR_SHARE_TOKEN` to enable." (`<code className="rounded bg-surface-2 px-1 text-xs">`), no button.

### 16.6 Public share page
- Own layout: `min-h-dvh bg-background`, content `mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8`. No sidebar, no logo link, no ModuleChip, no nav.
- Header: `mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between`; title `h1 font-display text-xl font-bold tracking-[-0.02em] text-foreground sm:text-2xl` "Cryptogram Release Calendar"; status `text-xs text-muted` "Last updated <time>", with "· Updating…" appended while syncing (no spinner, `aria-live="polite"`).
- Refresh failed: `Alert tone="info" icon={null}` muted-style notice, `mb-4`. Not available / no entries: `Card` + `EmptyState` (no icon, no action).
- Grid: the same `ReleaseCalendar` component (read-only, no warnings slot).

### 16.7 Phone (< sm, 375px)
- Header (owner): title row; status line under the title (`PageHeader` already stacks; put the status in `description` slot on phone or as first item of the wrapped action row). Sync now = `Button variant="secondary" size="icon" aria-label="Sync now"`; Open sheet + Copy share link move into existing `Menu` triggered by ghost `size="icon"` `MoreHorizontal` (`aria-label="More actions"`).
- Grid replaced by a list (`sm:hidden` list / `hidden sm:block` grid, both from the same data): per week a block `border-b border-border px-3 py-3 last:border-b-0`; week line `text-[11px] font-semibold uppercase tracking-[0.06em] text-muted` "Week 42" + note in normal case. Each day row `grid grid-cols-[4.5rem_1fr] gap-x-3 py-1.5`; date `text-xs font-medium text-foreground` ("Mon, Oct 12"); entries use the same group/line styles as §16.2. Today row: `-mx-3 px-3 rounded-none bg-pop-soft/50` + accent date pill. Empty days hidden except today; a week with no entries shows "No entries" `text-xs text-subtle`.
- No horizontal scroll at 375px; toolbar stays one row (prev/next, month, Today). Tap targets ≥ 32px (existing `icon`/`sm` sizes).

### 16.8 States checklist
Focus: all buttons/links use `FOCUS_RING` via `buttonClasses`; `summary` gets `focus-visible:ring-2 focus-visible:ring-signal rounded-sm`. Disabled: `disabled` attr (opacity-50 from `buttonClasses`). Hover only on controls, never on day cells. Both themes work as-is since only tokens are used.
