import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TargetId } from '@agentic-hub/shared';
import { procsOf, type CoreDeps } from '../context.js';
import { AhError, ValidationError } from '../errors.js';
import { ensureDir, fsyncDir, writeFileAtomic } from '../fs-safe.js';
import { listProcesses, procInfo, procOpenPaths, type ProcInfo } from '../processes.js';
import { currentVersionDir, listVersions, setCurrent } from '../profiles.js';
import type { AccountTarget, RollbackHandle, SwitchPlan } from './types.js';

export const DATA_DIR = 'data';

export function sameDevice(a: string, b: string): boolean {
  return statSync(a).dev === statSync(b).dev;
}

function isUnder(p: string, dir: string): boolean {
  return p === dir || p.startsWith(dir + path.sep);
}

export interface AppRunningInput {
  dataDir: string;
  appBinary: string;
  hostname: string;
  procs: ProcInfo[];
  /** Helper binaries that may hold files in the data dir without being the app (e.g. a browser's native host). */
  ignoreExes?: string[];
}

/** Parse an Electron SingletonLock target, `<hostname>-<pid>`. */
export function parseSingletonLock(target: string): { host: string; pid: number } | null {
  const dash = target.lastIndexOf('-');
  if (dash <= 0) return null;
  const pid = Number(target.slice(dash + 1));
  return Number.isInteger(pid) && pid > 0 ? { host: target.slice(0, dash), pid } : null;
}

/**
 * The app runs when (a) its SingletonLock names this host and a live process of the app's exact
 * binary, or (b) any process holds a file or its working directory inside the data dir.
 */
export function appProcesses(input: AppRunningInput): ProcInfo[] {
  const found = new Map<number, ProcInfo>();
  try {
    const lock = parseSingletonLock(readlinkSync(path.join(input.dataDir, 'SingletonLock')));
    if (lock && lock.host === input.hostname) {
      const info = procInfo(lock.pid);
      if (info && input.appBinary && info.exe === input.appBinary) found.set(info.pid, info);
    }
  } catch {
    /* no lock: the app is not running from this dir */
  }
  if (existsSync(input.dataDir)) {
    const real = realpathSync(input.dataDir);
    const ignore = new Set(input.ignoreExes ?? []);
    for (const p of input.procs) {
      if (found.has(p.pid) || (p.exe && ignore.has(p.exe))) continue;
      if (procOpenPaths(p.pid).some((open) => isUnder(open, real))) found.set(p.pid, p);
    }
  }
  return [...found.values()];
}

export interface ElectronTargetConfig {
  id: Extract<TargetId, 'claude-desktop' | 'codex-desktop'>;
  liveDir: string;
  appBinary: string;
  /** Files carried across every switch so they stay the same for all accounts. */
  sharedFiles: string[];
  ignoreExes?: string[];
  launch?: { cmd: string; args: string[] };
  disabledReason?: string;
}

function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Copy the shared files from `fromDir` into `toDir`, skipping ones that do not exist. */
export function carrySharedFiles(names: string[], fromDir: string, toDir: string): void {
  for (const name of names) {
    const src = path.join(fromDir, name);
    if (!existsSync(src)) continue;
    ensureDir(toDir);
    writeFileAtomic(path.join(toDir, name), readFileSync(src), statSync(src).mode & 0o777);
  }
}

/** Create the data dir of a new, empty desktop account, seeded with the shared files only. */
export function seedEmptyProfile(sharedFiles: string[], liveDir: string, versionDir: string): void {
  const data = path.join(versionDir, DATA_DIR);
  ensureDir(data);
  carrySharedFiles(sharedFiles, liveDir, data);
}

