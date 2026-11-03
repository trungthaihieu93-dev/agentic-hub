// Inlined as a string because the esbuild CLI bundle cannot load `.sql` files.
export const sql = `
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL CHECK (target IN ('claude-cli','codex-cli','claude-desktop','codex-desktop')),
  label TEXT NOT NULL,
  identity_key TEXT,
  email TEXT,
  org_name TEXT,
  token_fingerprint TEXT,
  profile_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE (target, label),
  UNIQUE (target, identity_key)
);
CREATE TABLE active_accounts (
  target TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  switched_at TEXT NOT NULL
);
CREATE TABLE live_status (
  target TEXT PRIMARY KEY,
  identity_key TEXT,
  email TEXT,
  org_name TEXT,
  logged_in INTEGER NOT NULL DEFAULT 0,
  drift INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL
);
CREATE TABLE switch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  actor TEXT NOT NULL CHECK (actor IN ('cli','dashboard','recovery')),
  outcome TEXT NOT NULL CHECK (outcome IN ('ok','refused','rolled_back','recovered','failed')),
  message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX switch_log_created ON switch_log (created_at);
CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
`;
