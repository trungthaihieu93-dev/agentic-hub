---
phase: 5
title: "Hono server API"
status: completed
priority: P1
effort: "5h"
dependencies: [3]
---

# Phase 5: Hono server API

## Goal

Serve a loopback-only Hono app on a single canonical origin, with admin-password login, cookie sessions stored in SQLite, the account and switch endpoints, a live-identity watcher, and the built web UI loaded from an absolute path.

## Files to Create / Modify

- Create: `libs/server/src/app.ts`: `createApp({ homeDir, db, publicDir })` returns a Hono app (testable with `app.request()`)
- Create: `libs/server/src/start.ts`: `startServer({ homeDir, port, host, publicDir })` using `@hono/node-server` `serve()` and `serveStatic` from `@hono/node-server/serve-static` with `root: publicDir` (absolute). It refuses to start if `publicDir/index.html` is missing.
- Create: `libs/server/src/middleware/auth.ts`, `middleware/origin-guard.ts`, `middleware/security-headers.ts`
- Create: `libs/server/src/routes/health.ts`, `auth.ts`, `accounts.ts`, `switch.ts`, `audit.ts`
- Create: `libs/server/src/watcher.ts`: watches the **parent directories** (`~/.claude/`, `~`, `~/.codex/`) with `fs.watch` and filters on the file names `.credentials.json`, `.claude.json` and `auth.json`, debounced 2s. Watching the files themselves would stop working after the first atomic rename-replace, because the watch follows the old inode. On a change it calls `checkLive(target)` from core and updates `live_status`:
  - if the live owner is the active account and the fingerprint changed, it adds a new snapshot version to that account's profile (keeping saved tokens fresh). It does this only through a **non-blocking `withLock`**: if a switch or capture holds the lock, it skips the event, because the engine snapshots the outgoing tokens itself;
  <!-- Updated: Validation Session 1 - watch dirs, try-lock before writing profiles -->
  - if the owner differs, it sets `drift=1`.
- Modify: `apps/server/src/main.ts`: dev entry that resolves `publicDir` to `apps/web/dist` and calls `startServer`
- Modify: `libs/shared/src/api.ts`: zod request and response schemas
- Create: `libs/server/src/app.spec.ts`

## API

| Method | Path | Auth | Body / result |
|---|---|---|---|
| GET | `/api/health` | none | `{ app: "ah", version }` (no pid, no other data) |
| POST | `/api/auth/login` | none | `{ password }` sets `ah_session` (host-only, httpOnly, SameSite=Strict, Path=/, 12h) |
| POST | `/api/auth/logout` | session | deletes the session |
| GET | `/api/auth/me` | none | `{ authenticated }` |
| GET | `/api/accounts` | session | per target: `{ target, active, live, drift, accounts, unsaved: VersionDto[], runningProcesses }` |
| POST | `/api/accounts/capture` | session | `{ target, label }` |
| DELETE | `/api/accounts/:id` | session | removes the saved profile; refuses for the active account |
| DELETE | `/api/accounts/unsaved/:target/:version` | session | removes an `_unsaved` snapshot |
| POST | `/api/switch` | session | `{ target, accountId, force?, relaunch? }` returns `SwitchResult`. HTTP 409 when `needsForce`, 423 when an app is running, 200 otherwise. |
| GET | `/api/audit?limit=50` | session | `switch_log` rows |

DTOs never contain token values, fingerprints or file contents: only id, label, email, org, capturedAt, isActive.

## Security

- Bind `127.0.0.1` only.
- **Canonical origin** is `http://ah.localhost:<port>`.
  - A request with `Host: localhost|127.0.0.1:<port>` may only call `GET /api/health`. Page requests get a 308 redirect to the canonical origin; any other API call gets 403.
  - Any other Host gets 403 (DNS-rebinding defence).
- **Mutations** (POST, DELETE) require `Origin` to equal the canonical origin exactly; a missing or `null` Origin gets 403. They also require `Sec-Fetch-Site: same-origin` when the header is present, and the custom header `X-AH-Request: 1`.
- Security headers:
  - `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
- Login back-off: after 5 failures, a 1s delay that doubles up to 30s (in memory).
- Session id: 32 random bytes in base64url. Store `sha256(id)` in `sessions` and purge expired rows on start.
- Errors return `{ error: code, message }`, never stack traces.

## Verification

`bunx nx test server-lib` with a temp home, an initialised `~/.ah`, and a stubbed `resolveTokenOwner`:
- `/api/health` without a session returns 200 `{app:"ah"}`; unauthenticated `/api/accounts` returns 401.
- A wrong password returns 401 and the back-off applies.
- Login → accounts → switch → audit works end to end; the 409 path carries warnings and writes a `refused` audit row.
- `Host: evil.com` returns 403. `Host: localhost:7427` gets the health endpoint only, a 308 for `/`, and 403 for `/api/accounts`.
- A POST with a missing, `null` or foreign Origin, or without `X-AH-Request`, returns 403.
- Responses contain no `accessToken`, `refresh_token`, `refreshToken` or `fingerprint` substrings.
- The server started with `cwd` set to a temp dir holding a decoy `public/index.html` serves the real `publicDir`.
- The watcher sets `drift=1` when a fixture credential file switches to another owner, including after the file has been replaced twice through rename.
- The watcher writes no snapshot while the lock is held, and writes one after it is released.
