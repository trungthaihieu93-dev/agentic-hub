---
title: "Dashboard sidebar and light/dark themes"
description: "Add responsive left navigation, a bottom account section, and persistent light/dark appearance."
status: completed
priority: P2
effort: "7.5h"
branch: feat/sidebar-and-themes
tags: [frontend, feature]
blockedBy: []
blocks: []
created: 2026-11-07
---

# Dashboard sidebar and light/dark themes

## Outcome

Replace the authenticated horizontal header with left navigation, place the local account section at its bottom, and support consistent light/dark appearance throughout the dashboard. Keep Accounts, Audit log, authentication, and switching behavior intact.

## Confirmed user decisions

The user confirmed all three choices during planning.

1. The bottom account section shows **Local admin** and **Sign out**. Provider identities remain on Accounts; the current session API supplies no profile identity.
2. With no valid saved preference, appearance follows the operating system. Choosing **Light** or **Dark** applies immediately and persists that explicit choice.
3. Below `lg` (1024px), navigation becomes a menu-triggered drawer.

## Constraints and non-goals

- Reuse semantic CSS tokens, Lucide, shadcn controls, existing Radix primitives, the tiny router, and QueryClient logout behavior. Add no dependencies or server/API changes.
- Keep the existing dark palette; design accessible light tokens. Load the same-origin theme bootstrap before styles without weakening the actual server CSP.
- Preserve the local-tool density, system fonts, provider text/monograms, reduced motion, keyboard access, and existing account operations.
- No settings route, sidebar collapse/persistence, profile API, provider branding, third theme option, theme reset action, or cross-tab synchronization.
- Implementation includes updates to the owning design/usage docs. Leave completed plans and historical OpenSpec change files untouched; no new OpenSpec change is required.

## Phases

| # | Phase | Effort | Depends on | Status |
|---|-------|--------|------------|--------|
| 1 | [Theme foundation](./phase-01-theme-foundation.md) | 3.5h | None | Completed |
| 2 | [Responsive sidebar and integration](./phase-02-responsive-sidebar.md) | 4h | Phase 1 | Completed |

These phases execute sequentially. Their checklists own execution tracking.

## Acceptance criteria

- [x] Desktop has a roughly 14rem left sidebar with current-route navigation and a reachable bottom account/theme section; mobile has accessible navigation.
- [x] Both themes cover login, auth loading/error, Accounts, Audit, dialogs, menus, badges, inputs, focus states, and toasts with measured contrast.
- [x] Theme resolves before first paint under the production CSP, persists explicit choices, follows OS changes only without an explicit choice, and remains usable when storage fails.
- [x] Existing route/history, login, successful and failed logout, account switching, capture, and audit flows retain their behavior.
- [x] At 375, 1023, 1024, and 1280px there is no document overflow; the existing audit table scrolls internally and the account footer remains reachable in short windows.
- [x] Focused behavior tests and final web lint/test/typecheck/build pass; browser checks and docs reflect the final UI.

## Evidence and dependencies

- [README and supported commands](../../README.md), [design guidelines](../../docs/design-guidelines.md), [usage](../../docs/usage.md).
- [Current layout/logout](../../apps/web/src/app/layout.tsx), [router](../../apps/web/src/app/router.tsx), [app/auth gates](../../apps/web/src/app/app.tsx).
- [Tokens](../../apps/web/src/styles.css), [HTML entry](../../apps/web/index.html), [actual CSP](../../libs/server/src/middleware/security-headers.ts), [auth response](../../libs/shared/src/api.ts).
- [Existing dashboard behavior contract](../../openspec/changes/add-ah-dashboard/specs/dashboard-ui/spec.md) is a regression reference, not a document to rewrite.
- Existing workspace tooling is sufficient; no external service or cross-plan dependency.

## Validation log — 2026-11-07

- Three questions asked; all three choices explicitly confirmed by the user and propagated to both phases.
- Light verification tier: 10 source claims checked; 10 verified, 0 failed, 0 unverified. AgentKit format validation passed.
- Both phases reread; confirmed choices, numeric dependencies, paths, commands, and scope reconciled. No unresolved contradictions or questions.
- At the planning handoff, 18 phase items remained unchecked. Both phases are now verified and complete.
- [Validation evidence and recorded answers](../reports/plan-validation-261107-1610-sidebar-and-theme.md).

## Delivery evidence

- [Verification and screenshots](../reports/verification-261107-1652-sidebar-and-theme.md): 162 uncached tests, 12 viewport/theme cases, account/auth flows, contrast, and cleanup evidence.
- [Fresh isolated review](../reports/code-review-final-261107-2259-sidebar-and-theme.md): no actionable findings. Publication is tracked in [issue #1](https://github.com/trungthaihieu93-dev/agentic-hub/issues/1).

<!-- slug: sidebar-and-theme -->
