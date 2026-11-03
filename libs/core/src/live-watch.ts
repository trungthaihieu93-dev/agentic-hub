import type { TargetId } from '@agentic-hub/shared';
import { snapshotAccountVersion } from './accounts.js';
import { nowOf, type CoreDeps } from './context.js';
import { tryWithLock } from './lock.js';
import { getActive, getLiveStatus, setLiveStatus } from './repo.js';
import { getTarget } from './targets/index.js';

export interface LiveCheck {
  target: TargetId;
  loggedIn: boolean;
  drift: boolean;
  /** True when fresh tokens of the active account were saved as a new version. */
  snapshotted: boolean;
  /** True when the snapshot was skipped because a switch or capture held the lock. */
  skippedLocked: boolean;
}

/**
 * Re-check who owns the live tokens of a CLI target. Unchanged tokens need no network call.
 * Fresh tokens of the active account are saved, but only if the switch lock is free right now;
 * tokens owned by anyone else set the drift flag.
 */
export async function checkLive(deps: CoreDeps, target: TargetId): Promise<LiveCheck> {
  const t = getTarget(deps, target);
  const at = nowOf(deps).toISOString();
  const base: LiveCheck = { target, loggedIn: false, drift: false, snapshotted: false, skippedLocked: false };
  if (t.identity !== 'token') return base;

  const active = getActive(deps.db, target);
  const fp = await t.liveFingerprint();
  const display = await t.readLiveIdentity();
  if (!fp) {
    setLiveStatus(deps.db, { target, identityKey: null, email: null, orgName: null, loggedIn: false, drift: false, checkedAt: at });
    return base;
  }
  if (active && active.tokenFingerprint === fp) {
    setLiveStatus(deps.db, { target, identityKey: active.identityKey, email: active.email, orgName: active.orgName, loggedIn: true, drift: false, checkedAt: at });
    return { ...base, loggedIn: true };
  }

  const owner = await t.resolveLiveOwner();
  if (owner.kind !== 'owner') {
    // Owner unknown right now (offline, expired): keep the previous drift flag.
    const prev = getLiveStatus(deps.db, target);
    setLiveStatus(deps.db, {
      target,
      identityKey: display?.identityKey ?? null,
      email: display?.email ?? null,
      orgName: display?.orgName ?? null,
      loggedIn: owner.kind === 'unknown',
      drift: prev?.drift ?? false,
      checkedAt: at,
    });
    return { ...base, loggedIn: owner.kind === 'unknown', drift: prev?.drift ?? false };
  }

  const drift = !!active && owner.identity.identityKey !== active.identityKey;
  setLiveStatus(deps.db, { target, identityKey: owner.identity.identityKey, email: owner.identity.email, orgName: owner.identity.orgName, loggedIn: true, drift, checkedAt: at });
  if (!active || drift) return { ...base, loggedIn: true, drift };

  const r = await tryWithLock(deps.paths.lockFile, async () => {
    // Re-read inside the lock: a switch may have finished in the meantime.
    const still = getActive(deps.db, target);
    if (still?.id !== active.id || (await t.liveFingerprint()) !== fp) return false;
    await snapshotAccountVersion(deps, t, still, owner.identity);
    return true;
  });
  return { ...base, loggedIn: true, drift: false, snapshotted: r.acquired && r.value, skippedLocked: !r.acquired };
}
