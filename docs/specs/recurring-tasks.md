# Recurring tasks (Tasks tab)

Status: draft, open questions resolved (see section 8) · Scope: Tasks tab (`src/app/tasks/page.tsx`, `src/components/tasks/`), `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/validation.ts`, `src/lib/api-client.ts`, `src/lib/use-dashboard.ts`, new `src/lib/recurrence.ts`, new `src/app/api/recurring-tasks/`

## 1. Problem
Some of the producer's tasks repeat: daily, on certain weekdays (Mon/Tue), or in the first week of each month. Today each one is re-typed by hand on the right day, and it gets forgotten when nobody types it.

## 2. Goal
Define a repeat rule once. The matching task then shows up in the right day section on its own. Each day's row is an ordinary task with its own status and comment.

## 3. Scope
**In**
- A rule list ("Recurring") managed from the Tasks tab: create, edit, pause/resume, delete.
- Cadences: daily, weekly (pick weekdays, with a "Weekdays" preset for Mon to Fri), monthly (either "Nth weekday of the month" or "day of the month").
- Start date and optional end date.
- Automatic creation of the day's task rows, a repeat icon on those rows, and pure helpers with unit tests.

**Out**
- "Every N weeks", time of day, reminders, owner/priority/tags on a rule, skipping holidays (`scrumHolidays` is not consulted), and a rule-level completion history.
- Recurring items on the Dashboard add-task form.
- Backfilling days before a rule's start date.
- Backfilling missed past days (catch-up is 0).
- The Dashboard UI is untouched. Its data hook (`useDashboard`) triggers generation, so due-today recurring tasks show there too.

## 4. User flow
1. Tasks header gets a **Recurring** button, with a count of active rules when there are any. There is no Add Task button on the tab. The button opens a panel using the existing `Modal` (bottom sheet on phone).
2. The panel lists rules. Each row shows the title, the summary (e.g. "Every Mon, Tue"), the next date ("Next: 12th Oct, 26"), and a Pause/Resume toggle. A row has Edit and Delete. A paused rule is dimmed with a "Paused" badge. A rule past its end date shows "Ended" (derived). An empty list says "No recurring tasks yet" above the **New recurring task** button.
3. New/Edit form fields:
   - Title (required) and Comment (optional).
   - Repeats: Daily | Weekly | Monthly.
   - Weekly: weekday toggles Mon to Sun (at least one) plus a "Weekdays" preset.
   - Monthly: a segmented choice. "On week" shows a select (1st, 2nd, 3rd, 4th, Last) plus the weekday toggles (at least one). "On day" shows a number 1 to 31.
   - Starts (date picker, pre-filled with today, editable) and Ends (optional).
   - A live preview line shows the summary and the next three dates.
4. Save. A rule that includes today creates today's row immediately, and tomorrow's row too if it matches. Both appear in the day sections at once.
5. Rows created from a rule show a small repeat icon in the Items cell, with the rule summary as its tooltip and aria-label. Everything else on the row works as before (inline edit, status, move, delete).
6. **Skip a day** = delete that day's row. It is not recreated.
7. Pause stops new rows and removes untouched future rows. Resume continues from today with no backfill. Delete removes the rule (see section 5).

## 5. Data
Types (`src/lib/types.ts`):
- `Task.recurringId?: string`, the id of the rule that created the row. It is set only by the generator. `updateTaskSchema` does not accept it. Check that the client `updateTask`, which spreads the whole task into the PATCH body, still succeeds (zod strips unknown keys).
- New `RecurringTask`:
  - `id`, `title`, `comment?`
  - `cadence`: `"daily" | "weekly" | "monthly"`
  - `weekdays?: number[]`, 0 to 6 with Sun = 0, the date-fns `getDay` convention. Used by weekly and by monthly "on week".
  - `monthlyMode?: "weekday_of_month" | "day_of_month"`
  - `weekOfMonth?: 1 | 2 | 3 | 4 | "last"`
  - `dayOfMonth?: number`, 1 to 31
  - `startDate: string` (yyyy-MM-dd), `endDate?: string`
  - `active: boolean`
  - `generatedThrough?: string`, the high-water mark: the last day already considered for this rule
  - `createdAt`, `updatedAt`
- `DashboardStore.recurringTasks: RecurringTask[]`.

