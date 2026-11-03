## ADDED Requirements

### Requirement: Login-only swap
Switching `claude-cli` SHALL replace only the `claudeAiOauth` key of `~/.claude/.credentials.json` and the `oauthAccount` key of `~/.claude.json`, each through an mtime-guarded field edit. `mcpOAuth`, `trustedDeviceToken` and every other key MUST remain unchanged. Switching `codex-cli` SHALL replace `~/.codex/auth.json` atomically.

#### Scenario: Shared data untouched
- **WHEN** the user switches `claude-cli` from A to B and back to A
- **THEN** `mcpOAuth`, `trustedDeviceToken` and all other `~/.claude.json` keys are deep-equal to before

### Requirement: Snapshot outgoing tokens with verified ownership
Before installing an account, the system SHALL snapshot the live tokens into a new version of the account that owns them, resolved through the provider's own identity source. When the owner is unknown or cannot be resolved, the tokens MUST be saved under `_unsaved` and MUST NOT overwrite any saved account.

#### Scenario: Refreshed tokens survive
- **WHEN** account A's tokens were refreshed while active and the user switches A → B → A
- **THEN** the refreshed tokens of A are active again without a new login

#### Scenario: Drifted tokens filed correctly
- **WHEN** the live tokens belong to A while `oauthAccount` says B
- **THEN** the snapshot is filed under A, never under B

### Requirement: Verify and roll back
After installing, the system SHALL verify that the provider identity matches the selected account. On mismatch or error it MUST restore the previous field values (or file) and record `rolled_back`.

#### Scenario: Verification fails
- **WHEN** the installed login reports a different identity
- **THEN** the previous login is restored, concurrent changes to other keys survive, and the audit log records `rolled_back`

### Requirement: Crash safety
Every mutating step SHALL be preceded by an fsynced journal entry, and the next operation that takes the switch lock MUST first complete or reverse an interrupted switch.

#### Scenario: Crash mid-switch
- **WHEN** the process dies after installing but before recording the switch
- **THEN** the next operation recovers from the journal and logs `recovered`

#### Scenario: New login after a crash
- **WHEN** the process died mid-switch and the user then logged in to another account
- **THEN** recovery leaves the new login in place and records that it kept the live login

### Requirement: Live owner already selected
When the live tokens already belong to the selected account, the system SHALL save them as that account's newest snapshot and mark it active without installing an older snapshot, and SHALL correct Claude's `oauthAccount` to match.

#### Scenario: Switch back after drift
- **WHEN** account A is live with fresh tokens while B is marked active, and the user switches to A
- **THEN** A's fresh tokens stay live and become A's newest snapshot

### Requirement: Codex identity per seat
The Codex account identity SHALL combine `tokens.account_id` with the user's email (or `sub`), so seats of one ChatGPT workspace are separate accounts.

#### Scenario: Two seats in one workspace
- **WHEN** the user captures two logins that share one `account_id` but have different emails
- **THEN** two accounts exist and switching between them installs each one's own tokens

### Requirement: Running sessions require force
When a provider CLI process (including the Codex app-server daemon) is running, a switch SHALL be refused with `needsForce` and a warning that the session may write the old account back, unless the caller passes `force`.

#### Scenario: Claude session open
- **WHEN** a `claude` process is running and the user switches without force
- **THEN** the switch is refused with the process listed and a `refused` audit row

### Requirement: Audit every attempt
Every switch attempt SHALL be recorded with target, from, to, actor, outcome (`ok`, `refused`, `rolled_back`, `recovered`, `failed`) and message.

#### Scenario: Successful switch logged
- **WHEN** a switch completes
- **THEN** one `ok` row is written in the same transaction that updates the active account
