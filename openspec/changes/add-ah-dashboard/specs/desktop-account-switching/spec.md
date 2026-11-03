## ADDED Requirements

### Requirement: Refuse while the app runs
A desktop switch SHALL be refused while the app is running, detected by a `SingletonLock` pointing at a live process of the app's exact binary on this host, or by any process holding a file or working directory inside the data dir.

#### Scenario: App open
- **WHEN** Claude desktop is running and the user switches its account
- **THEN** the switch is refused with "Quit Claude desktop first" and a `refused` audit row

#### Scenario: Unrelated helper
- **WHEN** only an unrelated process such as Chrome's native host is running
- **THEN** the switch is not refused

### Requirement: Rename swap on one device
With the app closed, the system SHALL move the live data dir into the outgoing account's profile and the incoming profile's data dir into place using `rename`, and MUST refuse when `~/.config` and `~/.ah` are on different devices. Each rename is journaled and reversed on failure.

#### Scenario: Swap and swap back
- **WHEN** the user switches A → B → A with the app closed
- **THEN** the original data dir of A is live again, byte for byte

#### Scenario: Crash after first rename
- **WHEN** the process dies after moving the live dir out
- **THEN** the next operation restores it from the journal

### Requirement: Shared MCP config
`claude_desktop_config.json` SHALL be carried across every desktop switch and seeded into empty profiles, so MCP servers stay the same for all accounts. Sessions, worktrees and the rest of the data dir belong to each account.

#### Scenario: MCP servers kept
- **WHEN** the user switches Claude desktop to another account
- **THEN** `claude_desktop_config.json` in the live dir equals the one before the switch

### Requirement: Codex desktop shares the Codex CLI login
The Codex desktop app runs its own `codex app-server` on `~/.codex/auth.json`, so the system SHALL NOT offer a separate Codex desktop target. The `codex-cli` target SHALL cover both, and SHALL count the desktop app's `codex` processes as running sessions.

#### Scenario: Codex desktop open
- **WHEN** the Codex desktop app is running and the user switches the Codex account without force
- **THEN** the switch is refused with `needsForce` and the app's `codex app-server` listed

#### Scenario: Legacy target name
- **WHEN** the user runs `ah switch codex-desktop <label>`
- **THEN** it is treated as `codex-cli`

### Requirement: Helpers that only log are not the app
A process whose executable is a known helper that keeps only a log open in the data dir (Claude desktop's Chrome native host) SHALL NOT count as the app running.

#### Scenario: Chrome open, Claude desktop closed
- **WHEN** Chrome keeps the Claude-in-Chrome native host running and Claude desktop is closed
- **THEN** a Claude desktop switch is not refused

### Requirement: Safe desktop recovery
Recovery of an interrupted desktop switch SHALL refuse while the app runs, and SHALL keep the journal and ask the user when both the live dir and its moved-out copy exist.

#### Scenario: App recreated its dir after a crash
- **WHEN** a crash left the live dir moved out and the app later created a new one
- **THEN** recovery stops with a message naming both paths and nothing is moved