/** Switches a desktop app by renaming its whole data dir in and out of ~/.ah/profiles. */
export function electronTarget(deps: CoreDeps, cfg: ElectronTargetConfig): AccountTarget {
  const { paths } = deps;
  const sharedStore = path.join(paths.sharedDir, cfg.id);
  const procs = () => (deps.listProcesses ? procsOf(deps) : listProcesses());

  const move = (from: string, to: string) => {
    renameSync(from, to);
    fsyncDir(path.dirname(from));
    if (path.dirname(to) !== path.dirname(from)) fsyncDir(path.dirname(to));
  };

  return {
    id: cfg.id,
    identity: 'none',
    rollback: 'rename',
    requiresAppClosed: true,
    sharedFiles: cfg.sharedFiles,
    enabled: () => (cfg.disabledReason ? { ok: false, reason: cfg.disabledReason } : { ok: true }),

    async runningProcesses() {
      return appProcesses({
        dataDir: cfg.liveDir,
        appBinary: cfg.appBinary,
        hostname: (deps.hostname ?? os.hostname)(),
        procs: procs(),
        ignoreExes: cfg.ignoreExes,
      });
    },
    readLiveIdentity: async () => null,
    resolveLiveOwner: async () => ({ kind: 'unknown', reason: 'desktop apps are tracked by the active account' }),
    liveFingerprint: async () => null,
    fingerprintOf: async () => null,
    snapshotTo: async () => {
      throw new AhError('unsupported', 'Desktop data dirs are moved, not copied');
    },

    assertCapturable() {
      if (!existsSync(cfg.liveDir)) throw new ValidationError(`${cfg.liveDir} does not exist; start the app and sign in first`);
    },

    seedEmpty(versionDir: string) {
      seedEmptyProfile(cfg.sharedFiles, cfg.liveDir, versionDir);
    },

    async prepareRollback(plan: SwitchPlan): Promise<RollbackHandle> {
      if (!plan.outgoingVersionDir) throw new AhError('no_outgoing', 'The current desktop data has no account to move into');
      return {
        kind: 'rename',
        liveDir: cfg.liveDir,
        moves: [
          { from: cfg.liveDir, to: path.join(plan.outgoingVersionDir, DATA_DIR) },
          { from: path.join(plan.incomingDir, DATA_DIR), to: cfg.liveDir },
        ],
      };
    },

    async installFrom(plan, handle) {
      if (handle.kind !== 'rename') throw new Error('desktop targets expect a rename handle');
      const same = deps.sameDevice ?? sameDevice;
      if (!same(paths.configDir, paths.ahDir)) {
        throw new ValidationError('~/.config and ~/.ah are on different devices, so the data dir cannot be renamed');
      }
      const [out, inc] = handle.moves;
      if (!existsSync(inc.from)) throw new ValidationError(`The saved data for "${plan.incoming.label}" is missing`);
      carrySharedFiles(cfg.sharedFiles, cfg.liveDir, sharedStore);
      if (existsSync(out.from)) {
        move(out.from, out.to);
        setCurrent(path.dirname(path.dirname(out.to)), path.dirname(out.to));
      }
      await deps.hooks?.afterJournal?.('renamed-out');
      move(inc.from, inc.to);
      carrySharedFiles(cfg.sharedFiles, sharedStore, cfg.liveDir);
    },

    async rollbackWith(handle) {
      if (handle.kind !== 'rename') throw new Error('desktop targets expect a rename handle');
      // Reverse whichever renames completed: a move is done when its source is gone and its target exists.
      // If both exist, something (usually the app itself) recreated a dir after the crash; refuse to
      // guess which one holds the real data.
      let restored = false;
      for (const m of [...handle.moves].reverse()) {
        const fromExists = existsSync(m.from);
        const toExists = existsSync(m.to);
        // Only the live dir's own move can be ambiguous: the app recreated ~/.config/<App> after it
        // was moved out. For the incoming move, a source that still exists just means "not done".
        if (fromExists && toExists && m.from === handle.liveDir) {
          throw new AhError('recovery_conflict', `Both ${m.from} and ${m.to} exist; move one aside by hand, then run ah again`);
        }
        if (toExists && !fromExists) {
          ensureDir(path.dirname(m.from));
          move(m.to, m.from);
          restored = true;
        }
      }
      // Drop the outgoing version dir made for this switch and point `current` back at real data.
      const outVersion = path.dirname(handle.moves[0].to);
      const accountDir = path.dirname(outVersion);
      if (existsSync(outVersion) && !existsSync(handle.moves[0].to)) rmSync(outVersion, { recursive: true, force: true });
      const cur = currentVersionDir(accountDir);
      if (cur && !existsSync(path.join(cur, DATA_DIR))) {
        const withData = listVersions(accountDir).filter((v) => existsSync(path.join(accountDir, v, DATA_DIR)));
        const last = withData[withData.length - 1];
        if (last) setCurrent(accountDir, path.join(accountDir, last));
        else unlinkSync(path.join(accountDir, 'current'));
      }
      return restored ? 'restored' : 'unchanged';
    },

    async verifyInstalled(plan) {
      if (!existsSync(cfg.liveDir)) return { ok: false, reason: `${cfg.liveDir} is missing after the swap` };
      if (existsSync(path.join(plan.incomingDir, DATA_DIR))) return { ok: false, reason: 'the incoming data dir was not moved into place' };
      for (const name of cfg.sharedFiles) {
        const kept = readOrNull(path.join(sharedStore, name));
        if (kept !== null && kept !== readOrNull(path.join(cfg.liveDir, name))) return { ok: false, reason: `${name} was not carried across` };
      }
      return { ok: true };
    },

    critical: (fn) => fn(),

    relaunch() {
      if (!cfg.launch) return;
      if (deps.launch) return deps.launch(cfg.launch.cmd, cfg.launch.args);
      spawn(cfg.launch.cmd, cfg.launch.args, { detached: true, stdio: 'ignore' }).unref();
    },
  };
}
