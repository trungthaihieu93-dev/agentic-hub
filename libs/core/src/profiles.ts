import { existsSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { TargetId } from '@agentic-hub/shared';
import { ensureDir, fsyncDir, resolveInside } from './fs-safe.js';
import type { AhPaths } from './paths.js';

export const KEEP_VERSIONS = 3;
export const UNSAVED = '_unsaved';

/** `v<YYYYMMDDHHmmssSSS>` in UTC; sorts in time order. */
export function versionName(d: Date): string {
  return 'v' + d.toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
}

/** Absolute dir of an account profile (`<target>/<accountId>`), always inside profilesDir. */
export function accountDir(paths: AhPaths, profilePath: string): string {
  return resolveInside(paths.profilesDir, profilePath);
}

export function profilePathFor(target: TargetId, key: string): string {
  return `${target}/${key}`;
}

/** Create a fresh, empty version dir under `dir` and return its absolute path. */
export function createVersionDir(dir: string, now: Date): string {
  ensureDir(dir);
  let name = versionName(now);
  let n = 1;
  while (existsSync(path.join(dir, name))) name = `${versionName(now)}-${n++}`;
  const full = path.join(dir, name);
  ensureDir(full);
  return full;
}

export function listVersions(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^v\d{17}(-\d+)?$/.test(n))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export function currentVersionDir(dir: string): string | null {
  const link = path.join(dir, 'current');
  try {
    return path.join(dir, readlinkSync(link));
  } catch {
    return null;
  }
}

/** Point `current` at `versionDir` atomically, then drop all but the newest versions. */
export function setCurrent(dir: string, versionDir: string): void {
  const tmp = path.join(dir, `.current-${randomBytes(4).toString('hex')}`);
  symlinkSync(path.basename(versionDir), tmp);
  renameSync(tmp, path.join(dir, 'current'));
  fsyncDir(dir);
  pruneVersions(dir);
}

export function pruneVersions(dir: string, keep = KEEP_VERSIONS): void {
  const current = currentVersionDir(dir);
  const versions = listVersions(dir);
  for (const v of versions.slice(0, Math.max(0, versions.length - keep))) {
    const full = path.join(dir, v);
    // A version holding a desktop data dir is an account's only copy of its app data.
    if (full !== current && !existsSync(path.join(full, 'data'))) rmSync(full, { recursive: true, force: true });
  }
}

export function unsavedDir(paths: AhPaths, target: TargetId): string {
  return resolveInside(paths.profilesDir, `${target}/${UNSAVED}`);
}
