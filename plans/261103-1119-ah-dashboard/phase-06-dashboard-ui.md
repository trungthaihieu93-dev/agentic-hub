---
phase: 6
title: "Dashboard UI"
status: completed
priority: P2
effort: "5h"
dependencies: [4, 5]
---

# Phase 6: Dashboard UI

## Goal

Build the React dashboard (login, account board per provider and surface, capture, switch with warnings, drift handling, audit log), designed with `ak-ui-ux-pro-max` and implemented with `ak-ui-styling` (shadcn/ui + Tailwind).

## Files to Create / Modify

- Create: `docs/design-guidelines.md`: the design system from `ak-ui-ux-pro-max` (one dark theme: palette, type, spacing, states)
- Create:
  - `apps/web/src/app/`: router and layout
  - pages: `apps/web/src/pages/login-page.tsx`, `accounts-page.tsx`, `audit-page.tsx`
- Create components: `apps/web/src/components/target-card.tsx`, `account-row.tsx`, `capture-dialog.tsx`, `switch-confirm-dialog.tsx`, `drift-banner.tsx`, `unsaved-list.tsx`
- Create: `apps/web/src/lib/api.ts`: a typed fetch client using the `libs/shared` zod schemas. It always sends `X-AH-Request: 1`.
- Create: `apps/web/components.json`, Tailwind config, and the generated `apps/web/src/components/ui/*` (shadcn)
- Create: component tests `*.spec.tsx` (vitest + Testing Library)

## Tasks & Steps

1. Run `ak-ui-ux-pro-max` with a developer-tool dashboard brief: dense, calm, keyboard friendly, a single dark theme. Claude and Codex are identified by text label and a neutral mark, not brand art. Save the result to `docs/design-guidelines.md`.
2. Run `ak-ui-styling`: set up Tailwind and shadcn/ui in `apps/web` and add `button`, `card`, `dialog`, `input`, `badge`, `table`, `sonner`, `dropdown-menu`.
3. Data layer: TanStack Query for `/api/accounts`, refetched on window focus and after every mutation (no interval polling; the server watcher keeps `live_status` current). A 401 sends the user to `/login`.
4. **Accounts page:** one card per target in the Phase 4 registry. Whether the Codex CLI and desktop cards are merged follows the Phase 4 spike and the user's answer. Each card shows:
   - the active account (label, email, org) and the live identity;
   - the drift banner when the watcher flagged drift, with "Capture as…" and "Switch back";
   - the saved accounts list with a Switch button;
   - "Capture current login";
   - "Add account" help: the exact `claude auth login` / `codex login` command, or the empty-profile flow for desktop;
   - running-process badges;
   - `_unsaved` snapshots with a delete action;
   - for desktop cards, a note that sessions and worktrees belong to each account while the MCP config is shared.
5. **Switch flow:** a confirm dialog.
   - On 409: list the running sessions, warn that a forced switch can make them write the old account back and may require a re-login, and offer "Switch anyway".
   - On 423: "Quit <App> first".
   - On success: offer "Relaunch app" for desktop targets.
   - Show the result as a toast.
6. **Audit page:** a table of the last 50 switch attempts (time, target, from → to, actor, outcome, message).
7. **Login page:** a single password field with an error state and focus management.
8. Accessibility: labelled controls, visible focus, dialogs trap focus, and colour is never the only signal for status.

## Verification

- `bunx nx test web`:
  - the login error renders;
  - a card shows the drift banner when `drift=true`;
  - the switch dialog lists the warnings on 409 and shows the quit message on 423;
  - the API client sends `X-AH-Request`.
- `bunx nx build web` passes.
- Manual: `bunx nx serve web` against the dev server, checked at 1280px wide.
