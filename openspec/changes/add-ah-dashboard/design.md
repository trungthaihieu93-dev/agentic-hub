## Context

Claude Code keeps its login in `~/.claude/.credentials.json` (`claudeAiOauth`) and `~/.claude.json` (`oauthAccount`); Codex keeps its login in `~/.codex/auth.json`; the desktop apps keep theirs inside their Electron data dir. All four refresh tokens in place, so a saved copy goes stale unless it is refreshed from the live files before every switch.

## Goals / Non-Goals

**Goals:** switch any of the four targets in one action without losing refreshed tokens, shared MCP logins, skills or config; recover from a crash mid-switch; keep a full audit trail.

**Non-Goals:** parallel accounts, encryption at rest, remote access, performing OAuth.

## Decisions

- **Field-level edits for Claude.** Only `claudeAiOauth` and `oauthAccount` are swapped, with an mtime-guarded read-modify-write. `mcpOAuth`, `trustedDeviceToken` and every other key stay shared. Whole-file copies were rejected because Claude Code rewrites `~/.claude.json` constantly.
- **Whole-file swap for Codex CLI.** `auth.json` holds only the login.
- **Rename swap for desktop apps.** The data dir is moved, not copied; the app must be closed; `claude_desktop_config.json` is carried across so MCP servers stay shared.
- **Token ownership is resolved before every snapshot** so tokens are never filed under the wrong account; unknown owners go to `_unsaved`.
- **Journal plus lock.** An fsynced journal written before each mutating step is replayed or reversed on the next lock acquisition.
- **Single canonical origin** `http://ah.localhost:7427` with Host, Origin and custom-header checks to block DNS rebinding and CSRF.

## Risks / Trade-offs

- A running CLI session can write the old account back after a forced switch → warn, require force, and watch for drift.
- Providers may move tokens into the OS keyring in a future release → the swap would then fail verification and roll back.
