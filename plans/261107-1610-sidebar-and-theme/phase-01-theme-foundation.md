---
title: "Theme foundation"
phase: 1
status: completed
priority: P2
effort: "3.5h"
dependencies: []
---

# Theme foundation

## Overview

Establish one browser-owned theme state that resolves before paint, exposes a narrow React bridge, and themes every existing screen and portal. This phase is independently usable with the current header; phase 2 moves its authenticated control into the sidebar footer.

Context: [plan and confirmed decisions](./plan.md), [design guidelines](../../docs/design-guidelines.md), [HTML entry](../../apps/web/index.html), [actual security headers](../../libs/server/src/middleware/security-headers.ts).

## Verified source findings

1. `apps/web/index.html:2-9` hardcodes the dark class and color-scheme before loading the stylesheet.
2. `apps/web/src/styles.css:7-64` has one dark `:root` palette and maps semantic variables into Tailwind; retain that token contract.
3. `apps/web/src/components/ui/sonner.tsx:6` fixes Sonner to dark; `app/app.tsx:75-78` mounts it beside Routes inside QueryClientProvider.
4. `app/app.tsx:51-68` renders login, loading, and error outside Layout. A theme confined to Layout would miss these states.
5. `components/ui/dialog.tsx:40-47` and `components/ui/dropdown-menu.tsx:24-30` render portals using popover tokens; root-level theme variables reach them.
6. `components/ui/badge.tsx:16-18` uses status text over 10% tinted backgrounds and 40% borders. Light-mode status colors require their own measured values.
7. `libs/server/src/middleware/security-headers.ts:5` permits same-origin scripts through `default-src 'self'` and inline styles through `style-src 'self' 'unsafe-inline'`; inline scripts are not permitted. The stylesheet's existing comment overstates the style restriction.
8. `apps/web/vite.config.mts:49-55` uses non-watch Vitest/jsdom with the existing shared setup. The public folder already exists for the favicon.

## Requirements

- Follow the confirmed theme decision: OS preference initially, then an explicit saved Light/Dark choice.
- Apply both themes to all existing surfaces, including login errors, auth loading/errors, inputs, status tints, Radix portals, and rich-color toasts.
- Preserve the current dark palette. Measure normal text at least 4.5:1, large text at least 3:1, and essential control/focus indicators at least 3:1 against adjacent colors.
- Invalid or inaccessible storage must not block rendering. An explicit choice still works in memory when persistence fails.
- Keep initialization free of inline scripts, remote resources, React dependencies, and credential data.

## Architecture and variation trace

Create `/theme-init.js` as a parser-blocking classic script before the stylesheet in `index.html`. It is the sole owner of preference resolution, `ah-theme` storage access, OS preference listening, root `.dark` class, and the active color-scheme meta value. Keep light defaults in `:root` and move the current palette under `:root.dark`, including CSS `color-scheme` for native controls.

The script publishes only `window.__AH_THEME__ = { getTheme, subscribe, setTheme }`. `getTheme()` returns the stable string `light` or `dark`; `subscribe(listener)` returns cleanup; `setTheme('light' | 'dark')` applies immediately, records the in-memory explicit choice, attempts storage, and notifies subscribers when the resolved string changes. Read storage in a try/catch; only exact `light`/`dark` values are valid. With no valid preference, use `matchMedia('(prefers-color-scheme: dark)')` and respond to OS changes. Once the user chooses a theme, OS changes no longer override it, including when storage writes fail. Do not introduce a provider or a second resolver.

`src/lib/theme.ts` supplies the typed window contract and a small `useSyncExternalStore` hook. `ThemeToggle` reads that hook and uses existing Buttons with visible Light/Dark labels, `aria-pressed`, and decorative Lucide Sun/Moon icons. Add it outside the login form, preserving form autofocus/submission, and beside Sign out in the existing header until phase 2. Sonner consumes the same resolved string, so it updates without remounting query state.

Concrete variation: choosing Light changes only the root token values and Sonner's theme prop; login, Accounts/Audit, Radix dialog/menu portals, and toast callers retain their existing semantic classes and APIs. Choosing Dark uses the same path and restores the existing palette. Prove both paths with bootstrap/control/toaster behavior tests and browser contrast checks; no component-specific light-mode branches or new styling registry.

## Related files

