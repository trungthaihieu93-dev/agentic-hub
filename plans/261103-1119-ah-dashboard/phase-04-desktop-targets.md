---
phase: 4
title: "Desktop targets"
status: completed
priority: P1
effort: "5h"
dependencies: [3]
---

# Phase 4: Desktop targets

## Goal

Add `claude-desktop` and `codex-desktop` targets that switch accounts by swapping the Electron data dir with `rename`. They refuse while the app is running and keep the MCP config shared across accounts.

## Files to Create / Modify

- Create: `libs/core/src/targets/claude-desktop.ts`, `libs/core/src/targets/codex-desktop.ts`
- Create: `libs/core/src/targets/electron-dir.ts`: `isAppRunning`, `sameDevice`, `swapDir`, `carrySharedFiles`
- Modify: `libs/core/src/targets/index.ts`: register both targets (one final edit)
- Modify: `openspec/changes/add-ah-dashboard/specs/desktop-account-switching/spec.md`: replace the Codex desktop scenarios marked pending with the spike outcome
- Create: specs for each

## Tasks & Steps

0. **Backup gate (hard stop, before any real-machine action in this or later phases).**
   - Ask the user to quit Claude desktop and Codex desktop.
   - Ask the user to confirm a backup location: a 0700 folder outside any synced folder.
   - Run:
     `umask 077; tar --create --zstd --file <dir>/ah-preflight-$(date +%Y%m%d-%H%M).tar.zst -C ~ .claude/.credentials.json .claude.json .codex/auth.json .config/Claude .config/Codex`
   - Check it with `tar --list`, then report the file size and path. Do not continue until the user confirms.
1. **Spike (about 30 min, strictly read-only; no logging out or in): where does Codex desktop keep its login?**
   - Evidence so far: `~/.config/Codex` looks like Chromium browser state. `~/.codex/` holds `auth.json`, `auth.lock` and `app-server-daemon/`. The only launcher present is `chatgpt.desktop`.
   - Method: start Codex desktop, then list `ls -l /proc/<pid>/fd` for the app and its daemon. Note which of `~/.codex/auth.json` and `~/.config/Codex/**` it opens, and whether `auth.json`'s mtime changes during normal use.
   - Record the result here.
   - **If it shares `~/.codex/auth.json`:** `codex-desktop` uses the codex-cli files and adds `requiresAppClosed=true` plus a relaunch. The UI handling follows the user's answer to the plan's open question.
   - **If it uses `~/.config/Codex`:** implement it like `claude-desktop`.
2. `isAppRunning(target)` is true when either holds:
   - (a) `SingletonLock` is a symlink to `<host>-<pid>` where `<host>` equals `os.hostname()` and `/proc/<pid>/exe` is the app's exact main binary (`/usr/lib/claude-desktop/claude-desktop` for Claude; the Codex binary comes from the spike);
   - (b) any of the user's processes has an fd or cwd under the data dir (scan `/proc/*/fd` and `/proc/*/cwd`).
   Chrome's `chrome-native-host` does not match (a), and it holds no fds in the data dir, so it does not match (b) either.
3. `swapDir`, called only through the Phase 3 engine with `rollback: 'rename'`:
   - Require `sameDevice(~/.config, ~/.ah)` (`stat.dev`; verified the same on this machine).
   - Steps (each one journaled, the directories fsynced after each rename):
     1. Copy the shared files out to `~/.ah/shared/<target>/`.
     2. `rename(~/.config/<App>, profiles/<target>/<outgoing>/v<ts>/data)` and repoint the outgoing `current`.
     3. `rename(profiles/<target>/<incoming>/current/data, ~/.config/<App>)`.
     4. Copy the shared files in.
   - Rollback reverses whichever renames completed, using the journal.
4. Shared files for `claude-desktop`: `claude_desktop_config.json`. The spike confirms whether others exist (for example `config.json`); each extra file must be agreed with the user. Everything else (sessions, worktrees, `claude-code/` runtime, `ant-did`) stays with the account.
5. Identity is `'none'`. The engine takes the outgoing account from `active_accounts`. `verifyInstalled` checks that `~/.config/<App>` exists, `profiles/<target>/<incoming>/current/data` no longer exists, and the shared files match.
6. **Capture** means labelling the currently live dir. The first switch away from it moves it into that profile.
   - **Add account:** create an empty profile containing only the shared files, then switch to it. The app starts logged out; the user logs in inside the app.
7. **Relaunch** (optional): spawn `gtk-launch com.anthropic.Claude` detached for Claude; the Codex launcher comes from the spike.
8. Exit step: update the desktop OpenSpec scenarios and success criterion 3 wording to match the spike outcome.

## Implementation notes (2026-11-03)

- Read-only check against the running Claude desktop (PID 13331): rule (a) found the main process through `SingletonLock`, and the scan took 15 ms.
- **Rule (b) correction:** Chrome starts `/usr/lib/claude-desktop/resources/chrome-native-host` for the Claude-in-Chrome extension. It lives as long as Chrome does and keeps `~/.config/Claude/logs/chrome-native-host.log` open, so rule (b) matched it and would have blocked every switch while Chrome was open. The target now ignores that exact binary path (`ignoreExes`), with a test.
- Extra files in `~/.config/Claude` (key names only): `config.json` holds `dxt:allowlist*:<orgUuid>` entries, which are per organisation and so stay with each account. `ant-device-registry.json` holds device keys and `buddy-tokens.json` holds `tokens-today`; both stay with each account. Today `claude_desktop_config.json` holds only `preferences`, `coworkUserFilesPath` and hardware-acceleration flags, with no `mcpServers` yet. It is still the only shared file.
- `codex-desktop` ships disabled with an explicit reason until the spike runs. The Codex launcher is `/usr/bin/chatgpt` (a shell script).

## Verification

- `bunx nx test core`:
  - refuses with a fake `SingletonLock` pointing at `process.pid` when the exe matches;
  - does not refuse for a live PID whose exe is something else;
  - refuses when a child process holds an fd under the data dir;
  - an A→B→A swap restores the dir contents and keeps the shared `claude_desktop_config.json` identical in both profiles;
  - refuses across devices (mocked `stat.dev`);
  - a crash after the first rename is recovered from the journal.
- Manual (Phase 7): a real Claude desktop switch with the app closed.
