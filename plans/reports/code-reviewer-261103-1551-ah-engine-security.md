# Code review: ah switch engine, targets, server, CLI (security and failure modes)

Date: 2026-11-03. Read-only review against plan `plans/261103-1119-ah-dashboard/` (phases 3-5).
User decisions were not relitigated: plain 0600 token files, no admin password for CLI switching, login-only Claude swap, and shared MCP config for desktop.

## Scope
- Core: `switch-engine.ts`, `recovery.ts`, `journal.ts`, `lock.ts`, `flock.ts`, `accounts.ts`, `live-watch.ts`, `fs-safe.ts`, `profiles.ts`, `identity.ts`, `targets/{claude-cli,codex-cli,electron-dir,json-files}.ts`
- Server: `app.ts`, `middleware/*`, `sessions.ts`, `watcher.ts`, `start.ts`, `routes/dto.ts`
- CLI: `single-instance.ts`, `run.ts`, `main.ts`, `commands/*`
- Tests: `nx run-many -t test -p core server-lib cli` passes (cached).
- **Evidence:** I reproduced four findings with a throwaway script against temp homes. It used the project's own fixtures and touched no project files. The script is at `/tmp/claude-1000/-home-tonythai93-Projects-agentic-hub/1f6051bd-fae3-400f-b047-3ebf5ed74fec/scratchpad/repro.mts`. Output:
  ```
  1 drift->switch to live owner: ok live refresh now = rt-b1 (fresh was rt-b2)
  2 recovery after new login: live account_id = acct-b (C login lost if not acct-c)
  3 same workspace: second capture created= false note= This login is already saved as "user1"; ... user1 current holds rt-u2
  4 A profile oauthAccount email = b@y.com (should be a@x.com)
  ```

## Overall assessment
The happy path, the field-level edits, the DTO hygiene and the origin/host guards are solid. The weak spot is the crash-recovery and snapshot ordering logic. Three defects can drop or misfile a real login (C1, H1, H2), and a fourth misfiles login metadata (M1). All four were reproduced. I would not use this on real credentials until C1, H1 and H2 are fixed.

## Critical

### C1. Recovery blindly restores the journaled login over whatever is live now, which can destroy a login that was never saved
- **Where:** `libs/core/src/recovery.ts:35-36`, `libs/core/src/targets/codex-cli.ts:87-89` (`restoreFile(handle.file, handle.previous)`), `libs/core/src/targets/claude-cli.ts:85-94`.
- **What happens:** `recoverFromJournal` runs on the next lock acquisition, which may be hours or days after the crash. It calls `rollbackWith(handle)` without checking that the live files still hold what *this* switch installed:
  - **Codex** rewrites the whole `auth.json` with the old contents unconditionally.
  - **Claude** rewrites the field whenever it differs from `previous`.
- **Scenario (reproduced, case 2):**
  1. ah dies at step `installing` or `installed`. This happens on Ctrl+C of `ah serve` (see M2), on `kill -9`, or on a power loss.
  2. The user then runs `codex login` as account C, or Claude refreshes or rotates its tokens.
  3. The next capture, switch or delete runs recovery, which writes A's stale `auth.json` over C's.
  4. C's login was never snapshotted anywhere, so it is lost.
  5. The same `captureAccount` call then resolves the owner as A and adds A's stale tokens as a "fresh snapshot".
- **Related problems:**
  - For Claude, a rotated refresh token is replaced by its stale predecessor.
  - Recovery also runs `rollbackWith` outside `t.critical()`, so the Codex rollback does not hold `auth.lock`.
- **Fix:**
  - Store what was installed in the handle, for example `installedFingerprint` / `installedHash` per field or file. Roll back only when the live value still equals it (or still equals `previous`, in which case nothing needs doing).
  - Otherwise leave the live login alone. Snapshot it through the normal `snapshotOutgoing` owner rules, log `recovered` with "live login changed since the crash; nothing restored", and clear the journal.
  - Run recovery's rollback inside `getTarget(...).critical(...)`.
  - Add a test: crash at `installing`, then a new login, then recovery. The new login must survive.

## High

### H1. The incoming version dir is chosen before the outgoing snapshot, so switching to the account that owns the live tokens installs its stale tokens
- **Where:** `libs/core/src/switch-engine.ts:106` (`incomingDir` resolved) versus `:146` (`snapshotOutgoing`). The same applies to `plan.incomingDir` at `:125-130`.
- **Scenario (reproduced, case 1):**
  1. The active account is A. The user logs in as B by hand, or a forced session drifts, and B's live tokens are now `rt-b2`.
  2. The user clicks "switch to B", which is the natural way to fix drift.
  3. `snapshotOutgoing` resolves the owner as B and saves `rt-b2` as B's new `current`.
  4. `installFrom` then installs the *old* B version (`rt-b1`) over the fresh tokens.
  5. Verify passes: the old token still names B, or it has expired and verification is skipped.
