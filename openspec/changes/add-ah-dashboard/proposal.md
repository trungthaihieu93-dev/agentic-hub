## Why

Switching between several Claude and Codex accounts today means logging out and in again in each CLI and desktop app, which loses refreshed tokens and takes minutes. A local tool that captures each login once and swaps it in on demand removes that friction without sending anything off the machine.

## What Changes

- Add a global `ah` command (`ah init`, `ah`/`ah serve`, `ah list`, `ah capture`, `ah switch`) linked with `bun link`.
- Add a password-protected dashboard served only on `http://ah.localhost:7427` (loopback).
- Store app config, a scrypt hash of the admin password, and a SQLite database (`node:sqlite`) in `~/.ah` (0700); credential snapshots are 0600 files under `~/.ah/profiles`.
- Add one switch engine for four targets: `claude-cli`, `codex-cli`, `claude-desktop`, `codex-desktop`, with a crash journal, lock, token-verified snapshots, per-field rollback, and an audit log.

## Capabilities

### New Capabilities

- `admin-init-auth`: one-time admin password, login sessions, canonical origin.
- `account-registry`: capture, list and delete saved logins; live identity; drift flag; versioned snapshots.
- `cli-account-switching`: login-only swap for Claude Code and Codex CLIs with ownership checks, journal, rollback and audit.
- `desktop-account-switching`: data-dir swap for the desktop apps, refused while they run, with shared MCP config.
- `dashboard-ui`: login page, account board, switch flow, audit view.

### Modified Capabilities

None.

## Impact

- New Nx workspace: `apps/web`, `apps/server`, `apps/cli`, `libs/core`, `libs/server`, `libs/shared`.
- Reads and writes `~/.claude/.credentials.json` (`claudeAiOauth` only), `~/.claude.json` (`oauthAccount` only), `~/.codex/auth.json`, and `~/.config/Claude`.
- Non-goals: running two accounts at once, other providers, encryption at rest, remote access, performing OAuth logins.
