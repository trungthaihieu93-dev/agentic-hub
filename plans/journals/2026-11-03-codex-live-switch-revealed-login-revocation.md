---
title: Codex live switch worked; a second codex login revoked the first
date: 2026-11-03
summary: First real two-account Codex switch through ah; the switch engine behaved, but the older account's token was dead before ah touched it
---

# Codex live switch worked; a second codex login revoked the first

## What happened
Ran Phase 7's live check for Codex with the user present. Captured the new live login as `crypto`, saw the switch refused while the app-server daemon ran, stopped the daemon with `codex app-server daemon stop`, and switched crypto → personal → crypto. Identity, file mode, `config.toml` and the audit log were all correct.

## What surprised us
- `codex app-server daemon stop` leaves a `pid-update-loop` helper alive. ah counted it as a running Codex, so every switch still needed `--force`. It holds no auth file, so it is now ignored (with a test).
- The `personal` snapshot's refresh token was revoked by OpenAI. Its hash matches the 15:56 backup, so ah did not alter or rotate it. The likely cause is that `codex login` for the second account signed out the first one. If so, collecting a second Codex account via a normal login destroys the first, and a separate `CODEX_HOME` is needed.

## Next steps
- The user re-logs in to personal, ideally under a separate `CODEX_HOME`, to confirm the revocation theory.
- Claude steps 4–6 still need a second Claude account.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
