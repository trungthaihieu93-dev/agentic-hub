# ah dashboard: design guidelines

The design system for the `ah` dashboard (`apps/web`): a dense, calm interface
with semantic light and dark palettes, system fonts, and keyboard access.

The [stylesheet](../apps/web/src/styles.css) owns token values and their
Tailwind v4 mapping. Components are shadcn/ui (new-york style, Radix
primitives) under [the shared UI directory](../apps/web/src/components/ui).
This file explains the intent; keep it aligned with the executable owners.

## Product brief

- A local developer tool used for a few seconds at a time to check and switch
  Claude and Codex logins. It should be dense, calm and keyboard friendly.
- Light and Dark share the same layout, density, and semantic component styles.
- Claude and Codex appear as text labels with a neutral monogram (`Cl`, `Cx`).
  No logos, brand colours or brand art.
- Desktop navigation must leave enough room for account cards; narrow and
  short windows must keep navigation, content, and footer actions reachable.

## Navigation and responsive layout

- At `lg` (1024px) and above, use an approximately 14rem left sidebar with the
  `ah` brand, Accounts, and Audit log. The bottom section holds Local admin,
  Light/Dark controls, and Sign out, and remains reachable in short windows.
- Local admin identifies the password-protected local session. Provider
  identities stay on Accounts; the sidebar has no admin email or avatar.
- Below 1024px, a compact top bar exposes a labelled menu button. Its left
  drawer contains the same navigation and footer actions. Only the active
  navigation is exposed to keyboard and assistive-technology users.
- The drawer traps focus and closes on Escape, overlay click, navigation
  (including the current page and browser back/forward), or resizing to desktop.
  Dismissal restores focus to the visible menu trigger; navigation and desktop
  resizing move focus to the main content.
- Account cards use one column below `xl` (1280px) and two at `xl` and above,
  leaving room for the sidebar. Long content must wrap without page-level horizontal
  scrolling; the audit table keeps its own horizontal scroll region.

The [layout](../apps/web/src/app/layout.tsx) owns the shell and drawer lifecycle;
the [router](../apps/web/src/app/router.tsx) owns links and current-page state.

## Appearance

With no valid saved preference, appearance follows the device, including later
device-theme changes. Choosing Light or Dark applies immediately and stores
that explicit choice as `ah-theme` in browser storage. Only exact `light` and
`dark` values count; the saved choice wins over device settings on reload. If
storage is denied, the choice still works until the page is reloaded. The
interface offers those two choices, without a System or reset control.

The [same-origin bootstrap](../apps/web/public/theme-init.js) owns preference
resolution. The [HTML entry](../apps/web/index.html) loads it before styles so
appearance resolves before first paint without an inline script. All screens
use the same resolved theme: login, auth loading/errors, Accounts, Audit,
dialogs and menu portals, and toasts. The shared appearance control uses
visible Light/Dark labels with `aria-pressed`; it sits outside the login form
and in the authenticated navigation footer.

## Colour

All colours are semantic tokens. Components never use raw hex values. The
[stylesheet](../apps/web/src/styles.css) owns both palettes; retain the existing
dark token values. Light mode uses darker status colours so text stays legible
on light tinted surfaces. [Status badges](../apps/web/src/components/ui/badge.tsx)
own their shared tint treatment.

Normal text must reach 4.5:1 contrast; large text and essential control/focus
indicators must reach 3:1 against adjacent colours in both themes. The
[shared Input](../apps/web/src/components/ui/input.tsx) uses semantic
`muted-foreground` opacity for its boundary to meet control contrast without
changing the dark palette. Check the rendered status tints and focus states,
including their opacity, rather than comparing only the base tokens.

**Colour is never the only signal.** Every status also has text and, where it
helps, a Lucide icon: "Active" plus a check, "Login drift" plus a warning
triangle, audit outcomes as icon plus word ("OK", "Refused", "Rolled back",
"Recovered", "Failed").

## Typography

- System font stacks only (`ui-sans-serif, system-ui, …` and `ui-monospace, …`).
  The [server CSP](../libs/server/src/middleware/security-headers.ts) uses
  `default-src 'self'`, which excludes remote fonts, CDNs, and inline scripts.
  Its `style-src 'self' 'unsafe-inline'` permits inline styles; theme startup
  uses the external same-origin script without weakening that policy.
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
| Toasts | sonner, bottom-right, rich colours with icons and the resolved theme; the result message goes in the description |
| Loading / error | `role="status"` text while loading; `role="alert"` with a Retry button on error |

Buttons: one `primary` per view region (Capture current login, Sign in,
Switch). Use `secondary`/`outline` for the rest, `ghost` for icon buttons, and
`destructive` for anything that deletes or forces.

## Interaction and accessibility

- Every control has a visible label or an `aria-label` (icon buttons such as
  "More actions for work" and "Delete unsaved snapshot <version>").
- Focus is always visible: a 2px `ring` colour with an offset on buttons, and
  border plus ring on inputs. Focus outlines are never removed.
- Form and confirmation dialogs are Radix: they trap focus, close on Escape and
  restore focus to the trigger. The first field gets focus on open. The
  navigation drawer follows the focus rules above.
- Forms validate on submit, show the error below the field (`role="alert"`,
  `aria-invalid`, `aria-describedby`) and keep the user's input. Labels are
  checked with the shared `labelSchema`.
- Login: the password field gets focus on load, and again after an error.
- Navigation: a skip link, `<nav aria-label="Main">` and `aria-current="page"`.
  Preserve standard link behaviour, including modified clicks and history.
- Motion remains brief; animations and transitions respect
  `prefers-reduced-motion`.
- No hover-only information. A cmdline in a `title` duplicates text that is
  already visible.

## Data freshness

The board refetches on window focus and after every mutation. There is no
interval polling, because the server-side watcher keeps the live status
current.

## Anti-patterns

- Brand logos and colours for Claude or Codex.
- Remote fonts, CDNs, or inline `<script>` (they break the CSP).
- Status shown only as a coloured dot.
- Emoji as icons; use Lucide SVGs with `aria-hidden` next to text.
