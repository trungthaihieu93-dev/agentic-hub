---
title: Add root workspace scripts
date: 2026-11-08
summary: "Added dev, test, lint, build and publish:local scripts and documented usage."
---

# Add root workspace scripts

Added five root package scripts using existing Nx targets. Development runs server and web together; tests run once; local publishing builds and then runs bun link. Updated README setup and development commands.

Lint and build pass. The dev task graph resolves both servers. Server integration tests require loopback socket access. A subsequent full test run hit a NO_COLOR/FORCE_COLOR warning in crash tests that assert empty stderr; all six test targets passed after repeating verification with NO_COLOR unset (five targets used successful cached results). No application behavior or test code was changed. Local linking was not executed.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
