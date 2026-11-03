---
title: ah dashboard built; review caught login-loss bugs
date: 2026-11-03
summary: All 7 phases of the ah account switcher built and pushed; review found and we fixed a recovery bug that overwrote newer logins; live two-account switching still pending
---

# ah dashboard built; review caught login-loss bugs

## What happened
Implemented plan `plans/261103-1119-ah-dashboard` end to end: Nx workspace, core (~/.ah, scrypt, node:sqlite migrations, switch engine), Hono server, React dashboard (delegated), `ah` CLI. 112 tests; pushed as commit 3529035 to trungthaihieu93-dev/agentic-hub (main).

## What the real machine taught us
- `claude auth status --json` only echoes the cached `oauthAccount`: a fake token in a throwaway `CLAUDE_CONFIG_DIR` still reported `loggedIn: true`. Ownership now uses `GET https://api.anthropic.com/api/oauth/profile`. The binary suggested `account.email_address`, but the live response uses `account.email`; the first real capture failed until fixed.
- Codex desktop (ChatGPT app) runs `/usr/lib/chatgpt/resources/codex app-server` on `~/.codex/auth.json`, so it is folded into the codex-cli target (user decision).
- Chrome's Claude-in-Chrome native host keeps `~/.config/Claude/logs/chrome-native-host.log` open and would have blocked every desktop switch; it is now ignored by exact path.
- The pid file recorded the realpath of main.js, but the cmdline shows `~/.bun/bin/ah`, so a second `ah` deleted the first server's pid file as stale (no signal sent; identity checks held).

## Review findings fixed
An independent review reproduced: recovery restoring stale tokens over a login made after a crash (critical); switching to the live owner installing its older snapshot over fresh tokens (high); Codex seats in one workspace merging on `account_id` (high). Rollback is now conditional on the live value still being what the switch installed, the incoming snapshot is read after the outgoing one is saved, and Codex identity is `account_id:email`. The switch lock is now a kernel flock.

## Next steps
- Phase 7 steps 4–7: real two-account switching (Claude and Codex), a forced switch with an open session, the desktop switch and relaunch, and the browser login and audit check. The user's second logins did not reach the credential files.
- Answer whether refresh tokens rotate on use.
- Archive the OpenSpec change after the live run.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
