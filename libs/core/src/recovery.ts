import { TARGET_INFO } from '@agentic-hub/shared';
import { nowOf, type CoreDeps } from './context.js';
import { AhError } from './errors.js';
import { transaction } from './db/index.js';
import { clearJournal, readJournal } from './journal.js';
import { withLock, type LockOptions } from './lock.js';
import { logSwitch, setActive, setLiveStatus, getAccount } from './repo.js';
import { getTarget } from './targets/index.js';

export interface RecoveryResult {
  recovered: boolean;
  action?: 'nothing_changed' | 'rolled_back' | 'kept_live' | 'completed';
  message?: string;
}

/**
 * Finish or reverse a switch that was interrupted. A switch that reached `verified` only lacks
 * its bookkeeping, which is completed; anything earlier is rolled back with the journaled handle.
 * Must run while holding the switch lock.
 */
export async function recoverFromJournal(deps: CoreDeps): Promise<RecoveryResult> {
  const j = readJournal(deps.paths);
  if (!j) return { recovered: false };
  const at = nowOf(deps).toISOString();
  let action: RecoveryResult['action'];
  let message: string;

  if (j.step === 'verified') {
    const to = getAccount(deps.db, j.to);
    transaction(deps.db, () => {
      setActive(deps.db, j.target, j.to, at);
      if (to) setLiveStatus(deps.db, { target: j.target, identityKey: to.identityKey, email: to.email, orgName: to.orgName, loggedIn: true, drift: false, checkedAt: at });
      logSwitch(deps.db, { target: j.target, fromAccountId: j.from, toAccountId: j.to, actor: 'recovery', outcome: 'recovered', message: 'Completed the bookkeeping of an interrupted switch', createdAt: at });
    });
    action = 'completed';
    message = 'Completed an interrupted switch';
  } else if (j.handle && j.step !== 'started') {
    const t = getTarget(deps, j.target);
    if (t.requiresAppClosed && (await t.runningProcesses()).length > 0) {
      throw new AhError('recovery_blocked', `Quit ${TARGET_INFO[j.target].displayName} so ah can finish recovering an interrupted switch`);
    }
    const handle = j.handle;
    // Same provider lock as a switch; a login made after the crash is never overwritten.
    const outcome = await t.critical(() => t.rollbackWith(handle));
    message =
      outcome === 'kept-live'
        ? `A switch interrupted at step "${j.step}" was not undone: the live login changed after the crash, so it was kept`
        : `Rolled back a switch interrupted at step "${j.step}"`;
    logSwitch(deps.db, { target: j.target, fromAccountId: j.from, toAccountId: j.to, actor: 'recovery', outcome: 'recovered', message, createdAt: at });
    action = outcome === 'kept-live' ? 'kept_live' : 'rolled_back';
  } else {
    logSwitch(deps.db, { target: j.target, fromAccountId: j.from, toAccountId: j.to, actor: 'recovery', outcome: 'recovered', message: 'An interrupted switch had not changed anything', createdAt: at });
    action = 'nothing_changed';
    message = 'An interrupted switch had not changed anything';
  }
  clearJournal(deps.paths);
  return { recovered: true, action, message };
}

/** Take the switch lock, recover any interrupted switch first, then run `fn`. */
export async function withSwitchLock<T>(deps: CoreDeps, fn: () => Promise<T>, opts?: LockOptions): Promise<T> {
  return withLock(
    deps.paths.lockFile,
    async () => {
      await recoverFromJournal(deps);
      return fn();
    },
    opts,
  );
}
