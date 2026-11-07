# Sidebar and theme plan validation

Validated the [implementation plan](../261107-1610-sidebar-and-theme/plan.md) against the current source on 2026-11-07. The plan is ready for implementation; application code and behavior have not changed.

## User validation

Three questions were asked through the asynchronous input tool. The user explicitly selected the first option for each.

1. **What should the account section at the bottom of the sidebar contain?**
   - Options: Local admin label and Sign out (Recommended) | Active Claude/Codex account summaries and Sign out.
   - Answer: Local admin label and Sign out (Recommended).
   - Effect: Both phases keep provider identities on Accounts and use the existing local session without adding profile fields.
2. **Which theme should a first visit use, before the user chooses Light or Dark?**
   - Options: Follow the device theme, then remember the user's choice (Recommended) | Keep dark as the default, then remember the user's choice.
   - Answer: Follow the device theme, then remember the user's choice (Recommended).
   - Effect: The bootstrap follows OS appearance until an explicit Light/Dark preference exists; both phases preserve that contract.
3. **How should the left navigation work on narrow screens?**
   - Options: Open as a drawer from a menu button (Recommended) | Switch to a compact top navigation.
   - Answer: Open as a drawer from a menu button (Recommended).
   - Effect: Phase 2 includes the drawer, focus handling, route closure, and breakpoint cleanup; the plan's acceptance criteria cover it.

## Source verification

Light tier: five claims sampled per phase, ten verified, zero failed, zero unverified. The controller independently checked the following source facts after drafting.

| Phase | Verified claim | Evidence |
|---|---|---|
| 1 | HTML hardcodes the dark class and color-scheme. | [HTML entry](../../apps/web/index.html) |
| 1 | One dark root palette feeds existing semantic Tailwind tokens. | [Stylesheet](../../apps/web/src/styles.css) |
| 1 | Sonner fixes its theme to dark. | [Toast component](../../apps/web/src/components/ui/sonner.tsx) |
| 1 | Login/loading/error render outside Layout; Toaster mounts alongside Routes. | [App](../../apps/web/src/app/app.tsx) |
| 1 | CSP permits same-origin scripts through default-src, with no inline-script allowance. | [Security headers](../../libs/server/src/middleware/security-headers.ts) |
| 2 | Layout owns the header, navigation, and ordered logout/error/cache/redirect behavior. | [Layout](../../apps/web/src/app/layout.tsx) |
| 2 | Router ignores same-path navigation and subscribes to popstate. | [Router](../../apps/web/src/app/router.tsx) |
| 2 | The session response exposes only authenticated: boolean. | [API schema](../../libs/shared/src/api.ts) |
| 2 | Shared DialogContent uses centered positioning and transforms. | [Dialog component](../../apps/web/src/components/ui/dialog.tsx) |
| 2 | The existing table wrapper already owns horizontal overflow. | [Table component](../../apps/web/src/components/ui/table.tsx) |

`bunx vitest --help` confirmed focused run filters and the config option. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project web --json` confirmed the web lint, test, typecheck, and build targets; [Vite configuration](../../apps/web/vite.config.mts) confirms jsdom and non-watch tests. These were read-only tooling checks, not application test runs.

## Whole-plan consistency sweep

- Reread the index and both phase files. Checked the three confirmed decisions across overview, requirements, steps, checks, risks, and rollback notes.
- Removed generated placeholder tails and aligned phase metadata to numeric identifiers/dependencies before final validation.
- Checked relative Markdown links, cited existing files, proposed files marked Create, sequential ownership, preserved consumers, and final verification commands.
- AgentKit format validation passed; parsing found two phases, eighteen pending phase items, and zero completed implementation tasks.
- There is no live task CRUD surface in this session. The two-phase plan keeps execution state in its durable checklists.
- No contradictory decisions or unresolved questions remain. No application tests or production browser checks were run during planning; both are explicit implementation gates.

## Handoff

Execute `/ak-cook plans/261107-1610-sidebar-and-theme/plan.md` when implementation is requested. This planning task does not start implementation.
