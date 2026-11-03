# Phase 6 (Dashboard UI): implementation report

Status: DONE_WITH_CONCERNS. `bunx nx run-many -t lint test build typecheck -p web` passes with 0 lint errors and 0 warnings, and all 20 tests pass. The manual 1280px check against the live server has not been run.

## What was built (apps/web)

- **Setup:**
  - Tailwind v4 through `@tailwindcss/vite`, with tokens in `src/styles.css`.
  - shadcn/ui new-york with `components.json`. The `src/components/ui/*` components were hand-written to the shadcn source using the `radix-ui` package: button, card, dialog, input, label, badge, table, sonner and dropdown-menu.
  - The `@/` alias is set in vite and in both tsconfigs.
  - The Nx welcome starter is removed.
- **Data:**
  - `src/lib/api.ts` is a typed fetch client that validates every response against the shared zod schemas. Every request sends `X-AH-Request: 1` and `credentials: 'same-origin'`. Errors come back as `ApiError`, and a switch returns `{status: 200|409|423, result}`.
  - The server-only optional fields (`enabled`, `disabledReason`, `sharedFiles`) are kept through a local `targetDtoSchema.extend(...)`. Without it, zod would strip them. The shared schemas are unchanged.
  - `src/lib/queries.ts` holds the TanStack Query hooks. Data refetches on window focus and after every mutation, with no interval.
  - Any 401 marks the session as signed out, and the router then goes to `/login`.
- **Router:** `src/app/router.tsx` is a tiny History API router with three routes: `/login`, `/` and `/audit`. The server already falls back to `index.html`.
- **Pages:**
  - Login: a single password field. It shows an error for 401 and 429, keeps focus on the field and returns focus to it after an error.
  - Accounts: one target card per target.
  - Audit: a table with time, target, from → to, actor, outcome (icon and text) and message.
- **Components:**
  - `target-card`, `account-row`, `capture-dialog` (which also runs the desktop "Add empty account" flow), `switch-confirm-dialog`, `drift-banner`, `unsaved-list`, plus `confirm-dialog` and `provider-mark` (a neutral `Cl`/`Cx` monogram).
  - The switch dialog handles three responses. On 409 it lists the processes, gives the re-login warning and offers "Switch anyway" with `force: true`. On 423 it says "Quit <App> first." and offers Try again. On 200 it shows a toast that matches the outcome (ok, refused, rolled_back or failed), plus a note when there is an unsaved snapshot.
  - Desktop targets get a "Relaunch <App> after switching" checkbox, which sends `relaunch: true`.
- **Tests (vitest + Testing Library, mocked fetch):**
  - The API client headers, body, error mapping, 409 passthrough, extra fields and network errors.
  - Login error, 429 and empty-password cases.
  - The drift banner and its actions, the active badge, the CLI hint, process badges, the desktop shared-MCP note and the disabled card.
  - The switch dialog: 409 warnings followed by a forced retry, the 423 quit message, and relaunch.
  - Capture label validation and a successful capture.
- **Design:** `docs/design-guidelines.md` covers the single dark theme, tokens with measured contrast ratios, system fonts, component states, accessibility rules and anti-patterns.

## Deps added (exact pins, apps/web/package.json)

- Runtime: tailwindcss 4.3.4, @tailwindcss/vite 4.3.4, radix-ui 1.8.1, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, lucide-react 1.67.0, sonner 2.0.8, @tanstack/react-query 5.105.3, tw-animate-css 1.4.0, zod 4.6.7.
- Dev: @testing-library/user-event 14.6.8, @testing-library/jest-dom 7.0.1.

## Deviations and concerns

1. **tsc output moved.** `tsconfig.app.json` `outDir` is now `out-tsc/app`; it was `dist`. Vite's `emptyOutDir` on the same folder raced with `tsc --build` in `run-many` and made typecheck fail with TS6305. As a side effect, the built web folder that Phase 7 copies no longer contains `.d.ts` files.
2. **CSP and runtime `<style>` tags.** Sonner and Radix's scroll lock (react-remove-scroll) inject `<style>` elements at runtime. Under `default-src 'self'` the browser blocks these and logs a CSP violation.
   - Toasts still look correct, because `sonner/dist/styles.css` is bundled into the app CSS.
   - The only real loss is that the page behind an open dialog can still scroll.
   - If clean consoles matter, the server could add `style-src 'self' 'unsafe-inline'`, which is a server-phase decision. The built `index.html` has no inline scripts and no remote fonts or CDNs; I checked this with a scratch build.
3. **`<base href="/">` removed** from `index.html`, because the server's `base-uri 'none'` would block it.
4. **"Switch back" in the drift banner** calls switch with the active account's id. This assumes the server accepts a switch to the currently active account to reinstall it. If it refuses, the user sees a refused toast.
5. **Bundle size.** The single bundle is 536 kB (163 kB gzip), which triggers Vite's chunk-size warning. That is acceptable for a local tool, and no code splitting was added.
6. **Manual check not done.** The 1280px check with `bunx nx serve web` against the dev server has not been run, because there is no running server or browser in this session.

## Unresolved questions

- Should the server CSP allow inline styles (concern 2), or is the blocked-style console noise acceptable?
