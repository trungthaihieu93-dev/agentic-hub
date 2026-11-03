import type { Actor, LogOutcome, TargetId } from '@agentic-hub/shared';
import type { Db } from './db/index.js';
import type { Account } from './targets/types.js';

interface AccountRow {
  id: string;
  target: TargetId;
  label: string;
  identity_key: string | null;
  email: string | null;
  org_name: string | null;
  token_fingerprint: string | null;
  profile_path: string;
  created_at: string;
  captured_at: string;
}

const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  target: r.target,
  label: r.label,
  identityKey: r.identity_key,
  email: r.email,
  orgName: r.org_name,
  tokenFingerprint: r.token_fingerprint,
  profilePath: r.profile_path,
  createdAt: r.created_at,
  capturedAt: r.captured_at,
});

export function getAccount(db: Db, id: string): Account | null {
  const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  return r ? toAccount(r) : null;
}

export function findAccountByIdentity(db: Db, target: TargetId, identityKey: string): Account | null {
  const r = db.prepare('SELECT * FROM accounts WHERE target = ? AND identity_key = ?').get(target, identityKey) as AccountRow | undefined;
  return r ? toAccount(r) : null;
}

export function findAccountByLabel(db: Db, target: TargetId, label: string): Account | null {
  const r = db.prepare('SELECT * FROM accounts WHERE target = ? AND label = ?').get(target, label) as AccountRow | undefined;
  return r ? toAccount(r) : null;
}

export function listAccountsFor(db: Db, target?: TargetId): Account[] {
  const rows = (
    target
      ? db.prepare('SELECT * FROM accounts WHERE target = ? ORDER BY label COLLATE NOCASE').all(target)
      : db.prepare('SELECT * FROM accounts ORDER BY target, label COLLATE NOCASE').all()
  ) as unknown as AccountRow[];
  return rows.map(toAccount);
}

export function insertAccount(db: Db, a: Account): void {
  db.prepare(
    `INSERT INTO accounts (id, target, label, identity_key, email, org_name, token_fingerprint, profile_path, created_at, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(a.id, a.target, a.label, a.identityKey, a.email, a.orgName, a.tokenFingerprint, a.profilePath, a.createdAt, a.capturedAt);
}

export function updateSnapshotMeta(db: Db, id: string, m: { fingerprint: string | null; email?: string | null; orgName?: string | null; capturedAt: string }): void {
  db.prepare(
    'UPDATE accounts SET token_fingerprint = ?, email = COALESCE(?, email), org_name = COALESCE(?, org_name), captured_at = ? WHERE id = ?',
  ).run(m.fingerprint, m.email ?? null, m.orgName ?? null, m.capturedAt, id);
}

export function deleteAccountRow(db: Db, id: string): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

export function getActiveId(db: Db, target: TargetId): string | null {
  const r = db.prepare('SELECT account_id FROM active_accounts WHERE target = ?').get(target) as { account_id: string | null } | undefined;
  return r?.account_id ?? null;
}

export function getActive(db: Db, target: TargetId): Account | null {
  const id = getActiveId(db, target);
  return id ? getAccount(db, id) : null;
}

export function setActive(db: Db, target: TargetId, accountId: string | null, at: string): void {
  db.prepare(
    'INSERT INTO active_accounts (target, account_id, switched_at) VALUES (?, ?, ?) ON CONFLICT(target) DO UPDATE SET account_id = excluded.account_id, switched_at = excluded.switched_at',
  ).run(target, accountId, at);
}

export interface LiveStatus {
  target: TargetId;
  identityKey: string | null;
  email: string | null;
  orgName: string | null;
  loggedIn: boolean;
  drift: boolean;
  checkedAt: string;
}

export function getLiveStatus(db: Db, target: TargetId): LiveStatus | null {
  const r = db.prepare('SELECT * FROM live_status WHERE target = ?').get(target) as
    | { identity_key: string | null; email: string | null; org_name: string | null; logged_in: number; drift: number; checked_at: string }
    | undefined;
  if (!r) return null;
  return { target, identityKey: r.identity_key, email: r.email, orgName: r.org_name, loggedIn: r.logged_in === 1, drift: r.drift === 1, checkedAt: r.checked_at };
}

export function setLiveStatus(db: Db, s: LiveStatus): void {
  db.prepare(
    `INSERT INTO live_status (target, identity_key, email, org_name, logged_in, drift, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(target) DO UPDATE SET identity_key = excluded.identity_key, email = excluded.email, org_name = excluded.org_name,
       logged_in = excluded.logged_in, drift = excluded.drift, checked_at = excluded.checked_at`,
  ).run(s.target, s.identityKey, s.email, s.orgName, s.loggedIn ? 1 : 0, s.drift ? 1 : 0, s.checkedAt);
}

export interface LogEntry {
  target: TargetId;
  fromAccountId: string | null;
  toAccountId: string | null;
  actor: Actor;
  outcome: LogOutcome;
  message: string | null;
  createdAt: string;
}

export function logSwitch(db: Db, e: LogEntry): void {
  db.prepare(
    'INSERT INTO switch_log (target, from_account_id, to_account_id, actor, outcome, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(e.target, e.fromAccountId, e.toAccountId, e.actor, e.outcome, e.message, e.createdAt);
}
