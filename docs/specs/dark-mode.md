# Dark mode

## 1. Problem
Helpit is light-only. Producers who work late, or who keep the OS in dark mode, get a bright paper canvas. There is no way to follow the system setting or pick a theme.

## 2. Goal
A three-way theme preference (System / Light / Dark) that applies on first paint with no flash, keeps the "Ink & signal orange" identity (see `visual-redesign.md` §2), and passes WCAG AA in both themes.

## 3. Scope
**In:** dark token set in `globals.css`; a no-flash inline script in `layout.tsx`; a theme toggle in the sidebar footer (desktop sidebar + mobile drawer); fixing hard-coded colors that break in dark (§7); shadows, scrim, `::selection`, `color-scheme`, date inputs, theme-color meta.
**Out:** no `store.json`, `types.ts`, API, or server changes. No per-module theming, no high-contrast theme, no scheduled (time-of-day) switching. PWA icons (`icon.tsx`, `pwa-icon.tsx`) stay as they are.

## 4. User flow
1. First visit: preference = **System**. `<html data-theme>` resolves to `light` or `dark` from `prefers-color-scheme` before first paint.
2. The user opens the sidebar (desktop) or the menu drawer (mobile) and sees a 3-segment control in the footer card, above "Sign out": **System** (Monitor icon) / **Light** (Sun) / **Dark** (Moon). Icons have visible labels or `aria-label`s, and the control is a `radiogroup` with `aria-checked` set.
3. Picking an option updates `data-theme` straight away (no reload) and saves to `localStorage["helpit-theme"]` = `"system" | "light" | "dark"`.
4. On **System**, a `matchMedia("(prefers-color-scheme: dark)")` listener re-resolves the theme live when the OS changes. On Light or Dark, the listener has no effect.
5. Reload or come back later: the inline script reads the stored value and applies it before paint. A `storage` event keeps other open tabs in sync.
6. The login page (no AppShell, so no toggle) still follows the stored or system theme, because the script lives in the root layout.

## 5. Implementation notes (no code, just the contract)
- **Inline script** in `<head>` of `src/app/layout.tsx`. It runs synchronously: try/catch read of localStorage, fall back to `system` if the value is missing or invalid, resolve via `matchMedia`, then set `document.documentElement.dataset.theme`. If anything throws it sets `light`. Add `suppressHydrationWarning` to `<html>`.
- **CSS:** keep the light tokens on `:root`. Add a `[data-theme="dark"]` block that overrides the same variable names (tokens + the `--shadow-*` vars from `@theme static`) and sets `color-scheme: dark`. `@theme inline` mappings stay the same, so every `bg-*`/`text-*` utility switches automatically.
- Add `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` for rare one-off overrides. Prefer tokens.
- **New tokens (both themes):** `--on-fill` (text/icons on solid semantic, platform, accent and neutral fills) and `--on-signal` (text on signal/pop fills, which is always ink). Map them as `--color-on-fill` and `--color-on-signal`.
- Date inputs: change the `input[type=date|datetime-local] { color-scheme: light }` rule to `color-scheme: inherit` so the native picker follows the theme.
- **themeColor:** keep `#E8590C` (signal) in both themes. It's the brand bar and doesn't change, so no runtime meta swap is needed. `manifest.ts` `background_color` stays light (see Open questions).

## 6. Token table
Contrast ratios are computed (WCAG 2.x, approximate). "card" is the reference surface unless noted.

