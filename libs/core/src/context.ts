import { execFile } from 'node:child_process';
import type { Db } from './db/index.js';
import type { FetchLike } from './identity.js';
import type { AhPaths } from './paths.js';
import { listProcesses, type ProcInfo } from './processes.js';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}
export type CommandRunner = (cmd: string, args: string[]) => Promise<CommandResult>;

export const runCommand: CommandRunner = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20_000, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      let code = 0;
      if (err) {
        const e = err as { code?: unknown; killed?: boolean; signal?: string | null };
        if (e.code === 'ENOENT') code = 127;
        else if (e.killed || e.signal) code = 124; // timed out or killed
        else code = typeof e.code === 'number' ? e.code : 1;
      }
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });

/** Test hooks for injecting failures at precise points of a switch. */
export interface EngineHooks {
  /** Called right after the journal records `step`. A test may kill the process here. */
  afterJournal?(step: string): void | Promise<void>;
  /** Called inside the final bookkeeping transaction, before COMMIT. */
  beforeCommit?(): void;
}

/** Everything core needs from the outside world, injectable for tests. */
export interface CoreDeps {
  paths: AhPaths;
  db: Db;
  now?: () => Date;
  fetch?: FetchLike;
  run?: CommandRunner;
  listProcesses?: () => ProcInfo[];
  /** Overrides `os.hostname()` for the desktop SingletonLock check. */
  hostname?: () => string;
  /** Overrides each desktop app's main binary path (tests point it at the node binary). */
  appBinaries?: Partial<Record<'claude-desktop' | 'codex-desktop', string>>;
  /** Overrides the device check used before a desktop rename swap. */
  sameDevice?: (a: string, b: string) => boolean;
  /** Spawns a detached process to relaunch a desktop app. */
  launch?: (cmd: string, args: string[]) => void;
  hooks?: EngineHooks;
}

export function nowOf(deps: CoreDeps): Date {
  return deps.now ? deps.now() : new Date();
}

export function procsOf(deps: CoreDeps): ProcInfo[] {
  return (deps.listProcesses ?? listProcesses)();
}

export function fetchOf(deps: CoreDeps): FetchLike {
  return deps.fetch ?? ((url, init) => fetch(url, init));
}
