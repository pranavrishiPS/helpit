# Visual redesign: "Ink & signal orange"

Status: implemented (colour + surface pass on top of the earlier "Arcade Night" layout) · Owner: UI · Scope: whole app (shell, all pages, shared UI)
Visual only. No data, API, or behavior changes unless a line below says "(tiny API add)".

---

## 1. Direction

**Ink & signal orange.** Calm and editorial. A near-black ink sidebar, warm paper canvas, white cards with a thin warm-grey border, and one accent: a signal orange used sparingly. Surfaces are flat. Shadows are subtle and neutral (ink at low alpha). There are **no** gradients, glows, coloured shadows, purple, or per-module rainbow hues. Modules are told apart by icon shape and label, not colour; the active nav item is marked with the orange accent. Headings use Bricolage Grotesque, UI text stays in Geist. Motion stays quiet: a hover lift, a press, and a little pop when you check something off.

The look should feel like a producer's cockpit: dense, scannable, AA contrast everywhere, and no decoration that costs space on 375px.

**Two oranges.** `--signal` `#E8590C` fails AA as text and behind white text, so it is for non-text marks only (active-nav bar, focus ring, dots, progress fills, left/top indicator bars). `--accent` `#C2410C` is the text-safe orange for links, accent text, and primary button fills.

**Dark mode: not in this pass.** The sidebar is already dark. A full dark theme needs dark versions of every soft tint, the calendar banners, and native date pickers, which roughly doubles the QA. Every color below is a CSS variable, so adding `@media (prefers-color-scheme: dark)` later only means overriding the `:root` values. For now, set `color-scheme: light`.

---

## 2. Tokens (`src/app/globals.css`)

Replace the current `:root` and `@theme inline` blocks with the ones below. **Back-compat aliases** keep every existing class (`text-warning`, `bg-accent-secondary/10`, `text-brand`, …) compiling and looking reasonable, so pages can be migrated one at a time.

### 2.1 Color variables (light)

```css
:root {
  color-scheme: light;

  /* Neutrals — warm paper + ink */
  --background: #F6F4EF;      /* app canvas (paper) */
  --card: #FFFFFF;            /* cards, inputs, popovers, modals */
  --surface-2: #F1EEE7;       /* wells, table heads, hover fill, section bands */
  --surface-3: #E8E4DB;       /* pressed/selected neutral, progress tracks, skeletons */
  --border: #E4E0D8;          /* card + divider lines (decorative) */
  --border-strong: #D3CDC2;   /* hover borders, dashed drop zones */
  --border-input: #8C857A;    /* form control outline — 3.6:1 on white (WCAG 1.4.11) */

  --foreground: #1A1918;      /* body + headings (ink) */
  --muted: #6F6A62;           /* secondary text — see §2.5 */
  --subtle: #A39E94;          /* placeholders, decorative icons, disabled. NEVER essential text */

  --brand: #1A1918;           /* = ink; kept for back-compat (text-brand) */
  --brand-hover: #000000;

  /* Accent */
  --accent: #C2410C;          /* text-safe orange: links, accent text, primary fills (white text) */
  --accent-hover: #9A3412;
  --accent-soft: #FDF0E8;
  --signal: #E8590C;          /* NON-TEXT marks only: active nav bar, focus ring, dots, progress */
  --pop: var(--signal);       /* back-compat alias — text on it must be ink */
  --pop-ink: var(--accent);
  --pop-soft: var(--accent-soft);

  /* Semantic — each text colour passes 4.5:1 on white AND on its own -soft tint */
  --success: #2F7D4F;  --success-hover: #24613D;  --success-soft: #EEF6F0;
  --caution: #8A5A12;  --caution-hover: #6F480E;  --caution-soft: #FBF3E4;  /* text shade of #B7791F */
  --caution-mark: #B7791F;    /* the brighter amber, non-text marks only */
  --danger:  #B42318;  --danger-hover:  #912018;  --danger-soft:  #FCEDEB;  /* true red, not orange */
  --info:    #3D5A80;  --info-hover:    #2F4766;  --info-soft:    #EDF1F6;  /* slate blue */

  /* Back-compat aliases — existing "warning" usages are all red/danger semantics */
  --warning: var(--danger);
  --warning-hover: var(--danger-hover);
  --accent-secondary: var(--info);
  --accent-secondary-hover: var(--info-hover);

  /* Platforms — muted moss vs slate, always shown next to the platform name */
  --android: #4A6B3A;  --android-soft: #EFF3EC;  --android-ink: #34502A;
  --ios:     #3D5A80;  --ios-soft:     #EDF1F6;  --ios-ink:     #2A4060;

  /* Sidebar (flat ink) */
  --sidebar: #1A1918;
  --sidebar-2: #252321;
  --sidebar-foreground: #DDD9D1;
  --sidebar-muted: #9A948A;

  /* Overlay scrim */
  --overlay: rgb(26 25 24 / 0.5);
}
```

The `--mod-*` per-module hues are **removed**.

### 2.2 Tailwind theme mapping

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-input: var(--border-input);
  --color-muted: var(--muted);
  --color-subtle: var(--subtle);
  --color-brand: var(--brand);
  --color-brand-hover: var(--brand-hover);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-soft: var(--accent-soft);
  --color-signal: var(--signal);
  --color-caution-mark: var(--caution-mark);
  --color-pop: var(--pop);
  --color-pop-ink: var(--pop-ink);
  --color-pop-soft: var(--pop-soft);
  --color-success: var(--success);
  --color-success-hover: var(--success-hover);
  --color-success-soft: var(--success-soft);
  --color-caution: var(--caution);
  --color-caution-hover: var(--caution-hover);
  --color-caution-soft: var(--caution-soft);
  --color-danger: var(--danger);
  --color-danger-hover: var(--danger-hover);
  --color-danger-soft: var(--danger-soft);
  --color-info: var(--info);
  --color-info-hover: var(--info-hover);
  --color-info-soft: var(--info-soft);
  --color-warning: var(--warning);
  --color-warning-hover: var(--warning-hover);
  --color-accent-secondary: var(--accent-secondary);
  --color-accent-secondary-hover: var(--accent-secondary-hover);
  --color-android: var(--android);
  --color-android-soft: var(--android-soft);
  --color-android-ink: var(--android-ink);
  --color-ios: var(--ios);
  --color-ios-soft: var(--ios-soft);
  --color-ios-ink: var(--ios-ink);
  --color-sidebar: var(--sidebar);
  --color-sidebar-2: var(--sidebar-2);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-overlay: var(--overlay);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-bricolage);   /* NOT var(--font-display) — would be circular */
}