| Token | Light | Dark | Dark contrast notes |
|---|---|---|---|
| `color-scheme` | light | dark | Native scrollbars, form controls and date pickers |
| `--background` | #F6F4EF | #141312 | Warm near-black canvas |
| `--card` | #FFFFFF | #1E1C1A | Raised above canvas |
| `--surface-2` | #F1EEE7 | #272522 | Wells, table heads, hover |
| `--surface-3` | #E8E4DB | #33302C | Pressed, tracks, skeletons |
| `--border` | #E4E0D8 | #35322E | Decorative only. 1.33:1 on card, same as light (UI §12.4) |
| `--border-strong` | #D3CDC2 | #45413C | Hover borders, drop zones. 1.7:1 card |
| `--border-input` | #8C857A | #7A746B | 3.7:1 card, 4.0:1 bg (1.4.11) |
| `--foreground` | #1A1918 | #EDEAE4 | 15.5 bg, 14.1 card, 10.9 surface-3 |
| `--muted` | #6F6A62 | #A8A298 | 7.3 bg, 6.7 card, 6.0 s-2, 5.2 s-3 (passes on s-3 in dark) |
| `--subtle` | #A39E94 | #6E6961 | 3.1 card. Never essential text |
| `--brand` / `--brand-hover` | #1A1918 / #000000 | #EDEAE4 / #FFFFFF | = foreground |
| `--accent` | #C2410C | #F07A35 | 6.1 card, 6.7 bg. On-fill ink on it 6.7 (UI §12.4) |
| `--accent-hover` | #9A3412 | #F08A4B | Hover goes lighter in dark. 6.8 card, on-fill 7.5 |
| `--accent-soft` | #FDF0E8 | #3A2418 | Accent text on it 5.2 |
| `--signal` | #E8590C | #E8590C (unchanged) | 4.8 card, 5.2 bg (non-text marks, focus ring) |
| `--on-signal` (new) | #1A1918 | #1A1918 | Ink on signal 4.9 (logo "H", pop badge) |
| `--on-fill` (new) | #FFFFFF | #141312 | Ink on every dark solid fill is 7.5 or higher (below) |
| `--success` / `-soft` | #2F7D4F / #EEF6F0 | #6BBF8A / #1C2C22 | 7.6 card, 6.6 soft. On-fill 8.3 |
| `--success-hover` | #24613D | #86CFA0 | |
| `--caution` / `-soft` | #8A5A12 / #FBF3E4 | #E0B062 / #2E2614 | 8.5 card, 7.5 soft. On-fill 9.3 |
| `--caution-hover` | #6F480E | #EAC27E | |
| `--caution-mark` | #B7791F | #D69A3A | Non-text marks |
| `--danger` / `-soft` | #B42318 / #FCEDEB | #F28B7F / #3A1E1B | 7.1 card, 6.4 soft. On-fill 7.8 |
| `--danger-hover` | #912018 | #F6A79D | |
| `--info` = `--ios` / `-soft` | #3D5A80 / #EDF1F6 | #8FAAD1 / #1D2533 | 7.1 card, 6.5 soft. On-fill 7.8 |
| `--info-hover` | #2F4766 | #A9BFDE | |
| `--ios-ink` | #2A4060 | #B4C6E2 | 7 or higher on ios-soft |
| `--android` / `-soft` | #4A6B3A / #EFF3EC | #9BBE86 / #1F2A1B | 8.2 card, 7.2 soft. On-fill 8.9 |
| `--android-ink` | #34502A | #BBD6A9 | 8 or higher on android-soft |
| `--sidebar` / `--sidebar-2` | #1A1918 / #252321 | #0E0D0C / #1C1A18 | Darker than canvas, so the sidebar edge stays visible |
| `--sidebar-foreground` / `-muted` | #DDD9D1 / #9A948A | unchanged | Muted 6.4 on dark sidebar |
| `--overlay` | rgb(26 25 24 / .5) | rgb(0 0 0 / .6) | |
| `--shadow-card` | ink .04 | rgb(0 0 0 / .30) | Borders carry the separation in dark |
| `--shadow-raised` | ink .10 / .04 | rgb(0 0 0 / .45) + rgb(0 0 0 / .30) | |
| `--shadow-overlay` | ink .25 + ink .05 ring | rgb(0 0 0 / .55) + rgb(255 255 255 / .06) ring | Ring outlines modals on dark |
| `::selection` | signal / .18 | signal / .35 | Selected text stays readable |
| Aliases (`warning`, `accent-secondary`, `pop*`) | via var() | inherit automatically | No change |

