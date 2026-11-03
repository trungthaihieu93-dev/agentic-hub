## ADDED Requirements

### Requirement: Capture current login
The system SHALL capture the live login of a target as a named account. For CLI targets it MUST resolve the token owner through the provider's own data before saving, add a new version to an existing account with the same identity, and otherwise create a new account. Labels MUST match `^[\w .-]{1,40}$` and MUST NOT start with a dot.

#### Scenario: New identity
- **WHEN** the user captures `claude-cli` as `work` and no saved account has that identity
- **THEN** a new account `work` is created with a 0600 snapshot under `~/.ah/profiles/claude-cli/<id>/v<timestamp>/`

#### Scenario: Known identity
- **WHEN** the live login belongs to an existing account
- **THEN** a new snapshot version is added to that account instead of creating a duplicate

#### Scenario: Unsafe label
- **WHEN** the label contains `/` or starts with a dot
- **THEN** the capture is rejected and nothing is written

### Requirement: Versioned snapshots
Each account SHALL keep its last three snapshot versions with a `current` symlink to the newest good one, replaced atomically.

#### Scenario: Old versions pruned
- **WHEN** a fourth snapshot is taken for an account
- **THEN** the oldest version is removed and `current` points at the newest

### Requirement: List and delete
The system SHALL list accounts per target with the active one marked, and SHALL delete a saved profile only when the account is not active.

#### Scenario: Delete active account refused
- **WHEN** the user deletes the active account
- **THEN** the request is refused and the profile remains

### Requirement: Live identity and drift
The system SHALL record the live identity per CLI target and MUST flag drift when the live token owner differs from the active account. When the live owner is the active account and its tokens changed, it SHALL add a fresh snapshot version unless a switch holds the lock.

#### Scenario: Session writes back an old login
- **WHEN** the live credential file changes to tokens owned by a different account than the active one
- **THEN** the target shows drift until the next successful switch

### Requirement: Responses never expose secrets
API responses and CLI output MUST NOT contain access tokens, refresh tokens, fingerprints or file contents.

#### Scenario: Accounts listing
- **WHEN** the dashboard lists accounts
- **THEN** each entry contains only id, label, email, organisation, capture time and the active flag
