import { readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Db } from './index.js';
import { MIGRATIONS, type Migration } from './migrations/index.js';
import { ensureDir } from '../fs-safe.js';

const KEEP_BACKUPS = 5;

function currentVersion(db: Db): number {
  const t = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!t) return 0;
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  return row.v ?? 0;
}

function hasTables(db: Db): boolean {
  const row = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get() as { n: number };
  return row.n > 0;
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
}

function pruneBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => /^ah-\d+\.db$/.test(f))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) unlinkSync(path.join(dir, f));
}

export interface MigrateOptions {
  backupsDir: string;
  now?: () => Date;
  migrations?: Migration[];
  /** Test hook: runs after the backup and before BEGIN IMMEDIATE. */
  beforeTransaction?: () => void;
}

export interface MigrateResult {
  applied: number[];
  backup: string | null;
}

/**
 * Apply pending migrations. An existing database is first copied with VACUUM INTO (which
 * cannot run inside a transaction); the migrations then run in one BEGIN IMMEDIATE transaction
 * that re-reads the version, so two processes never apply the same migration.
 */
export function migrate(db: Db, opts: MigrateOptions): MigrateResult {
  const list = opts.migrations ?? MIGRATIONS;
  const now = opts.now ?? (() => new Date());
  const pending = list.filter((m) => m.version > currentVersion(db));
  if (pending.length === 0) return { applied: [], backup: null };

  let backup: string | null = null;
  if (hasTables(db)) {
    ensureDir(opts.backupsDir);
    backup = path.join(opts.backupsDir, `ah-${stamp(now())}.db`);
    db.prepare('VACUUM INTO ?').run(backup);
    pruneBackups(opts.backupsDir);
  }
  opts.beforeTransaction?.();

  const applied: number[] = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = currentVersion(db);
    for (const m of list.filter((x) => x.version > version).sort((a, b) => a.version - b.version)) {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, now().toISOString());
      applied.push(m.version);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { applied, backup };
}
