# Tasks tab: day-by-day table (GitHub Projects style)

Status: implemented (reworked from the earlier Board/navigator draft) · Scope: Tasks tab only (`src/app/tasks/page.tsx`, `src/components/tasks/Task{Board,DaySection,EditableText,AddItem,Menus}.tsx`, `src/components/ui/Menu.tsx`, helpers in `src/lib/task-board.ts`)

## 1. Goal
Open Tasks and see work laid out day by day, newest first, in clean grouped tables: edit cells inline, add items in place, and move work between days in one click.

## 2. Layout
A vertical stack of day sections. Each section is a rounded date chip (format `5th Oct, 26`) above a rounded table with exactly four columns:

| S. No. | Items | Status | Comments |
|---|---|---|---|

- **S. No.**: 1-based index within that day, rows ordered by `createdAt` ascending, so numbers never jump when a status changes. Done rows stay in place, dimmed and struck through.
- **Items**: `task.title`, click to edit inline (Enter or blur saves, Esc cancels, blank is rejected). Holds the one-click done checkbox on the left and a "..." row menu on the right (Move to today, Move to tomorrow, Pick date, No date, Delete). The menu shows on hover/focus on desktop and always on touch.
- **Status**: menu chip (Todo / In progress / Blocked / Done) using `statusColor`.
- **Comments**: `task.description`, click to edit inline (Enter or blur saves, Shift+Enter for a new line, Esc cancels). Clearing it clears the description. No schema change.
- Last row of every table: **+ Add item** input. Type a title and press Enter: creates a task with that section's `dueDate` (none in No date), `status: "todo"` and the API default priority (medium). Focus stays for rapid entry; failed creates keep the text.

Header: page title and description (no Add button), "Today: N of M done" with a progress bar, and a small **Go to date** picker that reveals an empty section for that date (past or future) and scrolls to it, so the user can plan ahead.

## 3. Section order
1. **Today**, always shown, even when empty (hint: "Nothing planned for today. Add your first item below.").
2. Earlier days, newest first (the 5th above the 4th). The 7 most recent days that have tasks show; the rest sit behind a **Show older days (N)** button. A day revealed through Go to date is always visible.
3. **Upcoming**: future days, soonest first.
4. **No date**: tasks with no (or a malformed) `dueDate`; always shown so undated items can be added.

Grouping uses `task.dueDate` as a local `yyyy-MM-dd` (date-fns, never UTC). The tab still uses `getTasksTabTasks`, so Slack and mail tasks stay out.

## 4. Data and logic
No change to `Task` in `src/lib/types.ts`, no store change, no new dependency. Mutations go through the existing `addTask` / `updateTask` / `deleteTask`.

Pure helpers in `src/lib/task-board.ts` (tests in `src/lib/__tests__/task-board.test.ts`): `todayKey`, `shiftDayKey`, `taskDay`, `formatDayChip`, `tasksForDay`, `dayProgress`, `sortByCreated`, `groupTasksByDay` (Today always present, past desc, upcoming asc, No date), `splitRecentDays`, `statusPatch`, `reschedulePatch`, `titlePatch`, `commentPatch`.

## 5. States and edge cases
- Loading: `PageSkeleton`. Errors: dismissible `ErrorBanner`; an edit that fails shows the stored value again.
- Empty section: one muted hint row above the "+ Add item" row. No dummy content anywhere.
- A row is dimmed and non-interactive while a status/move/delete request is in flight; inline edits show their own muted saving state.
- "Today" is re-evaluated when the tab regains focus (midnight rollover).
- Dashboard (`HomeDashboard`, `AddTaskForm`, `TaskList`) and Mail are untouched.

## 6. UI
Look: "Ink & signal orange". Tokens and `src/components/ui` only: `rounded-card` table wrapper with `border-border` and `shadow-card`, `tableClasses` head/row styles, `checkboxClasses`, `Badge`, `Menu` popover (`src/components/ui/Menu.tsx`), `fieldClasses`. Today's chip is accent-tinted with a "Today" badge; other chips are neutral. Focus rings use `ring-signal`.

Phone (< 640px): the header row is hidden and each row becomes a stacked card: S. No. and Items on top, Status and Comments below, with no horizontal page scroll. Between 640px and the table's minimum width the table scrolls inside its own wrapper, not the page.

## 7. Acceptance
- [ ] No page-header Add button; Dashboard still shows its add-task form and list unchanged.
- [ ] Sections follow the order in section 3; Today is present with zero tasks.
- [ ] Each table has exactly the four columns above, S. No. is 1..n by creation order and stable across status changes.
- [ ] Items and Comments edit inline with Enter / blur / Esc as described; blank title is rejected.
- [ ] Status chip changes status; checkbox toggles Done / Todo; row menu items change `dueDate` only and Delete removes the task.
- [ ] "+ Add item" creates a todo with the section's date (none for No date) and keeps focus.
- [ ] Go to date reveals and scrolls to an empty section; Show older days reveals the rest.
- [ ] Works at 375px with no horizontal page scroll.
- [ ] Unit tests cover the grouping, ordering and patch helpers.
