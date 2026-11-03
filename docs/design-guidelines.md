# ah dashboard: design guidelines

The design system for the `ah` dashboard (`apps/web`). It was derived with the
`ak-ui-ux-pro-max` design-system search ("developer tool dashboard, dense, calm,
dark") and adapted: the search proposed a light background, an orange CTA and
Google-hosted Inter, which this product does not use.

The tokens live in `apps/web/src/styles.css` (CSS variables mapped into Tailwind v4
with `@theme inline`); components are shadcn/ui (new-york style, Radix
primitives) under `apps/web/src/components/ui`. This file explains the intent.
When the two disagree, the stylesheet is what ships, so update both.

## Product brief

- A local developer tool used for a few seconds at a time to check and switch
  Claude and Codex logins. It should be dense, calm and keyboard friendly.
- There is one theme, and it is dark. No light mode and no theme toggle.
- Claude and Codex appear as text labels with a neutral monogram (`Cl`, `Cx`).
  No logos, brand colours or brand art.
- Viewport target: desktop, checked at 1280px. Cards stack to one column below
  the `lg` breakpoint, so narrow windows still work without horizontal scroll.

## Colour

All colours are semantic tokens. Components never use raw hex values.

| Token | Value | Use | Contrast |
|-------|-------|-----|----------|
| `background` | `#0b1120` | page | |
| `card` | `#111a2e` | cards, login panel | |
| `popover` | `#16203a` | dialogs, menus | |
| `muted` | `#1a2438` | quiet fills (code, notes) | |
| `foreground` | `#e2e8f0` | body text | 14.1:1 on card |
| `muted-foreground` | `#94a3b8` | secondary text | 6.8:1 on card |
| `border` / `input` | `#263247` / `#334155` | dividers / control outlines | |
| `primary` | `#2563eb` + white text | the one main action per view | 5.2:1 |
| `destructive` | `#dc2626` + white text | delete, "Switch anyway" | 4.8:1 |
| `ring` | `#60a5fa` | focus ring | 6.8:1 on card |
| `success` | `#22c55e` | active account, OK outcome | 7.6:1 on card |
| `warning` | `#f59e0b` | drift, running sessions, refused / rolled back | 8.1:1 on card |
| `danger` | `#f87171` | errors, failed, "quit the app first" | 6.3:1 on card |

Status tints are the status colour at 10% fill with a 40% border, and text in
the full status colour.

**Colour is never the only signal.** Every status also has text and, where it
helps, a Lucide icon: "Active" plus a check, "Login drift" plus a warning
triangle, audit outcomes as icon plus word ("OK", "Refused", "Rolled back",
"Recovered", "Failed").

## Typography

- System font stacks only (`ui-sans-serif, system-ui, …` and `ui-monospace, …`).
  The server sends CSP `default-src 'self'`, so remote fonts and CDNs are not allowed.
- Base size 14px (`text-sm`) for this dense tool UI; 12px (`text-xs`) only for
  metadata such as timestamps, pids and section labels. Page titles use
  `text-lg` and card titles `text-base`, both semibold.
- Monospace for commands (`claude auth login`), snapshot versions, cmdlines and
  file names.
- Section labels inside cards are 12px, uppercase, tracked, and muted.

## Spacing and shape

- A 4px rhythm: `gap-1.5` inside rows, `gap-4`/`space-y-4` between card
  sections, and `p-4` card padding. Content width is capped at `max-w-7xl`.
- Radius: 8px base (`--radius`), 12px for cards, 6px for controls and badges.
- Lists inside cards are bordered and divided (`divide-y`), not separate cards.

## Components and states

| Element | Pattern |
|---------|---------|
| Target card | Monogram, display name, "CLI" or "Desktop app" badge, then: active account, live login, drift banner, running processes, saved accounts, unsaved snapshots, add-account help, the desktop shared-MCP note, and footer actions |
| Disabled target | "Unavailable" badge, the server's `disabledReason`, and no actions |
| Account row | Label, "Active" badge, email · org, capture time; "Switch" (secondary) and a "More actions" menu with Delete, both only for non-active rows |
| Drift banner | `role="alert"`, warning tint: "Capture as…" and "Switch back to <label>" |
| Switch dialog | Confirm, then, depending on the response: 409 lists the processes, gives the re-login warning, and offers "Switch anyway" (destructive); 423 says "Quit <App> first." and offers "Try again"; desktop targets get a "Relaunch <App> after switching" checkbox |
| Destructive confirm | A dialog with Cancel and a destructive confirm button |
| Toasts | sonner, bottom-right, rich colours with icons; the result message goes in the description |
| Loading / error | `role="status"` text while loading; `role="alert"` with a Retry button on error |

Buttons: one `primary` per view region (Capture current login, Sign in,
Switch). Use `secondary`/`outline` for the rest, `ghost` for icon buttons, and
`destructive` for anything that deletes or forces.

## Interaction and accessibility

- Every control has a visible label or an `aria-label` (icon buttons such as
  "More actions for work" and "Delete unsaved snapshot <version>").
- Focus is always visible: a 2px `ring` colour with an offset on buttons, and
  border plus ring on inputs. Focus outlines are never removed.
- Dialogs are Radix: they trap focus, close on Escape and restore focus to the
  trigger. The first field gets focus on open.
- Forms validate on submit, show the error below the field (`role="alert"`,
  `aria-invalid`, `aria-describedby`) and keep the user's input. Labels are
  checked with the shared `labelSchema`.
- Login: the password field gets focus on load, and again after an error.
- Navigation: a skip link, `<nav aria-label="Main">` and `aria-current="page"`.
- Motion: 150ms colour and opacity transitions only, all disabled under
  `prefers-reduced-motion`.
- No hover-only information. A cmdline in a `title` duplicates text that is
  already visible.

## Data freshness

The board refetches on window focus and after every mutation. There is no
interval polling, because the server-side watcher keeps the live status
current.

## Anti-patterns

- Light theme, a theme toggle, or brand logos and colours for Claude or Codex.
- Remote fonts, CDNs, or inline `<script>` (they break the CSP).
- Status shown only as a coloured dot.
- Emoji as icons; use Lucide SVGs with `aria-hidden` next to text.
