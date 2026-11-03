import { readFileSync, writeFileSync } from 'node:fs';
import { AhError, LockBusyError } from './errors.js';
import { isFlockHeld, withFlock } from './flock.js';
import { readBootId, readStartTime } from './processes.js';

export interface LockOwner {
  pid: number;
  startTime: string;
  bootId: string;
}

/**
 * The switch lock is a kernel flock on `switch.lock`. While held, the file also records its
 * holder for diagnostics (the single-instance check reads it); the record is cleared on release.
 */
export function readLockOwner(file: string): LockOwner | null {
  if (!isFlockHeld(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as LockOwner;
  } catch {
    return null;
  }
}

function busy<T>(err: unknown): T {
  if (err instanceof AhError && err.code === 'flock_busy') throw new LockBusyError();
  throw err;
}

async function held<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const owner: LockOwner = { pid: process.pid, startTime: readStartTime(process.pid) ?? '', bootId: readBootId() };
  writeFileSync(file, JSON.stringify(owner), { mode: 0o600 });
  try {
    return await fn();
  } finally {
    writeFileSync(file, '');
  }
}

export interface LockOptions {
  timeoutMs?: number;
}

/** Run `fn` while holding the switch lock, waiting up to `timeoutMs` for it. */
export async function withLock<T>(file: string, fn: () => Promise<T>, opts: LockOptions = {}): Promise<T> {
  writeFileSync(file, '', { flag: 'a', mode: 0o600 });
  return withFlock(file, () => held(file, fn), { waitSeconds: (opts.timeoutMs ?? 10_000) / 1000 }).catch(busy<T>);
}

/** Run `fn` only if the lock is free right now; never waits. */
export async function tryWithLock<T>(file: string, fn: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
  writeFileSync(file, '', { flag: 'a', mode: 0o600 });
  try {
    const value = await withFlock(file, () => held(file, fn), { nonBlocking: true });
    return { acquired: true, value };
  } catch (err) {
    if (err instanceof AhError && err.code === 'flock_busy') return { acquired: false };
    throw err;
  }
}
