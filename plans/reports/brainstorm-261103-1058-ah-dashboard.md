# Brainstorm contract: `ah` — local AI provider/account dashboard

Status: accepted (user answered design questions 2026-11-03)

## Outcome

A local dashboard started from a global `ah` command. It lists Claude and Codex accounts for both the CLIs and the desktop apps, shows which one is active, and switches the active account with one click or one command (`ah switch claude work`). App config and metadata persist in `~/.ah`, and the dashboard is protected by an admin password set once at `ah init`.

## Evidence (inspected 2026-11-03)

| Target | Where it keeps its login | Notes |
|---|---|---|
| Claude Code CLI 2.1.317 | `~/.claude/.credentials.json` plus the `oauthAccount` field in `~/.claude.json` | `~/.claude` also holds skills, rules, agents and hooks, which must stay shared |
| Codex CLI 0.166.0 | `~/.codex/auth.json` | `config.toml`, `AGENTS.md` and the sqlite state stay shared |
| Claude desktop | `~/.config/Claude` (Electron data dir) | Cookies are encrypted with the OS keyring; a `SingletonLock` file shows the app is running |
| Codex desktop | `~/.config/Codex` (Electron data dir) | Same model as Claude desktop |

Toolchain on this machine: Node 26.13 (has built-in `node:sqlite`), bun 1.4.4, Nx 24.0.2 installed globally. OpenSpec (`@fission-ai/openspec` 1.16.0) is not installed. The project folder is empty and `~/.ah` does not exist yet.

## Decisions

1. **CLI switching is a global swap of credential files only.** Before switching, `ah` copies the outgoing account's live credential files back into its own profile, because the CLIs refresh tokens in place. Then it installs the incoming account's files. Skills and config stay shared.
2. **Desktop switching swaps the data dir.** `ah` refuses if the app is running (process check plus `SingletonLock`). Otherwise it moves `~/.config/<App>` into `~/.ah/profiles/<provider>-desktop/<account>/` and moves the incoming account's dir into place. Relaunching the app afterwards is optional.
3. **Token store:** profile files are saved with mode 0600 inside a `~/.ah` folder with mode 0700, the same protection the CLIs use. Only the admin password's scrypt hash (salted, with `node:crypto` + `timingSafeEqual`) is stored, in `~/.ah/config.json`.
4. **Serving:** `bun link` puts `ah` on your PATH. The dashboard binds to `127.0.0.1` on a fixed port and is opened at `http://ah.localhost:<port>`.

## Constraints

- **Workspace:** Nx integrated workspace with `apps/web` (Vite + React), `apps/server` (Hono on `@hono/node-server`), `apps/cli` (the `ah` bin) and `libs/shared` (types and zod schemas). bun is the package manager and Node 26 is the runtime.
- **Database:** SQLite through `node:sqlite` at `~/.ah/ah.db`. It holds account metadata, active-account state and a switch audit log. Credential blobs stay in files, not in the database. Schema changes go through a small versioned migration runner, and the database is backed up before each migration.
- **Spec control:** OpenSpec is initialised in the repo (`openspec/`). Each capability (init/auth, account registry, CLI switching, desktop switching, dashboard UI) gets a spec, and changes go through `openspec` change proposals.
- **UI:** `ak-ui-ux-pro-max` for design direction and `ak-ui-styling` (shadcn/ui + Tailwind) for implementation.
- **Security:** the server listens only on loopback. API calls need a session cookie (httpOnly, SameSite=Strict) obtained by logging in with the admin password. API responses never include token contents.
- **Processes:** one server process per run on a fixed port. If the port is busy and owned by a stale `ah` process, `ah` stops it instead of picking another port.

## Non-goals

- Running two accounts at once (no `CLAUDE_CONFIG_DIR`/`CODEX_HOME` profiles and no parallel desktop instances).
- Providers other than Claude and Codex.
- Encrypting stored tokens at rest.
- Remote or multi-user access, and any cloud deployment.
- Doing the OAuth login itself. Accounts are captured from a login you complete in the CLI or app ("capture current login as account X").

## Acceptance criteria

1. On first run, `ah init` asks for the admin password twice, creates `~/.ah` (0700) with `config.json` (holding the hash only) and `ah.db`, and never asks again. A second `ah init` refuses unless given `--reset`.
2. Running `ah` starts the server and opens `http://ah.localhost:<port>`. Login with the admin password is required, and a wrong password is rejected.
3. The current Claude CLI, Codex CLI, Claude desktop and Codex desktop logins can each be captured as named accounts. They show in the dashboard with the active one marked.
4. Switching a CLI account from the dashboard or with `ah switch` leaves `claude` / `codex` authenticated as the selected account. Switching back keeps any tokens refreshed in the meantime, so no re-login is needed. Skills and config in `~/.claude` are unchanged.
5. Switching a desktop account while the app is running is refused with a clear message. With the app closed, the swap happens and the app opens on the selected account.
6. A failed switch rolls back to the previous files. Every switch is recorded in the audit log.
7. `nx run-many -t lint test build` passes. OpenSpec specs exist for each capability and `openspec validate` passes.

## Trade-offs

- **Global credential swap** relies on each CLI keeping its whole login in the files listed above. It fails first if a CLI moves its tokens into the OS keyring or rewrites the file while a session is running. Snapshotting before every switch plus rollback limits the damage. This needs re-checking whenever a CLI upgrades.
- **Desktop data-dir swap** relies on the app reading its data dir only at startup and on the keyring key being shared across dirs on the same machine. It fails first if the app ties login to a device ID file. Mitigation: move the whole dir, including `ant-did`, so the device identity travels with the account.
- **Per-terminal profiles** (rejected) would allow parallel use, but each account would need its own copy of `~/.claude` skills and config.

Better approaches: none. The recommended direction is the requested one, with one adjustment: `node:sqlite` instead of `better-sqlite3`, which avoids building a native module against Node 26.

## Unresolved risks

- The `oauthAccount` field in `~/.claude.json` sits in a 96 KB file that Claude Code writes often. The swap must edit that one field in place rather than replace the whole file.
- Whether the desktop apps pick up a swapped data dir cleanly (keyring-encrypted cookies) has to be confirmed by a manual test during implementation.