## 7. Hard-coded colors found in `src/` (grep: hex, rgb(), bg-white/black, text-white/black, white/ and black/ opacity, palette classes)
**Must change (they break in dark):**
| File:line | Today | Change to |
|---|---|---|
| `components/ui/index.tsx:232` | Badge neutral `bg-foreground text-white` | `text-on-fill` (light text on a light fill otherwise) |
| `components/ui/index.tsx:233-240` | Solid badges `text-white` on accent/success/caution/danger/info/android/ios | `text-on-fill` |
| `components/ui/index.tsx:238` | Pop badge `bg-pop text-foreground` | `text-on-signal` |
| `components/ui/index.tsx:497` | Primary button `bg-accent text-white` | `text-on-fill` |
| `components/ui/index.tsx:501` | Danger button `hover:text-white` | `hover:text-on-fill` |
| `components/ui/index.tsx:796` | Checkbox checked `bg-success text-white` | `text-on-fill` |
| `lib/utils.ts:106` | `bg-danger text-white` | `text-on-fill` |
| `components/planning/ReleaseCalendar.tsx:146` | Today chip `bg-accent text-white` | `text-on-fill` |
| `components/scrum/ScrumAttendanceBoard.tsx:333, 611` | `bg-accent text-white` | `text-on-fill` |
| `components/tasks/MailApprovals.tsx:134, 198` | CheckCircle2 `fill-success … text-white` | `text-on-fill` |
| `components/layout/AppShell.tsx:20` | Logo "H" `bg-signal text-foreground` | `text-on-signal` |
| `app/login/page.tsx:25` | Logo "H" `bg-signal text-foreground` | `text-on-signal` |
| `app/globals.css:186` | Date inputs `color-scheme: light` | `inherit` |
| `app/globals.css:176` | `::selection` literal | Theme-aware (table above) |

