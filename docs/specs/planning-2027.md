# 2027 Planning (Capacity Plan + Swag Costing)

Source: Google Sheet "Cryptogram LRP 2027", verbatim export in `docs/specs/data/lrp-2027-sheet-export.json` (exported 2026-10-13).

## 1. Problem
2027 long-range planning lives in a Google Sheet. The producer has to switch out of Helpit to check team capacity and feature costing, and the sheet hides gaps: most rows have blank day cells and no Total/ROI.

## 2. Goal
A "2027 Planning" sidebar group with two screens that copy the sheet: **Capacity Plan** (editable inputs, computed mandays) and **Swag Costing** (LRP / Adhoc tabs, computed Total and ROI, incomplete rows flagged). Seed only real sheet data. Each known gap becomes a todo, never a guessed value.

## 3. Scope
**In:** sidebar group, two screens, store persistence, one-time seed from the export, gap todos, add/edit/delete rows, moving a row between LRP and Adhoc.
**Out:** live sync with Google Sheets, export to sheet, other years, a link to the Feature tracker or Releases, sorting/filtering (later), a charting library (Capacity v2 uses simple inline bars only).

## 4. Routing and sidebar (no clash with `/planning`)
- `/planning` is the existing **Releases** module (`src/app/planning`, `src/components/planning`, nav id `planning`, "Releases, deadlines, and sprint scope"). Leave it as it is.
- The new module uses **`/lrp-2027`**. Do not use `/planning-2027`: the sidebar marks an item active with `pathname.startsWith(item.href)`, so `/planning-2027` would also highlight "Planning".
  - `/lrp-2027` redirects to `/lrp-2027/capacity`
  - `/lrp-2027/capacity` is the Capacity Plan
  - `/lrp-2027/swag-costing?tab=lrp|adhoc` is Swag Costing (default `lrp`, so the active tab survives a reload or a shared link)
- The sidebar has no grouped nav today (`NAV_ITEMS` is flat in `src/lib/navigation.ts`, rendered by `SidebarNav` in `AppShell.tsx`). Define one:
  - `NavItem` gets an optional `children: { id, label, href }[]`. Add a new `ModuleId` `"lrp2027"` with its icon and style in `src/lib/modules.ts`.
  - The parent row "2027 Planning" sits right after "Planning". It is a button with a chevron, not a link, and it toggles the group.
  - Children are indented: "Capacity Plan" and "Swag Costing". Use the existing active styling on the child. The parent shows a muted active state.
  - The group auto-expands when the current route is under `/lrp-2027`. Remember the manual expand/collapse state in localStorage.
  - Same behavior in the mobile drawer. The mobile header shows the child label (for example "Swag Costing").

## 5. User flow
**Capacity Plan**
*(Superseded by the v2 layout in §9.2.)*
1. Open 2027 Planning > Capacity Plan. The page shows a per-function summary (headcount, mandays per year, monthly bars) and a 12-month strip of potential days with thin months flagged. The full table is collapsed.
2. Edit headcount inline, or click a month to edit working days, holidays, and leaves. Computed values update at once in a local draft.
3. Click Save to persist, or Discard. Undo/Redo work over the draft.

**Swag Costing**
1. Open 2027 Planning > Swag Costing. A Google-Sheets-style tab strip sits at the bottom or top of the grid with **LRP** and **Adhoc**, each showing its row count.
2. LRP shows the 30 seeded rows in sheet order. Adhoc shows an empty state ("No adhoc features yet" + Add row).
3. Add row: a blank row (or dialog) in the current tab. Only Feature Name is required.
4. Edit any cell inline. Delete asks for confirmation.
5. The row menu has "Move to Adhoc" or "Move to LRP". The row goes to the end of the other tab.
6. 1-pager: a URL shows as a link ("Open", new tab, full URL on hover). Text over about 2 lines is cut off and has "Show more / Show less".
7. Incomplete rows (any of the six day cells blank) get a visible marker, such as an amber left border and an "Incomplete" chip, with a tooltip listing the missing cells.

## 6. Data (`src/lib/types.ts`, store)
New optional `DashboardStore` keys. `readStore` defaults them the same way `plotBacklog` and `features` are defaulted.

```
CapacityPlan {
  year: number
  headcount: { product, design, ux, uiArt, animUi, dev, qa: number }
  months: { label: string; workingDays: number; holidays: number; leaves: number }[]   // 12 rows, labels as in sheet ("Sept")
  updatedAt: string
}
SwagFunction = "spec" | "ux" | "art" | "ta" | "dev" | "qa"
TShirtSize   = "XS(0-2)" | "S(2-5)" | "M(5-10)" | "L(10-15)"       // the only sizes present in the sheet
SwagCostingRow {
  id, tab: "lrp" | "adhoc", order: number,
  owner?: string, featureName: string, onePager?: string,
  eoPercent?: number,                         // "0.46%" stored as 0.46
  costs: Record<SwagFunction, { size?: TShirtSize; days?: number }>,
  priority?: string,
  createdAt, updatedAt
}
store.capacityPlan?: CapacityPlan
store.swagCosting?: SwagCostingRow[]
```
- **Computed, never stored:** Potential = working − holidays − leaves. Function mandays = potential × headcount. Total row = column sums. Swag Total = sum of the filled day cells. ROI = EO% / Total, shown as a % with 2 decimals.
- **Seed:** a one-time migration runs when the key is missing. It reads values from the export exactly. Blank cells stay `undefined`. Trailing spaces in names stay (for example "Leagues "). Sheet Total/ROI cells are not stored because they are computed.
- **Owner:** stored as the sheet text ("Aryan" = Aryan Kulkarni per TEAM.md; "Backlog" is kept as text). The new-row owner picker lists TEAM.md names plus "Backlog". No other people.
- **Gap todos:** the same seed migration adds them once (not on every read, never duplicated). Each todo: `source:"manual"`, `status:"todo"`, `priority:"medium"`, `tags:["planning"]`, no due date or owner. One todo per feature:
  - `Fill QA days for <feature> — Swag Costing (LRP)` for Two-Act Quotes - Mid-Puzzle Chapter Break, Butterfly, Daily Quest variation, Adaptive Difficulty Opts, Brilliance boost, Leagues. The description names the row and says QA size is set but QA days are blank in the sheet.
  - `Fill missing costing for Lucky Hour — Swag Costing (LRP)`. The description lists the gaps and the stray "M(5-10)" value (see Open question 1).
