---
phase: 2
title: "Core: ~/.ah, config, password, SQLite"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Core — ~/.ah, config, password, SQLite

## Goal

Give `libs/core` a tested foundation: injectable paths, safe file writes, `~/.ah` with strict permissions, `config.json` holding the admin password hash, and SQLite through `node:sqlite` with versioned, locked, backed-up migrations.

## Files to Create / Modify

- Create: `libs/core/src/paths.ts`: `resolvePaths(homeDir)` returns
  - `~/.ah`: `ahDir`, `configFile`, `dbFile`, `profilesDir`, `sharedDir`, `backupsDir`, `tmpDir`, `lockFile` (`switch.lock`), `journalFile` (`switch-journal.json`), `pidFile` (`server.pid`)
  - providers: `claudeCredentials` (`~/.claude/.credentials.json`), `claudeJson` (`~/.claude.json`), `codexAuth` (`~/.codex/auth.json`), `codexAuthLock` (`~/.codex/auth.lock`), `codexDaemonPid` (`~/.codex/app-server-daemon/daemon.pid`), `claudeDesktopDir` (`~/.config/Claude`), `codexDesktopDir` (`~/.config/Codex`)
- Create: `libs/core/src/fs-safe.ts`:
  - `writeFileAtomic(path, data, mode)`: temp file opened with `O_CREAT|O_EXCL|O_WRONLY` at the final mode, fsync the file, rename, fsync the directory, unlink the temp file on error
  - `editJsonField(path, key, value)`: read, record mtime, set one key, re-check mtime (retry once, then fail), atomic write keeping the original mode
  - `ensureDir(path, 0o700)`
  - `resolveInside(root, rel)`: throws if the result leaves `root`
- Create: `libs/core/src/config.ts`: zod-validated `AhConfig { version: 1, port: 7427, host: "127.0.0.1", admin: { algo: "scrypt", salt, hash, N, r, p }, createdAt }`
- Create: `libs/core/src/password.ts`: async `hashPassword` and `verifyPassword` (`node:crypto` `scrypt` promisified, N=2^15, r=8, p=1, `maxmem` raised to fit, 16-byte salt, 64-byte key, `timingSafeEqual`)
- Create: `libs/core/src/init.ts`: `initAh({ homeDir, password, reset })`
- Create: `libs/core/src/db/index.ts`: `openDb(path)` returns `new DatabaseSync(path, { timeout: 5000 })` with `journal_mode=WAL` and `foreign_keys=ON`
- Create: `libs/core/src/db/migrate.ts`, `libs/core/src/db/migrations/index.ts` (ordered `[{ version: 1, sql }]`), `libs/core/src/db/migrations/001-initial.ts` (exports the SQL as a template string; no `?raw` import, because the esbuild CLI bundle cannot load it)
  <!-- Updated: Validation Session 1 - migrations inlined as TS strings -->

- Create: `libs/core/src/labels.ts`: zod `Label = /^[\w .-]{1,40}$/`, no leading dot
- Create: `libs/core/src/testing/temp-home.ts`: `makeTempHome()` plus a guard that throws if `homeDir === os.homedir()` while `VITEST` is set
- Create: matching `*.spec.ts` next to each module

## Profile layout (the one format used by all phases)

`~/.ah/profiles/<target>/<accountId>/` contains:
- `v<YYYYMMDDHHmmssSSS>/`: one directory per snapshot; the last 3 are kept
- `current`: a symlink to the newest good version, replaced atomically through rename

Desktop targets keep their swapped data dir at `.../v<ts>/data`. `accounts.profile_path` stores `<target>/<accountId>` only, and every use goes through `resolveInside(profilesDir, …)`.

## Schema (001-initial.ts)

```sql
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,                -- uuid; also the profile dir name
  target TEXT NOT NULL CHECK (target IN ('claude-cli','codex-cli','claude-desktop','codex-desktop')),
  label TEXT NOT NULL,
  identity_key TEXT,                  -- claude "<orgId>:<lowercased email>" | codex tokens.account_id | NULL for desktop
  email TEXT, org_name TEXT,
  token_fingerprint TEXT,             -- sha256 of the saved refresh token (CLI targets)
  profile_path TEXT NOT NULL,
  created_at TEXT NOT NULL, captured_at TEXT NOT NULL,
  UNIQUE (target, label), UNIQUE (target, identity_key)
);
CREATE TABLE active_accounts (target TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL, switched_at TEXT NOT NULL);
CREATE TABLE live_status (target TEXT PRIMARY KEY, identity_key TEXT, email TEXT, drift INTEGER NOT NULL DEFAULT 0, checked_at TEXT NOT NULL);
CREATE TABLE switch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL,
  from_account_id TEXT, to_account_id TEXT, actor TEXT NOT NULL CHECK (actor IN ('cli','dashboard','recovery')),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','refused','rolled_back','recovered','failed')),
  message TEXT, created_at TEXT NOT NULL
);
CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
```

## Tasks & Steps

1. Implement `paths.ts`, `fs-safe.ts` and `labels.ts`. Only the CLI entry may call `os.homedir()`.
2. Implement `password.ts`. Reject passwords shorter than 8 characters.
3. Implement `initAh`:
   - Set `process.umask(0o077)` at the start.
   - Create `~/.ah`, `profiles/`, `shared/`, `backups/` and `tmp/` with mode 0700, and `config.json` with mode 0600.
   - Open `ah.db` and run migrations.
   - Throw `AlreadyInitializedError` if `config.json` exists and `reset` is false.
   - With `reset`, replace only the `admin` block and delete all `sessions` rows; accounts and profiles stay.
4. Implement the migration runner:
   - If a migration is pending and the database already has tables, first run `VACUUM INTO '~/.ah/backups/ah-<ts>.db'` **outside any transaction** (SQLite refuses VACUUM inside an open transaction). Two processes may both back up; that is harmless.
   - Then apply inside `BEGIN IMMEDIATE`, re-reading `schema_migrations` inside that transaction so two processes can't both apply a migration.
   <!-- Updated: Validation Session 1 - backup moved before the transaction -->

   - Keep the last 5 backups.
5. Assert modes after creation, and sweep `tmp/` entries older than one day on open.

## Verification

- `bunx nx test core` covers:
  - hash/verify round trip; a wrong password is rejected;
  - init creates `ah.db` with all tables; a re-run refuses; `reset` keeps accounts;
  - modes are 0700/0600 even with umask 002;
  - `writeFileAtomic` leaves no temp file after an injected error;
  - `editJsonField` changes one key, leaves other keys equal, and fails when the mtime changes twice;
  - `resolveInside` rejects `../`;
  - the label schema rejects `/` and a leading dot;
  - a migration on an existing db makes a backup; a second run is a no-op; two concurrent runs apply once;
  - the temp-home guard throws on the real home.
- `bunx nx lint core` passes.
