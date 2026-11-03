import { execFile } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import {
  procIdentity,
  readBootId,
  readLockOwner,
  readStartTime,
  writeFileAtomic,
  type AhPaths,
  type ProcIdentity,
} from '@agentic-hub/core';

export interface PidRecord {
  pid: number;
  port: number;
  startTime: string;
  bootId: string;
  /** Path of the script that started the server; must appear in its cmdline. */
  entry: string;
}

/** Everything the single-instance check asks of the system, injectable for tests. */
export interface InstanceProbes {
  identity(pid: number): ProcIdentity | null;
  health(port: number): Promise<boolean>;
  /** PID listening on the port, -1 when held by a process we cannot see, null when free. */
  portOwner(port: number): Promise<number | null>;
  lockHolder(): number | null;
  kill(pid: number, signal: NodeJS.Signals): void;
  sleep(ms: number): Promise<void>;
}

export function defaultProbes(paths: AhPaths): InstanceProbes {
  return {
    identity: procIdentity,
    health: async (port) => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
        const body = (await r.json()) as { app?: string };
        return r.ok && body.app === 'ah';
      } catch {
        return false;
      }
    },
    portOwner: (port) =>
      new Promise((resolve) => {
        execFile('ss', ['-ltnpH', `sport = :${port}`], (err, stdout) => {
          if (err || !stdout.trim()) return resolve(null);
          const m = /pid=(\d+)/.exec(stdout);
          resolve(m ? Number(m[1]) : -1);
        });
      }),
    lockHolder: () => readLockOwner(paths.lockFile)?.pid ?? null,
    kill: (pid, signal) => process.kill(pid, signal),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

export function readPidRecord(paths: AhPaths): PidRecord | null {
  try {
    return JSON.parse(readFileSync(paths.pidFile, 'utf8')) as PidRecord;
  } catch {
    return null;
  }
}

export function writePidRecord(paths: AhPaths, port: number, entry: string): void {
  const rec: PidRecord = { pid: process.pid, port, startTime: readStartTime(process.pid) ?? '', bootId: readBootId(), entry };
  writeFileAtomic(paths.pidFile, JSON.stringify(rec), 0o600);
}

export function removePidRecord(paths: AhPaths): void {
  const rec = readPidRecord(paths);
  if (rec?.pid !== process.pid) return;
  try {
    unlinkSync(paths.pidFile);
  } catch {
    /* already gone */
  }
}

export type InstanceDecision =
  | { action: 'reuse'; port: number }
  | { action: 'start'; note?: string }
  | { action: 'blocked'; message: string };

function sameAhProcess(rec: PidRecord, probes: InstanceProbes): boolean {
  const id = probes.identity(rec.pid);
  return !!id && id.startTime === rec.startTime && id.bootId === rec.bootId && !!rec.entry && id.cmdline.includes(rec.entry);
}

/**
 * Decide whether to reuse a running ah server, stop a stale one, or start fresh. A process is
 * signalled only when its PID, start time, boot id and cmdline all match the pid file, it owns
 * the listening socket, and it does not hold the switch lock.
 */
export async function resolveInstance(paths: AhPaths, port: number, probes: InstanceProbes): Promise<InstanceDecision> {
  const rec = readPidRecord(paths);
  let note: string | undefined;
  if (rec) {
    if (sameAhProcess(rec, probes)) {
      if (await probes.health(rec.port)) return { action: 'reuse', port: rec.port };
      const owner = await probes.portOwner(rec.port);
      if (owner !== rec.pid) {
        return { action: 'blocked', message: `A stale ah server (PID ${rec.pid}) is not answering and does not own port ${rec.port}; stop it manually` };
      }
      if (probes.lockHolder() === rec.pid) {
        return { action: 'blocked', message: `The stale ah server (PID ${rec.pid}) is in the middle of a switch; try again shortly` };
      }
      probes.kill(rec.pid, 'SIGTERM');
      // Give it 5 s to drain; while it holds the switch lock it is finishing a switch, so wait up
      // to 30 s more rather than kill it mid-switch.
      for (let i = 0; i < 350 && probes.identity(rec.pid); i++) {
        if (i >= 50 && probes.lockHolder() !== rec.pid) break;
        await probes.sleep(100);
      }
      if (sameAhProcess(rec, probes)) probes.kill(rec.pid, 'SIGKILL');
      note = `Stopped a stale ah server (PID ${rec.pid})`;
    } else {
      note = 'Removed a stale pid file';
    }
    try {
      unlinkSync(paths.pidFile);
    } catch {
      /* already gone */
    }
  }
  const owner = await probes.portOwner(port);
  if (owner !== null) {
    const who = owner > 0 ? `PID ${owner}` : 'a process owned by another user';
    return { action: 'blocked', message: `Port ${port} is already used by ${who}; stop it or run \`ah serve --port <n>\`` };
  }
  return { action: 'start', note };
}