- **Dev must not invent any value**: no default days from a T-shirt size, no default headcount, priority, owner or EO.
- API: one route `src/app/api/lrp-2027/route.ts` that follows the existing pattern (`updateStore`, `validation.ts`, `api-client.ts`, `notifyStoreUpdated`).

## 7. Edge cases
- **Empty states:** Adhoc is empty from the start. If capacity data is missing, show an empty card, not zeros.
- **Validation:** numbers must be ≥ 0, and decimals are allowed (leaves are 2.41). A blank day cell means "missing", not 0. If potential days go below 0, show the value in red with a warning and still save.
- **Year:** changing the year only relabels the plan. It does not recalculate working days or holidays (that would be guessing).
- **ROI:** if EO or Total is blank or 0, ROI shows "—".
- **Incomplete rows:** Total shows the partial sum, and the row is still flagged.
- **Large lists:** the grid scrolls horizontally with Owner and Feature Name pinned. The header stays sticky. It must work with 100+ rows.
- **Invalid URLs** in the 1-pager are shown as plain text.
- **Concurrent writes:** use the existing `updateStore` (Blob optimistic retry).

## 8. Acceptance criteria
- [ ] The sidebar shows "2027 Planning" with a chevron. It expands to Capacity Plan and Swag Costing (desktop and mobile drawer), and auto-expands on `/lrp-2027/*`.
- [ ] Visiting `/lrp-2027/*` does **not** highlight "Planning", and `/planning` still works unchanged.
- [ ] On a fresh store, Capacity Plan shows year 2027, headcount 4/1/1/1/1/2/2 and the 12 months from the sheet. Totals: working 261, holidays 6, leaves 28.92, potential 226.08, Product 904.32, Design/UX/UI-Art/Anim 226.08, Dev/QA 452.16.
- [ ] Editing any input recomputes the row and the totals, and the change persists after reload.
- [ ] Swag Costing LRP shows exactly 30 rows in sheet order, and Adhoc shows the empty state.
- [ ] Streak Week Strip shows Total 12 / ROI 0.04%, and Daily Reward on D0 shows Total 12 / ROI 0.06% (matches the sheet).
- [ ] Rows with blank day cells show the Incomplete marker, and blank cells stay blank (not 0).
- [ ] 1-pager URLs open in a new tab, and long text cuts off with Show more.
- [ ] Add, edit, delete and move-between-tabs work in both tabs and persist. Tab counts update.
- [ ] The Tasks tab has exactly 7 new todos (6 QA-days + Lucky Hour) with the fields above. Re-loading the app does not duplicate them.
- [ ] No value exists in the store that is not in the export or entered by the user.

## 9. UX

### 9.1 Decisions that close earlier "or" choices
- **Tab strip goes at the top** of the grid, under the toolbar. It keeps the Sheets look (flat tabs joined to the grid edge) but stays visible without scrolling. Reuse `Tabs` (counts are already supported). UI picks the visual variant.
- **Add row is inline.** It adds a blank row at the end of the current tab with focus in Feature Name. No dialog on desktop. Phones use a bottom sheet (§9.5).
- **Each function is one combined cell** (`<size> · <days>`, for example `XS · 2`). This cuts 12 cost columns to 6, so the grid has **13 visible columns** instead of 19. The data model does not change: size and days are still separate fields, edited side by side inside the cell.
- **Moving a row is not confirmed** because it can be reversed. It shows feedback with Undo. **Deleting a row is confirmed** because it cannot be undone.
- Overdue and done states do not apply to this module. Neither screen has dates or a status.

### 9.2 Capacity Plan v2 (`/lrp-2027/capacity`)
Replaces the v1 spreadsheet layout. User feedback: headcount takes too much space, accidental saves, no undo, number spinners change on scroll, broken two-row "Mandays" header, and "feels like a Google Sheet".
Answers first: **"How many mandays does each function have in <year>, and which months are thin?"** Insight first, inputs second, full table last (collapsed).
Data model and formulas are unchanged (§6). Every number must still match the sheet (§8).