@theme {
  --radius-chip: 0.375rem;     /* 6px  — tags, tiny count pills, calendar banners */
  --radius-control: 0.625rem;  /* 10px — buttons, inputs, selects, tabs items, nav items */
  --radius-card: 1rem;         /* 16px — cards, stat tiles, tables, list containers */
  --radius-modal: 1.25rem;     /* 20px — modals, hero, login card */

  /* Neutral ink shadows only. shadow-glow and shadow-chip are removed. */
  --shadow-card: 0 1px 2px rgb(26 25 24 / 0.04);
  --shadow-raised: 0 4px 12px -4px rgb(26 25 24 / 0.10), 0 1px 2px rgb(26 25 24 / 0.04);
  --shadow-overlay: 0 20px 40px -12px rgb(26 25 24 / 0.25), 0 0 0 1px rgb(26 25 24 / 0.05);

  --ease-soft: cubic-bezier(0.2, 0.8, 0.2, 1);

  --animate-fade-in: fade-in 160ms var(--ease-soft);
  --animate-scale-in: scale-in 180ms var(--ease-soft);
  --animate-sheet-up: sheet-up 220ms var(--ease-soft);
  --animate-drawer-in: drawer-in 220ms var(--ease-soft);
  --animate-pop: pop 220ms var(--ease-soft);

  @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
  @keyframes scale-in { from { opacity: 0; transform: scale(0.97) translateY(4px) } to { opacity: 1; transform: none } }
  @keyframes sheet-up { from { transform: translateY(100%) } to { transform: none } }
  @keyframes drawer-in { from { transform: translateX(-100%) } to { transform: none } }
  @keyframes pop { 0% { transform: scale(0.8) } 60% { transform: scale(1.12) } 100% { transform: scale(1) } }
}
```

### 2.3 Global base + utilities (also in globals.css)

```css
/* bg-brand-gradient, bg-hero, sidebar-surface and app-canvas are REMOVED.
   Use flat bg-sidebar / bg-background / bg-card instead. */
@utility no-scrollbar { scrollbar-width: none; &::-webkit-scrollbar { display: none; } }

