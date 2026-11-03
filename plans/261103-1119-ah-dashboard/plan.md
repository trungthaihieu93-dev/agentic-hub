---
title: "ah — local Claude/Codex account switcher dashboard"
description: "A global `ah` command that serves a password-protected local dashboard for switching Claude and Codex accounts across CLIs and desktop apps."
status: in-progress
priority: P1
effort: 40h
branch: main
tags: [feature, frontend, backend, database, auth, infra]
blockedBy: []
blocks: []
created: 2026-11-03
---

# ah — local Claude/Codex account switcher dashboard

## Overview

A global `ah` command that serves a password-protected local dashboard for switching Claude and Codex accounts across CLIs and desktop apps. App config and metadata persist in `~/.ah`; SQLite holds account metadata, state, sessions and the switch audit log. The accepted design contract is [brainstorm-261103-1058-ah-dashboard.md](../reports/brainstorm-261103-1058-ah-dashboard.md). The red-team decisions below refine it (credential scope, desktop shared config, live-session policy).

## Architecture

```
apps/cli (ah bin, esbuild) ─┬─> libs/server (createApp, startServer: Hono) ─┐
apps/server (dev entry) ────┘                                               ├─> libs/core
apps/web (Vite + React) ──> libs/shared (zod schemas, API + SwitchResult types)
                            built web copied to apps/cli/dist/public
```