```
┌ PageHeader: Capacity Plan <year>          ● Unsaved changes  [↶][↷] [Discard] [Save] ┐
├ Card: By function ────────────────────────────────────────────────────────────────────┤
│ Function      Headcount     Mandays/yr   Jan ... Dec (12 mini bars, mandays/month)     │
│ Product       [ <n> ]       <sum>        ▂▃▅▅▃▁▅▅▅▅▃▂                                  │
│ Design        [ <n> ]       <sum>        ▂▃▅▅▃▁▅▅▅▅▃▂                                  │
│ ... (UX, UI/Art, Anim+UI, Dev, QA — 7 rows)                                            │
│ Total         <sum>         <sum>                                                      │
├ Card: Months (potential days per person) ────────────────────────────────────────────┤
│  █    █    █    █    ▆    ▃    █    █    █    █    ▆    ▄     ← bar = potential days   │
│ Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sept Oct  Nov  Dec                             │
│ <n>  <n>  <n>  ...                                            ← value under each bar   │
│ Thin: <month> (<n> holidays, <n> leaves) · <month> ...        ← one-line callout       │
│ Click a month to edit working days, holidays, leaves.                                  │
├ ▸ View full table (collapsed by default) ─────────────────────────────────────────────┤
└───────────────────────────────────────────────────────────────────────────────────────┘

Month popover (opens anchored to the clicked bar; bottom sheet on phone):
┌ <month> ───────────────────── [×] ┐
│ Working days   [ <n> ]            │
│ Holidays       [ <n> ]            │
│ Leaves         [ <n> ]            │
│ Potential      <calc>  (live)     │
│        [◀ Prev]  [Next ▶]  [Done] │
└───────────────────────────────────┘
```

**By function (top card).** One row per function, 7 rows + Total. This is the answer to "how much capacity per function".
- Headcount is a small inline text input in the row (about 4 characters wide), not a labelled box grid. All 7 fit on one screen without wrapping.
- Mandays/yr is the column sum (same as the v1 Total row). It is the biggest number in the row.
- The mini bars show that function's 12 monthly mandays, so dips are visible without reading numbers. Hover or focus on a bar shows `<month>: <n> mandays`.
- Changing headcount updates that row's total and bars at once, with a brief highlight.

**Months strip (second card).** One bar per month for potential days, with the value under it.
- **Thin month** = potential days at least 10% below the 12-month average. Thin bars get a warning style and a "Thin" marker. A one-line callout lists the thin months with their holidays and leaves, so the cause is clear. If no month is thin, hide the callout.
- Negative potential shows the bar at 0 with the danger value and "Leaves + holidays exceed working days."
- Clicking a bar (or Enter/Space on it) opens the **month popover**. Fields: Working days, Holidays, Leaves, and Potential shown live. Prev/Next moves to the adjacent month without closing. Esc or Done closes it. Edits go into the draft, not the server.

**View full table (collapsed).** A disclosure under the months card for anyone who wants the sheet view. Default closed, and the open/closed state is remembered in localStorage.
- **One header row only**, with no "Mandays" group row: `Month | Working | Holidays | Leaves | Potential | Product | Design | UX | UI/Art | Anim | Dev | QA`. Full names appear on hover.
- Total row first, Month column pinned. Working/Holidays/Leaves are editable here too, and they feed the same draft.

**Year.** Moved out of the header into a small "Plan year" text field inside the full-table disclosure (it rarely changes). Helper text: "Relabels the plan only. Days are not recalculated."

**Editing model: draft + Save** (replaces save-on-blur for this screen only. Swag Costing keeps §9.4.)
- Every edit (headcount, month fields, year) changes a local draft. Nothing is sent until **Save**.
- With no changes, the header shows a muted "All changes saved" and Save/Discard are disabled. With changes: "● Unsaved changes (<n>)", Save (primary) and Discard enabled.
- **Undo/Redo** buttons work over the draft. Shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, Ctrl/Cmd+S save. They don't fire while the user is typing in a field (the browser's own text undo applies there). Each committed field change is one undo step. Undo past the last save is allowed until Save. After Save the history clears.
- **Discard** asks "Discard <n> unsaved changes?" [Cancel] [Discard]. The dialog opens with focus on Cancel.
- **Save** sends one patch with all changes. While saving, the button shows "Saving…" and is disabled. On success it shows "Saved" for about 2s. On failure it shows an inline `Alert` "Couldn't save. Your changes are kept." with Retry. The draft is never dropped.
- **Leave guard:** while there are unsaved changes, sidebar navigation and in-app links show "You have unsaved changes" with [Stay] [Discard and leave] [Save and leave]. Reload/close uses the browser's `beforeunload` prompt.
- If the store updates from elsewhere while there are unsaved changes, keep the draft and show "Plan changed elsewhere. Saving will overwrite it." with a [Reload] option.

**Inputs (all fields on this screen).**
- Plain text inputs (`type="text"`, `inputMode="decimal"`, headcount and year use `inputMode="numeric"`). No spinner arrows. Mouse wheel and Up/Down arrows never change the value.
- Validate on blur and on Save. Errors: "Must be 0 or more.", "Enter a number.", and "Enter a whole number." (year only). An invalid field keeps the typed text, shows the error under it, and blocks Save. Save shows "Fix <n> fields" and focuses the first invalid field.
- Enter commits the field. Esc reverts the field to its value before editing.

**Keyboard.** Tab order: header actions → headcount inputs (top to bottom) → month bars (Left/Right arrows move between months, Enter opens) → full-table toggle. In the popover, Tab cycles through its fields, and focus returns to the bar on close.

### 9.3 Swag Costing (`/lrp-2027/swag-costing?tab=…`)
What it answers first: "Which features are missing costing, and what does each cost against its EO?"

