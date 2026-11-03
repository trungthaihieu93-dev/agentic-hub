import { readdirSync } from 'node:fs';
import path from 'node:path';
import { openDb } from './index.js';
import { migrate } from './migrate.js';
import { MIGRATIONS } from './migrations/index.js';
import { makeTempHome, type TempHome } from '../testing/temp-home.js';

describe('migrate', () => {
  let t: TempHome;
  let file: string;
  let backupsDir: string;
  beforeEach(() => {
    t = makeTempHome();
    file = path.join(t.homeDir, 'ah.db');
    backupsDir = path.join(t.homeDir, 'backups');
  });
  afterEach(() => t.cleanup());

  it('applies the initial schema to an empty db without a backup, then is a no-op', () => {
    const db = openDb(file);
    expect(migrate(db, { backupsDir })).toEqual({ applied: [1], backup: null });
    expect(migrate(db, { backupsDir })).toEqual({ applied: [], backup: null });
    db.close();
  });

  it('backs up an existing db before a new migration', () => {
    const db = openDb(file);
    migrate(db, { backupsDir });
    const next = [...MIGRATIONS, { version: 2, sql: 'CREATE TABLE extra (x INTEGER);' }];
    const r = migrate(db, { backupsDir, migrations: next });
    expect(r.applied).toEqual([2]);
    expect(r.backup).not.toBeNull();
    expect(readdirSync(backupsDir)).toHaveLength(1);
    db.close();
  });

  it('keeps the last 5 backups', () => {
    const db = openDb(file);
    migrate(db, { backupsDir });
    const list = [...MIGRATIONS];
    for (let v = 2; v <= 8; v++) {
      list.push({ version: v, sql: `CREATE TABLE t${v} (x INTEGER);` });
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, v));
      migrate(db, { backupsDir, migrations: [...list], now: () => at });
    }
    expect(readdirSync(backupsDir)).toHaveLength(5);
    db.close();
  });

  it('applies a migration once when another connection wins the race', () => {
    const a = openDb(file);
    const b = openDb(file);
    const r = migrate(a, {
      backupsDir,
      beforeTransaction: () => {
        expect(migrate(b, { backupsDir }).applied).toEqual([1]);
      },
    });
    expect(r.applied).toEqual([]);
    expect(a.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).toMatchObject({ n: 1 });
    a.close();
    b.close();
  });
});
