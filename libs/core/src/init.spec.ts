import { readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { initAh, openAhDb } from './init.js';
import { readConfig } from './config.js';
import { verifyPassword } from './password.js';
import { makeTempHome, type TempHome } from './testing/temp-home.js';

describe('initAh', () => {
  let t: TempHome;
  let umask: number;
  beforeEach(() => {
    t = makeTempHome();
    umask = process.umask(0o002);
  });
  afterEach(() => {
    process.umask(umask);
    t.cleanup();
  });

  it('creates ~/.ah, the config with only a hash, and a migrated db', async () => {
    process.umask(0o002);
    const { paths } = await initAh({ homeDir: t.homeDir, password: 'password-1' });
    expect(statSync(paths.ahDir).mode & 0o777).toBe(0o700);
    expect(statSync(paths.profilesDir).mode & 0o777).toBe(0o700);
    expect(statSync(paths.configFile).mode & 0o777).toBe(0o600);
    const raw = readFileSync(paths.configFile, 'utf8');
    expect(raw).not.toContain('password-1');
    expect(await verifyPassword('password-1', readConfig(paths).admin)).toBe(true);
    const db = new DatabaseSync(paths.dbFile);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    db.close();
    expect(tables).toEqual(expect.arrayContaining(['accounts', 'active_accounts', 'live_status', 'schema_migrations', 'sessions', 'switch_log']));
  });

  it('refuses a second run without reset', async () => {
    const { paths } = await initAh({ homeDir: t.homeDir, password: 'password-1' });
    const before = readFileSync(paths.configFile, 'utf8');
    await expect(initAh({ homeDir: t.homeDir, password: 'password-2' })).rejects.toThrow(/already initialised/);
    expect(readFileSync(paths.configFile, 'utf8')).toBe(before);
  });

  it('reset replaces only the admin hash, clears sessions and keeps accounts', async () => {
    const { paths } = await initAh({ homeDir: t.homeDir, password: 'password-1' });
    const created = readConfig(paths).createdAt;
    const db = openAhDb(paths);
    db.prepare("INSERT INTO accounts (id,target,label,profile_path,created_at,captured_at) VALUES ('a','claude-cli','work','claude-cli/a','t','t')").run();
    db.prepare("INSERT INTO sessions VALUES ('h','2099','t')").run();
    db.close();
    await initAh({ homeDir: t.homeDir, password: 'password-2', reset: true });
    const cfg = readConfig(paths);
    expect(cfg.createdAt).toBe(created);
    expect(await verifyPassword('password-2', cfg.admin)).toBe(true);
    const db2 = openAhDb(paths);
    expect(db2.prepare('SELECT COUNT(*) n FROM accounts').get()).toMatchObject({ n: 1 });
    expect(db2.prepare('SELECT COUNT(*) n FROM sessions').get()).toMatchObject({ n: 0 });
    db2.close();
  });
});