```
┌ PageHeader: Swag Costing                                  Saved ✓  [+ Add row] ┐
│ <n> features · <n> incomplete · <n> total days         (plain summary line)    │
├ Tabs: [ LRP <n> ●<n> ] [ Adhoc <n> ]     ● = incomplete count, only when > 0   │
├───────────────────────┬──────────────────────────────────────────┬────────────┤
│ PINNED LEFT           │ SCROLLS →                                 │ PINNED RIGHT│
│ Owner │ Feature       │ 1-pager │EO │Spec│UX │Art│TA │Dev│QA │Pri │Total│ROI│⋯│
├───────┼───────────────┼─────────┼───┼────┼───┼───┼───┼───┼───┼────┼─────┼───┼─┤
│<owner>│<feature name> │ Open ↗  │<%>│XS·2│…  │   │   │   │XS·—│    │ <n> │<%>│⋯│
│▌amber │ [Incomplete]  │<text…>  │   │    │   │   │   │   │    │    │<n>  │ — │⋯│
│       │               │Show more│   │    │   │   │   │   │    │    │partial│ │ │
├───────┴───────────────┴─────────┴───┴────┴───┴───┴───┴───┴───┴────┴─────┴───┴─┤
│ + Add row                                                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```
- **Pinned left:** Owner and Feature Name. The Incomplete chip sits inside the Feature cell, so the flag is visible at any scroll position.
- **Pinned right:** Total, ROI and the row menu (⋯). These are the outcome columns, so they stay in view while the costing columns scroll.
- **Sticky header** stays in view while the page scrolls vertically. Edge shadows show when more columns sit to the left or right (`scroll-fade-x` already does this).
- Column order and labels follow the sheet. Short headers are Spec, UX, Art, TA, Dev, QA, Pri. The full name ("Spec Costing") shows on hover.
- At laptop width (about 1280px with the sidebar), the pinned columns plus 4 or 5 cost columns fit, and the rest scroll. The 1-pager column has a fixed width with a 2-line clamp. "Show more" grows only that row.
- A blank day cell shows a muted "—" with a "missing" style, so it never looks like 0. Total shows the partial sum with the label "partial". ROI shows "—" when EO or Total is blank or 0.
- The incomplete tooltip lists the missing cells by name, for example "Missing: QA days". It is also readable by screen readers, not only on hover.

### 9.4 Editing and keyboard (both screens)
- **Grid navigation:** arrow keys move between cells. Enter or typing starts editing. Enter saves and moves down. Tab saves and moves right. Esc cancels. Clicking outside the cell (blur) saves.
- **Function cell editing:** shows a size select and a days number field next to each other. Tab moves between the two fields. Choosing a size does **not** fill in days.
- **Owner editing:** a select listing TEAM.md names plus "Backlog". Seeded text that is not in the list (for example "Aryan") still shows as the current value.
- **Validation:** shown inline under or next to the cell, and the value is not saved.
  - Negative number: "Must be 0 or more."
  - Empty Feature Name on an existing row: the edit reverts and shows "Feature name can't be empty."
  - Negative Potential: saved, with the value shown as a warning and the tooltip "Leaves + holidays exceed working days."
- **Save feedback:** a single status in the page header shows "Saving…", then "Saved". On failure, `ErrorBanner` shows "Couldn't save <field>. Retry". The cell keeps the typed value and shows an error marker until the retry succeeds. Typed values are never silently dropped.
- **New row:** the row is saved only after Feature Name has text. Pressing Esc or leaving an untouched new row removes it. If an empty new row is already open, "Add row" focuses it instead of adding a second one.

### 9.5 Row actions (⋯ menu, uses `Menu`)
- The menu has "Move to Adhoc" (or "Move to LRP" when in Adhoc) and "Delete row". It opens from the keyboard with Enter on ⋯ or Shift+F10 on the row.
- **Move:** the row leaves the current tab and goes to the end of the other tab. Both tab counts update. An inline notice shows "Moved <feature name> to <tab>." with **Undo** and **View** actions. Undo puts the row back in its original position. View switches tab and scrolls to the row with a highlight. The notice dismisses after a few seconds or when the user performs the next action.
- **Delete:** a `Modal` asks "Delete <feature name>?" with the body "This can't be undone." The buttons are Cancel (default focus) and Delete (destructive). After deleting, focus moves to the next row, or to the previous row if it was the last one.

### 9.6 States
| State | Capacity Plan | Swag Costing |
|---|---|---|
| Loading | `PageSkeleton`: header, 7 function rows, 12-bar strip (same heights, no layout shift) | Header, tabs and about 8 skeleton rows. The pinned-column layout stays the same so nothing shifts when data arrives. |
| Load error | `ErrorBanner` "Couldn't load the capacity plan." + Retry | Same message, with "Swag Costing" |
| Empty | `EmptyState` "No capacity plan yet". Never shows zeros (see Q6). | **Adhoc:** "No adhoc features yet" + [Add row] + hint "Or move a row here from LRP using ⋯." **LRP empty:** "No LRP features" + [Add row] |
| Incomplete | n/a | Amber left border + "Incomplete" chip + missing-cells tooltip + "partial" Total. The incomplete count appears in the tab and the summary line. |
| Editing | Draft (v2): "● Unsaved changes (<n>)" + Save/Discard/Undo/Redo; changed fields marked until saved; leave guard active | Active cell outlined. A moved or deleted row is removed only after the save succeeds. If the save fails, it is restored and the error banner shows. |
| Save error | Inline `Alert` "Couldn't save. Your changes are kept." + Retry; draft kept | Cell error marker + banner Retry |
| Invalid input | Error under field, Save blocked with "Fix <n> fields" | Inline error, value not saved |
| Thin month | Warning bar + "Thin" marker + callout line; no callout when none | n/a |

