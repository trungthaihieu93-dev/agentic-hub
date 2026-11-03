import { TARGET_INFO, type TargetId } from '@agentic-hub/shared';
import {
  captureAccount,
  checkLive,
  getActiveId,
  getLiveStatus,
  getTarget,
  listAccounts,
  registeredTargets,
  resolveAccountByLabel,
  switchAccount,
} from '@agentic-hub/core';
import { openCore, type CliContext } from '../cli-context.js';

export async function listCommand(ctx: CliContext): Promise<number> {
  const deps = openCore(ctx);
  try {
    for (const id of registeredTargets()) {
      const t = getTarget(deps, id);
      const enabled = t.enabled();
      if (enabled.ok && t.identity === 'token') await checkLive(deps, id).catch(() => undefined);
      const live = getLiveStatus(deps.db, id);
      const activeId = getActiveId(deps.db, id);
      const head = `${TARGET_INFO[id].displayName} (${id})`;
      const status = !enabled.ok
        ? 'disabled'
        : t.identity === 'token'
          ? live?.loggedIn
            ? `live: ${live.email ?? 'unknown owner'}${live.drift ? '  DRIFT: the live login is not the active account' : ''}`
            : 'live: not logged in'
          : '';
      ctx.out(`${head}${status ? '  ' + status : ''}`);
      const accounts = listAccounts(deps, id);
      if (accounts.length === 0) ctx.out('    (no saved accounts)');
      for (const a of accounts) {
        const mark = a.id === activeId ? '*' : ' ';
        const who = [a.email, a.orgName].filter(Boolean).join(', ');
        ctx.out(`  ${mark} ${a.label}${who ? `  ${who}` : ''}`);
      }
    }
    ctx.out('* = active account');
    return 0;
  } finally {
    deps.db.close();
  }
}

export async function captureCommand(ctx: CliContext, target: TargetId, label: string): Promise<number> {
  const deps = openCore(ctx);
  try {
    const r = await captureAccount(deps, { target, label });
    ctx.out(r.created ? `Captured the current ${TARGET_INFO[target].displayName} login as "${r.account.label}".` : `Saved a fresh snapshot of "${r.account.label}".`);
    if (r.note) ctx.out(r.note);
    return 0;
  } finally {
    deps.db.close();
  }
}

/** Exit codes: 0 ok, 1 failed or rolled back, 2 needs --force, 3 the app is running. */
export async function switchCommand(ctx: CliContext, target: TargetId, label: string, opts: { force: boolean; relaunch: boolean }): Promise<number> {
  const deps = openCore(ctx);
  // Let a switch that already started finish its critical section before the process exits.
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
    ctx.err('Finishing the switch before exiting…');
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const account = resolveAccountByLabel(deps, target, label);
    const r = await switchAccount(deps, { target, accountId: account.id, actor: 'cli', force: opts.force, relaunch: opts.relaunch });
    for (const p of r.warnings) ctx.err(`  running: PID ${p.pid} ${p.name}  ${p.cmdline}`);
    if (r.outcome === 'ok') {
      ctx.out(r.message);
      return 0;
    }
    ctx.err(r.message);
    if (r.needsForce) {
      ctx.err('Run again with --force to switch anyway.');
      return 2;
    }
    if (r.appRunning) return 3;
    return 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    deps.db.close();
    if (interrupted) process.exitCode = 130;
  }
}
