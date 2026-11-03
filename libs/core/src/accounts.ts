import { existsSync, rmSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { TARGET_INFO, type TargetId } from '@agentic-hub/shared';
import { nowOf, type CoreDeps } from './context.js';
import { transaction } from './db/index.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { ensureDir, resolveInside } from './fs-safe.js';
import { parseLabel } from './labels.js';
import { accountDir, createVersionDir, listVersions, profilePathFor, setCurrent, unsavedDir, UNSAVED } from './profiles.js';
import { withSwitchLock } from './recovery.js';
import {
  deleteAccountRow,
  findAccountByIdentity,
  findAccountByLabel,
  getAccount,
  getActiveId,
  insertAccount,
  listAccountsFor,
  setActive,
  setLiveStatus,
  updateSnapshotMeta,
} from './repo.js';
import { getTarget } from './targets/index.js';
import type { Account, AccountTarget } from './targets/types.js';
import type { Identity } from './identity.js';

export function listAccounts(deps: CoreDeps, target?: TargetId): Account[] {
  return listAccountsFor(deps.db, target);
}

export function resolveAccountByLabel(deps: CoreDeps, target: TargetId, label: string): Account {
  const a = findAccountByLabel(deps.db, target, label);
  if (!a) throw new NotFoundError(`No ${TARGET_INFO[target].displayName} account named "${label}"`);
  return a;
}

/** Save the live tokens as a new version of `account` and make it the current one. */
export async function snapshotAccountVersion(deps: CoreDeps, t: AccountTarget, account: Account, identity?: Identity): Promise<string> {
  const dir = createVersionDir(accountDir(deps.paths, account.profilePath), nowOf(deps));
  await t.snapshotTo(dir, identity);
  setCurrent(path.dirname(dir), dir);
  updateSnapshotMeta(deps.db, account.id, {
    fingerprint: await t.fingerprintOf(dir),
    email: identity?.email,
    orgName: identity?.orgName,
    capturedAt: nowOf(deps).toISOString(),
  });
  return dir;
}

export interface CaptureResult {
  account: Account;
  created: boolean;
  /** Set when the live login already belonged to an account with a different label. */
  note?: string;
}

/** Capture the live login of `target` as a named account. */
export async function captureAccount(deps: CoreDeps, input: { target: TargetId; label: string }): Promise<CaptureResult> {
  const label = parseLabel(input.label);
  const t = getTarget(deps, input.target);
  const enabled = t.enabled();
  if (!enabled.ok) throw new ValidationError(enabled.reason);
  return withSwitchLock(deps, async () => (t.identity === 'token' ? captureToken(deps, t, label) : captureDesktop(deps, t, label)));
}

async function captureToken(deps: CoreDeps, t: AccountTarget, label: string): Promise<CaptureResult> {
  const name = TARGET_INFO[t.id].displayName;
  const owner = await t.resolveLiveOwner();
  if (owner.kind !== 'owner') throw new ValidationError(`Cannot confirm who owns the current ${name} login: ${owner.reason}`);
  const at = nowOf(deps).toISOString();
  const existing = findAccountByIdentity(deps.db, t.id, owner.identity.identityKey);
  let account: Account;
  let created = false;
  let note: string | undefined;
  if (existing) {
    await snapshotAccountVersion(deps, t, existing, owner.identity);
    account = getAccount(deps.db, existing.id) as Account;
    if (existing.label !== label) note = `This login is already saved as "${existing.label}"; added a fresh snapshot to it`;
  } else {
    if (findAccountByLabel(deps.db, t.id, label)) throw new ConflictError(`A ${name} account named "${label}" already exists`);
    const id = randomUUID();
    account = {
      id,
      target: t.id,
      label,
      identityKey: owner.identity.identityKey,
      email: owner.identity.email,
      orgName: owner.identity.orgName,
      tokenFingerprint: null,
      profilePath: profilePathFor(t.id, id),
      createdAt: at,
      capturedAt: at,
    };
    insertAccount(deps.db, account);
    try {
      await snapshotAccountVersion(deps, t, account, owner.identity);
    } catch (err) {
      deleteAccountRow(deps.db, id);
      rmSync(accountDir(deps.paths, account.profilePath), { recursive: true, force: true });
      throw err;
    }
    account = getAccount(deps.db, id) as Account;
    created = true;
  }
  transaction(deps.db, () => {
    setActive(deps.db, t.id, account.id, at);
    setLiveStatus(deps.db, { target: t.id, identityKey: account.identityKey, email: account.email, orgName: account.orgName, loggedIn: true, drift: false, checkedAt: at });
  });
  return { account, created, note };
}

/** Desktop capture labels the live data dir; it moves into the profile on the first switch away. */
async function captureDesktop(deps: CoreDeps, t: AccountTarget, label: string): Promise<CaptureResult> {
  const name = TARGET_INFO[t.id].displayName;
  const active = getActiveId(deps.db, t.id);
  if (active) {
    const a = getAccount(deps.db, active);
    throw new ConflictError(`The live ${name} data is already captured as "${a?.label}"`);
  }
  if (findAccountByLabel(deps.db, t.id, label)) throw new ConflictError(`A ${name} account named "${label}" already exists`);
  t.assertCapturable?.();
  const at = nowOf(deps).toISOString();
  const id = randomUUID();
  const account: Account = {
    id,
    target: t.id,
    label,
    identityKey: null,
    email: null,
    orgName: null,
    tokenFingerprint: null,
    profilePath: profilePathFor(t.id, id),
    createdAt: at,
    capturedAt: at,
  };
  ensureDir(accountDir(deps.paths, account.profilePath));
  transaction(deps.db, () => {
    insertAccount(deps.db, account);
    setActive(deps.db, t.id, id, at);
  });
  return { account, created: true };
}

/**
 * Add a new, empty desktop account that holds only the shared files. Switching to it starts the
 * app logged out, and the user signs in inside the app.
 */
export async function addEmptyDesktopAccount(deps: CoreDeps, input: { target: TargetId; label: string }): Promise<Account> {
  const label = parseLabel(input.label);
  const t = getTarget(deps, input.target);
  if (t.identity !== 'none' || !t.seedEmpty) throw new ValidationError('Empty accounts exist only for desktop apps; log in with the CLI and capture instead');
  const enabled = t.enabled();
  if (!enabled.ok) throw new ValidationError(enabled.reason);
  return withSwitchLock(deps, async () => {
    if (findAccountByLabel(deps.db, t.id, label)) throw new ConflictError(`A ${TARGET_INFO[t.id].displayName} account named "${label}" already exists`);
    const at = nowOf(deps).toISOString();
    const id = randomUUID();
    const account: Account = {
      id,
      target: t.id,
      label,
      identityKey: null,
      email: null,
      orgName: null,
      tokenFingerprint: null,
      profilePath: profilePathFor(t.id, id),
      createdAt: at,
      capturedAt: at,
    };
    const dir = createVersionDir(accountDir(deps.paths, account.profilePath), nowOf(deps));
    t.seedEmpty?.(dir);
    setCurrent(path.dirname(dir), dir);
    insertAccount(deps.db, account);
    return account;
  });
}

/** Delete a saved profile. The active account is never deleted. */
export async function deleteAccount(deps: CoreDeps, id: string): Promise<void> {
  await withSwitchLock(deps, async () => {
    const a = getAccount(deps.db, id);
    if (!a) throw new NotFoundError('No such account');
    if (getActiveId(deps.db, a.target) === id) throw new ConflictError(`"${a.label}" is the active account; switch to another account first`);
    deleteAccountRow(deps.db, id);
    rmSync(accountDir(deps.paths, a.profilePath), { recursive: true, force: true });
  });
}

export interface UnsavedVersion {
  version: string;
  capturedAt: string;
}

export function listUnsaved(deps: CoreDeps, target: TargetId): UnsavedVersion[] {
  const dir = unsavedDir(deps.paths, target);
  return listVersions(dir).map((v) => ({ version: v, capturedAt: statSync(path.join(dir, v)).mtime.toISOString() }));
}

export async function deleteUnsaved(deps: CoreDeps, target: TargetId, version: string): Promise<void> {
  if (!/^v\d{17}(-\d+)?$/.test(version)) throw new ValidationError('Invalid snapshot version');
  await withSwitchLock(deps, async () => {
    const dir = resolveInside(deps.paths.profilesDir, `${target}/${UNSAVED}/${version}`);
    if (!existsSync(dir)) throw new NotFoundError('No such unsaved snapshot');
    rmSync(dir, { recursive: true, force: true });
  });
}
