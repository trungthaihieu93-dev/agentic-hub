## ADDED Requirements

### Requirement: One-time initialisation
`ah init` SHALL prompt for the admin password twice on a TTY, create `~/.ah` with mode 0700, write `config.json` with mode 0600 holding only a scrypt hash and its parameters, and create a migrated `ah.db`. It MUST refuse when `~/.ah/config.json` already exists unless `--reset` is given.

#### Scenario: First run
- **WHEN** the user runs `ah init` with no `~/.ah` and enters the same password twice
- **THEN** `~/.ah` exists with mode 0700, `config.json` with mode 0600 contains no plaintext password, and `ah.db` contains all tables

#### Scenario: Second run refused
- **WHEN** the user runs `ah init` again without `--reset`
- **THEN** the command exits non-zero and leaves `config.json` unchanged

#### Scenario: Reset keeps accounts
- **WHEN** the user runs `ah init --reset` and enters a new password
- **THEN** only the admin hash changes, all sessions are removed, and saved accounts remain

### Requirement: Password login
The dashboard SHALL require the admin password and MUST store sessions only as the SHA-256 of a 32-byte random id, in an httpOnly, SameSite=Strict, host-only cookie that expires after 12 hours.

#### Scenario: Wrong password
- **WHEN** a login request carries the wrong password
- **THEN** the server answers 401 and sets no cookie

#### Scenario: Repeated failures slow down
- **WHEN** more than five logins fail in a row
- **THEN** each further attempt is delayed, doubling from one second up to thirty seconds

### Requirement: Canonical origin
The server SHALL bind only to 127.0.0.1 and MUST serve the dashboard and API only for `Host: ah.localhost:<port>`. Mutating requests MUST carry `Origin` equal to the canonical origin and the header `X-AH-Request: 1`.

#### Scenario: Foreign host
- **WHEN** a request arrives with `Host: evil.com`
- **THEN** the server answers 403

#### Scenario: Loopback alias
- **WHEN** a request arrives with `Host: localhost:7427`
- **THEN** `GET /api/health` succeeds, page requests are redirected to `http://ah.localhost:7427`, and other API calls get 403

#### Scenario: Cross-site mutation
- **WHEN** a POST arrives without `Origin`, with a foreign `Origin`, or without `X-AH-Request`
- **THEN** the server answers 403 and changes nothing