- **Projects** (Nx TS-solution workspace, explicit `--name`): `web`, `server`, `cli`, `core`, `shared`, `server-lib`. Build outputs live in each project's `dist/`.
- **Why more libs than the contract listed:**
  - `libs/core` is the only code that touches `~/.ah` and the provider files.
  - `libs/server` lets the `ah` bundle and the dev server share one Hono app. Without it, the CLI would import an app (the scope review's critical finding).
- **Paths:** every path comes from `resolvePaths(homeDir)`. Tests use temp homes, and a guard throws if a test resolves to the real home.
- **One switch engine serves four targets** (`claude-cli`, `codex-cli`, `claude-desktop`, `codex-desktop`). It runs, in order: journal, lock, snapshot outgoing (new version), install, verify via the provider CLI, roll back per field or by reversing renames, and audit. Targets declare their capabilities: `identity: 'token' | 'none'`, `rollback: 'field' | 'rename'`, `requiresAppClosed`.
- **Serving:** `ah` starts the server on `127.0.0.1:7427` and opens `http://ah.localhost:7427`, the only canonical origin. Static files resolve from `import.meta.url`, never from the current folder.

## Phases

| # | Phase | Effort | Depends on | Status |
|---|-------|--------|-----------|--------|
| 1 | [Workspace and OpenSpec scaffold](./phase-01-workspace-and-openspec.md) | 5h | — | Completed |
| 2 | [Core: ~/.ah, config, password, SQLite](./phase-02-core-config-password-sqlite.md) | 5h | 1 | Completed |
| 3 | [Switch engine and CLI targets](./phase-03-switch-engine-and-cli-targets.md) | 10h | 2 | Completed |
| 4 | [Desktop targets](./phase-04-desktop-targets.md) | 5h | 3 | Completed |
| 5 | [Hono server API](./phase-05-hono-server-api.md) | 5h | 3 | Completed |
| 6 | [Dashboard UI](./phase-06-dashboard-ui.md) | 5h | 4, 5 | Completed |
| 7 | [ah CLI, link and end-to-end verification](./phase-07-ah-cli-link-and-verification.md) | 5h | 4, 5, 6 | In progress |

Phases 4 and 5 can run in parallel: Phase 3 owns the target registry (`libs/core/src/targets/index.ts`), Phase 4 owns only `libs/core/src/targets/*-desktop.ts` and `electron-*.ts`, and Phase 5 owns `libs/server/**` and `apps/server/**`. Phase 4 adds its two targets to the registry in a single, final edit.

## Key decisions

From the accepted contract:
- CLI switching is a global swap with a snapshot of the outgoing account first.
- Desktop switching swaps the data dir and refuses while the app runs.
- Tokens are stored as 0600 files (no encryption at rest); only a scrypt hash of the admin password is stored.
- `bun link` exposes `ah`; the dashboard is at `ah.localhost`.
- Runtime is Node 26 with `node:sqlite`.

From the red-team review (user decisions, 2026-11-03):
1. **Claude CLI swaps the login only:** the `claudeAiOauth` key in `.credentials.json` and `oauthAccount` in `~/.claude.json`, both edited per field. `mcpOAuth` and `trustedDeviceToken` stay shared and are never touched.
2. **Desktop swaps the dir but shares MCP config:** `claude_desktop_config.json` is carried across every switch and seeded into empty profiles. Sessions and worktrees belong to each account, and the UI says so.
3. **Running sessions:** warn, require "switch anyway", then watch. A server-side watcher re-checks the live identity on credential-file changes and flags drift.

## Success criteria

- [x] `ah init` asks for the password once, creates `~/.ah` (0700) with `config.json` (hash only) and a migrated `ah.db`; a re-run refuses without `--reset`. (Phase 2, 7)
- [x] `ah` serves `http://ah.localhost:7427` from any working directory and requires the admin password; a wrong password is rejected. (Phase 5, 6, 7)
- [x] All requested targets can capture the current login as a named account; the dashboard shows them with the active one marked. (Phase 3, 4, 6)
- [ ] CLI switching leaves `claude`/`codex` authenticated as the selected account (confirmed by `claude auth status`, checked against the server as the Phase 3 spike decides, and by `codex login status` plus `tokens.account_id` in `auth.json`), keeps refreshed tokens on switch-back, and leaves `mcpOAuth`, `trustedDeviceToken`, skills and config unchanged. (Phase 3, 7)
- [ ] Desktop switching is refused while the app runs, works when it is closed, and keeps the MCP config shared. (Phase 4, 7)
- [x] A failed or interrupted switch rolls back or is recovered from the journal, and every attempt (ok, refused, rolled back, failed) is in the audit log. (Phase 3)
- [x] `nx run-many -t lint test build` passes; OpenSpec specs exist per capability and `openspec validate --all --strict` passes. (Phase 1, 7)

## Risks

| Risk | Mitigation | Phase |
|------|-----------|-------|
| A running session writes the old account's tokens back, or rotates them | Warn and require force; resolve token ownership with the provider CLI before every snapshot; never file tokens under an account they don't match; the watcher flags drift | 3, 5 |
| `~/.claude.json` and `.credentials.json` get clobbered | Field-level read-modify-write with an mtime guard, forward and on rollback; never write a whole-file copy back | 3 |
| Crash mid-switch | fsynced intent journal, replayed or reversed on the next lock acquisition | 3, 4 |
| Losing a real login during development | Hard backup gate before the first real-machine action (Phase 4 start); the spike is read-only | 4, 7 |
| Killing an unrelated process through PID reuse | Act only when PID, start time, boot id, cmdline and port ownership all match | 3, 7 |
| Codex desktop login location unknown | Read-only spike at the start of Phase 4; the plan covers both outcomes | 4 |

## Red Team Review

### Session — 2026-11-03
**Findings:** 39 raw from 4 reviewers (Security, Failure Mode, Assumption, Scope), deduplicated to 15. 14 accepted (3 of them as user decisions) and 1 partly rejected.
**Severity breakdown:** 3 Critical, 8 High, 4 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | CLI had no way to start the server; static root resolved from the current folder (UI 404s or planted-page XSS) | Critical | Accept | Arch, Phase 1, 5, 7 |
| 2 | Nx 24 TS-solution layout (`apps/*/dist`, `@agentic-hub/*` names); `CLAUDECODE` remaps the preset to a GitHub template; `.sql` import breaks vitest; `vitest.workspace.ts` is dead; unpinned packages; `openspec archive` needs `-y` | Critical | Accept | Phase 1, 2, 7 |
| 3 | Claude identity not bound to tokens; verify read back its own write | Critical | Accept | Phase 3 |
| 4 | Profiles overwritten in place; temp-file mode, umask and copy cleanup | High | Accept | Phase 2, 3 |
| 5 | No crash journal; SQLite busy timeout; migration race; lock didn't cover capture/delete | High | Accept | Phase 2, 3 |
| 6 | Rollback wrote a whole stale `~/.claude.json` | High | Accept | Phase 3 |
| 7 | Codex daemon excluded from the process check; `auth.lock` ignored | High | Accept | Phase 3 |
| 8 | Force path undermines AC4 | High | Accept (user: warn + force + watch) | Phase 3, 5, 6 |
| 9 | `.credentials.json` holds `mcpOAuth` and `trustedDeviceToken` | High | Accept (user: login key only) | Phase 3 |
| 10 | Desktop dir holds MCP config, sessions and runtime (563 MB) | High | Accept (user: share MCP config) | Phase 4, 6 |
| 11 | Spike could log out real accounts before any backup; backup incomplete | High | Accept | Phase 4, 7 |
| 12 | PID-reuse SIGKILL; `/api/health` undefined; desktop running check matched Chrome's helper | High | Accept | Phase 3, 4, 5, 7 |
| 13 | Cross-phase contracts (engine desktop hooks, registry owner, dependencies, `switchAccount` signature, `resolvePaths`, init creating the db, label path traversal) | Medium | Accept | Phase 2–6 |
| 14 | Local-origin cookie/CSRF gaps; host guard blocks the Vite dev proxy | Medium | Accept | Phase 1, 5 |
| 15 | Gold plating (light toggle, 375px checks, rename endpoint, `ah status`, 5s polling, stdin password, login back-off) | Medium | Accept except back-off (kept: tiny, guards the only password) | Phase 3, 5, 6, 7 |

Unverified by reviewers (left as checks in Phases 3 and 4): whether Claude/Codex rotate refresh tokens on refresh, the exact `auth.lock` semantics in Codex, and whether Codex logout revokes tokens on the server.

### Whole-Plan Consistency Sweep
- Searched for stale terms: `dist/apps/` (none left), `vitest.workspace` (none), `renameAccount`/`PATCH` (removed), `ah status` (removed), `5s` polling (removed), `./public` (now resolved from `import.meta.url`), whole-file `credentials.json` profile (now `claude-ai-oauth.json`).
- Dependencies updated: Phase 6 now depends on [4, 5], and the target registry is owned by Phase 3.
- Profile path format is defined once in Phase 2 (`profiles/<target>/<accountId>/v<timestamp>/` with a `current` pointer) and used in Phases 3 and 4.
- Unresolved: the Codex CLI/desktop merge question (below).

## Validation Log

### Session 1 — 2026-11-03
**Questions asked:** 4. Each answer took the recommended option.

1. **Claude token owner:** match on `"<orgId>:<lowercased email>"` from `claude auth status --json`, which has no accountUuid (verified). Phase 3 now opens with a read-only spike that checks whether that command asks the server; if it only reads the cache, verification uses an authenticated request. → Phase 2 schema comment, Phase 3.
2. **Codex token owner:** decode the `id_token` and `tokens.account_id` from `auth.json`. `codex login status` prints only "Logged in using ChatGPT" (verified). → Phase 3.
3. **Migrations:** inline TS strings (`001-initial.ts`), because the esbuild CLI bundle can't load `?raw`. → Phase 2.
4. **Watcher writes:** non-blocking `withLock`, and the event is skipped while a switch holds the lock. → Phase 5.

Applied without a question (mechanical errors):
- Vite proxy: `changeOrigin: true` sent `Host: 127.0.0.1`, which the Phase 5 host guard rejects. It now sets `Host: ah.localhost:7427`. → Phase 1.
- `VACUUM INTO` can't run inside `BEGIN IMMEDIATE`, so the backup now runs before the transaction. → Phase 2.
- `claude` is a versioned native ELF (`~/.local/share/claude/versions/<ver>`), so process matching uses that directory. → Phase 3.
- Codex `daemon.pid` is JSON (`pid`, `processStartTime`, `processIdentity`, `executableIdentity`), not a bare PID. → Phase 3.
- `fs.watch` on a file stops firing after an atomic rename-replace, so the watcher now watches the parent directories. → Phase 5.

### Verification Results
- Claims checked: 24 (package pins, toolchain, provider file paths and keys, binaries, launchers, same device, auth CLI output)
- Verified: 18 | Failed: 6 (all fixed above) | Unverified: 3, carried over from the red team (token rotation, `auth.lock` semantics, Codex logout revocation) plus the new Claude `auth status` source spike
- Tier: Full (7 phases); the red team had already run, so this pass was limited to live-state facts and contracts between phases
- Verified facts: Node 26.13.0, bun 1.4.4; npm has `create-nx-workspace`/`nx` 24.0.3, `vitest` 5.1.0, `hono` 4.13.16, `@hono/node-server` 2.1.6, `@fission-ai/openspec` 1.16.0 and `zod` 4.6.7 (the pin for "current exact"); `.credentials.json` keys `claudeAiOauth`, `mcpOAuth`, `trustedDeviceToken`; `~/.claude.json` has `oauthAccount` (98 KB); `auth.json` keys `OPENAI_API_KEY`, `auth_mode`, `last_refresh`, `tokens`; `auth.lock` exists; `/usr/lib/claude-desktop/claude-desktop`, `com.anthropic.Claude.desktop`, `chatgpt.desktop`, `flock`, `gtk-launch` and `ss` exist; `~/.config` and `~` are on the same device; `~/.ah` is absent.
- Noted for Phase 4: `~/.config/Claude` also holds `config.json`, `ant-device-registry.json` and `buddy-tokens.json`. Phase 4 step 4 already requires agreeing every extra shared file with the user.

### Whole-Plan Consistency Sweep
- Stale terms searched: `?raw`, `001-initial.sql`, `accountUuid` as a match key, `codex login status` as an owner source, `changeOrigin: true`, watching the credential files directly. None remain, except as the explicit "not this" notes.
- Phase 7's end-to-end check `claude auth status reports the expected account` still holds; the spike decides how much that check proves.
- No contradictions remain.

## Implementation log (2026-11-03)

- **Built:** all seven phases' code; 112 tests across 6 projects (`nx run-many -t lint test build typecheck` passes uncached); `openspec validate --all --strict` passes (10/11 tasks; 5.2 open).
- **Spikes:**
  - `claude auth status` only echoes the cache, so ownership uses Anthropic's profile endpoint (`account.email`, `organization.uuid`).
  - Codex `auth.lock` is a blocking `flock`; ah holds it while switching.
  - Codex desktop runs its own `codex app-server` on `~/.codex/auth.json`, so **user decision:** one Codex account and no separate codex-desktop target.
  - Claude desktop: only `claude_desktop_config.json` is shared (user decision). Chrome's native host is ignored by the running check.
- **Independent review:** [code-reviewer report](../reports/code-reviewer-261103-1551-ah-engine-security.md). C1, H1, H2, M1–M4, M6, L1–L4 and L6 are fixed with regression tests, and the reviewer's own reproduction script now passes. L7 was a false positive: `listAudit` already clamps to 1..500. M5 is mitigated: `_unsaved` is pruned to 10, and a switch warns when a newer unsaved snapshot exists.
- **Real machine:**
  - Backup at `~/ah-preflight-backup/ah-preflight-20261103-1556.tar.zst`.
  - `bun link` done; `ah init` done by the user (700/600, hash only).
  - Served from `/tmp`, with the host, origin and auth checks confirmed by curl. Single-instance reuse confirmed.
  - Captured "personal" for claude-cli, codex-cli and claude-desktop.
- **Not yet run (Phase 7 steps 4–7):** real switching between two accounts, a forced switch with an open session, the desktop switch and relaunch, and the browser login and audit check. The user's second logins did not reach the credential files, so the live test was skipped by the user. The refresh-token rotation question stays open.

- **Live Codex run (20:22):** capture, refusal, forced switching both ways and the audit log all verified; details in the Phase 7 notes. Fixed: the daemon's `pid-update-loop` helper no longer blocks switching. Found: the older `personal` Codex snapshot had been revoked server-side, most likely by the `codex login` used to add the second account.

## Unresolved questions

- Do Claude and Codex rotate refresh tokens on use? Codex did not rotate during one live call on a valid access token; a refresh cycle is still unobserved. Claude is untested.
- Does `codex login` (or logout) revoke the previous account's tokens? The evidence points that way. If confirmed, a second Codex account must be logged in under a separate `CODEX_HOME`, and ah would need a way to capture from there.
- Claude steps 4–6 (CLI switching, forced switch with an open session, desktop switch and relaunch) still need a second Claude account.
