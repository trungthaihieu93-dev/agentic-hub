---
phase: 7
title: "ah CLI, link and end-to-end verification"
status: in-progress
priority: P1
effort: "5h"
dependencies: [4, 5, 6]
---

# Phase 7: ah CLI, link and end-to-end verification

## Goal

Ship the `ah` command (init, serve, list, capture, switch), link it globally with `bun link`, verify every acceptance criterion on the real machine, and archive the OpenSpec change.

## Files to Create / Modify

- Modify: `apps/cli/src/main.ts`: command routing with `node:util` `parseArgs`. It calls `process.umask(0o077)` at start and resolves `publicDir = fileURLToPath(new URL('./public', import.meta.url))`.
- Create: `apps/cli/src/commands/init.ts`, `serve.ts`, `list.ts`, `capture.ts`, `switch.ts`
- Create: `apps/cli/src/prompt-password.ts`: hidden TTY input through `node:readline` with muted output. It refuses to run without a TTY. Tests inject a prompt function; there is no environment-variable bypass.
- Create: `apps/cli/src/single-instance.ts`
- Modify: `README.md`, create `docs/usage.md`
- Modify: `openspec/`: tick `tasks.md`, then archive `add-ah-dashboard` into `openspec/specs/`

## Commands

| Command | Behaviour |
|---|---|
| `ah init [--reset]` | Prompts for the password twice, calls `initAh`, prints the `~/.ah` path. Refuses if already initialised and `--reset` is not given. |
| `ah` / `ah serve [--no-open] [--port N]` | Requires init (otherwise suggests `ah init`). Starts the server and opens `http://ah.localhost:<port>` with `xdg-open`. |
| `ah list` | Table of targets, accounts, the active marker, live identity and drift; works without the server. |
| `ah capture <target> <label>` | Captures the live login. |
| `ah switch <target> <label> [--force] [--relaunch]` | Same engine as the dashboard, with `actor=cli`. Prints warnings and exits 2 on `needsForce`, 3 when an app is running. |

CLI switching does not ask for the admin password, as decided (tokens are protected by 0600 file permissions). The dashboard is password-gated.

## Single instance and port

- `~/.ah/server.pid` holds `{ pid, port, startTime, bootId, entry }`. `startTime` is field 22 of `/proc/<pid>/stat`; `bootId` comes from `/proc/sys/kernel/random/boot_id`.
- On start:
  1. **Reuse.** If the pid file's process matches on all of `startTime`, `bootId` and `cmdline`-contains-`entry`, and `GET /api/health` (5s timeout) returns `app:"ah"`, open the browser to it and exit 0.
  2. **Stale `ah` server.** Send a signal only when that identity matches **and** the PID owns the listening socket on the port (`ss -ltnp`) **and** it does not hold `switch.lock`. Then send SIGTERM, wait 5s, and SIGKILL.
  3. **Anything else** (identity mismatch): treat the pid file as stale, delete it, and signal nothing.
  4. **Port held by a non-`ah` process:** exit with a message naming the PID. Never pick another port silently.
- SIGINT/SIGTERM: close the server and remove the pid file.

## Linking

- `bunx nx run-many -t build`, then `bun link` at the repo root. Root `package.json` has `bin.ah` → `apps/cli/dist/main.js`, which has a shebang and mode 0755 from `post-build.mjs`. Verify with `which ah` (expect `~/.bun/bin/ah`).
- `ah.localhost` resolves to `::1` through getent. Chrome, curl and Node fall back to `127.0.0.1` (verified).

## End-to-end verification (real machine, user present)

0. Confirm the Phase 4 backup archive exists and is recent. If not, repeat the backup gate.
1. `ah init`: enter the password twice.
   - `stat -c %a ~/.ah ~/.ah/config.json` shows `700 600`.
   - `config.json` contains only hash fields.
   - Running `ah init` again refuses.
2. `cd /tmp && ah --no-open`, then `curl -s http://ah.localhost:7427/ | grep -q '<div id="root"'`, which proves the UI loads from any folder. Open the browser: a wrong password is rejected and the correct one logs in.
3. Capture the current Claude CLI, Codex CLI and Claude desktop logins, and Codex desktop per the Phase 4 outcome.
4. Log in to a second Claude account (`claude auth login`), capture it, and switch back and forth from the dashboard and with `ah switch`. After each switch:
   - `claude auth status` reports the expected account;
   - `jq '.mcpOAuth | keys' ~/.claude/.credentials.json` and `jq '.trustedDeviceToken | type'` are unchanged (key names only);
   - `sha256sum ~/.claude/settings.json` and `ls ~/.claude/skills | wc -l` are unchanged.
5. Switch with an open `claude` session: you get the warning, use "Switch anyway", then confirm the drift banner appears if that session writes the old account back. Switching back to the original account still works without re-login, or else the rotation finding from Phase 3 is recorded.
6. With Claude desktop open, the switch is refused. Quit it, switch and relaunch. The app opens on the selected account and its MCP servers are still listed.
7. The audit page lists every attempt, including refusals.
8. Run:
   - `bunx nx run-many -t lint test build` (passes)
   - tick every item in `openspec/changes/add-ah-dashboard/tasks.md`
   - `bunx openspec archive add-ah-dashboard -y`
   - `bun run spec:validate` (passes)

## Verification

- `bunx nx test cli`:
  - argument parsing; init refusal;
  - single-instance cases: reuse, stale PID with a matching identity, PID reuse with a mismatched start time (signals nothing), a foreign process holding the port;
  - the password prompt refuses without a TTY.
- The end-to-end checklist above is complete and recorded in the phase notes.

## Live run notes (2026-11-03 20:22, Codex only)

- Fresh credential backup before switching: `~/ah-preflight-backup/ah-creds-20261103-2022.tar.zst`.
- Captured the live Codex login as `crypto` (the ChatGPT team account). The drift flag on the uncaptured login cleared.
- With the app-server daemon running, `ah switch codex-cli personal` was refused with exit 2 and named both processes. `auth.json` was unchanged.
- After `codex app-server daemon stop`, the `codex app-server daemon pid-update-loop` helper kept running and still forced `--force`. It holds only its updater lock and log, never `auth.json`. It is now ignored by the running check, with a regression test.
- crypto → personal → crypto: each switch installed the right account (`id_token` email), kept `config.toml` byte-identical and left `auth.json` at 0600. On crypto, `codex exec` worked and the refresh token was unchanged after use.
- **personal is unusable:** its refresh token was revoked by OpenAI. The snapshot token matches the 15:56 backup (last refresh 2026-10-30), so ah neither rotated nor altered it. The revocation happened after 15:56, most likely when `codex login` signed out personal to log in crypto. Re-login of personal is needed.
- Audit log: two refusals and two ok switches, in order, with messages.
- Not run: steps 4–6 for Claude (no second Claude account yet; user chose to skip).