| Action | Full path | Change |
|---|---|---|
| Create | `apps/web/public/theme-init.js` | Sole early theme controller; Vite copies the same-origin asset. |
| Create | `apps/web/src/lib/theme.ts` | Typed controller bridge and resolved-theme hook. |
| Create | `apps/web/src/components/theme-toggle.tsx` | Accessible explicit Light/Dark controls. |
| Create | `apps/web/src/lib/theme.spec.tsx` | Execute the real bootstrap with controlled browser fixtures; exercise bridge and control. |
| Modify | `apps/web/index.html` | Load external bootstrap before CSS; remove hardcoded dark-only state. |
| Modify | `apps/web/src/styles.css` | Light/default and preserved dark token values; correct stale CSP comment. |
| Modify | `apps/web/src/components/ui/sonner.tsx` | Consume the resolved theme; retain existing toast options. |
| Modify | `apps/web/src/pages/login-page.tsx` | Place theme control outside the existing form. |
| Modify | `apps/web/src/app/layout.tsx` | Temporarily mount the shared control in the current authenticated header. |
| Modify | `apps/web/src/test/helpers.tsx` | Provide isolated setup using the real bootstrap for consuming component tests. |
| Modify | `apps/web/src/test/setup.ts` | Reset root classes, storage, controller, listeners, and test globals if shared fixture cleanup needs it. |

No deletion or production server/auth/schema changes. Read `badge.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `app.tsx`, and `main.tsx` as consumers; their APIs do not need a theme rewrite.

## Implementation steps

1. Build the single controller and typed bridge for the confirmed theme behavior. Keep the bootstrap dependency-free and its resolved snapshot stable; tolerate missing `matchMedia` with a light fallback rather than an initialization crash.
2. Update HTML ordering and CSS selectors. Keep all existing semantic token names and Tailwind mappings. Start the light palette with slate neutrals, white card/popover surfaces, and darker status text (for example success `#15803d`, warning `#92400e`, danger `#b91c1c`); measure the actual tinted combinations before finalizing them.
3. Wire the shared theme control into login and the current header. Preserve password focus and form semantics. Feed Sonner the same resolved theme, keeping `richColors`, close button, position, and CSS import.
4. Exercise the actual public bootstrap in isolation, for example with `node:vm` and controlled document/storage/media-query fixtures; do not create a mirrored implementation for tests. Use the existing Testing Library patterns for hook/control and Sonner integration.
5. Inspect the built HTML and copied asset. Verify the script is before emitted styles, is same-origin, and runs under the existing server CSP before visible content appears. Check fresh light/dark system settings and saved opposite preferences on hard reload.

## Todo

- [x] Implement controller, bridge, and external-script ordering.
- [x] Add light tokens and preserve dark tokens; record measured contrast for text/status/focus surfaces.
- [x] Add shared control and synchronize Sonner across login/authenticated routes.
- [x] Add focused bootstrap and React behavior tests; keep existing login tests passing.
- [x] Verify a production build's first paint and portal/toast colors under the actual CSP.

## Verification

Run from the repository root; these are implementation gates, not results from planning.

```sh
node --check apps/web/public/theme-init.js
bunx vitest run --config apps/web/vite.config.mts src/lib/theme.spec.tsx src/pages/login-page.spec.tsx
bunx nx run web:lint
bunx nx run web:typecheck
bunx nx run web:build
```

Test valid saved light/dark against opposite OS settings; absent/invalid storage with both OS values; storage getter/setter exceptions; OS changes before and after an explicit choice; controller subscriber cleanup and React StrictMode; immediate root/meta/control/toaster agreement; persisted choice after reinitialization; and unchanged login form focus/errors. Assert behavior and accessible state, not snapshots of CSS class strings.

Browser-check login, auth loading/error, Accounts, Audit, a dialog, a dropdown, and success/error toasts in both themes. Measure real computed foreground/background colors, including status alpha compositing. First-paint/CSP checks require the built app served by the existing ah server, not only Vite preview. Reuse owned running processes; before starting deterministic ports 7427/5173 inspect `ss -ltnp`, track any processes started, and stop them after validation.

## Success criteria

- [x] Every existing view and portal follows the same semantic contract in both themes.
- [x] A hard reload resolves theme before paint with no inline-script violation; the built bootstrap is present and served as JavaScript.
- [x] Explicit choices remain effective with failed persistence and are never overridden by OS changes within that page session.
- [x] Required contrast measurements and focused checks pass; no auth or query behavior changed.

## Risks, security, and rollback

Public-script/React drift is prevented by one resolver and tests executing the shipped bootstrap. Storage access can throw, so preference access is isolated and only the non-sensitive theme string is stored. The root variable contract covers Radix portals; Sonner also needs its explicit prop. Do not weaken CSP or alter credential handling. Correct the stale design/CSS explanation to match the actual policy in phase 2's docs pass.

Rollback this phase's theme script, HTML/CSS, bridge/control, and consumers together to restore the existing dark-only UI. Leave unrelated browser storage untouched; an unused theme preference is harmless. Proceed to phase 2 only after this foundation is verified.
