# Sidebar and theme autonomous delivery brief

Status: Confirmed by the user on 2026-11-07. Implementation and local verification are complete; pull-request delivery is tracked in issue #1.

## Objective

Implement the [accepted UI plan](../261107-1610-sidebar-and-theme/plan.md), verify the integrated result, and deliver a reviewed pull request on `trungthaihieu93-dev/agentic-hub`.

## Proposed outcome

The [interactive schematic preview](../261107-1610-sidebar-and-theme/visuals/explain-sidebar-and-theme.html) shows the proposed sidebar, bottom Local admin and Sign out section, Light/Dark controls, and small-screen navigation. Existing account cards retain their behavior; the sketch contains no live account data.

## Done means

1. Desktop navigation uses a left sidebar with Accounts/Audit selection and a reachable bottom Local admin, Light/Dark, and Sign out section. Below 1024px an accessible menu drawer handles focus, history, route changes, and resizing correctly.
2. Light and Dark apply consistently to login, auth loading/errors, account/audit pages, dialogs, menus, badges, inputs, focus states, and toasts. Initial appearance follows the device; explicit choices persist and resolve before paint under the existing CSP. Denied storage remains usable; contrast is measured.
3. Existing authentication, successful/failed logout, account capture/switch safeguards, history, and audit behavior remain intact. Browser checks cover both themes at 375/1023/1024/1280px and short windows, with internal table scrolling and no page overflow.
4. Focused tests, complete web checks, and the repository's existing CI commands pass on the integrated branch. Owning docs and plan checklists reflect the result, and a fresh isolated review has no unresolved blocking findings.
5. The work is committed and pushed to a feature branch, a pull request is opened, and a linked GitHub issue carries the truthful `done` label. Processes, worker worktrees, and scratch artifacts started by the run are cleaned up. The feature branch and PR remain available for review.

## Constraints and out of scope

- Keep all three confirmed choices: Local admin and Sign out; device theme followed by remembered explicit choice; mobile drawer.
- Reuse existing tokens, Radix/shadcn controls, Lucide, router, and QueryClient patterns. No new runtime dependencies, API/profile/schema changes, credential changes, third theme option, or sidebar collapse/persistence.
- Preserve existing dark tokens and account operations. Browser verification uses an isolated temporary application home and the real server, without changing saved provider accounts in the user's home.
- Merge, deployment, unrelated fixes, spending money, and messages outside the authorized GitHub issue/PR workflow are outside this delivery endpoint. Unrelated findings are filed as deduplicated `ai-handle` issues under the invoked workflow.

## Prerequisites inspected at preflight

- Node 26.13.0, bun 1.4.4, Git, `gh`, `ak`, installed dependencies, and local Chromium are available.
- GitHub authentication is active with repository ADMIN permission. Read-only issue/label queries and SSH access to the main branch succeed. No branch protection or ruleset is configured.
- The current branch is `main` at `1aa970c`; only this session's planning artifacts are untracked. The remote main SHA matches the local commit.
- Ports 7427 and 5173 are free. About 14 GiB memory and 82 GiB disk are available. There are no worker worktrees to reuse.
- No production credentials or additional assets are needed. Missing issue lifecycle labels can be created additively after confirmation. No handover input remains missing.
- Local usage reporting has no populated analytics index and does not establish a remaining provider allowance. Start with at most two worker sessions and throttle on actual quota/resource signals.

## Defaults and execution order

Use one integration feature branch. Implement theme foundation first; then implement the dependent sidebar, integration tests, and docs with explicit file ownership. Independent read-only checks can overlap. Each code-writing worker receives its own worktree. Integrate sequentially, verify each diff, then run fresh isolated review and the full integrated checks. GitHub issue transitions and comments are authorized through the invoked A-to-Z workflow.

## Stop and ask only if

- A destructive or irreversible action outside this brief becomes necessary.
- A change would leave this repository/scope or alter a confirmed Done-means item.
- Unapproved spending or external messaging is needed.
- A failure remains unexplained after diagnosis and advisor counsel.
- A required prerequisite becomes invalid, such as expired or revoked access.

## Preview verification

The initial generated diagram fragment contained an invalid SVG `height="auto"` and undersized reader controls. The render checker failed that artifact. The preview now embeds the compiler's static SVG, removes the invalid height attribute in the generated artifact, and uses CSS sizing. Installed skill code was not changed. The drawer breakpoint was aligned to the accepted plan, and the diagram gained an internally scrollable accessible region for narrow screens.

Preview rubric: 21/24. Brief fidelity, hierarchy, spacing, alignment, typography, color, shape, responsiveness, and absence of decorative clutter each score 2. States, schematic content completeness, and implementation-level craft each score 1 because this is an approval sketch; live safeguards and production behavior require implementation verification. Nothing scores below 1. Desktop/mobile screenshots were inspected. Production application behavior remains unverified until implementation.

The final preview opened through `file://` and passed the bundled render checker at 375x812, 768x1024, and 1440x900 with zero errors and zero warnings. [Render evidence](../261107-1610-sidebar-and-theme/visuals/render-check/render-report.json) and the adjacent screenshots are local artifacts. The checker processes have exited; no development server was started.

## Confirmation record

The user explicitly replied **Confirm** to this brief and preview. The invoked A-to-Z skill (`~/.agents/skills/ak-atoz/SKILL.md`) explicitly requires: "Only an explicit Confirm opens gate 2". GitHub access, remote main, memory, and deterministic ports were rechecked after confirmation. No prerequisite handover is required.