Rule semantics:
- "Nth weekday" means the Nth occurrence of that weekday in the month. 1st = days 1 to 7, 2nd = days 8 to 14, and so on. "Last" = the final occurrence (the weekday's last 7 days). A 5th week is not offered, since Last covers it.
- Day of month 29 to 31 is clamped to the month's last day, so "31" fires every month.
- Weekly and Nth-weekday fire on every chosen weekday.

Store and migration:
- `createDefaultStore` adds `recurringTasks: []`. No seed rules, no dummy data.
- `readStoreUnlocked` normalises `recurringTasks ?? []`, the same way `plotBacklog` and `features` are handled.
- Normalisation drops rules with an invalid cadence or date, drops weekdays outside 0 to 6 and duplicates, and defaults `active` to true only if it is missing.
- It follows the existing persist rules: local mode may write the migrated store, and Blob mode only returns it in memory and persists on the next `updateStore`.
- Old stores and old tasks need no other change. Do not touch production data when testing.

**Generation.** Done server-side, inside a single `updateStore` updater, so it is atomic and safe if the Blob optimistic retry re-runs it. The updater must be pure. Constants in `recurrence.ts`: `LOOKAHEAD_DAYS = 1`, `CATCHUP_DAYS = 0`.
- The client sends its local `today` (yyyy-MM-dd). The server is never trusted for "today", because Vercel runs in UTC.
- For each active rule, the window is from max(`generatedThrough` + 1, `startDate`, today minus `CATCHUP_DAYS`) to min(today plus `LOOKAHEAD_DAYS`, `endDate`). In practice: today..tomorrow, never earlier than the start date.
- For each occurrence in the window, create a Task: `title`, `description = comment`, `status: "todo"`, `priority: "medium"`, `source: "manual"`, `tags: []`, `dueDate`, `recurringId`.
- Skip it if a task with the same `recurringId` + `dueDate` already exists. That is a second guard.
- Then set `generatedThrough` to the window end.
- Instances of one rule are ordered by rule `createdAt`, so S. No. is stable.
- Because the marker only moves forward, a deleted or completed instance is never regenerated.
- A new rule starts with `generatedThrough = max(startDate, today) - 1`, so there is no backfill and a rule starting today gets today's row.

**Rule edits** (affect only future days). On edit, pause or delete:
- Remove "untouched" future instances: `dueDate > today` (so, tomorrow's row), `status todo`, and title and comment still equal to the rule's old values. Touched ones (any other status, or an edited title or comment) are kept.
- Set `generatedThrough = min(generatedThrough, today)`, then regenerate (edit only).
- Today: if the edited rule includes today and the old rule did not, set `generatedThrough = min(generatedThrough, today - 1)` so today's row is created at once. If today's row already exists, or the user deleted it, an edit never changes or recreates it. The past is never changed.
- Resume sets `generatedThrough = max(generatedThrough, today - 1)`. Days paused are not backfilled.
- Delete also clears `recurringId` on the remaining instances, so they become plain tasks. The icon only shows while the rule exists.

**API**
- New `/api/recurring-tasks`:
  - `GET` lists rules.
  - `POST` creates a rule (body includes `today`) and generates its instances.
  - `PATCH` takes `{id, ...fields, today}`. It covers edit, pause and resume through `active`.
  - `DELETE ?id=` uses `guardMutation`.
  - Zod schemas in `validation.ts`:
    - Title 1 to 500 chars, comment up to 5000.
    - Weekly or "on week" needs at least one weekday.
    - "On day" needs `dayOfMonth`.
    - `endDate >= startDate`.
    - Dates match `^\d{4}-\d{2}-\d{2}$`.
- New `POST /api/recurring-tasks/generate` with `{today}`. It returns `{created: n}`.
- `/api/tasks` is unchanged, and `GET /api/store` returns `recurringTasks`.
- Client: `api-client` functions and `useDashboard` expose `recurringTasks`, create/update/delete rule, and `generateRecurring`. All go through `mutate`, which reloads and calls `notifyStoreUpdated`.
- `useDashboard` itself calls `generate` after its first store load, on tab focus or visibility, and when the local day rolls over. Dashboard and Tasks both use the hook, so both trigger it and the Tasks page needs no separate call. It reloads only when `created > 0` and runs at most once per mount and local day plus on focus, so it cannot loop. A failed generate sets the hook `error` and does not block the page.

**Pure helpers** (`src/lib/recurrence.ts`, tests in `src/lib/__tests__/recurrence.test.ts`). They use local calendar components and `shiftDayKey`, never millisecond arithmetic and never UTC.
- `occursOn(rule, dayKey)`.
- `occurrencesBetween(rule, from, to)`: inclusive, ascending, clamped to start and end dates, empty when `from > to` or the rule is not active.
- `nextOccurrence(rule, afterDayKey)`: the first date after it, or undefined when the rule has ended. The search is bounded.
- `ruleSummary(rule)`:
  - "Every day"
  - "Every weekday" (Mon to Fri)
  - "Every Mon, Tue"
  - "1st Mon of every month"
  - "Last Fri of every month"
  - "Day 5 of every month"
  - "Day 31 of every month (last day in shorter months)"
- `planGeneration(rule, today, existingTasks)`: the dates to create under the window rule above.
- `isUntouchedInstance(task, rule)`.
- `applyRuleEdit` / `generateAll(store, today, now)`: pure store-to-store functions used by the routes.
- `validateRule`.

## 6. Edge cases
- **Empty states:** no rules gives the empty panel message. Today with no rules is unchanged.
- **Month ends:** day 29 to 31 clamps to the last day, including February and leap years. "Last Fri" is correct in 4 and 5 Friday months.
- **First week:** "1st Mon" is the Monday in days 1 to 7, even when the 1st is a Sunday.
- **DST and year rollover:** day stepping is calendar-based. A 23h or 25h day never skips or doubles a date.
- **Start and end dates:**
  - Start in the future: nothing is created until then, and the 1-day look-ahead can reveal it one day early.
  - Start in the past: no backfill. A new rule starts at today.
  - End date in the past or reached: no new rows, shown as Ended. Existing rows stay.
  - `endDate < startDate` is rejected.
- **Paused:** creates nothing, even if the app was closed for weeks. On resume only today onward is created.
- **App not opened for N days:** no backfill (`CATCHUP_DAYS = 0`). Missed past days are dropped silently, only today and tomorrow are created, never before `startDate`. The rule's marker still advances.
- **Deleted or completed instance:** never recreated. A user who moves an instance to another date keeps it there, and the original day is not refilled. The marker has already passed it.
- **Same-day edit:** editing a rule so it newly includes today creates today's row at once. If today's row exists or was deleted, an edit leaves it alone.
- **Concurrent tabs or Blob retries:** generation is idempotent through the marker plus the `recurringId` + `dueDate` check.
- **Large lists:** a daily rule adds 2 rows per run at most. Cap is 100 rules (validation error beyond that, shown as the form error).
- **Errors:** a failed generate shows the `ErrorBanner` and the tab stays usable. A failed rule save keeps the form open with the text.
- **Slack and mail tasks** are untouched. Instances use `source: "manual"`, so `getTasksTabTasks` shows them.

## 7. Acceptance criteria
- [ ] Fresh and existing stores load without errors, and `recurringTasks` reads as `[]` when absent. No rules or tasks are seeded.
- [ ] Tasks header has a Recurring button and no Add Task button. The panel opens, shows the empty message, and works at 375px.
- [ ] Creating a daily rule starting today puts today's row in Today and tomorrow's row in Upcoming, and nothing further. Rows are todo with the rule's title and comment.
- [ ] Saving an edit that newly includes today creates today's row at once. The Dashboard load also generates due rows.
- [ ] A weekly Mon+Tue rule creates rows only on those dates. The "Weekdays" preset selects Mon to Fri.
- [ ] A monthly "1st Mon" rule creates rows only on the first Monday, whatever day it falls on. "Last Fri" and "Day 31" behave per section 6.
- [ ] Reloading the tab or calling generate repeatedly creates no duplicates. Two simultaneous tabs create no duplicates.
- [ ] A deleted or completed instance is not recreated on reload. Opening the app after a gap creates no past days (only today and tomorrow, never before the start date).
- [ ] Editing a rule updates untouched future rows and leaves an existing or deleted today row, past rows, and user-edited rows alone. Pause removes untouched future rows. Resume restores from today with no backfill. Delete turns remaining rows into plain tasks.
- [ ] Recurring rows show a repeat icon with the rule summary as tooltip and aria-label. Inline edits, status, move and delete behave as on any row.
- [ ] End date stops creation. `endDate < startDate` and empty weekday selection show a field error.
- [ ] "Today" uses the local date. A test at 00:30 local and across DST confirms it.
- [ ] Unit tests cover `occursOn`, `occurrencesBetween`, `nextOccurrence`, `ruleSummary`, `planGeneration` and the edit and pause rules, including month ends, leap February, 5-Friday months, DST and year rollover, paused, and start or end bounds.
- [ ] Tasks and Dashboard behavior is otherwise unchanged. Production data is never touched during testing.

## 8. Decisions (open questions resolved)
- "First week of the month" = the first occurrence of the chosen weekday(s), days 1 to 7, as specced. No "every day of the first week".
- Look-ahead is 1 day (tomorrow), catch-up is 0. Window = today..today+1, never earlier than the start date. Missed past days are never created. This also settles the "7 near-identical Upcoming sections" concern for daily rules.
- `useDashboard` triggers generation on load, so the Dashboard "due today" list is complete without visiting Tasks.
- Creating or editing a rule that includes today creates today's row at once.
- The cap stays at 100 rules.

## 9. UX
**Recurring button.** In the Tasks `PageHeader` `action` slot, a secondary `Button` with a repeat icon and the label "Recurring". When at least one rule is active, a count follows the label (same count pill as `Tabs`). No count at 0. It sits top right at sm and up. On phone `PageHeader` stacks, so it sits under the title, left aligned. It is the only header action. Rows are added through each day's "+ Add item", as today.

**Panel.** The existing `Modal` titled "Recurring tasks" opens on the list view. "New recurring task" and Edit swap the body to the form view in the same Modal (no stacked dialogs). Cancel or Escape in the form returns to the list. Escape in the list closes the panel and returns focus to the Recurring button.

List view:
```
Recurring tasks                                   [x]
+-----------------------------------------------------+
| <rule title>                       [Pause]  [...]   |
| <summary> · Next: <date>                            |
|-----------------------------------------------------|
| <rule title>  (Paused)             [Resume] [...]   |
| <summary> · Paused                                  |
+-----------------------------------------------------+
                          [Close]  [New recurring task]
```
- Click the title to edit (one click). Pause/Resume is one click with no confirm. The "..." menu has Edit and Delete.
- Delete asks inline in that row: "Delete this rule? Its remaining rows become plain tasks." with Cancel and Delete. No second modal.
- Order: active rules by next date (soonest first), then paused, then ended.

Form view:
```
New recurring task                                [x]
Title *            <title>
Comment            <comment, optional>
Repeats            [Daily | Weekly | Monthly]
  Weekly:   Days   [Mon][Tue][Wed][Thu][Fri][Sat][Sun]   [Weekdays]
  Monthly:  Mode   [On week | On day]
     On week:  <1st|2nd|3rd|4th|Last>   [Mon]...[Sun]
     On day:   Day of month <1 to 31>
Starts <date>      Ends <date, optional>
Preview: <summary>
         Next: <date>, <date>, <date>
                                   [Cancel]  [Save rule]
```
- Cadence and mode are single-choice segmented controls. Weekday toggles are multi-select. "Weekdays" selects Mon to Fri in one click.
- Defaults on New: Title focused, Repeats = Daily, Starts = today, Ends empty. Monthly defaults to "On week", 1st.
- Preview updates on every change. It shows the `ruleSummary` text and the next three dates (including today if it matches). If the form is incomplete it says "Pick at least one day to see dates." If the rule is past its end: "No upcoming dates."
- Fewest clicks: daily task = type title, Enter. Enter in any single-line field submits.

**States**
- Loading: the page shows the existing `PageSkeleton` until the store loads, so the panel never opens empty by mistake. Generation runs silently in the background.
- Empty: "No recurring tasks yet" with one line "Set a rule once and the task shows up on the right day." and the New button. The footer New button is hidden while empty to avoid a duplicate.
- Paused: row dimmed with a "Paused" badge, "Next" replaced by "Paused", and the action reads Resume.
- Ended: row dimmed with an "Ended" badge, "Next" shows a dash. Edit stays available (to extend the end date).
- Validation (shown on blur and on Save, first error focused): Title required. "Pick at least one day". "Day of month must be 1 to 31". "End date can't be before start date". "Start date is required".
- Saving: Save shows "Saving..." and is disabled, so it cannot double submit. Pause, Resume and Delete disable only their own row while pending.
- Error: failed save keeps the form open and shows the message in an `ErrorBanner` at the top of the form body (draft kept). Failed Pause or Delete shows the banner above the list. The 100-rule cap shows "You have reached 100 recurring tasks. Delete one to add more." Failed generate uses the page `ErrorBanner`.
- Success feedback: after Save the form returns to the list with the saved rule's row briefly highlighted, and the new rows appear in the day sections behind the panel.
- Rows: a recurring row looks like any row, plus the repeat icon (section 10).

**Keyboard and a11y**
- Recurring button opens with Enter or Space. Focus moves to Title (form) or the first rule (list). Escape closes the panel or form. Focus returns to the trigger on close.
- Tab order follows reading order. The existing `Modal` has no focus trap or Escape handling, so the panel must add both (the Modal doc says dialogs keep their own).
- Cadence and mode controls use `aria-pressed` buttons in a labeled group, as `Tabs` does. Weekday toggles are `aria-pressed` buttons in a group labeled "Days", with full names as accessible names (Monday).
- Errors use `FieldError` (role alert) and `aria-invalid` on the field. The preview is `aria-live="polite"`.
- Row icon-only controls have labels ("Row actions", "Pause <title>", "Resume <title>").
- Pause and Resume toggles read their state in the label, not by color alone. Paused and Ended are text badges.

**Phone (375px)**
- The Modal is a bottom sheet (max 92% height, scrolls inside, sticky footer with full-width buttons). Keep this rather than a custom full-screen sheet.
- Rule rows wrap: title on line one, summary and next date on line two, Pause and "..." stay on the right of line one.
- Weekday toggles wrap to two lines (4 + 3) with at least 44px touch targets. Starts and Ends stack one per line. Native date pickers are used.
- The preview stays above the footer so it is visible while editing.

## 10. UI
Tokens and components only from `src/components/ui` and the Tasks tab. No new colors, fonts or shadows.

**Header button.** `Button variant="secondary" size="md"` with a lucide `Repeat` icon. Count uses the `Tabs` count pill (`bg-surface-3 text-foreground`, `rounded-full px-1.5 text-[11px] tabular-nums`).

**Panel shell.** `Modal` with `module="tasks"`, `icon={Repeat}`, `className="max-w-xl"` (wider than the default `max-w-lg` for the rule rows). Footer buttons: `Button variant="secondary"` (Close or Cancel) and `Button variant="primary"` (New recurring task, Save rule).

**Rule list.** Compact GitHub-Projects look: one bordered container (`border border-border bg-card`, no `shadow-card`, same flat treatment as the day tables) with rows separated by `border-t border-border` and `hover:bg-surface-2/60` (as `tableClasses.row`). Cells use `px-3 py-2`.
- Title: `text-sm font-medium text-foreground`, truncated to one line.
- Summary and next date: `text-xs text-muted tabular-nums`, separated by a middle dot.
- Paused and Ended rows use `opacity-70` (same as done rows) plus `Badge tone="neutral"`.
- Pause and Resume: `Button variant="ghost" size="sm"`. Row menu: the existing `Menu` with `MoreHorizontal`. Delete item uses the `destructive` flag.
- Inline delete confirm: row switches to `bg-danger-soft` text with `Button variant="danger" size="sm"` (Delete) and `Button variant="ghost" size="sm"` (Cancel).
- Empty: `EmptyState compact` with the `Repeat` icon, and `Button variant="primary" size="sm"`.
- Success highlight: `bg-success-soft/60` for a moment (as `tableClasses.successRow`).

**Form.** `Modal onSubmit` with body spacing from `Modal` (`space-y-4`).
- `Label`, `Input`, `Textarea`, `Select` and `FieldError` as they are. Date fields use `DateCommitInput` with `fieldClasses()` and `min` on Ends set to Starts. Because it commits on blur or Enter, the form reads the committed value, and Enter in a date field does not submit twice.
- Repeats and Monthly mode: the existing `Tabs` component.
- Weekday toggles: compact `Button variant="secondary" size="sm"` per day with `aria-pressed`. Selected uses `bg-accent-soft text-accent` and `border-signal`. The "Weekdays" preset is `Button variant="ghost" size="sm"`.
- Preview: `rounded-control bg-surface-2/60 px-3 py-2 text-xs text-muted` with the dates in `text-foreground tabular-nums`. Date format is the day headers' format ("12th Oct, 26", via `formatDayChip`).
- Errors: `ErrorBanner` in the body for save errors, `FieldError` for field errors.

**Repeat icon on rows.** In `TaskRow`, Items cell, between the checkbox and the title: lucide `Repeat` at `h-3.5 w-3.5 text-muted`, `mt-1.5` to align with the title's first line, wrapped in a `span` with `title` and `aria-label` = `ruleSummary`, `role="img"`. Shown only when `task.recurringId` matches an existing rule. It does not change the title's width rules (`min-w-0 flex-1`). It stays visible on phone. No new column and no badge.

**Note for Dev/UI.** `RowMenu` trigger class has a typo: `sm:opacity-0sm:group-hover:opacity-100` (missing space), so the hover reveal on desktop probably does not work. Not part of this feature, worth a separate fix.