- **Impact:**
  - If the refresh token rotates (still unverified per the plan), live B is now logged out.
  - The good tokens sit in the profile, but every later "switch to B" is refused as "already active".
  - Case 4 shows the same effect with A: after A's running session wrote `rt-a9` back, switching to A installed `rt-a1`.
- **Fix:** resolve `incomingDir` after `snapshotOutgoing` (re-read `currentVersionDir`). Simpler still: when the live owner already equals `incoming.identityKey`, skip the install and only do the bookkeeping (setActive, clear drift, log ok).

### H2. The Codex identity key is the workspace `account_id`, so two seats in one ChatGPT workspace are merged and one overwrites the other
- **Where:** `libs/core/src/identity.ts:87-96` (`identityKey: tokens.account_id`), `libs/core/src/accounts.ts:73-80`, and the DB rule `UNIQUE (target, identity_key)`.
- **Why it matters:** `tokens.account_id` is the ChatGPT account (workspace) id. Every member of a Team or Enterprise workspace shares it, and multiple seats in one team is a prime use case for a switcher.
- **Scenario (reproduced, case 3):**
  1. The user captures user1, then logs in as user2 in the same workspace and captures it as "user2".
  2. ah finds the "existing" account user1, ignores the label, and writes user2's tokens as user1's `current` (`created=false`, with a note).
  3. Switching to "user1" now installs user2. `verifyInstalled` compares only `account_id`, so it passes.
  4. The user cannot hold both seats.
- **Fix:**
  - Use `account_id + ":" + (id_token sub, or the lowercased email)`.
  - The plan text for `identity.ts` already says "`tokens.account_id` plus email".
  - Use the same key in `verifyInstalled`.
  - Existing rows need a migration or a re-capture; this is pre-release, so a re-capture is acceptable.

## Medium