@layer base {
  html { accent-color: var(--accent); }
  body { background: var(--background); color: var(--foreground); font-family: var(--font-sans), system-ui, sans-serif; }
  h1, h2, h3 { font-family: var(--font-display), var(--font-sans), sans-serif; letter-spacing: -0.01em; }
  ::selection { background: rgb(232 89 12 / 0.18); }
  :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
  input[type="date"], input[type="datetime-local"] { color-scheme: light; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

Scrollbar: thumb `var(--border-strong)`, hover `var(--subtle)`. Remove `#cbd5e1`.

The `:focus-visible` outline is a safety net for the many ad-hoc buttons. Components that draw their own ring add `focus-visible:outline-none`.

### 2.4 Hex-value rule

Components use tokens only. The only allowed literals are `text-white` on solid accent/success/danger/info fills and inside the sidebar; the rgb values in `globals.css`; and `src/app/icon.tsx`, where `ImageResponse` can't read CSS variables. icon.tsx is a solid mark: background `#E8590C` (signal), ink `#1A1918` "H", radius 8. No gradients anywhere (the only `linear-gradient` left is the `scroll-fade-x` mask, which is not a visible colour).

### 2.5 AA contrast check (WCAG 2.x, computed)

| Pair | Ratio | Result |
|---|---|---|
| Ink `#1A1918` on white / paper | 17.6 / 16.0 | AA |
| Muted `#6F6A62` on white | 5.4 | AA |
| Muted on paper `#F6F4EF` | 4.9 | AA |
| Muted on surface-2 `#F1EEE7` | 4.6 | AA |
| Muted on surface-3 `#E8E4DB` | 4.2 | **fails** — don't put muted text on surface-3 (inactive Tabs count pill now uses ink) |
| Accent `#C2410C` on white / paper / accent-soft | 5.2 / 4.7 / 4.6 | AA |
| White on accent (primary button) | 5.2 | AA |
| Signal `#E8590C` on white | 3.6 | non-text only (≥3:1 for UI marks, 1.4.11) |
| Ink on signal (logo "H", solid `pop` badge) | 4.9 | AA |
| Success `#2F7D4F` on white / success-soft | 5.0 / 4.6 | AA |
| Caution `#B7791F` on white | 3.6 | fails as text → text uses `#8A5A12` (5.9 white, 5.4 on caution-soft) |
| Danger `#B42318` on white / danger-soft | 6.6 / 5.8 | AA |
| Info / iOS `#3D5A80` on white | 7.1 | AA |
| Android `#4A6B3A` on white | 6.1 | AA |
| Sidebar-muted `#9A948A` on sidebar `#1A1918` | 5.8 | AA |
| Input border `#8C857A` on white | 3.6 | 1.4.11 |

---

## 3. Typography

`src/app/layout.tsx`: keep Geist and Geist Mono, and add:

```ts
import { Bricolage_Grotesque } from "next/font/google";
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
// body className: `${geistSans.variable} ${geistMono.variable} ${bricolage.variable} antialiased`
```

- **Display: Bricolage Grotesque.** Variable, quirky, warm. Use it for h1–h3, stat numbers, the brand wordmark, and modal titles.
- **UI: Geist Sans.** Dense and neutral, with good tabular figures. Use it for all body, labels, controls, and tables.
- **Mono: Geist Mono.** Use it only for build numbers in tables and for the `data/store.json` code chip.

| Role | Font | Size / line | Weight | Extra |
|---|---|---|---|---|
| Hero greeting (Home) | display | 28/34 → sm 34/40 | 700 | tracking -0.02em |
| Page title (h1) | display | 24/30 → sm 28/34 | 700 | tracking -0.02em |
| Card / modal title (h2) | display | 16/22 (modal 18/24) | 600 | |
| Sub-heading (h3, release name) | display | 14/20 | 600 | |
| Stat value | display | 30/34 → sm 34/38 | 700 | `tabular-nums` |
| Body | sans | 14/20 | 400 | |
| Body strong / list title | sans | 14/20 | 500–600 | |
| Small | sans | 13/18 | 400 | descriptions, meta |
| Caption | sans | 12/16 | 500 | badges at md, helper text |
| Eyebrow / table head | sans | 11/14 | 600 | uppercase, tracking 0.06em, `text-muted` |
| Badge (sm) | sans | 11/16 | 600 | |

**Floor: 11px.** The only exception is calendar cells and the effort grid, which can use 10px. Every `text-[9px]` in the codebase becomes `text-[10px]` or `text-[11px]` (see the page checklists).

---

## 4. Components (`src/components/ui/index.tsx` unless noted)

Shared rules for all components:
- Transitions are `transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[var(--ease-soft)]`.
- Focus is `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-card`. Every ad-hoc `ring-accent` focus ring is `ring-signal`.
- Non-text indicator bars (`shadow-[inset_3px_0_0_…]`, `before:bg-…`, top bars) use `var(--signal)`.
- Minimum touch target on phones is 32px (`h-8 w-8`) for icon buttons.

### 4.1 Button (restyle + tiny API add)

Export a class helper so links can look like buttons without nesting a `<button>` inside an `<a>`. Today that nesting happens in the login, Slack, Mail inbox, Settings, and Scrum sheet screens.

```ts
export function buttonClasses({ variant = "primary", size = "md" } = {}): string
// Button uses it internally. Usage on links: <a href="/api/gmail/auth" className={buttonClasses({variant:"secondary", size:"sm"})}>
```

| Part | Classes |
|---|---|
| Base | `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-semibold select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none` + transition + focus |
| `size="sm"` | `h-8 px-3 text-xs` (icons `h-3.5 w-3.5`) |
| `size="md"` | `h-10 px-4 text-sm` (icons `h-4 w-4`) |
| `size="icon"` (new) | `h-8 w-8 p-0` (for the Plus-only add buttons) |
| `primary` | `bg-accent text-white shadow-card hover:bg-accent-hover` (flat, no glow or inner highlight) |
| `secondary` | `bg-card text-foreground border border-border-strong shadow-card hover:bg-surface-2 hover:border-input/60` |
| `ghost` | `text-muted hover:bg-surface-2 hover:text-foreground` |
| `danger` | `bg-danger-soft text-danger hover:bg-danger hover:text-white` |

Icons inside buttons drop their `mr-1.5` margins because `gap-1.5` handles spacing.

### 4.2 Card (restyle + tiny API add)

- Base: `rounded-card border border-border bg-card p-4 sm:p-5 shadow-card`.
- `interactive?: boolean` adds `hover:-translate-y-0.5 hover:shadow-raised hover:border-border-strong cursor-pointer`. Use it only on whole-card links or toggles (stat tiles with href, outing card header).
- `tone?: "default" | "muted"`. `muted` gives `bg-surface-2/60 shadow-none` for past outings and completed items.

### 4.3 CardHeader (new) and CardLink (new)

These replace the six copy-pasted header rows on the dashboard and similar rows on other pages.

```tsx
<CardHeader title="Due today" icon={ListTodo} module="tasks" action={<CardLink href="/tasks">All tasks</CardLink>} />
```
- Wrapper: `mb-4 flex items-center justify-between gap-3`.
- Icon chip: 28px `ModuleChip size="sm"` (4.11).
- Title: `h2`, display 16/22 600, `truncate`.
- CardLink: `inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-accent hover:bg-accent-soft`, with an `ArrowRight h-3.5 w-3.5` that does `group-hover:translate-x-0.5`.

### 4.4 Badge / status pill (restyle + tiny API add)

- Base: `inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap`.
- New `tone?: "neutral"|"accent"|"success"|"caution"|"danger"|"info"|"pop"|"android"|"ios"`.
- New `solid?: boolean`.
- New `dot?: boolean`, which adds a 6px `rounded-full bg-current` before the label.
- Keep `className` so old callers still work.

| tone | soft (default) | solid |
|---|---|---|
| neutral | `bg-surface-2 text-muted border-border` | `bg-foreground text-white` |
| accent | `bg-accent-soft text-accent` | `bg-accent text-white` |
| success | `bg-success-soft text-success` | `bg-success text-white` |
| caution | `bg-caution-soft text-caution` | `bg-caution text-white` |
| danger | `bg-danger-soft text-danger` | `bg-danger text-white` |
| info | `bg-info-soft text-info` | `bg-info text-white` |
| pop | `bg-pop-soft text-pop-ink` | `bg-pop text-foreground` |
| android | `bg-android-soft text-android-ink` | `bg-android text-white` |
| ios | `bg-ios-soft text-ios-ink` | `bg-ios text-white` |

Text stays sentence case. Status labels keep their current text, and the existing `capitalize` stays.

### 4.5 StatCard → stat tile (restyle + tiny API add)

New optional props: `icon?: LucideIcon`, `module?: ModuleId`, `href?: string`, `tone?: "default"|"attention"` (`accent` stays as an alias for `attention`).

- Container: Card plus `relative overflow-hidden p-4`. With `href`, wrap it in a `Link` with `interactive`.
- Top row: label as an eyebrow (11px uppercase muted) on the left, and a 28px neutral chip on the right: `rounded-lg bg-surface-2 text-muted` with the icon at `h-4 w-4`.
- Value: `mt-2 font-display text-[30px] sm:text-[34px] leading-none font-bold tabular-nums text-foreground`. If the value is 0, use `text-muted`.
- Hint: `mt-1.5 text-xs text-muted`.
- `attention`: flat white card with `border-signal/40`, the value in `text-accent`, and a 6px pulsing dot next to the label (`bg-signal animate-pulse`). No gradient fill.

### 4.6 Input / Select / Textarea / Label (new, replaces 7 duplicated `inputClass` strings)

Export `fieldClasses` plus thin components `Input`, `Select`, `Textarea`, and `Label`. They are plain elements with these classes, and `className` still merges in.

| Part | Classes |
|---|---|
| Base | `w-full rounded-control border border-input bg-card px-3 text-sm text-foreground placeholder:text-subtle outline-none transition` |
| Height | Input/Select `h-10` (md) / `h-8 text-xs px-2.5` (`size="sm"`); Textarea `py-2 min-h-[4.5rem] resize-y` |
| Hover | `hover:border-foreground/40` |
| Focus | `focus:border-signal focus:ring-4 focus:ring-signal/15` |
| Invalid | `aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15` |
| Disabled / read-only display | `disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed` |
| Select | `pr-8 cursor-pointer` (native arrow kept) |
| Label | `mb-1.5 block text-xs font-semibold text-foreground`; optional hint `text-[11px] font-normal text-muted` |
| Inline error | `mt-1.5 text-xs font-medium text-danger` |

The calculated "Total budget" box in NewOutingDialog uses Input styling plus `bg-surface-2 font-semibold`, and is not focusable.

### 4.7 Tabs / segmented filter (new; unifies 3 different styles)

These replace Tasks (`bg-brand` pills), Resources (small brand pills), and MailTodos (segmented).

```tsx
<Tabs value={filter} onChange={setFilter} items={[{ id: "open", label: "Open", count: 4 }, …]} />
```
- Wrapper: `max-w-full overflow-x-auto no-scrollbar`, and inside it `inline-flex gap-1 rounded-control bg-surface-2 p-1 ring-1 ring-inset ring-border`.
- Item: `h-8 shrink-0 rounded-lg px-3 text-xs font-semibold text-muted hover:text-foreground` with `aria-pressed`.
- Active: `bg-card text-foreground shadow-card`.
- Count: `ml-1.5 rounded-full bg-surface-3 px-1.5 text-[11px] tabular-nums text-foreground` (muted on surface-3 fails AA). When the item is active, the count gets `bg-accent-soft text-accent`.

### 4.8 Table (new thin wrappers, or exported class constants)

| Part | Classes |
|---|---|
| Wrapper | `overflow-x-auto rounded-card border border-border bg-card shadow-card` |
| thead tr | `bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted` |
| th / td | `px-3 py-2.5`; numeric `text-right tabular-nums` (or center for checkmark columns) |
| tbody tr | `border-t border-border transition-colors hover:bg-surface-2/60` |
| Selected row | `bg-accent-soft shadow-[inset_3px_0_0_var(--signal)]` |
| Success row | `bg-success-soft/60` |

### 4.9 Modal (new `Modal` shell; 5 dialogs share it)

These dialogs share it: NewReleaseDialog, FeatureDialog, ResourceDialog, NewOutingDialog/EditOutingDialog, and ExpenseDialog. The shell is presentational. Each dialog keeps its own Escape, reset, and submit logic and passes `onClose`.

```tsx
<Modal open onClose={handleClose} title="New release" icon={CalendarRange} module="planning" footer={<>…buttons…</>}>…</Modal>
```
- Overlay: `fixed inset-0 bg-overlay backdrop-blur-[2px] animate-fade-in`.
- Desktop (sm+): centered with `p-4`. The panel is `w-full max-w-lg max-h-[90dvh] rounded-modal bg-card shadow-overlay animate-scale-in flex flex-col overflow-hidden`.
- Phone (<640): bottom sheet. Container `items-end p-0`. The panel is `rounded-t-modal rounded-b-none max-h-[92dvh] animate-sheet-up`, with a grab handle on top (`mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3`).
- Header: `flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4`. Use a ModuleChip md (36px) and an h2 in display 18/24 600. The close button is ghost `size="icon"` and sits right.
- Body: `px-5 sm:px-6 pb-4 space-y-4 overflow-y-auto`.
- Footer: `sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface-2/70 px-5 sm:px-6 py-3.5`. On phones the buttons are `flex-1` (full-width pair).

### 4.10 PageHeader (restyle + tiny API add)

New optional props: `module?: ModuleId` and `icon?: LucideIcon`.

- Layout: `mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`.
- Left: a ModuleChip lg (40px, `rounded-xl`, neutral), then the title block.
- h1: display 24 → 28, 700, `text-foreground`, `text-balance`.
- Description: `mt-0.5 text-sm text-muted`.
- Action: `shrink-0`. On phones it goes full-width under the title when it's a single primary button (`w-full sm:w-auto` on the button).

### 4.11 ModuleChip (new) + module map (new `src/lib/modules.ts`)

```ts
export type ModuleId = NavItem["id"];
const NEUTRAL_MODULE_STYLE = {
  solid: "bg-surface-2 text-foreground ring-1 ring-inset ring-border",
  soft: "bg-surface-2",
  text: "text-muted",
};
export const MODULE_STYLES: Record<ModuleId, …> = { home: NEUTRAL_MODULE_STYLE, tasks: NEUTRAL_MODULE_STYLE, … };
```

Every module gets the same neutral treatment; no per-module hues. The record shape stays so callers don't change.

ModuleChip sizes: sm 28px `rounded-lg` with a `h-4` icon; md 36px `rounded-xl` with a `h-[18px]` icon; lg 40px `rounded-xl` with a `h-5` icon. The `solid` variant is a paper chip with an ink icon and hairline ring (no shadow). The `soft` variant is a well with a muted icon. Icons are the same lucide icons as `AppShell` ICONS. Move that map into `modules.ts` so the shell, PageHeader, and Modal share it.

### 4.12 EmptyState (restyle + tiny API add)

New optional props: `icon?: LucideIcon`, `action?: ReactNode`, `compact?: boolean`.

- Default: `py-10`. Icon well is 48px `rounded-2xl bg-surface-2 text-muted` with a 22px icon and `ring-1 ring-inset ring-border`.
- Title: `mt-3 text-sm font-semibold text-foreground`.
- Description: `mt-1 max-w-sm text-[13px] text-muted`.
- Action: `mt-4`.
- `compact` (inside cards): `py-6` with a 36px well.
- **Copy:** keep every existing empty-state string. Don't write new copy.

### 4.13 ErrorBanner, Alert, Toast

- ErrorBanner: `rounded-control border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger`. Add a leading `AlertCircle h-4 w-4`. Dismiss is a ghost `size="sm"` button.
- The overdue alert (dashboard) and Settings `integrationMessage` use the same shape with `caution` and `info` tones. Optionally export `Alert({ tone })` and implement ErrorBanner as `Alert tone="danger"`.
- SlackRateLimitToast: the solid surface is `bg-card shadow-overlay border border-caution/30 rounded-card`, with a left 3px bar `shadow-[inset_3px_0_0_var(--caution)]` and an icon in `text-caution`. It currently uses a translucent `bg-warning/10` that lets content show through. Add `animate-scale-in`.

### 4.14 Skeleton (new, optional but recommended)

`Skeleton` is `animate-pulse rounded-lg bg-surface-3`. Replace each page's plain "Loading X..." text with a header bar (h-8 w-48), a row of 3 card blocks (h-28), and a block (h-64). Keep the original text as `sr-only` inside `role="status"`.

### 4.15 Checkbox (task complete / mail todo complete)

- Shape: 20px `rounded-md border-2 border-input bg-card`. MailTodos keeps its circular 22px variant.
- Hover: `border-signal bg-accent-soft`.
- Done: `border-success bg-success text-white`, and the check icon gets `animate-pop`.
- Done row: title `line-through text-muted`, and the row is `opacity-70` (instead of 55–60, which drops muted text under AA).

### 4.16 Popover (ReminderPicker panel)

`rounded-card border border-border bg-card p-2 shadow-overlay animate-scale-in`. Preset rows are `rounded-lg px-2 h-9 text-xs hover:bg-surface-2`. The trigger chip uses `Badge`-like styles: set means `accent` soft; unset means `bg-card border-border text-muted hover:border-accent/40 hover:text-accent`.

---

## 5. Shell (`src/components/layout/AppShell.tsx`)

### Sidebar (desktop, lg+)
- `w-64 bg-sidebar text-sidebar-foreground` (flat ink, no gradient), with a right hairline `border-r border-white/5`.
- **Brand block:** `px-5 pt-6 pb-5`. Logo is a solid 36px `rounded-xl bg-signal` mark with an ink "H" in display bold (no Sparkles icon, no shadow). "Helpit" is display 18 700 `text-white`. "Command center" is `text-[11px] text-sidebar-muted`. Drop the bottom border and let spacing separate it.
- **Nav item:** `group flex h-10 items-center gap-3 rounded-control px-2 text-sm font-medium`.
  - Icon chip: 28px `rounded-lg grid place-items-center`.
  - Inactive: `text-sidebar-foreground/85 hover:bg-white/[0.05] hover:text-white`. The chip is transparent and the icon is `text-sidebar-muted group-hover:text-white`.
  - Active: `relative bg-white/[0.07] text-white`, a 3px `bg-signal` bar on the left edge (`absolute inset-y-2 left-0 rounded-full`), and the icon in `text-signal`. No filled chip, no ring, no shadow.
  - Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal`.
  - Add `aria-current="page"` on the active item.
- Spacing: `space-y-0.5 px-3 py-2`.
- **Footer:** `m-3 rounded-card bg-white/[0.04] ring-1 ring-inset ring-white/10 p-3`. It shows "PlaySimple Games" in `text-xs text-sidebar-foreground`, then "v0.1 — building daily" in `text-[11px] text-sidebar-muted`, then Sign out as a full-width row button (`mt-2 h-8 rounded-lg text-xs text-sidebar-foreground hover:bg-white/10 hover:text-white` with a `LogOut h-3.5` icon).
- Replace every `text-slate-400/500/200` in the shell with `text-sidebar-muted` or `text-sidebar-foreground`.

### Mobile drawer (<lg)
- Use the same surface and items, at `w-72 max-w-[85vw]`, with `animate-drawer-in` on the panel and `bg-overlay backdrop-blur-[2px] animate-fade-in` on the scrim.
- Nav items are `h-11` on phones.

### Top bar (phones/tablets only; desktop has none, and PageHeader does that job)
- `sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/85 px-3 backdrop-blur-md`.
- Menu button is ghost `size="icon"` (`h-9 w-9`).
- Then a ModuleChip sm for the current page and the page label in display 15 600 `truncate`.
- The header must be inside the scroll container's sibling, as it is now. Keep `shrink-0`.

### Main
- The scroll area gets flat `bg-background` (paper), padding `px-4 py-5 sm:p-6 lg:px-8 lg:py-7`, and `pb-[max(1.25rem,env(safe-area-inset-bottom))]`.
- Content wrapper: `mx-auto w-full max-w-[1440px]`.

---

## 6. Semantic color helpers (`src/lib/utils.ts`)

These functions decide most of the app's status colors. Re-point them like this:

| Function / case | New classes |
|---|---|
| `priorityColor` urgent | Badge solid danger: `bg-danger text-white border-danger` |
| high | `bg-accent-soft text-accent border-accent/30` |
| medium | `bg-info-soft text-info border-info/20` |
| low / default | `bg-surface-2 text-muted border-border` |
| `statusColor` done / live / completed | `text-success bg-success-soft` (currently accent blue, which reads as "in progress") |
| in_progress / in_dev / qa | `text-info bg-info-soft` |
| blocked | `text-danger bg-danger-soft` |
| default | `text-muted bg-surface-2` |
| `releasePhaseColor` ux | `text-foreground bg-surface-3 border-border-strong` (pop now = accent, so ux moved to neutral-strong to stay distinct from art) |
| art | `text-accent bg-accent-soft border-accent/25` |
| animation | `text-caution bg-caution-soft border-caution/25` |
| dev | `text-info bg-info-soft border-info/25` |
| qa | `text-success bg-success-soft border-success/25` |
| default (Yet to start) | `text-muted bg-surface-2 border-border` |
| `releasePlatformTitleClass` android / ios | `text-android` / `text-ios` |
| `releasePlatformCardClass` | `border-l-4 border-l-android` / `border-l-4 border-l-ios` |
| `releasePlatformDateClass` | android `border-android/30 bg-android-soft text-android-ink`; ios `border-ios/30 bg-ios-soft text-ios-ink`; none `border-border bg-surface-2 text-foreground` |

---

## 7. Hard-coded color → token mapping

Apply this everywhere. A `rg "(slate|gray|white|black|emerald|blue|sky|violet|indigo|pink|rose|orange|amber)-?\d*" src` should return only the allowed exceptions in §2.4 when you're done.

| Current | Replace with | Notes |
|---|---|---|
| `bg-white` | `bg-card` | |
| `bg-white/60` | `bg-card/60` | |
| `bg-slate-50`, `/30 /40 /50 /60 /80 /90` | `bg-surface-2` (keep the opacity suffix for faint wells) | |
| `hover:bg-slate-50`, `hover:bg-slate-50/50 /80` | `hover:bg-surface-2` | |
| `bg-slate-100` (selected/active/code/tag) | `bg-surface-3` for selected, `bg-surface-2` for tags/code | |
| `hover:bg-slate-100` | `hover:bg-surface-2` | |
| `bg-slate-100/80` (selected calendar day) | `bg-accent-soft/60` | the selection now reads as color, not gray |
| `bg-slate-200`, `/80 /90` | `bg-surface-3` | progress track, "Other"/shipped chips |
| `border-slate-200`, `/80` | `border-border` | |
| `border-slate-300` | `border-input` (controls/checkbox) or `border-border-strong` (dashed chips) | |
| `text-slate-400`, `placeholder:text-slate-400` | `text-subtle`, `placeholder:text-subtle` | decorative only |
| `text-slate-500 / 600 / 700` | `text-muted` | use `text-foreground` where it's the primary label |
| `text-slate-800` | `text-foreground` | |
| `bg-black/40` (scrims) | `bg-overlay backdrop-blur-[2px]` | |
| `border-black/[0.06]` (calendar banner divider) | `border-current/15` | |
| `emerald-*` meaning success / approved / under estimate | `success`, `success-soft` | MailApprovals, FunctionEffortGrid, Sheets badge |
| `emerald-*` meaning Android | `android`, `android-soft`, `android-ink` | ReleaseCalendar, NewReleaseDialog, ReleaseCard |
| `blue-*` meaning iOS | `ios`, `ios-soft`, `ios-ink` | |
| `blue-*` (expense "Outing" badge) | Badge `tone="info"` | |
| `sky-*` (scrum first-half-off) | `accent`, `accent-soft` | |
| `sky-200` (iOS banner/legend) | `ios-soft` + `ios` bar | |
| `violet-*` (Figma, plot backlog, UX) | `accent`, `accent-soft` | |
| `pink-*` (art phase) | `pop-ink`, `pop-soft` | |
| `orange-*` (animation phase) | `caution`, `caution-soft` | |
| `amber-*` (slides, over-estimate) | `caution`, `caution-soft` | |
| `bg-amber-50/40` (today in calendars) | `bg-pop-soft/50` | plus a date-number pill, see Planning |
| `rose-*` (absent / not going) | Badge `tone="neutral"` with `line-through decoration-muted/50` | "didn't go" isn't an error |
| `indigo-*` (holiday) | `pop-soft`, `pop-ink` | holidays feel festive |
| `fill-emerald-500 stroke-emerald-500` | `fill-success stroke-success` | |
| `text-white` on `bg-accent/success/danger` | keep | allowed |
| `bg-brand text-white` (active tabs) | `Tabs` component | |
| `bg-warning/10 text-warning …` | keep (alias → danger) or migrate to `danger` names | semantic is unchanged |
| `text-accent-secondary`, `bg-accent-secondary/10` | `text-info`, `bg-info-soft` | alias works meanwhile |

---

## 8. Spacing, layout, density

- 4px grid. Page sections are `gap-6`, so cards in a grid use `gap-4 sm:gap-5`. Lists inside cards are `space-y-2`. Card header to content is `mb-4`.
- Card padding `p-4 sm:p-5`. List rows: `p-3` for cards-as-rows, `px-4 py-3` for rows inside a list container.
- Section titles get a new `SectionTitle` component. It's an eyebrow (11px uppercase 600 tracking 0.06em muted) with an optional count pill (`bg-surface-3 rounded-full px-1.5 tabular-nums`) and an optional right slot, with `mb-3`. Mail, Features, and Outings use it.
- Hover-only action icons (delete, remove, edit) are always visible on touch. On `sm+` they show on hover, and they must also show on keyboard focus: add `sm:focus-visible:opacity-100` and `sm:group-focus-within:opacity-100`. TaskList and MailTodos are missing this today.
- Icon buttons are `h-8 w-8` with an `h-4` icon (some are 22–24px today).

---

## 9. Per-page checklist

### Global / shell
- [ ] globals.css tokens, theme, utilities, base (§2). layout.tsx adds Bricolage (§3). icon.tsx solid orange favicon with ink "H".
- [ ] ui/index.tsx restyles plus new: `buttonClasses`, `CardHeader`, `CardLink`, `Badge tone`, `StatCard` props, `Input/Select/Textarea/Label`, `Tabs`, table styles, `Modal`, `ModuleChip`, `EmptyState` props, `Alert`, `Skeleton`, `SectionTitle`. Add `src/lib/modules.ts`.
- [ ] AppShell per §5. SlackRateLimitToast per §4.13.
- [ ] utils.ts color helpers per §6.
- [ ] Replace every `<a><Button/></a>` and `<Link><Button/></Link>` with a styled link via `buttonClasses` (login, slack, MailInbox, settings ×2, ScrumSheetSync).

### Login (`src/app/login/page.tsx`)
- [ ] Page background flat `bg-background` (paper), with a centered card `max-w-sm rounded-modal border border-border p-8 shadow-raised`.
- [ ] Logo: solid 48px `rounded-2xl bg-signal` mark with an ink "H" (display bold), same as the sidebar mark. "Helpit" in display 28 700. The subtitle stays as is.
- [ ] Error becomes `Alert tone="danger"`. The Google button is an `<a>` with `buttonClasses({size:"md"})` and `w-full`.

### Home (`HomeDashboard.tsx`)
- [ ] **Hero:** a flat white card, not a coloured tile: `rounded-modal border border-border bg-card p-5 sm:p-7 shadow-card`. The greeting is display 28→34 700 `text-foreground`. The role/date line is `text-sm text-muted`. When there are overdue tasks, the overdue alert sits inside the hero as a pill: `inline-flex mt-4 rounded-full bg-danger-soft text-danger ring-1 ring-inset ring-danger/20 px-3 py-1.5 text-sm`, with an AlertCircle, the bold count, and the existing text.
- [ ] **Stat tiles:** `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4`, each with a module icon and a link: Due today (tasks, CalendarCheck, `/tasks`, attention when >0), Open tasks (tasks, ListTodo, `/tasks`), Slack items (slack, MessageSquare, `/slack`), Mail items (mail, Mail, `/mail`), Due soon (tasks, CalendarClock, `/tasks`). On a 2-col phone grid the 5th tile spans 2 columns (`col-span-2 sm:col-span-1`) so there's no orphan.
- [ ] **Card grid:** `lg:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-5`. Every card uses `CardHeader` with a module chip: Due/Overdue (tasks; in the overdue case it uses the `danger` text color for the title count), Coming up (tasks), Slack (slack), Mail (mail), Releases in flight (planning, Rocket), Reminders (mail, BellRing).
- [ ] Slack/Mail mini rows: `rounded-xl bg-surface-2/70 p-3 hover:bg-surface-2`, no border. The channel is `text-xs font-semibold text-foreground` (not `text-accent`).
- [ ] Release rows: platform dot (8px `bg-android`/`bg-ios`), name in the platform color, date with `releasePlatformDateClass`, and status · phase as a Badge with `releasePhaseColor`. Separate rows with `divide-y divide-border`.
- [ ] Empty text in cards becomes `EmptyState compact` with the same strings.
- [ ] Next outing: plain Card with an outings ModuleChip. "View outings" becomes a `buttonClasses({variant:"secondary",size:"sm"})` link instead of a Badge-in-Link.
- [ ] Loading becomes a Skeleton (§4.14).

### Tasks (`tasks/page.tsx`, `TaskList.tsx`)
- [ ] PageHeader `module="tasks"`. Filter becomes `Tabs`.
- [ ] TaskRow: `rounded-xl border border-border bg-card p-3 hover:border-border-strong hover:shadow-card`. Overdue: `bg-danger-soft/50 border-danger/25 shadow-[inset_3px_0_0_var(--danger)]`. Reminder due: `bg-accent-soft/50 border-accent/25 shadow-[inset_3px_0_0_var(--signal)]`. Checkbox per §4.15. Priority Badge via `priorityColor`. Tags `rounded-chip bg-surface-2 px-1.5 text-[11px] text-muted`. Title `break-words`.
- [ ] AddTaskForm: inputs become `Input`/`Select`. The expanded form is a `Card` with `border-accent/25 shadow-raised` (no `mt-4` when it's in the header action; it should drop under the header full-width on phones).
- [ ] "No tasks here." becomes `EmptyState compact icon={ListTodo}`.

### Scrum attendance (`scrum/page.tsx`, `ScrumAttendanceBoard.tsx`, `ScrumSheetSync.tsx`)
- [ ] PageHeader `module="scrum"`.
- [ ] Sheet sync card: ModuleChip soft (FileSpreadsheet). The status pill becomes a Badge: Linked=success, Connected-link a sheet=info, Not connected=neutral, Needs setup=caution. Connect is a styled link. The message line uses `Alert` tone info (or danger when it's `lastSyncError`).
- [ ] Day picker: prev/next become ghost `size="icon"`, and the date becomes `Input size="sm"`. "Today" is a ghost sm button. Recent-date chips become `Tabs`-like pills (`h-7 rounded-full`; active `bg-accent text-white`).
- [ ] Status pills (`STATUS_PILL_CLASSES`): `h-8 rounded-full px-3 text-xs font-semibold border`. Unselected: `bg-card border-border text-muted hover:bg-surface-2`. Selected: on_time `bg-success-soft text-success border-success/40`, late `bg-caution-soft text-caution border-caution/40`, leave `bg-info-soft text-info border-info/40`, first_half_off `bg-accent-soft text-accent border-accent/40`, other `bg-surface-3 text-foreground border-border-strong`.
- [ ] `CALENDAR_STATUS_CLASSES`: same tones, soft background only. Holiday is `bg-pop-soft text-pop-ink`. NA is `bg-surface-2 text-subtle`.
- [ ] Roster rows: name column `w-32 sm:w-40`. On phones the pills wrap under the name (`basis-full sm:basis-auto`).
- [ ] Holiday banner: `Alert tone="pop"`-style (`bg-pop-soft text-pop-ink`), with the Unmark ghost button.
- [ ] Insights table uses the §4.8 table styles. On-time % is `text-success font-semibold`. Selected row per §4.8.
- [ ] Member calendar: header `bg-surface-2`. Today cell gets `bg-pop-soft/50` and the date number in a 20px `rounded-full bg-accent text-white` pill. Raise 9px/10px text to 10/11px.

### Slack (`slack/page.tsx`)
- [ ] PageHeader `module="slack"`.
- [ ] Status strip: Card with a left 3px bar: `shadow-[inset_3px_0_0_var(--success)]` when connected, `var(--subtle)` when not. "Synced · team" is in `font-semibold`. The Settings link uses `buttonClasses`.
- [ ] Item cards: the ModuleChip soft (slack) replaces the `bg-accent/10` square. The channel is `text-sm font-semibold text-foreground`. Badges: priority via `priorityColor`, action `tone="neutral"`, synced `tone="info"`. "Open in Slack" uses the CardLink style. Done items use `Card tone="muted"` instead of `opacity-50`, which fails contrast.
- [ ] "N open items" becomes `SectionTitle` with a count, and Show/Hide done goes in its right slot.
- [ ] **Missing empty state:** when `visible.length === 0`, render `EmptyState icon={MessageSquare}` with the dashboard's existing string "No open Slack follow-ups right now."

### Mail (`mail/page.tsx`, `MailInbox.tsx`, `MailApprovals.tsx`, `MailTodos.tsx`, `ReminderPicker.tsx`)
- [ ] PageHeader `module="mail"`. Section h2s become `SectionTitle` (Inbox, Sprint approvals, Reminders), all with `mb-3`, and sections get `mb-8` consistently (currently 10/8/4).
- [ ] Inbox `STATUS_COLORS`: unread=accent, needs_reply=caution, drafted=info, done=success (Badge tones). Category is neutral and gmail is info. Done card is `tone="muted"`. Action buttons: on phones they become a row of `size="sm"` buttons with `flex-1`.
- [ ] Inbox placeholder becomes `EmptyState icon={Mail}` with the existing copy, and the action is a styled link or button.
- [ ] Approvals: use table styles. Complete row is `bg-success-soft/60`. "Mail not sent" row is `bg-surface-2/60`, and the italic text becomes `text-xs text-muted not-italic`. Check icons are `fill-success stroke-success`. The Complete badge is success solid and Pending is caution soft. "Mark mail sent" becomes ghost `size="sm"` in `text-accent`. Raise `text-[10px]` labels to 11px. The Completed toggle row is `rounded-control bg-surface-2 hover:bg-surface-3`.
- [ ] Approvals mobile cards: complete `border-success/30 bg-success-soft/60`. Party toggle buttons are `h-9 w-9`.
- [ ] MailTodos composer: `rounded-card border-border shadow-card`. Expanded is `border-accent/30 shadow-raised`. The dashed circle is `border-border-strong` with a `text-subtle` plus icon. Priority chips map low→neutral, medium→info, high→pop, urgent→danger soft. The Cancel/Add buttons become `Button` ghost/primary sm.
- [ ] MailTodos filter becomes `Tabs`. The list container is `rounded-card`. Section bands are `bg-surface-2`. Rows `hover:bg-surface-2/60`.
- [ ] ReminderPicker per §4.16.

### Planning (`planning/page.tsx`, `ReleaseCalendar.tsx`, `ReleaseCard.tsx`, `NewReleaseDialog.tsx`)
- [ ] PageHeader `module="planning"`. The summary chips (in flight / this month / blockers) become Badges: neutral, neutral, and danger with a `dot`. Add `mb-4`.
- [ ] **Calendar header fix:** at about 1000px the month title truncates to "Oct…" because the legend and Today share the row. Make the title `shrink-0` with display 16 600. Move the legend to its own row (`basis-full order-last`) below `xl`.
- [ ] Legend swatches: `bg-android-soft ring-1 ring-android/40`, `bg-ios-soft ring-1 ring-ios/40`, `bg-surface-3`.
- [ ] Weekday header `bg-surface-2` at 11px. Week-number column `bg-surface-2/60` at 10px.
- [ ] Day cells: `bg-card`. Out-of-month `bg-surface-2/40`. Hover (with releases) `bg-surface-2`. Selected `bg-accent-soft/60` with the existing left bar in `bg-signal`. Today `bg-pop-soft/50`, with the date label in a `rounded-full bg-accent px-1.5 text-white` pill.
- [ ] `releaseBannerClass`: android `bg-android-soft text-android-ink shadow-[inset_3px_0_0_var(--android)]`, ios `bg-ios-soft text-ios-ink shadow-[inset_3px_0_0_var(--ios)]`, live `bg-surface-3 text-muted` with a 10px `Check` before the name, fallback `bg-accent-soft text-accent`. Banner radius `rounded-chip`. Selected `ring-2 ring-signal ring-offset-1`. Sprint lines are 10px (not 9).
- [ ] Unscheduled strip `bg-surface-2/60`, with the label as an eyebrow.
- [ ] ReleaseCard detail panel: Card `p-4`. Name is h3 display 15 600 in the platform color. The phase `<select>` keeps `releasePhaseColor` but uses `rounded-full h-7 px-2.5 text-[11px] font-semibold`. Section wells are `rounded-xl bg-surface-2/70 p-3` (no border). Planned/Actual tiles are `bg-card rounded-lg border border-border` with a platform top bar in `border-t-android` or `border-t-ios`, and the label at 11px eyebrow (was 9px). Inputs become `Input size="sm"`. The sprint item list is `bg-card rounded-lg`. Remove buttons are ghost icon. The blockers box becomes `Alert tone="danger"`.
- [ ] NewReleaseDialog becomes `Modal` (`module="planning"`). The platform toggle is a 2-up segmented control: selected Android `border-android bg-android-soft text-android-ink`, selected iOS `border-ios bg-ios-soft text-ios-ink`, unselected `bg-card border-border text-muted hover:bg-surface-2`. Each option has a 8px platform dot. Fields become `Input`/`Label`. The error becomes an inline danger error.

### Feature tracker (`features/page.tsx`, `FeatureList.tsx`, `FunctionEffortGrid.tsx`, `PlotBacklogPanel.tsx`)
- [ ] PageHeader `module="features"`. "In progress" and "Upcoming items" become `SectionTitle` with counts.
- [ ] FeatureCard: Card `p-0`. Header `px-4 py-3`. Title is h3 display 15 600. The Est badge is neutral with a `Timer` icon. The chevron button is ghost icon. Milestone pills are `rounded-lg bg-surface-2 border-0 px-2.5 py-2`, with labels at 11px eyebrow and date inputs as `Input size="sm"` (borderless until hover: `border-transparent hover:border-input`). Add a 2px left bar per pill in sequence colors: Start `info`, Scope `accent`, Pre-prod `caution`, Release `success`, so the milestone order reads at a glance.
- [ ] The effort section well is `bg-surface-2/70 rounded-xl p-3`. The Delete button stays `danger` sm, right-aligned.
- [ ] FunctionEffortGrid: cells `rounded-lg bg-card border border-border`. Empty cells use `border-dashed`. Role label is 10px eyebrow. Est/Act labels are 10px (was 9). Act value `text-accent`. Variance: over is `text-caution`, under is `text-success`. The total variance chip uses Badge caution, success, or neutral.
- [ ] FeatureDialog becomes `Modal` (`module="features"`). Labels become `Label`, which also fixes the inconsistent `text-sm font-medium` labels here vs `text-xs text-muted` elsewhere.
- [ ] PlotBacklogPanel: input plus `size="icon"` add button. The list is `rounded-xl border border-border bg-card divide-y divide-border`. The rank number is a 22px `rounded-full bg-accent-soft text-accent text-[11px] font-bold`. The drop target is `border-t-2 border-t-accent bg-accent-soft/50`. While dragging, use `opacity-50 bg-surface-2`. Tags become Badge accent. The empty text becomes `EmptyState compact icon={ListOrdered}` with "Nothing queued yet."

### Resources (`resources/page.tsx`, `ResourceList.tsx`)
- [ ] PageHeader `module="resources"`. The filter becomes `Tabs` with counts.
- [ ] The list drops `max-w-lg`, which leaves dead space on desktop. Use `max-w-3xl` instead. The container is a §4.8-style card.
- [ ] Row: `h-12 px-3 gap-3`. Replace the type text badge with a 28px soft type chip (icon plus `title` and `sr-only` label): doc=info `FileText`, figma=accent `Figma`, sheets=success `Sheet`, slides=caution `Presentation`, link=neutral `Link2`. The title is `text-sm font-semibold hover:text-accent`. The description shows on `sm+` (currently only `lg`) and is `max-w-[14rem] truncate text-xs text-muted`. Action icons are ghost `size="icon"`, with hover/focus reveal per §8.
- [ ] Empty becomes `EmptyState icon={Link2}` with the existing copy.
- [ ] ResourceDialog becomes `Modal` (`module="resources"`). The "detected" hint shows as a Badge info with a `ScanSearch` icon (Sparkles removed — reads as "AI").

### Outings (`outings/page.tsx` has uncommitted user edits; apply on top of them and don't revert anything; `NewOutingDialog.tsx`, `ExpenseDialog.tsx`)
- [ ] PageHeader `module="outings"`. "Upcoming" and "Past outings" become `SectionTitle`.
- [ ] OutingCard: upcoming cards get a top accent `shadow-[inset_0_3px_0_var(--signal)]`. Past cards are `tone="muted"`. The title is h2 display 18 600. The team/pool badges are neutral with icons. The date and venue meta stay as is. Edit/expand are ghost icon buttons.
- [ ] BudgetStrip: `rounded-xl bg-surface-2 p-3`. The track is `h-2 bg-surface-3`. The fill is flat `bg-signal`, or `bg-danger` when over budget. Remaining is `text-success` (danger when over). Values are `font-semibold tabular-nums`.
- [ ] CollapsibleSection: `rounded-xl border-border`. The header is `h-10 hover:bg-surface-2`. When open the header is `bg-surface-2/60`.
- [ ] Expense rows: `rounded-lg bg-card border-border`. The type badge is outing=info and other=pop. The amount is `font-semibold tabular-nums`.
- [ ] MemberChips: going/attended = Badge success with a `dot`, pending = caution, didn't go = neutral with line-through.
- [ ] Empty becomes `EmptyState icon={Users}` with the existing copy.
- [ ] NewOutingDialog / ExpenseDialog become `Modal` (`module="outings"`). Suggestion chips: `border-dashed border-border-strong bg-card text-muted hover:border-accent hover:text-accent`. The going/not-going toggle is Badge success or neutral. The total budget display is per §4.6.

### Settings (`settings/page.tsx`)
- [ ] PageHeader `module="settings"`. Cards use `CardHeader` (Profile: `UserRound`; Integrations: `Plug`).
- [ ] Profile inputs become `Input`/`Label`. They have no focus style today. Save message: success text, or danger on failure.
- [ ] `data/store.json` code chip: `rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]`.
- [ ] IntegrationRow: `rounded-xl border border-border p-4 hover:border-border-strong`. The icon uses a ModuleChip soft (neutral). The status pill becomes a Badge with a `dot`: Connected=success, Not connected=neutral, Needs setup=caution, Loading=neutral. Connect is a styled link.
- [ ] integrationMessage becomes `Alert tone="info"`.

---

## 10. Phone width (375px) rules
- No horizontal page scroll. Only the calendars and tables scroll inside their own `overflow-x-auto` container, and it gets a right-edge fade hint: `[mask-image:linear-gradient(90deg,#000_92%,transparent)]` on `<sm`.
- PageHeader action buttons go full-width under the title.
- Modals become bottom sheets (§4.9).
- Stat tiles are 2-up, with the 5th spanning 2 columns.
- Tabs scroll horizontally with no visible scrollbar.
- Card padding is `p-4`. Main padding is `px-4`.
- Badge rows `flex-wrap gap-1.5`. Long titles `break-words` (task, slack summary, mail subject). Resource titles truncate.

## 11. Motion summary
| Where | Effect |
|---|---|
| Buttons | color/shadow 150ms; press `translate-y-px` |
| Interactive cards / stat tiles | `-translate-y-0.5` + `shadow-raised`, 180ms |
| Modals | scrim fade 160ms; panel scale-in 180ms (sheet-up 220ms on phones) |
| Drawer | slide-in 220ms |
| Checkbox done | `animate-pop` 220ms |
| CardLink arrow | `translate-x-0.5` on hover |
| Attention stat dot | `animate-pulse` |

All of it is turned off under `prefers-reduced-motion` (§2.3).

## 12. Implementation order (each step leaves the app working)
1. globals.css + layout.tsx fonts + icon.tsx. Aliases keep old classes alive.
2. `ui/index.tsx` primitives + `lib/modules.ts`.
3. AppShell + toast.
4. `utils.ts` color helpers. This alone recolors badges app-wide.
5. Pages in this order: Home → Tasks → Mail → Planning → Features → Scrum → Slack → Resources → Settings → Login → Outings (last, because of the user's uncommitted edits).
6. Run the §7 grep. Then QA at 375 / 768 / 1280 / 1440, keyboard-tab through each page to check focus rings, and spot-check contrast with DevTools.

## 13. Out of scope
- Dark mode (see §1).
- Nav count badges, grouping nav into sections, a desktop top bar. These need data or structure changes; the Designer can scope them later.
- No copy changes, apart from reusing the existing Slack empty-state string on the Slack page.
