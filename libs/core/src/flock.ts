import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AhError } from './errors.js';

export interface FlockOptions {
  /** How long to wait for the lock; fractions are allowed. Default 10 s. */
  waitSeconds?: number;
  /** Fail at once instead of waiting. */
  nonBlocking?: boolean;
}

/**
 * Hold an exclusive flock(2) on `file` while `fn` runs, using util-linux `flock(1)` because Node has
 * no flock. The kernel drops the lock when the holder dies, so a crash never leaves a stale lock:
 * the helper exits as soon as its stdin (our end of the pipe) closes.
 */
export async function withFlock<T>(file: string, fn: () => Promise<T>, opts: FlockOptions = {}): Promise<T> {
  if (!existsSync(path.dirname(file))) return fn();
  const mode = opts.nonBlocking ? ['--nonblock'] : ['--wait', String(opts.waitSeconds ?? 10)];
  const child = spawn('flock', ['--exclusive', ...mode, file, 'sh', '-c', 'echo locked; exec cat >/dev/null'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
  await new Promise<void>((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      if (out.includes('locked')) resolve();
    });
    child.on('error', (e) => reject(new AhError('flock_failed', `Could not run flock: ${e.message}`)));
    void exited.then((code) => reject(new AhError('flock_busy', `Could not lock ${file} (flock exited ${code})`)));
  });
  try {
    return await fn();
  } finally {
    child.stdin.end();
    await exited;
  }
}

/** True when some process holds an flock on `file` right now. */
export function isFlockHeld(file: string): boolean {
  if (!existsSync(file)) return false;
  return spawnSync('flock', ['--exclusive', '--nonblock', file, 'true']).status !== 0;
}
