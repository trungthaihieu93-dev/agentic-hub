# ah — local Claude and Codex account switcher

`ah` saves your Claude and Codex logins as named accounts and switches between them from a password-protected local dashboard or the command line. Nothing leaves the machine except the provider's own identity checks.

| Target | What `ah` swaps |
|---|---|
| `claude-cli` (Claude Code) | Only `claudeAiOauth` in `~/.claude/.credentials.json` and `oauthAccount` in `~/.claude.json`. MCP logins, the trusted device token, settings and skills stay shared. |
| `codex-cli` (Codex CLI and the Codex desktop app) | `~/.codex/auth.json`, under Codex's own `auth.lock`. The desktop app uses the same file. |
| `claude-desktop` | The whole `~/.config/Claude` data dir, moved by `rename` while the app is closed. `claude_desktop_config.json` (MCP servers) stays shared. |

See [docs/usage.md](docs/usage.md) for commands and safety behaviour.

## Requirements

- Linux, Node 26 or newer (uses `node:sqlite`), bun 1.4
- util-linux `flock` and `ss`

## Set up

```sh
bun install --frozen-lockfile
bun run publish:local           # builds all projects and puts `ah` on your PATH (~/.bun/bin/ah)
ah init                        # set the admin password once; creates ~/.ah (0700)
ah                             # opens http://ah.localhost:7427
```

## Develop

| Command | Purpose |
|---|---|
| `bun run dev` | Starts the backend on port 7427 and Vite on `http://ah.localhost:5173` |
| `bun run test` | Runs all workspace tests once |
| `bun run lint` | Lints all workspace projects |
| `bun run build` | Builds all workspace projects, including the `ah` bundle and its web UI |
| `bun run docs:dev` | Starts the documentation site locally |
| `bun run docs:build` | Builds the documentation site from the Markdown in `docs/` |
| `bun run docs:preview` | Previews the built documentation site |
| `bun run publish:local` | Builds all projects and links `ah` locally with `bun link` |
| `bunx nx run-many -t lint test build typecheck` | Full check (tests use temporary homes, never your real files) |
| `bunx nx serve server` | Dev server on port 7427 using `apps/web` output |
| `bunx nx serve web` | Vite on `http://ah.localhost:5173`, proxying `/api` to the dev server |
| `bun run spec:validate` | Validate the OpenSpec specs in `openspec/` |
| `bun run ah -- <args>` | Run the built bundle without linking |

Workspace layout: `apps/cli` (the `ah` bin), `apps/server` (dev entry), `apps/web` (React dashboard), `libs/core` (all file and account logic), `libs/server` (Hono app), `libs/shared` (zod schemas and types). Design notes for the UI are in [docs/design-guidelines.md](docs/design-guidelines.md).

## Documentation deployment

The Astro Starlight site in `apps/docs` builds from the canonical Markdown in `docs/`. GitHub Actions builds it for pull requests and deploys the verified build to Cloudflare Pages after successful checks on `main`. Configure the repository variable `CLOUDFLARE_PAGES_PROJECT_NAME` with the intended Pages project, and repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; the token needs Cloudflare Pages edit access. The project's production branch must be `main`. See [the CI workflow](.github/workflows/ci.yml) for the deployment command. To recover a known-good version, use the Pages dashboard's deployment rollback for the intended project or rerun the workflow on a new `main` commit containing the known-good docs. Verify the production deployment and URL in the Cloudflare dashboard.
