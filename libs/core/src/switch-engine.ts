import path from 'node:path';
import { TARGET_INFO, type Actor, type Proc, type SwitchResult, type TargetId } from '@agentic-hub/shared';
import { snapshotAccountVersion } from './accounts.js';
import { nowOf, type CoreDeps } from './context.js';
import { transaction } from './db/index.js';
import { AhError, NotFoundError, ValidationError } from './errors.js';
import { clearJournal, writeJournal, type Journal, type JournalStep } from './journal.js';
import type { ProcInfo } from './processes.js';
import { accountDir, createVersionDir, currentVersionDir, listVersions, pruneVersions, unsavedDir } from './profiles.js';
import { withSwitchLock } from './recovery.js';
import { findAccountByIdentity, getAccount, getActive, getLiveStatus, logSwitch, setActive, setLiveStatus } from './repo.js';
import { getTarget } from './targets/index.js';
import type { Account, AccountTarget, RollbackHandle, RollbackOutcome, SwitchPlan } from './targets/types.js';

export interface SwitchOptions {
  target: TargetId;
  accountId: string;
  actor: Actor;
  force?: boolean;
  relaunch?: boolean;
}

export const FORCE_WARNING =
  'A forced switch can make a running session write the old account back, and that session may need a new login.';

/** `_unsaved` keeps this many snapshots; older ones are pruned. */
const KEEP_UNSAVED = 10;

function toProc(p: ProcInfo): Proc {
  const name = p.exe ? path.basename(p.exe) : (p.cmdline[0] ?? `pid ${p.pid}`);
  return { pid: p.pid, name, cmdline: p.cmdline.join(' ').slice(0, 300) };
}

function result(r: Partial<SwitchResult> & Pick<SwitchResult, 'outcome' | 'message'>): SwitchResult {
  return { warnings: [], needsForce: false, appRunning: false, ...r };
}

interface OutgoingSnapshot {
  unsavedVersion?: string;
  note?: string;
  /** Identity key of whoever owns the live tokens, when known. */
  liveOwnerKey?: string;
}

/**
 * Save the live tokens before they are replaced. Tokens are filed only under the account the
 * provider says owns them; unknown or unresolvable owners go to `_unsaved`, never onto a guess.
 */
async function snapshotOutgoing(deps: CoreDeps, t: AccountTarget, active: Account | null): Promise<OutgoingSnapshot> {
  const fp = await t.liveFingerprint();
  if (!fp) return {};
  if (active && active.tokenFingerprint === fp) return { liveOwnerKey: active.identityKey ?? undefined };
  const owner = await t.resolveLiveOwner();
  if (owner.kind === 'owner') {
    const acc = findAccountByIdentity(deps.db, t.id, owner.identity.identityKey);
    if (acc) {
      await snapshotAccountVersion(deps, t, acc, owner.identity);
      return { liveOwnerKey: owner.identity.identityKey };
    }
  }
  const dir = createVersionDir(unsavedDir(deps.paths, t.id), nowOf(deps));
  await t.snapshotTo(dir, owner.kind === 'owner' ? owner.identity : undefined);
  pruneVersions(path.dirname(dir), KEEP_UNSAVED);
  const why = owner.kind === 'owner' ? `they belong to ${owner.identity.email ?? 'an account'} that is not saved` : `their owner is unknown (${owner.reason})`;
  return {
    unsavedVersion: path.basename(dir),
    note: `The live tokens were saved under "unsaved" because ${why}.`,
    liveOwnerKey: owner.kind === 'owner' ? owner.identity.identityKey : undefined,
  };
}

/** True when `_unsaved` holds a snapshot taken after the account's current one. */
function newerUnsavedExists(deps: CoreDeps, t: AccountTarget, incomingDir: string): boolean {
  const unsaved = listVersions(unsavedDir(deps.paths, t.id));
  const newest = unsaved[unsaved.length - 1];
  return !!newest && newest > path.basename(incomingDir);
}

const ROLLBACK_NOTE: Record<RollbackOutcome, string> = {
  restored: '',
  unchanged: '',
  'kept-live': ' The live login changed meanwhile, so it was left as it is.',
};

