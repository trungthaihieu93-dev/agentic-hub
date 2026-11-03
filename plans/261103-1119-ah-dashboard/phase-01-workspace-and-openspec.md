---
phase: 1
title: "Workspace and OpenSpec scaffold"
status: completed
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Workspace and OpenSpec scaffold

## Goal

Create a pinned Nx 24 TS-solution workspace (bun, Node 26) with six named projects, working lint/test/build targets, a committed lockfile, git, and OpenSpec with one spec per capability delivered through an initial change proposal.

## Files to Create / Modify

- Create (root):
  - `package.json`: `"private": true`, `"type": "module"`, `workspaces`, `"bin": {"ah": "apps/cli/dist/main.js"}`, `"engines": {"node": ">=26"}`, empty `trustedDependencies`
  - `nx.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.mjs`, `bun.lock` (committed)
  - `.gitignore`: ignores `dist`, `node_modules`, `.nx`, `*.db`, `*.db-wal`, `*.db-shm`
- Create projects:
  - `apps/web` (`--name=web`): Vite + React
  - `apps/server` (`--name=server`): dev entry that calls `startServer` from `libs/server`
  - `apps/cli` (`--name=cli`): esbuild bundle, the `ah` bin
  - `libs/core` (`--name=core`), `libs/server` (`--name=server-lib`), `libs/shared` (`--name=shared`)
- Create: `apps/cli/scripts/post-build.mjs`: copies `apps/web/dist` to `apps/cli/dist/public`, prepends nothing (esbuild `banner` adds the shebang), and runs `chmod 0755 apps/cli/dist/main.js`
- Create: `openspec/` via `openspec init`, plus `openspec/changes/add-ah-dashboard/{proposal.md,tasks.md,specs/*/spec.md}`
- Create: `README.md` (setup, `bun install --frozen-lockfile`, `nx` targets, `ah init`, `bun link`)

## Tasks & Steps

1. `git init`. Scaffold into the scratchpad, because `create-nx-workspace` refuses a non-empty folder and Claude Code's environment remaps `--preset=ts` to a downloaded GitHub template:
   `env -u CLAUDECODE -u CLAUDE_CODE -u AI_AGENT bunx create-nx-workspace@24.0.3 agentic-hub --preset=ts --pm=bun --nxCloud=skip --interactive=false`
   Move the result into the repo, keeping `plans/`.
2. Pin exact versions: `nx` and all `@nx/*` at 24.0.3, `vitest@5.1.0`, `hono@4.13.16`, `@hono/node-server@2.1.6`, `zod` (current exact version), `@fission-ai/openspec@1.16.0`. Use `bun add -D --exact …`. Run `bun install` and then `bunx nx report`. **Stop if the report shows any Nx version other than 24.0.3.** Commit `bun.lock`.
3. Generate projects, always with `--name`:
   - `nx g @nx/react:app apps/web --name=web --bundler=vite --unitTestRunner=vitest --e2eTestRunner=none --style=css`
   - `nx g @nx/node:app apps/server --name=server --bundler=esbuild --framework=none --unitTestRunner=vitest`
   - `nx g @nx/node:app apps/cli --name=cli --bundler=esbuild --framework=none --unitTestRunner=vitest`
   - `nx g @nx/js:lib libs/core --name=core --bundler=none --unitTestRunner=vitest`, and the same for `libs/server --name=server-lib` and `libs/shared --name=shared`
   After generating, run `bunx nx show projects` and record each project's real `outputPath`. Every later path in this plan assumes `<project>/dist`; correct it if the report differs.
4. esbuild for `cli` and `server`: `format: ['esm']`, `bundle: true`, `platform: node`, `target: node26`, `banner.js: '#!/usr/bin/env node'` (cli only). `node:*` builtins stay external automatically.
5. Make `cli:build` depend on `web:build` (Nx `dependsOn`), then run `post-build.mjs`.
6. Vite dev server on `ah.localhost:5173`. Proxy `/api` to `http://127.0.0.1:7427` with `changeOrigin: false` and a `configure` hook that sets `Host` to `ah.localhost:7427` and `Origin` to `http://ah.localhost:7427`, so the Phase 5 host and origin checks also pass in development. (`changeOrigin: true` would send `Host: 127.0.0.1:7427`, which Phase 5 answers with 403 for every API call except health.)
   <!-- Updated: Validation Session 1 - proxy Host header must be the canonical host -->

7. Leave out `vitest.workspace.ts` (vitest 5 ignores it). Nx runs each project's own `vitest.config.ts`.
8. OpenSpec: `bunx openspec init --tools claude,codex --no-animation`. It writes Codex skills to the project's `.agents/`, not `~/.codex`; confirm with `git status` after running.
9. Write change `add-ah-dashboard` with ADDED requirements and `#### Scenario:` blocks for five capabilities:
   - `admin-init-auth`: one-time password, hash only, login session, `--reset`, canonical origin
   - `account-registry`: capture, list, delete saved profile, live identity, drift flag, versioned snapshots
   - `cli-account-switching`: login-key-only swap, token-ownership check, journal, field rollback, running-session warning plus force, audit
   - `desktop-account-switching`: app-running refusal, rename swap, shared MCP config, same-device check
   - `dashboard-ui`: login, account board, switch flow, audit view
   Leave the Codex desktop scenarios marked as pending the Phase 4 spike. Phase 4's exit step updates them.
10. Root scripts: `"spec:validate": "openspec validate --all --strict --no-interactive"`.

## Verification

- `bunx nx run-many -t lint test build` exits 0.
- `ls apps/cli/dist/main.js apps/cli/dist/public/index.html` both exist, and `node apps/cli/dist/main.js` runs on Node 26.
- `bun run spec:validate` exits 0 and `bunx openspec list` shows `add-ah-dashboard`.
- `bun install --frozen-lockfile` leaves `bun.lock` unchanged.
