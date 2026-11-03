## ADDED Requirements

### Requirement: Login page
The dashboard SHALL show a single password field and an error message on a wrong password, and SHALL send unauthenticated users to the login page.

#### Scenario: Wrong password
- **WHEN** the user submits a wrong password
- **THEN** an error is shown and focus returns to the password field

### Requirement: Account board
The dashboard SHALL show one card per target with the active account, the live identity, the saved accounts with a Switch action, a capture action, the add-account instruction, running-process badges, unsaved snapshots and, for desktop targets, a note that sessions are per account while MCP config is shared.

#### Scenario: Drift shown
- **WHEN** a target has drift
- **THEN** its card shows a banner with "Capture as…" and "Switch back"

### Requirement: Switch flow
Switching SHALL go through a confirm dialog. On a running-session refusal the dialog MUST list the sessions, explain the risk and offer "Switch anyway"; on an app-running refusal it MUST say to quit the app first.

#### Scenario: Sessions running
- **WHEN** the server answers 409 with warnings
- **THEN** the dialog lists the processes and offers "Switch anyway"

#### Scenario: App running
- **WHEN** the server answers 423
- **THEN** the dialog says to quit the app first

### Requirement: Audit view
The dashboard SHALL list the last 50 switch attempts with time, target, from, to, actor, outcome and message.

#### Scenario: Refusals listed
- **WHEN** a switch was refused
- **THEN** the audit view shows it with outcome `refused`