export async function switchAccount(deps: CoreDeps, opts: SwitchOptions): Promise<SwitchResult> {
  const t = getTarget(deps, opts.target);
  const name = TARGET_INFO[t.id].displayName;
  const enabled = t.enabled();
  if (!enabled.ok) throw new ValidationError(enabled.reason);

  return withSwitchLock(deps, async () => {
    const incoming = getAccount(deps.db, opts.accountId);
    if (!incoming || incoming.target !== t.id) throw new NotFoundError(`No ${name} account with that id`);
    const active = getActive(deps.db, t.id);
    const at = () => nowOf(deps).toISOString();
    const log = (outcome: 'ok' | 'refused' | 'rolled_back' | 'failed', message: string) =>
      logSwitch(deps.db, { target: t.id, fromAccountId: active?.id ?? null, toAccountId: incoming.id, actor: opts.actor, outcome, message, createdAt: at() });
    const markActive = (message: string) =>
      transaction(deps.db, () => {
        setActive(deps.db, t.id, incoming.id, at());
        setLiveStatus(deps.db, {
          target: t.id,
          identityKey: incoming.identityKey,
          email: incoming.email,
          orgName: incoming.orgName,
          loggedIn: true,
          drift: false,
          checkedAt: at(),
        });
        log('ok', message);
        deps.hooks?.beforeCommit?.();
      });

    // Already active, with the live tokens unchanged and no drift flagged?
    if (active?.id === incoming.id) {
      const drifted = getLiveStatus(deps.db, t.id)?.drift ?? false;
      const unchanged = t.identity === 'none' || (!drifted && (await t.liveFingerprint()) === active.tokenFingerprint);
      if (unchanged) {
        const message = `"${incoming.label}" is already the active ${name} account`;
        log('refused', message);
        return result({ outcome: 'refused', message });
      }
    }

    // Running processes.
    const procs = (await t.runningProcesses()).map(toProc);
    if (procs.length > 0 && t.requiresAppClosed) {
      const message = `Quit ${name} first; it is still running`;
      log('refused', message);
      return result({ outcome: 'refused', message, warnings: procs, appRunning: true });
    }
    if (procs.length > 0 && !opts.force) {
      const message = `${procs.length} ${name} process(es) are running. ${FORCE_WARNING}`;
      log('refused', message);
      return result({ outcome: 'refused', message, warnings: procs, needsForce: true });
    }

    if (t.identity === 'none' && !active && t.requiresAppClosed) {
      const message = `Capture the current ${name} data as an account first, so it is not lost when switching`;
      log('refused', message);
      return result({ outcome: 'refused', message });
    }

    const incomingAccountDir = accountDir(deps.paths, incoming.profilePath);
    if (!currentVersionDir(incomingAccountDir)) {
      const message = `"${incoming.label}" has no saved snapshot to switch to`;
      log('failed', message);
      return result({ outcome: 'failed', message });
    }

    const journal: Journal = { step: 'started', target: t.id, from: active?.id ?? null, to: incoming.id, actor: opts.actor, handle: null, startedAt: at() };
    const step = async (s: JournalStep, handle?: RollbackHandle) => {
      journal.step = s;
      if (handle) journal.handle = handle;
      writeJournal(deps.paths, journal);
      await deps.hooks?.afterJournal?.(s);
    };

    const run = async (): Promise<SwitchResult> => {
      await step('started');
      let outgoing: OutgoingSnapshot = {};
      let handle: RollbackHandle | null = null;
      const rollBack = async (why: string): Promise<SwitchResult> => {
        let message = `Switch to "${incoming.label}" rolled back: ${why}`;
        try {
          if (handle) message += ROLLBACK_NOTE[await t.rollbackWith(handle)];
        } catch (err) {
          message += `. Restoring the previous login also failed (${(err as Error).message}); the journal is kept for recovery`;
          log('failed', message);
          return result({ outcome: 'failed', message, unsavedVersion: outgoing.unsavedVersion });
        }
        clearJournal(deps.paths);
        log('rolled_back', message);
        return result({ outcome: 'rolled_back', message, unsavedVersion: outgoing.unsavedVersion });
      };

      let plan: SwitchPlan;
      try {
        if (t.identity === 'token') outgoing = await snapshotOutgoing(deps, t, active);
        // The live tokens already belong to the incoming account: they were just saved as its
        // newest snapshot, so installing an older one would replace fresh tokens with stale ones.
        if (t.identity === 'token' && outgoing.liveOwnerKey && outgoing.liveOwnerKey === incoming.identityKey) {
          const savedDir = currentVersionDir(incomingAccountDir);
          if (savedDir) await t.alignLiveMetadata?.(savedDir);
          const message = `"${incoming.label}" was already the live ${name} login; marked it active and saved its current tokens.`;
          markActive(message);
          clearJournal(deps.paths);
          return result({ outcome: 'ok', message, warnings: procs });
        }
        // Read the incoming snapshot only now, after any fresh tokens of that account were saved.
        const incomingDir = currentVersionDir(incomingAccountDir) as string;
        plan = {
          incoming,
          incomingDir,
          outgoing: active,
          outgoingVersionDir: t.identity === 'none' && active ? createVersionDir(accountDir(deps.paths, active.profilePath), nowOf(deps)) : null,
        };
        handle = await t.prepareRollback(plan);
        await step('installing', handle);
        await t.installFrom(plan, handle);
      } catch (err) {
        if (!handle) {
          clearJournal(deps.paths);
          const message = `Switch to "${incoming.label}" failed before anything changed: ${(err as Error).message}`;
          log('failed', message);
          return result({ outcome: 'failed', message, unsavedVersion: outgoing.unsavedVersion });
        }
        return rollBack((err as Error).message);
      }

      await step('installed');
      let verified;
      try {
        verified = await t.verifyInstalled(plan);
      } catch (err) {
        verified = { ok: false, reason: (err as Error).message };
      }
      if (!verified.ok) return rollBack(verified.reason ?? 'verification failed');

      await step('verified');
      const staleWarning =
        t.identity === 'token' && newerUnsavedExists(deps, t, plan.incomingDir)
          ? 'An unsaved snapshot is newer than this account\'s saved login; if it asks you to log in again, log in and capture it again.'
          : undefined;
      const notes = [outgoing.note, verified.warning, staleWarning, procs.length > 0 ? FORCE_WARNING : undefined].filter(Boolean).join(' ');
      const message = `Switched ${name} to "${incoming.label}".${notes ? ' ' + notes : ''}`;
      markActive(message);
      clearJournal(deps.paths);
      if (opts.relaunch && t.relaunch) t.relaunch();
      return result({ outcome: 'ok', message, warnings: procs, unsavedVersion: outgoing.unsavedVersion });
    };

    try {
      return await t.critical(run);
    } catch (err) {
      // The provider lock could not be taken: nothing was changed.
      if (err instanceof AhError && err.code.startsWith('flock_')) {
        clearJournal(deps.paths);
        log('failed', err.message);
        return result({ outcome: 'failed', message: err.message });
      }
      throw err;
    }
  });
}
