# Using ah

## Commands

| Command | What it does |
|---|---|
| `ah init [--reset]` | Asks for the admin password twice (hidden, terminal only) and stores only its scrypt hash in `~/.ah/config.json`. `--reset` changes the password and signs out all dashboard sessions; accounts stay. |
| `ah` / `ah serve [--no-open] [--port N]` | Starts the dashboard on `127.0.0.1` and opens `http://ah.localhost:7427`. If an `ah` server already runs, it is reused. A stale `ah` server is stopped only after its PID, start time, boot id, command line and port all match. Any other process on the port is never touched. |
| `ah list` | Shows each target, its saved accounts (`*` marks the active one), the live login and any drift. |
| `ah capture <target> <label>` | Saves the current login as an account. A login that is already saved gets a fresh snapshot instead of a duplicate. |
| `ah switch <target> <label> [--force] [--relaunch]` | Switches the account. Exit codes: 0 ok, 1 failed or rolled back, 2 sessions running (repeat with `--force`), 3 the desktop app is running. |

Targets are `claude-cli` (alias `claude`), `codex-cli` (aliases `codex` and `codex-desktop`), and `claude-desktop`.

## Adding another account

- **Claude Code / Codex:** capture the current login, run `claude auth login` or `codex login` with the other account, then capture again under a new label.
- **Claude desktop:** capture the current data, use "Add empty account" in the dashboard, switch to it, and sign in inside the app.

## What a switch does

1. Takes the switch lock (a kernel `flock` on `~/.ah/switch.lock`) and finishes or safely undoes any switch that was interrupted.
2. Refuses while the desktop app runs. For CLIs, it asks for "Switch anyway" (`--force`) while sessions run, because a running session can write the old account back.
3. Saves the live tokens under the account the provider says owns them: Anthropic's profile endpoint for Claude, the `id_token` in `auth.json` for Codex. Unknown owners go to `_unsaved` and never overwrite a saved account.
4. Writes a crash journal, installs the selected login, and verifies it with the provider. On failure it rolls back, but only if nothing else changed the login in the meantime.
5. Records every attempt (`ok`, `refused`, `rolled_back`, `recovered`, `failed`) in the audit log, shown on the dashboard's Audit page.

While the dashboard runs, it watches the credential files. Refreshed tokens of the active account are saved automatically, and a login that no longer matches the active account is flagged as drift.

## Files

| Path | Contents |
|---|---|
| `~/.ah/config.json` (0600) | Port, host, scrypt hash of the admin password |
| `~/.ah/ah.db` | Accounts, active account, live status, audit log, sessions (SQLite) |
| `~/.ah/profiles/<target>/<account>/v<time>/` | Saved logins (0600 files, last 3 versions, `current` symlink) |
| `~/.ah/backups/` | Database copies taken before each schema migration (last 5) |

Tokens are protected by file permissions only, the same way the CLIs store them; they are not encrypted.

## Security

- The server listens on `127.0.0.1` only, and answers only for `Host: ah.localhost:<port>`. `localhost` and `127.0.0.1` can reach the health check only.
- Changes need the exact `Origin`, `X-AH-Request: 1`, and a session cookie (`HttpOnly`, `SameSite=Strict`, 12 hours) issued after the admin password.
- After 5 wrong passwords, logins are delayed, starting at 1 s and doubling up to 30 s.
- API responses never include tokens, fingerprints, identity keys or file paths.
