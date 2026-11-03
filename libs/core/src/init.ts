import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { readConfig, writeConfig, DEFAULT_HOST, DEFAULT_PORT, type AhConfig } from './config.js';
import { openDb, type Db } from './db/index.js';
import { migrate } from './db/migrate.js';
import { AlreadyInitializedError } from './errors.js';
import { ensureDir } from './fs-safe.js';
import { hashPassword } from './password.js';
import { resolvePaths, type AhPaths } from './paths.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Create the ~/.ah folders with mode 0700 and remove stale temp entries. */
export function prepareAhDirs(paths: AhPaths, now = new Date()): void {
  for (const dir of [paths.ahDir, paths.profilesDir, paths.sharedDir, paths.backupsDir, paths.tmpDir]) ensureDir(dir, 0o700);
  for (const entry of readdirSync(paths.tmpDir)) {
    const full = path.join(paths.tmpDir, entry);
    if (now.getTime() - statSync(full).mtimeMs > DAY_MS) rmSync(full, { recursive: true, force: true });
  }
}

/** Open ~/.ah/ah.db and bring its schema up to date. */
export function openAhDb(paths: AhPaths, now?: () => Date): Db {
  prepareAhDirs(paths, now?.());
  const db = openDb(paths.dbFile);
  migrate(db, { backupsDir: paths.backupsDir, now });
  return db;
}

export interface InitOptions {
  homeDir: string;
  password: string;
  reset?: boolean;
  now?: () => Date;
}

export interface InitResult {
  paths: AhPaths;
  reset: boolean;
}

export async function initAh(opts: InitOptions): Promise<InitResult> {
  process.umask(0o077);
  const paths = resolvePaths(opts.homeDir);
  const now = opts.now ?? (() => new Date());
  const exists = existsSync(paths.configFile);
  if (exists && !opts.reset) throw new AlreadyInitializedError(paths.ahDir);

  const admin = await hashPassword(opts.password);
  const db = openAhDb(paths, now);
  try {
    const config: AhConfig = exists
      ? { ...readConfig(paths), admin }
      : { version: 1, port: DEFAULT_PORT, host: DEFAULT_HOST, admin, createdAt: now().toISOString() };
    writeConfig(paths, config);
    if (exists) db.exec('DELETE FROM sessions');
  } finally {
    db.close();
  }
  return { paths, reset: exists };
}