### M1. The Claude snapshot saves `oauthAccount` from `~/.claude.json` even when it belongs to another account
- **Where:** `libs/core/src/targets/claude-cli.ts:53-58` (`snapshotTo` writes `liveAccount()` unconditionally).
- **What happens:** In the drift case the plan itself describes (tokens are A's, `oauthAccount` says B), the tokens are correctly filed under A. A's `oauth-account.json`, however, is B's (reproduced, case 4).
- **Impact:** The next switch to A installs A's tokens next to B's `oauthAccount`. Claude Code then shows B's email and org and uses B's account and org UUIDs. The existing drift test checks only the tokens.
- **Fix:**
  - Pass the resolved `Identity` into `snapshotTo`.
  - Write `oauth-account.json` only when `organizationUuid:emailAddress` matches `identity.identityKey`.
  - Otherwise copy the previous version's `oauth-account.json`, or write a minimal `{emailAddress, organizationUuid, organizationName}` built from the profile response.
  - Add an assertion to the drift test.

### M2. Server shutdown does not wait for an in-flight switch; it closes the DB and exits mid critical section
- **Where:** `apps/cli/src/main.ts:26-30` (`server.stop().then(() => process.exit(0))`), `libs/server/src/start.ts:46-53` (`closeAllConnections`, then `db.close()`), and `apps/cli/src/single-instance.ts:107-112`.
- **What happens:**
  - Plan step 8 requires signal handlers to let the critical section finish. Only `ah switch` does this.
  - On Ctrl+C or SIGTERM, `ah serve` drops connections, closes the DB under a running `switchAccount`, and exits.
  - The single-instance stale-server kill checks `lockHolder()` and only then sends SIGTERM, so a switch that starts in between is also cut.
- **Scenario:** Ctrl+C while a Claude switch waits up to 10 s on the profile call leaves the journal at `installed`. This is not lost on its own, but it feeds straight into C1.
- **Fix:**
  - Track in-flight switch, capture and delete promises in the server.
  - On stop, stop accepting requests, `await` those promises (and the watcher's `running` set), then close the DB.
  - In `resolveInstance`, send SIGTERM and let the process drain instead of escalating to SIGKILL while the lock is held by that PID.

### M3. Desktop recovery can rename dirs under a running app, and later prune the real profile
- **Where:** `libs/core/src/recovery.ts:35-36`, `libs/core/src/targets/electron-dir.ts:178-198`, `libs/core/src/profiles.ts:61-68`.
- **Scenario:**
  1. A crash happens after rename-out and before rename-in, so `~/.config/Claude` is missing.
  2. The user opens Claude desktop, which creates a fresh `~/.config/Claude`.
  3. On the next ah operation, recovery sees both `from` and `to` exist, skips both moves, logs "rolled back" and clears the journal.
  4. The DB still says A is active, but the live dir is an unknown fresh login.
  5. The next switch away moves that fresh dir into a new A version and repoints `current`.
  6. A's real data (sessions, worktrees) is now a non-current version. After a few more switches `pruneVersions` deletes it, because it keeps the 3 newest *names* and protects only `current`.
- **Second problem:** recovery never checks `runningProcesses()` for `requiresAppClosed` targets. If the app is running at recovery time, it renames the data dir out from under a live Electron process.
- **Fix:**
  - For `requiresAppClosed` targets, recovery must refuse while the app runs. Return LockBusy-style "quit the app to finish recovery".
  - When neither move can be reversed cleanly, keep the journal and report it instead of declaring success.
  - Make `pruneVersions` never delete a version that contains `data/`.

### M4. Lock file: an empty file blocks every operation forever, and the stale takeover can double-grant or wedge the lock
- **Where:** `libs/core/src/lock.ts:44-46` and `:52-61`.
- **Empty lock file:**
  - A crash, or a power loss before the data hits disk, between `O_EXCL` create and `writeSync` leaves an empty `switch.lock`.
  - `readLockOwner` then returns `null` forever, so every switch, capture and delete fails with LockBusy. The comment says "unless it stays empty", but nothing implements that.
- **Stale takeover race:**
  1. X and Y both see a dead owner. X moves the stale lock aside and creates its own.
  2. Y then renames *X's live lock* aside, sees it is alive, and renames it back.
  3. If Z created a lock in that gap, the rename overwrites Z's lock, and both X and Z hold the lock.
  4. If X released in that gap, its `release()` found no file, and Y's rename-back resurrects a lock owned by the long-lived server PID. That wedges all switches until the server restarts.
- **Fix:** use a kernel lock on `switch.lock`. The project already depends on util-linux `flock` and has `withFlock`, so reuse that pattern: a held `flock(1)` child. The kernel releases the lock when its holder dies, so stale detection and the rename dance go away. Keep the JSON owner record only for diagnostics. At minimum, treat an empty lock older than a few seconds (by mtime) as stale.

### M5. Fresh Claude tokens with an unresolvable owner are stranded in `_unsaved` with no restore path, and switch-back installs stale tokens
- **Where:**
  - `libs/core/src/switch-engine.ts:44-59`
  - `libs/core/src/identity.ts:54-56`: an expired access token gives owner `unknown`.
  - `libs/server/src/app.ts:111-116`: unsaved snapshots can only be deleted.
- **Scenario:**
  1. Claude refreshed A's tokens while the ah server was not running, so the watcher did not snapshot them.
  2. Later the access token expires. This is the normal state when no Claude session is running.
  3. `ah switch claude B` files A's only valid refresh token under `_unsaved`.
  4. Switching back to A installs A's older snapshot.
- **Impact:** If refresh tokens rotate, A is logged out. The working token sits in `_unsaved`, and neither the UI nor the CLI can restore or assign it. This undermines the success criterion "keeps refreshed tokens on switch-back".
- **Fix** (preserves the "never file on a guess" rule):
  - Add an explicit "restore/assign unsaved snapshot" action that re-resolves the owner once the user has run `claude` (fresh access token).
  - Alternatively, on switch-back to A, warn when an `_unsaved` snapshot newer than A's `current` exists.
  - Also prune `_unsaved`, which currently grows without bound.

### M6. Atomic replace breaks symlinked credential files
- **Where:** `libs/core/src/fs-safe.ts:35-48` (`writeFileAtomic`), used by `editJsonField` and `restoreFile` on `~/.claude.json`, `~/.claude/.credentials.json` and `~/.codex/auth.json`.
- **What happens:** If any of these is a symlink (dotfile managers, stow), `rename(tmp, file)` replaces the link with a regular file in the link's directory. The real file keeps the old login, and the user's dotfile setup silently forks.
- **Fix:** `realpathSync(file)` first and write next to the real target, or refuse with a clear error when the path is a symlink.

## Low
- **L1.** `libs/core/src/switch-engine.ts:121-122`: `step('started')` is written before `t.critical()`. If `withFlock` fails (flock busy or missing), the error escapes with no `failed` audit row, and the journal is left for a spurious "nothing changed" recovery. Fix: write the `started` journal inside `critical`, or catch around `critical` and clear the journal plus log `failed`.
- **L2.** `libs/core/src/context.ts:17`: a timeout or signal (`err.code` is not a number) maps to 127, so `codex login status` that timed out reports "verification skipped: the codex command was not found". This is plausible if Codex blocks on `auth.lock`, which ah holds. Fix: map only `ENOENT` to 127 and report timeouts as such.
- **L3.** `libs/core/src/fs-safe.ts` (`editJsonField` `JSON.parse(raw)`): V8 `SyntaxError` messages embed a snippet of the input. The error flows into `rollBack(err.message)`, then into `switch_log.message` and the API response. If `.credentials.json` is malformed, a token fragment can reach the audit log and UI. Fix: catch and rethrow `ValidationError(\`${file} is not valid JSON\`)`.
- **L4.** `libs/core/src/switch-engine.ts:77-84`: "already active" compares the cheap `oauthAccount` identity. When tokens drifted (A's tokens, `oauthAccount` B, active B) and the watcher has not set `drift`, switching to B is refused even though the live tokens are not B's. Fix: when a token target's live fingerprint differs from `active.tokenFingerprint`, do not refuse.
- **L5.** `libs/core/src/targets/electron-dir.ts:156`: `handle.sharedFiles[].previous` is journaled but never used by `rollbackWith`. It is dead data; drop it or use it.
- **L6.** `libs/core/src/targets/electron-dir.ts:55-60`: rule (b) compares `/proc/*/fd` targets with `path.resolve(dataDir)`, not `realpathSync`. If `~/.config` is a symlink, a running app is not detected through rule (b).
- **L7.** `libs/server/src/app.ts:131-132`: `limit=-1` passes `Number.isFinite`, and SQLite `LIMIT -1` is unbounded. Clamp it to 1..500.
- **L8.** `libs/server/src/middleware/security-headers.ts:5`: CSP adds `style-src 'unsafe-inline'`, which the plan did not specify. Fine if the UI needs it; record the decision.

## Edge cases found by scouting
- A drift switch to the live owner (H1), and recovery after a manual re-login (C1): both reproduced.
- Two Codex seats in one workspace (H2): reproduced.
- `oauthAccount` and token mismatch persisted into the profile (M1): reproduced.
- A switch in flight during server Ctrl+C (M2), desktop dir recreated by the app before recovery (M3), and an empty or racing lock file (M4): established by code reading.

## Checked and found sound
- `toAccountDto`/`targetDto` expose no tokens, fingerprints, identity keys or paths.
- Host guard (DNS rebinding), exact-Origin, `Sec-Fetch-Site` and `X-AH-Request` on all mutations including login. Session ids are 32 random bytes and stored only as sha256; the cookie is host-only, `HttpOnly` and `SameSite=Strict`. Errors carry no stack traces.
- `deleteUnsaved` (regex plus zod target), `resolveInside` on profile paths, and the label schema block path traversal.
- `single-instance.ts` kills only after PID, start time, boot id, cmdline and port-owner checks. The SIGKILL is re-gated on the start time. `codexDaemonProcess` checks boot id plus start ticks.
- The Claude field edits leave `mcpOAuth`, `trustedDeviceToken` and the other `.claude.json` keys intact. The mtime guard is in place.
- The watcher snapshots only under a try-lock and re-checks the fingerprint inside it.

## Recommended actions (priority order)
1. **C1:** make rollback conditional on the live value still being the installed one, wrap recovery's rollback in `critical()`, and add the "new login after crash" test.
2. **H1:** re-read `incomingDir` after `snapshotOutgoing`, or skip the install when the live owner is the incoming account.
3. **H2:** Codex identity key = `account_id:sub` (or `account_id:email`); update verify and add a same-workspace test.
4. **M2:** make server shutdown drain in-flight operations before closing the DB.
5. **M1, M3, M4:** oauthAccount ownership check; desktop recovery refuses while the app runs and pruning never deletes `data/`; kernel lock for `switch.lock`.
6. **M5, M6**, then the Low items.

## Metrics
- Type coverage: strict TS. `as` casts on parsed JSON (journal, pid file, lock) are unchecked; acceptable for ah-owned files.
- Tests: core, server-lib and cli pass (cached). They miss: post-crash login changes, drift-to-incoming, same-workspace Codex, `oauthAccount` content in drift snapshots, server shutdown mid-switch, and an empty lock file.
- Lint: not run (review scope).

## Unresolved questions
1. Do Claude and Codex rotate refresh tokens on use? (This was still open in the plan.) The answer sets the practical severity of H1, M5 and the stale-restore half of C1. The unsaved-login-overwrite half of C1 is severe regardless.
2. Should "switch to the account that already owns the live tokens" be a pure bookkeeping operation (my recommendation for H1), or show its own confirmation in the UI?

Status: DONE_WITH_CONCERNS
Summary: The switch engine has one critical and two high defects that can lose or misfile a real login: recovery restores stale tokens over newer ones, a stale incoming snapshot is installed when the live owner is the target, and the Codex identity key merges seats that share a workspace. All three were reproduced against temp homes. Fix them before any real-machine use; the medium items cover shutdown draining, desktop recovery, the lock file and metadata misfiling.
