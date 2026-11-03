---
phase: 3
title: "Switch engine and CLI targets"
status: completed
priority: P1
effort: "10h"
dependencies: [2]
---

# Phase 3: Switch engine and CLI targets

## Goal

Build the shared switch engine (journal, lock, token-verified snapshot, install, verify, per-field rollback, audit, crash recovery), the target registry, and the `claude-cli` and `codex-cli` targets. Either CLI can then be switched without losing a login, and shared data (MCP logins, device token, skills, config) is left untouched.

## Files to Create / Modify

- Create: `libs/core/src/targets/types.ts`: the target contract
- Create: `libs/core/src/targets/index.ts`: the registry (two CLI targets now; Phase 4 adds the desktop ones)
- Create: `libs/core/src/targets/claude-cli.ts`, `libs/core/src/targets/codex-cli.ts`
- Create: `libs/core/src/identity.ts`: `resolveTokenOwner(target)` returns `{ identityKey, email, orgName }` or `null`:
  - claude-cli: runs `claude auth status --json` (verified keys: `loggedIn`, `email`, `orgId`, `orgName`; **no accountUuid**) and builds `identityKey = "<orgId>:<lowercased email>"`. If the step 0 spike shows the command only reads `~/.claude.json`, it uses the server-backed check that the spike chose.
  - codex-cli: decodes the `id_token` claims in `auth.json` (`tokens.account_id` plus email). `codex login status` prints only "Logged in using ChatGPT", so it is used only as a logged-in check.
  <!-- Updated: Validation Session 1 - owner sources corrected against the real CLI output -->

- Create: `libs/core/src/accounts.ts`: `listAccounts`, `captureAccount`, `deleteAccount` (saved profile only; refuses for the active account), `resolveAccountByLabel`
- Create: `libs/core/src/switch-engine.ts`: `switchAccount(opts): Promise<SwitchResult>`, `recoverFromJournal()`
- Create: `libs/core/src/lock.ts`: `withLock(paths, fn)`
- Create: `libs/core/src/processes.ts`: `findProcesses(match)` (reads `/proc/*/cmdline`, `/proc/*/exe`, `/proc/*/stat`) and `procIdentity(pid)` returning `{ startTime, bootId, cmdline }`
- Create: `libs/core/src/live-watch.ts`: `checkLive(target)`, used by the Phase 5 watcher
- Modify: `libs/shared/src/switch.ts`: `SwitchResult = { outcome: 'ok'|'refused'|'rolled_back'|'failed', warnings: Proc[], message, needsForce: boolean }`
- Create: specs for each module

## Target contract

```ts
interface AccountTarget {
  id: TargetId;
  identity: 'token' | 'none';                  // 'none' = desktop: the engine uses active_accounts
  rollback: 'field' | 'rename';
  requiresAppClosed: boolean;
  runningProcesses(): Promise<Proc[]>;
  readLiveIdentity(): Promise<Identity | null>; // cheap, read from files
  liveFingerprint(): Promise<string | null>;    // sha256 of the live refresh token
  snapshotTo(versionDir: string): Promise<void>;
  installFrom(versionDir: string): Promise<RollbackHandle>;
  rollbackWith(handle: RollbackHandle): Promise<void>;
  verifyInstalled(account: Account): Promise<boolean>;
}
```

`switchAccount({ target, accountId, actor, force = false, relaunch = false })`. The CLI resolves labels to ids with `resolveAccountByLabel`.

## Target details (verified 2026-11-03)

- **claude-cli**
  - `.credentials.json` has the top-level keys `claudeAiOauth`, `mcpOAuth` and `trustedDeviceToken`.
  - The profile stores only `claude-ai-oauth.json` (the `claudeAiOauth` object) and `oauth-account.json` (`oauthAccount` from `~/.claude.json`).
  - `installFrom` uses `editJsonField` on `.credentials.json` (`claudeAiOauth` only) and then on `~/.claude.json` (`oauthAccount` only).
  - The rollback handle holds the two *old field values*, never whole files, and `rollbackWith` re-applies them through `editJsonField`.
  - `mcpOAuth`, `trustedDeviceToken` and every other `~/.claude.json` key stay untouched.
  - Fingerprint: `sha256(claudeAiOauth.refreshToken)`.
  - Running processes: `claude` CLI processes, matched when `/proc/<pid>/exe` lies under `~/.local/share/claude/versions/`. `claude` is a native ELF whose real path includes the version (`versions/2.1.317`), so after an auto-update a running session still points at the older version path; matching one exact path would miss it.
  - `oauthAccount.accountUuid` is kept for display only; matching uses `identity_key` from `resolveTokenOwner`.
