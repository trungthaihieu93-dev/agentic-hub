## 1. Workspace

- [x] 1.1 Nx 24 workspace with web, server, cli, core, server-lib and shared projects
- [x] 1.2 OpenSpec initialised with one spec per capability

## 2. Core

- [x] 2.1 `~/.ah` layout, config, scrypt password hash, `initAh`
- [x] 2.2 SQLite through `node:sqlite` with locked, backed-up migrations

## 3. Switching

- [x] 3.1 Switch engine with lock, journal, snapshot, verify, rollback and audit
- [x] 3.2 `claude-cli` and `codex-cli` targets
- [x] 3.3 `claude-desktop` target; Codex desktop shares the `codex-cli` login

## 4. Server and UI

- [x] 4.1 Hono API with sessions, canonical-origin guard and live-identity watcher
- [x] 4.2 React dashboard: login, accounts, switch flow, audit

## 5. CLI and verification

- [x] 5.1 `ah` command with init, serve, list, capture and switch; single instance
- [ ] 5.2 `bun link` and end-to-end verification on the real machine
