---
title: "Responsive sidebar and integration"
phase: 2
status: completed
priority: P2
effort: "4h"
dependencies: [1]
---

# Responsive sidebar and integration

## Overview

Replace the authenticated header with a responsive left sidebar, move the local account and shared theme controls to its bottom, and verify the complete dashboard. Depends on [the verified theme foundation](./phase-01-theme-foundation.md) and follows [the confirmed user decisions](./plan.md).

Context: [current layout](../../apps/web/src/app/layout.tsx), [router](../../apps/web/src/app/router.tsx), [dashboard regression contract](../../openspec/changes/add-ah-dashboard/specs/dashboard-ui/spec.md), [design docs](../../docs/design-guidelines.md), [usage](../../docs/usage.md).

## Verified source findings

1. `apps/web/src/app/layout.tsx:37-53` currently renders Accounts, Audit log, and Sign out in a horizontal header; `main:54` already provides the skip-link target and programmatic focus target.
2. `layout.tsx:17-26` awaits logout before clearing cache, marks `queryKeys.me` unauthenticated, and replaces the URL with `/login`; failure returns after an error toast.
3. `apps/web/src/app/router.tsx:21-45` supports client navigation, replace navigation, popstate subscriptions, and `aria-current`; it preserves modified-click browser behavior.
4. `libs/shared/src/api.ts:83` defines the auth response as only `{ authenticated: boolean }`. Provider identities belong to target/account data, not an authenticated admin profile.
5. `apps/web/src/components/ui/dialog.tsx:40-48` centers content using fixed midpoint coordinates, negative transforms, max widths, padding, and zoom animation; applying only `left-0` cannot produce a correct drawer.
6. `apps/web/src/pages/accounts-page.tsx:39` uses `lg:grid-cols-2`; a desktop sidebar reduces available content width at 1024px and requires a deliberate grid breakpoint adjustment.
7. `apps/web/src/components/ui/table.tsx:6-7` already owns an `overflow-x-auto` wrapper; keep it and make its surrounding flex/main region shrink correctly.
8. `apps/web/src/test/helpers.tsx:23-28` creates a retry-disabled QueryClient per render; `test/setup.ts` supplies Radix/jsdom shims and cleanup.

## Requirements

- At `lg` and above, show an approximately 14rem sidebar with `ah`, Accounts, Audit log, and current-route styling. Preserve the visible skip link on focus and `<main id="main" tabIndex={-1}>`.
- Place Local admin, Light/Dark, and Sign out at the sidebar bottom. Do not invent an email/name/avatar or request a profile endpoint. Provider account data remains on Accounts.
- Below `lg`, expose a labelled menu button in a compact top bar and open an accessible left drawer containing the same navigation/footer content. Do not render a hidden but focusable duplicate navigation.
- Keep footer controls reachable in short viewports and content usable at 375/1023/1024/1280px without document-level horizontal overflow.
- Preserve logout failure/success ordering, auth redirects, QueryClient lifetime, tiny-router history, and all account/audit behavior.

## Architecture

Keep Layout as the authenticated shell and logout owner. Extract one small `SidebarContent` component for brand, navigation, and account footer. Render it in the CSS-hidden desktop aside and only inside an open mobile Radix portal; the inactive desktop subtree uses `display: none` below `lg`. No sidebar state is persisted.

Desktop shell uses flex with a roughly `w-56 shrink-0`, sticky `top-0 h-dvh` aside. The aside is `flex flex-col`; give navigation/content `min-h-0 overflow-y-auto` as needed and the footer `mt-auto shrink-0`. The main column is `flex-1 min-w-0`, keeps the existing maximum reading width and sensible gutters, and owns normal page scrolling. The drawer similarly uses `h-dvh` with a scrollable middle and reachable footer.

Build the drawer from the already-installed `Dialog` primitives from `radix-ui`, reusing the local DialogOverlay and existing Button styling. Use a left-edge Content with explicit width/max-width, top/bottom positioning, no midpoint transforms, and no centered/zoom classes. This avoids altering the shared centered DialogContent used by capture and switch confirmations. Provide a labelled Title, description where useful, a close button, focus trap, Escape handling, overlay close, and body scroll lock through Radix.

Use `usePathname()` to close on route changes, including browser back/forward. Close on a normal same-route navigation click too, since `navigate()` deliberately emits nothing for the current pathname; retain modified-click semantics. Close when crossing into desktop width so no hidden modal traps focus or body scrolling. Restore focus to the visible menu trigger after Escape/overlay close. For route-driven close, prevent Radix's default focus restoration and focus `#main` after navigation; for a desktop breakpoint transition, target visible main content instead of the now-hidden trigger. Guard deferred focus against unmounted Layout after successful logout/auth expiry.

Move the phase-1 header ThemeToggle into the footer; login keeps its independent control. Use current route links and semantic tokens, with Lucide icons decorative beside visible labels. Keep the existing table's horizontal scroll wrapper; change the account grid from two columns at `lg` to two at `xl`, since a 14rem sidebar leaves less space at the desktop boundary. Add `min-w-0`, wrapping, and small header spacing adjustments only where actual content overflow requires them.

## Related files

| Action | Full path | Change |
|---|---|---|
| Modify | `apps/web/src/app/layout.tsx` | Desktop shell, mobile drawer lifecycle, existing logout owner, main/skip target. |
| Create | `apps/web/src/components/sidebar-content.tsx` | Shared navigation and bottom Local admin/theme/Sign out section. |
| Create | `apps/web/src/app/layout.spec.tsx` | Navigation, footer, drawer lifecycle/focus, logout behavior. |
| Create | `apps/web/src/app/app.spec.tsx` | Auth gate/theme/toast integration using the real app and isolated QueryClient. |
| Modify | `apps/web/src/pages/accounts-page.tsx` | Adjust card breakpoint and wrapping to the reduced main width. |
| Modify | `apps/web/src/test/helpers.tsx` | Add controllable viewport/media query helpers only if needed by focused tests. |
| Modify | `docs/design-guidelines.md` | Replace dark-only/header guidance; document tokens, responsive shell, and actual CSP. |
| Modify | `docs/usage.md` | Brief dashboard navigation, local session section, and appearance preference behavior. |