- **codex-cli**
  - `auth.json` has the top-level keys `OPENAI_API_KEY`, `auth_mode`, `tokens`, `last_refresh`. The whole file is the login, so the profile stores `auth.json`.
  - The rollback handle is the old file contents, restored with `writeFileAtomic` (`auth.json` is written only by Codex auth, unlike `~/.claude.json`).
  - Identity comes from the same file: `identity_key = tokens.account_id`, plus the email from the `id_token` payload (base64url decode). This is also the token-owner source, because `codex login status` reports no account. `tokens` also has `login_owner_id` and `oauth_provenance` (verified 2026-11-03); the profile keeps them because the whole file is stored.
  - Fingerprint: `sha256(tokens.refresh_token)`.
  - Running processes include the CLI and the **app-server daemon**. `app-server-daemon/daemon.pid` is JSON with keys `pid`, `processStartTime`, `processIdentity` and `executableIdentity` (verified), not a bare PID. Parse it, and count the daemon as alive only when `procIdentity(pid).startTime` matches `processStartTime`.
  - `auth.lock`: first read the Codex source (codex-rs `login` crate) to confirm whether it is an advisory `flock`. If it is, hold it around snapshot and install by running the critical section under `flock(1)` (util-linux, present on this machine) through a small helper. Record the finding in this file.
    - **Finding (2026-11-03):** `codex-rs/login/src/auth/storage.rs` opens `<codex_home>/auth.lock` and calls Rust std `File::lock()`, which is an exclusive, blocking `flock(LOCK_EX)` on Linux. It holds the lock for the whole read-modify-write commit, including refresh. `ah` holds the same lock around snapshot and install through `flock --exclusive --wait 10 auth.lock` (helper `withFlock`). A plain `load()` doesn't take the lock, so a running Codex can still read mid-switch, which is why the running-process check stays.
    - The daemon's `daemon.pid` `processIdentity` is `{ bootId, startTicks }`. `startTicks` equals field 22 of `/proc/<pid>/stat`, so the daemon is matched on boot id plus start ticks, not on the `processStartTime` date string.

## Step 0: Claude owner spike (read-only, before the engine)

Find out whether `claude auth status --json` asks the server or only echoes `oauthAccount` from `~/.claude.json`. Method, with no file changes: run it with the network forced to fail, `HTTPS_PROXY=http://127.0.0.1:9 HTTP_PROXY=http://127.0.0.1:9 claude auth status --json`, and compare the result with a normal run. (`unshare -rn` is blocked on this machine because unprivileged user namespaces are restricted.) If Claude ignores proxy variables, use the user's firewall instead, with the user present.
- If it still reports the email offline, it reads the cache. `verifyInstalled` must then confirm the owner through a cheap authenticated request with the installed access token. The spike picks that endpoint, and the provider's own CLI or docs must show it.
- If it fails or differs offline, it asks the server. Use it as is.

Record the outcome here. Until then, treat the Claude verify step as unproven.

**Outcome (2026-11-03, Claude Code 2.1.317): it reads the cache.** With a throwaway `CLAUDE_CONFIG_DIR` holding a fake access token and a fake `oauthAccount`, `claude auth status --json` printed `loggedIn: true` and the fake email and org. It never checks the token. The proxy run also returned the cached data.
- Server check chosen: Claude Code's own profile call, found in its binary as ``fv(e){let n=`${BASE_API_URL}/api/oauth/profile` … headers:{Authorization:`Bearer ${e}`}``, with `BASE_API_URL:"https://api.anthropic.com"`. The live response (checked 2026-11-03, key names only) carries `account.email` and `organization.uuid`; `email_address` appears only in the token-refresh response, so `identity_key = "<organization.uuid>:<lowercased email>"`, the same key as `orgId:email` from `auth status`.
- `resolveTokenOwner('claude-cli')` calls that endpoint with the live `claudeAiOauth.accessToken`. If the access token has expired (`expiresAt`) or the request fails, the owner is unresolved (`null`). The engine never refreshes a token itself, because a refresh may rotate it.
- `verifyInstalled` makes the same call with the installed token. A mismatch or a 401 rolls back. An expired token or a network failure keeps the install and returns the warning "verification skipped", because the install came from a snapshot whose owner was already verified.