**OK as is (allowed by `visual-redesign.md` §2.4):** `AppShell.tsx` sidebar `text-white`, `bg-white/[…]`, `ring-white/10`, `border-white/5` (lines 25, 55, 56, 68, 83, 89, 132, 154). The sidebar stays dark in both themes. Also fine: `app/icon.tsx:17-18`, `lib/pwa-icon.tsx:16-17` (ImageResponse can't read CSS vars), `layout.tsx:32` themeColor, `manifest.ts:12-13`, the `scroll-fade-x` mask `#000` (an alpha mask, not a visible color). `lib/__tests__/mail-category.test.ts:49` is a false positive (ticket number). No inline `style={{ color/background }}`, gradients, or Tailwind palette classes (`gray-500` etc.) were found.

## 8. Edge cases
- **localStorage blocked or throws** (private mode, quota): the theme still applies from System, the toggle still works for the session, and nothing errors. Reads and writes are both wrapped in try/catch.
- **Invalid stored value:** treat it as `system` and don't rewrite it until the user picks something.
- **No flash:** hard-reloading `/`, `/login` and a deep route in Dark shows no light frame. No hydration warning for `data-theme`.
- **OS switches while the tab is open:** System follows live. Light and Dark ignore it.
- **Multiple tabs:** a change in one tab updates the others through the `storage` event.
- **Mobile:** the toggle sits in the drawer footer. The drawer closing on navigation doesn't reset the theme. Body-scroll lock is unaffected.
- **Native controls:** date/datetime pickers, `<select>` dropdowns, scrollbars and `accent-color` checkboxes follow `color-scheme`.
- **Muted on surface-3:** fails in light (4.2), passes in dark (5.2). Keep the light-theme rule (no muted text on surface-3).
- **Large lists and calendars:** no per-row JS. Theming is CSS-variable only, so long task, mail and release lists cost nothing extra.
- **Printing:** out of scope. Prints whatever theme is active.

## 9. Acceptance criteria
- [ ] Sidebar footer (desktop) and mobile drawer footer show a System / Light / Dark control, keyboard-operable (arrow keys or Tab plus Enter/Space), with a visible focus ring and the current option marked.
- [ ] Default with no stored value = System and matches the OS. Toggling the OS theme flips the app live.
- [ ] Light and Dark override the OS. The choice survives reload and new tabs. `localStorage["helpit-theme"]` holds `system|light|dark`.
- [ ] With localStorage disabled the app loads, follows the OS, and shows no console errors.
- [ ] Hard reload in Dark shows no flash of light theme on `/`, `/login`, `/planning`, `/tasks`.
- [ ] `<html>` carries `data-theme="light|dark"`, and `color-scheme` matches (date pickers and scrollbars go dark).
- [ ] All tokens in §6 apply in dark. No component still renders a white card or paper canvas in dark.
- [ ] Every item in §7 "Must change" is fixed. Solid badges, primary and danger buttons, the checked checkbox, the calendar today chip, scrum count pills, mail approval checks, and both logo marks are readable in both themes.
- [ ] Spot-check AA in dark: body text, muted text, links/accent, and each semantic and platform badge (soft and solid) meet 4.5:1. Input borders and focus ring meet 3:1.
- [ ] Modals, popovers, menus and toasts in dark: overlay scrim darkens the page, and `shadow-overlay` shows its 1px light ring.
- [ ] Light theme looks pixel-identical to today, apart from the token-swap classes, which resolve to the same colors.
- [ ] No changes to `store.json`, `types.ts`, `db.ts` or any API route.

## 10. Open questions (resolved)
1. PWA `manifest.ts` `background_color` (splash): **stays light.**
2. Browser theme-color bar: **stays signal orange** (`#E8590C`) in both themes.
3. Toggle labels: **icon + short text** (see §11).

## 11. UX

**Placement.** One `ThemeToggle` component inside `SidebarFooter`, so the desktop sidebar and mobile drawer render the same control. Order in the footer card: org line, version line, theme control, Sign out. The theme control sits above Sign out so the destructive-ish action stays last and isn't hit by accident.

```
+-- footer card ---------------------------+
| <org name>                               |
| <version line>                           |
|                                          |
| Theme                                    |  <- tiny muted label (visually hidden ok)
| +-----------+-----------+-----------+    |
| |[M] System | [S] Light | [D] Dark  |    |  <- 3 equal segments, h-8
| +-----------+-----------+-----------+    |
|   Using dark                             |  <- only when System is selected
|                                          |
| [->] Sign out                            |
+------------------------------------------+
  [M] Monitor  [S] Sun  [D] Moon (lucide, same 14px size as LogOut)
```

**Labels: icon + short text.** The footer's inner width is about 208px on desktop (w-64 minus margin and padding) and about 224-240px in the drawer. Three segments of ~68px fit a 14px icon plus "System" / "Light" / "Dark" at the footer's existing `text-xs` size. Text beats tooltips here: tooltips don't exist on touch, and "System" isn't obvious from a monitor icon. Icons are `aria-hidden`; the visible text is the accessible name. If a segment ever gets too tight, drop the icon, never the text.

**States.**
| State | What shows |
|---|---|
| Selected | Filled segment (raised pill on the track; Helpit has no segmented control yet, so build it as a reusable one in `src/components/ui`) plus `aria-checked="true"`. Selection must not rely on color alone: the pill shape/fill change carries it. |
| Unselected | Muted text and icon. Hover: same hover treatment as the Sign out row. |
| Focus | `ring-signal` focus ring on the focused segment (matches Sign out and drawer close). |
| System selected | One muted line under the control: "Using dark" or "Using light". Updates live when the OS flips. Hidden for Light/Dark (the choice is already the answer). |
| First paint / pre-hydration | Control renders with no segment selected until the client reads the stored value, then snaps to it with no animation. The page theme itself is already correct from the inline script. |
| Storage blocked | Looks and works the same. No error, no warning. The choice just doesn't persist past the session. |

There is no loading, empty, or error state for the user to see.

**Keyboard and ARIA.**
- Container: `role="radiogroup"` with `aria-label="Theme"`. Segments: `role="radio"`, `aria-checked`.
- Roving tabindex: one Tab stop for the whole group (the checked segment, or System if none). Left/Right and Up/Down move **and select** (standard radio behavior), wrapping at the ends. Home/End go to the first/last. Space/Enter selects the focused segment.
- Tab order in the footer: theme group, then Sign out.
- The "Using dark/light" line is plain text linked via `aria-describedby` on the System radio. No live-region announcement on change (the visual change is the feedback; announcing every OS flip is noise).

**Behavior details.**
- Click/tap applies immediately. No confirm, no toast, no reload. The theme switches instantly (no cross-fade) so the change reads as a direct response to the tap.
- Re-selecting the current option does nothing.
- On mobile, picking a theme **does not close the drawer**. The user sees the result behind the scrim and can close it themselves. Drawer close on navigation is unchanged.
- The sidebar is dark in both themes, so the control looks the same in Light and Dark. Only the main canvas changes, which is the expected feedback.
- Touch target: segments are at least 32px tall (h-8, matching Sign out). Each third of the row is the tap area.
- Other tabs follow via the `storage` event (§4.5). Their toggles update their selected segment too.
- Login page: no toggle (no AppShell), as §4.6 says. Not worth adding: the theme set in the app carries over.

## 12. UI

### 12.1 Components
- **New: `SegmentedControl`** exported from `src/components/ui/index.tsx` (next to `Tabs`, which it visually mirrors). `ThemeToggle` in `AppShell.tsx` is a thin wrapper around it.
- Props: `value: T | null` (null = pre-hydration, nothing selected), `onChange`, `items: { id, label, icon?: LucideIcon, describedBy? }[]`, `aria-label`, `tone: "surface" | "sidebar"` (default `surface`), `size: "sm" | "md"` (default `md`), `fullWidth?: boolean`.
- Reuse the existing `TRANSITION` constant. Don't reuse `FOCUS_RING` for the sidebar tone (see focus below).
- Icons: **lucide-react** (already used, e.g. `LogOut`, `Menu`, `X` in AppShell): `Monitor`, `Sun`, `Moon`, `aria-hidden`.

### 12.2 Anatomy and sizes
| Part | `sm` (sidebar footer) | `md` (in-page, e.g. future filters) |
|---|---|---|
| Track | `p-0.5 gap-0.5 rounded-control` (10px) | `p-1 gap-1 rounded-control` (same as `Tabs`) |
| Segment | `h-8 px-1 gap-1 rounded-lg text-xs font-medium` | `h-8 px-3 gap-1.5 rounded-lg text-xs font-semibold` |
| Icon | `h-3.5 w-3.5` (matches LogOut) | `h-3.5 w-3.5` |
| Layout | `fullWidth`: `flex w-full`, segments `flex-1 min-w-0 justify-center` | `inline-flex` |

Inner radius 8px inside a 10px track with 2px padding keeps the corners concentric. Height stays h-8 (32px tap target, same as Sign out). No `radius-chip` or `radius-card` here.

### 12.3 States by tone
| State | `sidebar` (dark footer, both themes) | `surface` (canvas/cards) |
|---|---|---|
| Track | `bg-black/20 ring-1 ring-inset ring-white/10` (reads as a recessed well in the `bg-white/[0.04]` footer card) | `bg-surface-2 ring-1 ring-inset ring-border` |
| Unselected | `text-sidebar-muted` | `text-muted` |
| Hover (unselected) | `hover:bg-white/[0.06] hover:text-white`. Lighter than Sign out's `white/10` on purpose, so hover never looks like the selected pill | `hover:text-foreground` |
| Selected | `bg-white/[0.14] text-white shadow-card ring-1 ring-inset ring-white/10`. The raised pill carries the state, not color alone | `bg-card text-foreground shadow-card` |
| Focus-visible | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal` (same as Sign out and drawer close). Signal on sidebar is 5.4:1 | `FOCUS_RING` |
| Disabled | `disabled:opacity-50 disabled:cursor-not-allowed`, no hover | same |
| Pre-hydration (`value=null`) | All segments unselected; no transition on first select | same |

`white/` and `black/` opacities are allowed in the sidebar only (`visual-redesign.md` §2.4). The `surface` tone uses tokens only.

### 12.4 Footer layout and phone width
- Order inside `SidebarFooter`: org, version, then `mt-3` label "Theme" (`text-[11px] font-medium text-sidebar-muted mb-1.5`), the control (`fullWidth`, `size="sm"`), the optional "Using dark/light" line (`mt-1.5 text-[11px] text-sidebar-muted`), then Sign out (`mt-2`, unchanged).
- Width budget: desktop inner width is 208px, so each segment is about 68px. "System" plus a 14px icon at `text-xs` with `gap-1 px-1` fits about 62-66px. Never truncate the label. If a build check shows it clipping, hide the icons (keep the text), per §11.
- Mobile drawer: same component, same classes. No breakpoint changes. Check at 375px that the drawer footer doesn't wrap the control onto two lines.

### 12.5 Dark token check (changes made in §6)
- `--accent` dark `#F08A4B` → **`#F07A35`**. The old value read peach/pastel next to `--signal` and made the primary button look washed out. The new one sits closer to the signal hue and still passes AA (6.1 on card, 6.7 on bg, ink on it 6.7, on accent-soft 5.2). `--accent-hover` → `#F08A4B` (the old accent, already verified).
- `--border` `#2E2B28` → **`#35322E`** and `--border-strong` `#3D3935` → **`#45413C`**. Shadows barely show in dark, so borders do the separating. The old border was 1.2:1 on card, below light's 1.33:1. The new values match light's step ratios.
- Everything else holds: warm neutrals stay in the ink family, the semantic tints are desaturated enough to sit under signal without competing, and signal stays the only saturated orange mark. No other value changes.