### 9.7 Phone width (< 640px)
- **Swag Costing turns into a card list.** No wide table is used. Each card shows Feature Name with the Incomplete chip, Owner, EO, Total and ROI on one line. Tapping a card expands it to show a 2×3 grid of function costs (`Spec XS·2`), the 1-pager (Open link or clamped text) and Priority. The ⋯ menu sits on the card.
- On phones, editing and adding use a `Modal` bottom sheet with all fields. Feature Name comes first, and Save is disabled until it has text.
- The tab strip is sticky under the mobile header. Tab counts stay visible.
- **Capacity Plan (v2):** By-function rows drop the mini bars and show Function · headcount input · Mandays/yr on one line. The months strip becomes 2 rows of 6 bars. The month editor opens as a `Modal` bottom sheet. Save/Discard stick to the bottom of the screen while there are unsaved changes, and Undo/Redo collapse into a ⋯ menu. The full table scrolls horizontally with Month pinned.

## 10. UI

Tokens and `src/components/ui` only. No hex, no new colors. New UI pieces: a `variant="sheet"` on the existing `Tabs`, plus a small `Popover` wrapper (only if one doesn't exist) for the Capacity month editor (§10.4). Every color below has a dark value in `globals.css`, so dark mode needs no `dark:` overrides. White/black opacities are allowed **only in the sidebar** (it is dark in both themes).

### 10.1 Sidebar group (`AppShell.tsx` `SidebarNav`)
- **Icon:** `lrp2027: Table2` (lucide) in `MODULE_ICONS`. Use `NEUTRAL_MODULE_STYLE` in `MODULE_STYLES`.
- **Parent row:** a `<button aria-expanded aria-controls>` with the same classes as a nav `Link`: `h-10` (`h-11` large), `rounded-control px-2 gap-3 text-sm font-medium`, 28px icon well, `focus-visible:ring-2 ring-signal`. Add a trailing `ChevronRight h-3.5 w-3.5 ml-auto text-sidebar-muted transition-transform`, with `rotate-90` when open.
  - Idle: `text-sidebar-foreground/85 hover:bg-white/[0.05] hover:text-white`.
  - Child active (muted active): `text-white`, icon `text-sidebar-foreground`. **No** bg fill and **no** signal bar. Those belong to the active child only.
- **Children:** a `<ul id>` with `relative mt-0.5 space-y-0.5 pl-10`, which lines child text up with the parent label. Add a guide line `absolute inset-y-1 left-[22px] w-px bg-white/10` (under the icon center).
  - Child link: `h-9` (`h-10` large), `px-2 text-[13px] font-medium rounded-control truncate`, no icon. Active and hover use the existing nav classes: `bg-white/[0.07] text-white` plus the `w-[3px] bg-signal` bar at the child's left edge, and `aria-current="page"`.
- No expand animation beyond the chevron rotate (the global reduced-motion rule covers it).

### 10.2 Shared cell language (both screens)
| Cell kind | Classes | Notes |
|---|---|---|
| Editable | `bg-card text-info font-medium tabular-nums`, hover `ring-1 ring-inset ring-border-strong`, `cursor-text` | Blue text means input (the Sheets convention). Never put a hover ring on computed cells. |
| Computed | `bg-surface-2 text-foreground tabular-nums cursor-default` | Opaque `surface-2`, not `/60`, because pinned cells must not show content scrolling underneath. |
| Active edit | `ring-2 ring-inset ring-signal bg-card` | Inside it, `Input`/`Select` `size="sm"`, borderless (`border-0 focus:ring-0`) so the cell keeps its size. |
| Error | `ring-2 ring-inset ring-danger bg-danger-soft` + `FieldError` text-[11px] under the cell | Keeps the typed value. |
| Missing (blank day) | muted `—` in `text-muted` on `bg-caution-soft`, with `<span class="sr-only">missing</span>` | Never `text-subtle` (essential info). |
| Warning value (Potential < 0) | `text-danger font-semibold` + `AlertTriangle h-3 w-3` + `title` | |
| Changed column flash | `bg-accent-soft` that fades back over about 600ms (`transition-colors`) | |
- Numbers are right-aligned with `tabular-nums`. Text is left-aligned.
- **Legend** (under PageHeader, `text-[11px] text-muted`): two 10px swatches, `bg-card ring-1 ring-border` labelled "Editable" in `text-info`, and `bg-surface-2` labelled "Calculated".
- **Save status** sits in the PageHeader actions, `text-[11px] text-muted`. "Saving…" uses `Loader2 animate-spin h-3 w-3`. "Saved" uses `Check h-3 w-3 text-success`. Use `aria-live="polite"`.

### 10.3 Grid shell (both tables)
- Base: `tableClasses` (wrapper, headRow, row). Dense override: cells `px-2 py-1.5 text-xs`, rows about 36px. Header cells `whitespace-nowrap`.
- **Sticky header needs its own scroll box.** `main` scrolls vertically and the wrapper is `overflow-x-auto`, so `sticky top-0` would not stick to page scroll. Make the wrapper `overflow-auto max-h-[calc(100dvh-13rem)]` (lg) and give `thead th` `sticky top-0 z-20 bg-surface-2`.
- **Pinned columns:** `sticky z-10` with an opaque bg (`bg-card` or `bg-surface-2`). Corner header cells get `z-30`. Use fixed widths so the `left-*` offsets are stable.
- **Pinned edges:** `shadow-[1px_0_0_var(--border-strong)]` on the last left-pinned column and `shadow-[-1px_0_0_var(--border-strong)]` on the first right-pinned one. **Do not rely on `scroll-fade-x`.** It only applies below 640px (where Swag uses cards), and it masks the right edge, which would fade the pinned Total/ROI.
- Row hover `hover:bg-surface-2/60` applies to non-pinned cells only. Pinned cells use `group-hover:bg-surface-2` so they stay opaque.

### 10.4 Capacity Plan (v2, matches §9.2)
Dashboard, not a sheet: two `Card`s with air between them, no gridlines outside the collapsed table, no legend row (drop the Editable/Calculated legend on this screen). Page stack `space-y-4`. Bars are plain `div`s with `%` heights; no charting library. Every color is a token, so dark mode needs no `dark:` classes.

**Inputs (all on this screen).** `Input size="sm"` with `type="text"`, `inputMode="numeric"` (headcount, year) or `"decimal"` (days), `text-right tabular-nums text-info font-medium`. No `type="number"` anywhere, so no spinners and no wheel changes. Changed-but-unsaved field: `ring-1 ring-inset ring-accent` + a 6px `bg-accent` dot before it (sr-only "edited"). Invalid: `border-danger bg-danger-soft` + `FieldError` (`text-[11px]`) below; keeps the typed text.

**Header + draft bar.** `PageHeader` (module icon, title "Capacity Plan <year>", subtitle as today). Actions `flex items-center gap-2`, wrapping on narrow widths:
- Status `text-xs`, `aria-live="polite"`: clean = `text-muted` "All changes saved"; dirty = `text-caution font-medium` with a 6px `bg-caution-mark` dot, "Unsaved changes (<n>)"; saving = `Loader2 h-3 w-3 animate-spin` "Saving…"; saved = `Check h-3 w-3 text-success` "Saved" (~2s).
- Undo/Redo: `Button variant="ghost" size="sm"` icon-only `h-8 w-8`, `Undo2`/`Redo2 h-4 w-4`, `aria-label` + `title` with the shortcut; disabled when the stack is empty.
- `Button variant="secondary" size="sm"` Discard, then `Button variant="primary" size="sm"` Save (`Save h-3.5 w-3.5`). Both disabled when clean. Invalid fields: Save label becomes "Fix <n> fields".
- Save error / "Plan changed elsewhere": `Alert` directly under the header (danger / info tone) with a ghost `Button size="sm"` Retry / Reload.
- Discard confirm and leave guard: `Modal`, Cancel/Stay is `secondary` with autofocus, Discard is `danger`, "Save and leave" is `primary`.

**Card 1: By function.** `Card` `p-0`; `CardHeader` title "By function", right side `text-xs text-muted` "Mandays in <year>".
- Rows: CSS grid, not a `<table>` look: `grid grid-cols-[8rem_4.5rem_6rem_1fr] items-center gap-x-4 px-4 h-11`, divided by `divide-y divide-border`. Column labels in one `text-[11px] uppercase tracking-[0.06em] text-muted` row (`h-8`, `bg-surface-2`).
- Function: `text-sm font-medium text-foreground truncate`. Headcount: `Input size="sm" w-14` (about 4 chars), `aria-label="<function> headcount"`.
- Mandays/yr: `text-base font-semibold tabular-nums text-foreground text-right` (largest number in the row).
- Mini bars: `flex items-end gap-[3px] h-7`, 12 bars `flex-1 max-w-3 rounded-t-[2px] bg-info`, height = month / function max (min 2px so zero is visible). A thin month's bar uses `bg-caution-mark`. Each bar has `title="<month>: <n> mandays"` and the group gets `role="img"` + `aria-label` with the 12 values.
- Headcount change: row flashes `bg-accent-soft` and fades over ~600ms (`transition-colors`); bars animate height `transition-[height] duration-300` (reduced-motion rule turns it off).
- Total row: `bg-surface-2 font-semibold`, label `text-[11px] uppercase tracking-[0.06em] text-muted`, headcount sum as plain text (not an input), Mandays/yr `text-base`. No bars.

**Card 2: Months.** `Card` `p-4`; `CardHeader` title "Months", right `text-xs text-muted` "Potential days per person · avg <n>".
- Strip: `grid grid-cols-12 gap-2`. Each month is a `button` (`rounded-control p-1.5 flex flex-col items-center gap-1.5 hover:bg-surface-2 focus-visible:ring-2 ring-signal`, `aria-label="<month>, <n> potential days[, thin]. Edit"`, roving tabindex for Left/Right).
  - Track `h-24 w-full max-w-8 rounded-[4px] bg-surface-2 flex items-end`, fill `w-full rounded-[4px] bg-info`, height = potential / max.
  - Below: month `text-[11px] text-muted`, value `text-sm font-semibold tabular-nums text-foreground`.
  - Average: a 1px dashed line `border-t border-dashed border-border-strong` across the strip at avg height (`aria-hidden`).
  - **Thin:** fill `bg-caution-mark`, value `text-caution`, and `Badge tone="caution"` "Thin" (`text-[10px]`) above the track. Negative potential: fill height 0, value `text-danger` + `AlertTriangle h-3 w-3`, `title="Leaves + holidays exceed working days."`.
  - Open month: `bg-surface-2 ring-1 ring-border-strong` while its popover is open.
- Callout (only when thin months exist): `mt-3 flex items-start gap-2 rounded-control bg-caution-soft px-3 py-2 text-xs text-caution`, `AlertTriangle h-3.5 w-3.5`, text "Thin: <month> (<n> holidays, <n> leaves) · …", months in `font-semibold`. Then hint `text-[11px] text-muted` "Click a month to edit working days, holidays, leaves."

**Month popover (new, small).** Reuse the `Menu` popover surface (`bg-card border border-border rounded-card shadow-card`) anchored under the bar, `w-64 p-3`, `role="dialog" aria-labelledby`. If a reusable `Popover` wrapper doesn't exist, add it next to `Menu` in `src/components/ui` (this is the only new component). Phones use `Modal` (bottom sheet).
- Header: month `text-sm font-semibold` + ghost `X` icon button `h-7 w-7`.
- Fields: `grid grid-cols-[1fr_5rem] items-center gap-y-2`, `Label text-xs` + `Input size="sm"` (rules above).
- Potential: `border-t border-border pt-2`, `text-sm font-semibold tabular-nums` (danger style when negative).
- Footer `flex justify-between pt-2`: ghost `size="sm"` Prev/Next (`ChevronLeft`/`ChevronRight`, disabled at Jan/Dec), `primary size="sm"` Done.

**View full table (collapsed).** A `button` row `h-10 px-1 text-sm font-medium text-muted hover:text-foreground` with `ChevronRight` (`rotate-90` when open), `aria-expanded aria-controls`. Open content is a `Card` `p-0`:
- Top strip `px-4 py-3 border-b border-border`: "Plan year" `Label` + `Input size="sm" w-20` (`inputMode="numeric"`) + hint "Relabels the plan only. Days are not recalculated."
- Table uses §10.2/10.3 cell language (dense, pinned Month `w-20`, sticky Total row `bg-surface-3`).
- **Header is one row:** `Month | Working | Holidays | Leaves | Potential | Product | Design | UX | UI/Art | Anim | Dev | QA`, full name in `title`. Every `th`: `sticky top-0 z-20 h-9 px-2 align-bottom pb-2 leading-none whitespace-nowrap bg-surface-2`, numbers `text-right`. Total row `sticky top-9` (equal to the fixed `h-9`, so no measured offset). A `border-l border-border` before Product is the only "mandays" grouping cue.
- **Why the current header breaks (fix in `CapacityPlanView.tsx` ~L285–320):** it mixes `rowSpan={2}` cells (vertically centered by default) with a `colSpan` "Mandays" row, so the left labels and the function labels sit on different baselines. Sticky offsets are hard-coded (`top-6` on row 2, `[--thead-h:3.5rem]` for the Total row) while the shared `headCell` adds `py-2`, so real row heights drift from those numbers and the second row/Total row overlap or gap on scroll. Fix: delete the group row and all `rowSpan`/`colSpan`, one `<tr>` with fixed `h-9` + `align-bottom`, Total row at `top-9`, drop `--thead-h`.

**States.** Loading: `PageSkeleton` with 8 `Skeleton h-11` rows and a 12-column `Skeleton h-24` strip (same sizes, no shift). Empty: `EmptyState` with module icon. Focus: global `focus-visible` signal ring everywhere. Disabled: `Button`/`Input` built-ins.

**Phone (< 640px).** By-function grid becomes `grid-cols-[1fr_4rem_5rem]` (bars hidden, `hidden sm:flex`). Months strip `grid-cols-6 gap-y-3`, track `h-16`. Draft actions move to a `fixed inset-x-0 bottom-0 z-30 bg-card border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]` bar (Discard + Save `flex-1`), shown only when dirty; Undo/Redo go into a `Menu` (`MoreHorizontal`) in the header; add `pb-20` to the page when the bar shows. Month editor = `Modal`. Full table scrolls horizontally inside its card with Month pinned (`w-16`); inputs `h-10`.

### 10.5 Swag Costing
- **Toolbar:** PageHeader (title, save status, `Button` primary `size="sm"` "+ Add row" with `Plus`). Below it, the summary line `text-xs text-muted` with the counts in `text-foreground font-semibold`, and the incomplete count in `text-caution`.
- **Tab strip = `Tabs variant="sheet"`** (new variant, same props and counts; the default pill variant is unchanged):
  - Track: `flex gap-0.5 border-b border-border` with no `surface-2` pill. It sits flush on top of the grid card, and the grid wrapper gets `rounded-t-none` when it follows the strip.
  - Tab: `h-9 px-4 text-xs font-semibold rounded-t-control border border-b-0`.
    - Inactive: `bg-surface-2 text-muted border-transparent hover:text-foreground hover:bg-surface-3`.
    - Active: `bg-card text-foreground border-border -mb-px` plus a 2px top bar `shadow-[inset_0_2px_0_var(--signal)]`.
  - Count: the existing count pill. Incomplete marker: `ml-1 inline-flex items-center gap-1 text-[11px] text-caution`, a 6px `bg-caution-mark` dot plus the number, with `aria-label="<n> incomplete"`. Shown only when > 0.
  - Use `role="tablist"`/`tab` + `aria-selected` for this variant (it controls the URL `?tab=`).
- **Columns (widths):** pinned left are Owner `w-28` (`left-0`) and Feature `w-60` (`left-28`). Scrolling: 1-pager `w-48`, EO `w-16`, Spec/UX/Art/TA/Dev/QA `w-24` each, Pri `w-20`. Pinned right are Total `w-20` (`right-[7.5rem]`), ROI `w-20` (`right-10`) and ⋯ `w-10` (`right-0`). Full header names go in `title` + `abbr`.
- **T-shirt chip (function cell):** `Badge tone="neutral"` with `min-w-7 justify-center font-mono`, showing only the letter (`XS`, `S`, `M`, `L`). The full value (`XS (0-2)`) goes in `title`/sr-only. Then `·` (`text-subtle`, aria-hidden), then days in `text-info tabular-nums`. A missing size or days uses the Missing style for that half only. The chips are all one neutral tone: size is a label, not a status, so it gets no color ramp.
  - Editing: `Select size="sm" w-16` + `Input size="sm" w-12 type="number"`, `gap-1`, inside the cell.
- **Incomplete row:**
  - The Owner cell (pinned, so it is always visible) gets `shadow-[inset_3px_0_0_var(--caution-mark)]`.
  - The Feature cell shows `Badge tone="caution"` "Incomplete" with `AlertTriangle h-3 w-3` after the name. It has `aria-describedby` pointing to a visually hidden "Missing: QA days" (also the `title`).
  - Total shows `<n>` plus `text-[10px] text-caution` "partial" under it. ROI shows `—` in `text-muted`.
- **Feature name:** `text-xs font-medium text-foreground`, `truncate` with the full name in `title`. The chip stays visible, so the name truncates, never the chip.
- **1-pager:** a URL renders as `text-accent hover:text-accent-hover underline-offset-2 hover:underline` "Open" + `ExternalLink h-3 w-3`, with `target="_blank" rel="noopener"` and the full URL in `title`. Text renders as `line-clamp-2 text-muted`, and "Show more / Show less" is a `text-[11px] font-semibold text-accent` button.
- **Row menu:** `Menu` triggered by a ghost icon `Button` `h-7 w-7` with `MoreHorizontal`, `aria-label="Row actions for <feature>"`. "Delete row" uses the danger item style.
- **Move notice:** `Alert` tone `info`, inline above the grid, with `Button variant="ghost" size="sm"` Undo / View. **View highlight:** the row gets `tableClasses.selectedRow` for about 2s.
- **Delete:** `Modal` with `Button` secondary Cancel (autofocus) and danger Delete.
- **Add-row footer:** a full-width `button` in the last row, `h-9 text-xs font-semibold text-muted hover:text-foreground hover:bg-surface-2` with `Plus`.
- Adhoc/LRP empty: `EmptyState` inside the grid card, under the tab strip, so the strip stays visible.

### 10.6 States
- Focus: always the global `focus-visible` signal ring. In the grid, the active cell ring (10.2) replaces the outline (`outline-none`).
- Disabled: `Button`/`Input` built-ins (`disabled:bg-surface-2 text-muted`). In the phone sheet, Save is disabled until Feature Name has text.
- Loading: `Skeleton` rows with the **same column widths** and pinned layout, so nothing shifts when data arrives.

### 10.7 Phone (< 640px)
- **Swag:** the tab strip is `sticky top-0 z-20 -mx-4 px-4 bg-background` (inside `main`, which is the scroll container under the h-14 header).
- **Swag cards:** a `Card` list with `p-3`, `space-y-2`.
  - Row 1: Feature (`text-sm font-semibold`, `line-clamp-2`), then the Incomplete badge and ⋯ (right).
  - Row 2: `text-xs text-muted`, "Owner · EO · Total · ROI", with values in `text-foreground tabular-nums`.
  - An incomplete card gets `shadow-[inset_3px_0_0_var(--caution-mark)]`.
  - Expanded: `grid grid-cols-3 gap-1.5` of function tiles (`rounded-chip bg-surface-2 p-1.5`, label `text-[10px] uppercase text-muted`, then chip · days). The 1-pager and Pri are below. Expand uses `ChevronDown` with `aria-expanded`.
- **Edit/Add:** `Modal` (it is already a bottom sheet on phones). Fields stack, with each function as a size `Select` + days `Input` in `grid-cols-2`.
- **Capacity:** see §10.4 Phone. Tap targets for editable cells are at least `h-10`.
- 375px checks: the PageHeader actions wrap below the title (`flex-wrap`). The summary line wraps, never truncates. No horizontal page scroll; only the Capacity table scrolls.

## 11. Open questions
1. **Lucky Hour mismatch:** the export does not match the brief. By column position, Lucky Hour has Dev = XS(0-2)/2 and QA size = XS(0-2). Only **QA days** is blank. "M(5-10)" sits **two columns right of Priority** (an unlabeled column), not in Priority. Spec choice: seed by column position, leave Priority blank, and put "M(5-10)" in the todo so the user decides whether it is the priority or a misplaced size. Confirm with the user or re-check the sheet.
2. Are there more T-shirt sizes (for example XL) to offer in the dropdown?
3. Should Priority be free text or a fixed list? There are no real values in the sheet yet.
4. Ten rows have no 1-pager (Uttam's "Timed hint…", all Mangesh rows, both Backlog rows). Do these need todos too? Not created for now.
5. Should Capacity Plan mandays ever feed Swag Costing (for example, capacity vs. demand per function)? Not in scope for now.
6. If the capacity plan is missing (for example, deleted from the store), should the empty state offer "Set up plan" with 12 blank months and blank headcount, or only point to the sheet? Neither option invents values. Until the user decides, the empty state shows a message only.