## Engine algorithm

1. `withLock`: the lock file holds `{ pid, startTime, bootId }`. A lock counts as stale only when that PID is dead or its start time or boot id differ. If `switch-journal.json` exists, run `recoverFromJournal()` first and block every other operation until it succeeds.
2. Load the target and account. Refuse if the account is already active and the live identity matches.
3. Running processes:
   - desktop: refuse;
   - CLI: return `needsForce: true` with warnings unless `force`.
   - Both cases write a `switch_log` row with `outcome='refused'`. The warning text says a forced switch can make a running session write the old account back and may require a re-login.
4. **Snapshot the outgoing account.**
   - Get the live fingerprint. If it equals the active profile's `token_fingerprint`, the tokens are unchanged; skip the snapshot.
   - Otherwise call `resolveTokenOwner()` to ask the provider CLI who owns the live tokens:
     - owner matches a known account: snapshot into a **new** `v<ts>/` under that account, repoint `current`, update its fingerprint;
     - unknown owner: snapshot into `profiles/<target>/_unsaved/v<ts>/` and report it;
     - owner cannot be resolved (offline or logged out): snapshot to `_unsaved` and warn. Never overwrite a known profile on a guess.
5. Write the journal (`{ step, target, from, to, handles }`, fsynced) before each mutating step.
6. `installFrom(target current)`, then `verifyInstalled`, which calls `resolveTokenOwner()` and compares against the account's `identity_key`. On mismatch or error, `rollbackWith(handle)`, verify the restore, and log `rolled_back`.
7. In one DB transaction, update `active_accounts`, insert the `switch_log` row and clear `live_status.drift`. Only after the commit succeeds, delete the journal. If the commit fails, the journal stays and recovery completes the bookkeeping.
8. `ah switch` installs SIGINT/SIGTERM handlers that wait for the critical section to finish.

## Capture flow

`captureAccount({ target, label })` runs under `withLock` and does the following:
1. Validate the label.
2. Resolve the token owner through the provider CLI.
3. If that `identity_key` exists, add a new version to it; otherwise create `profiles/<target>/<uuid>/v<ts>/` and insert the row with its fingerprint.

"Add another account" means: capture the current one, run `claude auth login` / `codex login` in a terminal, then capture again.

## Verification

`bunx nx test core` with temp homes and fixture files; the provider CLI calls go through an injected `resolveTokenOwner` stub. Cases:
- Capture creates 0600 files, and the claude-cli profile contains no `mcpOAuth` or `trustedDeviceToken`.
- Switching A→B→A returns A's refreshed token (simulate a refresh between switches).
- `mcpOAuth`, `trustedDeviceToken` and every other `~/.claude.json` key stay deep-equal across A→B→A.
- Drift case: the live tokens belong to A while `oauthAccount` says B. The snapshot goes to A, never to B. With an unresolvable owner it goes to `_unsaved`.
- An injected `installFrom` or verify failure restores the old field values only, and keys a concurrent writer changed in the meantime survive.
- A crash after each journal step (kill a child process) is recovered or reversed on the next `withLock`.
- A DB commit failure leaves the journal, and recovery finishes the bookkeeping.
- A second concurrent switch waits or fails on the lock; a stale lock whose start time doesn't match is taken over.
- Running processes produce `needsForce` and a `refused` log row.
- The codex daemon counts as a running process when the start time in its JSON `daemon.pid` matches, and does not count when the start time differs (PID reuse).
- `resolveTokenOwner` builds the claude `identity_key` from `orgId` and the lowercased email in a fixture `auth status` JSON, and the codex one from the `id_token` claims in a fixture `auth.json`.
- A `claude` process whose exe is an older `versions/<x>` path counts as running.

Manual (needs the Phase 4 backup gate first): does a Claude/Codex refresh rotate the refresh token? Record the answer here; it determines how strongly to word the force warning.