Read-only consumers: `app/router.tsx`, `app/app.tsx`, `components/ui/dialog.tsx`, `components/ui/table.tsx`, `pages/audit-page.tsx`, and phase-1 ThemeToggle/controller. Do not rewrite these contracts or historical plans/specs. Modify only a demonstrated overflow source if browser verification finds an additional affected consumer.

## Implementation steps

1. Replace the header with the desktop shell and shared SidebarContent using the confirmed Local admin footer and mobile-drawer choices. Preserve the existing logout function's await/error/cache/redirect ordering.
2. Add the mobile top bar and controlled Radix drawer with direct primitives. Implement pathname/current-link closing, breakpoint cleanup, and close-reason-aware focus restoration without adding routes or router APIs.
3. Keep the footer visually bottom-aligned and reachable, including at short heights. Move ThemeToggle from the old header to the footer; retain the login control and single shared theme state.
4. Shift the account-card two-column breakpoint to `xl`, constrain the main flex column, and verify real long emails, labels, process command lines, and audit messages. Preserve internal table scrolling and all existing actions.
5. Add behavior tests around the actual Layout and App. Keep fixture state isolated across history, QueryClient, media queries, localStorage, root theme class, and the theme bootstrap. Use existing test helpers rather than fake application behavior.
6. Update the owning docs after reviewing the final UI. Remove the obsolete dark-only anti-pattern, describe Light/Dark persistence and initial OS behavior, and correct the CSP explanation using server source. Verify links and claims against implementation; do not duplicate the token table if a source link is sufficient.
7. Run focused checks, the complete web checks, and browser verification. Record evidence and any unresolved issues before calling implementation complete.

## Todo

- [x] Implement the desktop aside and shared footer with Local admin, ThemeToggle, and existing Sign out behavior.
- [x] Implement the accessible mobile drawer and route/breakpoint/focus lifecycle.
- [x] Verify card/table sizing, long content, small screens, and short viewports.
- [x] Add Layout/App behavior tests and preserve existing login/account tests.
- [x] Update design/usage docs; complete final checks and browser evidence.

## Verification

Run from the repository root; no commands below have been run as application validation during planning.

```sh
bunx vitest run --config apps/web/vite.config.mts src/app/layout.spec.tsx src/app/app.spec.tsx src/pages/login-page.spec.tsx
bunx nx run web:lint
bunx nx run web:test
bunx nx run web:typecheck
bunx nx run web:build
```

Focused automated coverage:

- Accounts/Audit links retain `href` and `aria-current`, normal clicks use history, modified clicks retain browser behavior, and back/forward updates selection and closes an open drawer.
- Local admin and Sign out are present in the footer; no invented provider/user identity appears there.
- Drawer has a labelled dialog, opens/closes with keyboard, traps focus, closes on Escape, overlay, same-route click, route change, and desktop breakpoint; hidden navigation is absent from the active accessibility tree. Focus restores to a visible trigger or moves to main as specified.
- Logout failure shows the existing error toast without clearing cached account data or redirecting. Successful logout clears protected cache, sets `me` false, and replaces history with `/login`; opening the drawer cannot delay or change that sequence.
- App integration preserves signed-out redirect, login focus/error, authenticated Accounts/Audit, auth loading/retry error, and theme agreement through the gate. Include a representative portal and toast in each theme without CSS snapshots.

Browser-check both themes at 375px, 1023px, 1024px, and 1280px, including a short viewport such as 375x480 and 1024x500. Verify footer reachability, only one visible Main navigation, correct current link, no document overflow, internal audit scrolling, dialogs/menus/toasts, tab order, reduced motion, and root focus after drawer navigation/resize. Exercise capture, switch confirmation/refusal, delete confirmation, audit, successful logout, and a failed logout through existing flows; preserve server behavior and real local data. Do not mutate the user's saved provider accounts merely to obtain screenshots.

Use the production-served build for final theme/CSP checks. Reuse owned servers, inspect deterministic ports 7427/5173 before starting processes, track command/PID/port/worktree, and stop any processes started for this task. Validate Markdown links and compare final behavior to the plan acceptance criteria.

## Success criteria

- [x] Left navigation, bottom Local admin/theme/Sign out section, and mobile drawer meet the requested outcome and confirmed decisions.
- [x] Keyboard/focus, history, auth/logout, and account/audit behavior pass focused regression checks.
- [x] Both themes remain accessible across all states, viewport boundaries, and portals with no body overflow or unreachable footer.
- [x] Complete web lint/test/typecheck/build and production browser checks pass; docs describe the shipped behavior.

## Risks, security, and rollback

Centered DialogContent defaults can break drawer geometry; use the direct existing primitives and preserve shared confirmation dialogs. Hidden modal state during resize can trap focus/scroll, so breakpoint closure is a required check. Sidebar width can squeeze account cards; use the explicit `xl` grid adjustment and verify long content rather than hiding it. The admin footer carries only the generic local role, never credentials or provider identities. Keep session/API safeguards and theme storage unchanged.

Rollback sidebar/content/layout/grid changes together to restore the phase-1 header while retaining the verified theme foundation. Revert corresponding navigation docs with that rollback. No schema, credential, or data migration is involved. After all gates, hand off the completed implementation for the normal review/ship workflow; this plan does not itself authorize publication or claim completion.
