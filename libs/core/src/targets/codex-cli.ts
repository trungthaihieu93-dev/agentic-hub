import { readFileSync } from 'node:fs';
import path from 'node:path';
import { procsOf, runCommand, type CoreDeps } from '../context.js';
import { withFlock } from '../flock.js';
import { codexOwner, sha256, type CodexAuthFile } from '../identity.js';
import { procIdentity, procInfo, readBootId, type ProcInfo } from '../processes.js';
import type { AccountTarget, RollbackHandle } from './types.js';
import { readJsonOrNull, restoreFile } from './json-files.js';

const AUTH_FILE = 'auth.json';

function readRaw(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** The app-server daemon, counted only when its recorded boot id and start ticks still match. */
export function codexDaemonProcess(pidFile: string): ProcInfo | null {
  const d = readJsonOrNull<{ pid?: number; processIdentity?: { bootId?: string; startTicks?: number } }>(pidFile);
  if (!d?.pid) return null;
  const id = procIdentity(d.pid);
  if (!id) return null;
  const recorded = d.processIdentity;
  if (!recorded || recorded.bootId !== readBootId() || String(recorded.startTicks) !== id.startTime) return null;
  return procInfo(d.pid);
}

/**
 * `codex app-server daemon pid-update-loop` outlives `codex app-server daemon stop`. It holds only
 * its updater lock and log, never auth.json, so it cannot write an old login back.
 */
function isDaemonUpdaterLoop(p: ProcInfo): boolean {
  return p.cmdline.slice(1).join(' ') === 'app-server daemon pid-update-loop';
}

/** Codex CLI: the whole ~/.codex/auth.json is the login and is swapped atomically. */
export function codexCliTarget(deps: CoreDeps): AccountTarget {
  const { paths } = deps;
  const run = deps.run ?? runCommand;
  const liveAuth = () => readJsonOrNull<CodexAuthFile>(paths.codexAuth);

  return {
    id: 'codex-cli',
    identity: 'token',
    rollback: 'file',
    requiresAppClosed: false,
    enabled: () => ({ ok: true }),

    async runningProcesses() {
      const found = new Map<number, ProcInfo>();
      for (const p of procsOf(deps)) {
        if (p.exe && path.basename(p.exe) === 'codex' && !isDaemonUpdaterLoop(p)) found.set(p.pid, p);
      }
      const daemon = codexDaemonProcess(paths.codexDaemonPid);
      if (daemon) found.set(daemon.pid, daemon);
      return [...found.values()];
    },

    async readLiveIdentity() {
      const o = codexOwner(liveAuth());
      return o.kind === 'owner' ? o.identity : null;
    },

    resolveLiveOwner: async () => codexOwner(liveAuth()),

    async liveFingerprint() {
      const t = liveAuth()?.tokens?.refresh_token;
      return t ? sha256(t) : null;
    },

    async snapshotTo(dir) {
      const raw = readRaw(paths.codexAuth);
      if (raw === null) throw new Error('Codex is not logged in (no ~/.codex/auth.json)');
      restoreFile(path.join(dir, AUTH_FILE), raw);
    },

    async fingerprintOf(dir) {
      const t = readJsonOrNull<CodexAuthFile>(path.join(dir, AUTH_FILE))?.tokens?.refresh_token;
      return t ? sha256(t) : null;
    },

    async prepareRollback(plan): Promise<RollbackHandle> {
      const raw = readRaw(path.join(plan.incomingDir, AUTH_FILE));
      if (raw === null) throw new Error(`The saved profile for ${plan.incoming.label} has no auth.json`);
      return { kind: 'file', file: paths.codexAuth, previous: readRaw(paths.codexAuth), installedHash: sha256(raw) };
    },

    async installFrom(plan) {
      const raw = readRaw(path.join(plan.incomingDir, AUTH_FILE));
      if (raw === null) throw new Error(`The saved profile for ${plan.incoming.label} has no auth.json`);
      restoreFile(paths.codexAuth, raw);
    },

    async rollbackWith(handle) {
      if (handle.kind !== 'file') throw new Error('codex-cli expects a file rollback handle');
      const live = readRaw(handle.file);
      if (live === handle.previous) return 'unchanged';
      // Codex (a login or a refresh) rewrote auth.json after the install: never overwrite that.
      if (live === null || sha256(live) !== handle.installedHash) return 'kept-live';
      restoreFile(handle.file, handle.previous);
      return 'restored';
    },

    async verifyInstalled(plan) {
      const owner = codexOwner(liveAuth());
      if (owner.kind !== 'owner' || owner.identity.identityKey !== plan.incoming.identityKey) {
        return { ok: false, reason: 'auth.json does not hold the selected account after the install' };
      }
      const status = await run('codex', ['login', 'status']);
      if (status.code === 127) return { ok: true, warning: 'verification skipped: the codex command was not found' };
      if (status.code === 124) return { ok: true, warning: 'verification skipped: codex login status timed out' };
      if (status.code !== 0) return { ok: false, reason: `codex login status failed: ${status.stderr.trim() || status.stdout.trim()}` };
      return { ok: true };
    },

    critical: (fn) => withFlock(paths.codexAuthLock, fn),
  };
}
