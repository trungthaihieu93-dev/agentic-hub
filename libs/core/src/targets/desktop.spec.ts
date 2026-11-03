import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { addEmptyDesktopAccount, captureAccount } from '../accounts.js';
import { listAudit } from '../audit.js';
import { readJournal } from '../journal.js';
import { getActive } from '../repo.js';
import { switchAccount } from '../switch-engine.js';
import { makeEnv, type TestEnv } from '../testing/fixtures.js';
import { makeTempHome, type TempHome } from '../testing/temp-home.js';
import { getTarget } from './index.js';
import { appProcesses, parseSingletonLock } from './electron-dir.js';
import { listProcesses } from '../processes.js';

const MCP = JSON.stringify({ mcpServers: { files: { command: 'npx', args: ['fs'] } } });

describe('claude-desktop', () => {
  let t: TempHome;
  let env: TestEnv;
  let live: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    t = makeTempHome();
    env = makeEnv(t.homeDir, { appBinaries: { 'claude-desktop': process.execPath }, hostname: () => 'testhost' });
    live = env.paths.claudeDesktopDir;
    mkdirSync(path.join(live, 'Local Storage'), { recursive: true });
    writeFileSync(path.join(live, 'Local Storage', 'session'), 'account-A-session');
    writeFileSync(path.join(live, 'claude_desktop_config.json'), MCP);
  });
  afterEach(() => {
    for (const c of children.splice(0)) c.kill('SIGKILL');
    env.deps.db.close();
    t.cleanup();
  });

  async function setupAB() {
    const a = (await captureAccount(env.deps, { target: 'claude-desktop', label: 'personal' })).account;
    const b = await addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'work' });
    return { a, b };
  }

  it('parses SingletonLock targets whose host name contains dashes', () => {
    expect(parseSingletonLock('my-host-123')).toEqual({ host: 'my-host', pid: 123 });
    expect(parseSingletonLock('nohyphen')).toBeNull();
  });

  it('refuses while SingletonLock points at a live process of the app binary', async () => {
    const { b } = await setupAB();
    symlinkSync(`testhost-${process.pid}`, path.join(live, 'SingletonLock'));
    const r = await switchAccount(env.deps, { target: 'claude-desktop', accountId: b.id, actor: 'dashboard' });
    expect(r).toMatchObject({ outcome: 'refused', appRunning: true });
    expect(r.message).toMatch(/Quit Claude desktop first/);
    expect(listAudit(env.deps.db)[0]).toMatchObject({ outcome: 'refused' });
  });

  it('does not refuse for a live PID whose binary is something else, or a lock from another host', async () => {
    const { b } = await setupAB();
    const deps2 = { ...env.deps, appBinaries: { 'claude-desktop': '/usr/lib/claude-desktop/claude-desktop' } };
    symlinkSync(`testhost-${process.pid}`, path.join(live, 'SingletonLock'));
    expect(await getTarget(deps2, 'claude-desktop').runningProcesses()).toEqual([]);
    const deps3 = { ...env.deps, hostname: () => 'otherhost' };
    expect(await getTarget(deps3, 'claude-desktop').runningProcesses()).toEqual([]);
    expect((await switchAccount(deps2, { target: 'claude-desktop', accountId: b.id, actor: 'cli' })).outcome).toBe('ok');
  });

  it('refuses when a process holds its working directory inside the data dir', async () => {
    await setupAB();
    const child = spawn('sleep', ['30'], { cwd: path.join(live, 'Local Storage') });
    children.push(child);
    await new Promise((r) => setTimeout(r, 100));
    const deps = { ...env.deps, listProcesses: undefined };
    const procs = await getTarget(deps, 'claude-desktop').runningProcesses();
    expect(procs.map((p) => p.pid)).toContain(child.pid);
  });

  it('ignores helper binaries such as the Chrome native host that only keep a log open', async () => {
    mkdirSync(path.join(live, 'logs'), { recursive: true });
    const child = spawn('sleep', ['30'], { cwd: path.join(live, 'logs') });
    children.push(child);
    await new Promise((r) => setTimeout(r, 100));
    const sleepExe = (await import('node:fs')).realpathSync(`/proc/${child.pid}/exe`);
    const procs = appProcesses({ dataDir: live, appBinary: '/nope', hostname: 'testhost', procs: listProcesses(), ignoreExes: [sleepExe] });
    expect(procs.map((p) => p.pid)).not.toContain(child.pid);
  });

  it('A -> B -> A restores the original dir and keeps the shared MCP config in both profiles', async () => {
    const { a, b } = await setupAB();
    const r1 = await switchAccount(env.deps, { target: 'claude-desktop', accountId: b.id, actor: 'cli' });
    expect(r1.outcome).toBe('ok');
    expect(existsSync(path.join(live, 'Local Storage'))).toBe(false); // B is empty
    expect(readFileSync(path.join(live, 'claude_desktop_config.json'), 'utf8')).toBe(MCP);
    // The user signs in to B and edits the MCP config in the app.
    writeFileSync(path.join(live, 'b-session'), 'account-B-session');
    const MCP2 = MCP.replace('fs', 'fs2');
    writeFileSync(path.join(live, 'claude_desktop_config.json'), MCP2);

    const r2 = await switchAccount(env.deps, { target: 'claude-desktop', accountId: a.id, actor: 'cli' });
    expect(r2.outcome).toBe('ok');
    expect(readFileSync(path.join(live, 'Local Storage', 'session'), 'utf8')).toBe('account-A-session');
    expect(existsSync(path.join(live, 'b-session'))).toBe(false);
    expect(readFileSync(path.join(live, 'claude_desktop_config.json'), 'utf8')).toBe(MCP2);
    expect(getActive(env.deps.db, 'claude-desktop')?.id).toBe(a.id);

    const r3 = await switchAccount(env.deps, { target: 'claude-desktop', accountId: b.id, actor: 'cli' });
    expect(r3.outcome).toBe('ok');
    expect(readFileSync(path.join(live, 'b-session'), 'utf8')).toBe('account-B-session');
    expect(readFileSync(path.join(live, 'claude_desktop_config.json'), 'utf8')).toBe(MCP2);
  });

  it('refuses across devices without touching anything', async () => {
    const { b } = await setupAB();
    const deps = { ...env.deps, sameDevice: () => false };
    const r = await switchAccount(deps, { target: 'claude-desktop', accountId: b.id, actor: 'cli' });
    expect(r.outcome).toBe('rolled_back');
    expect(r.message).toMatch(/different devices/);
    expect(readFileSync(path.join(live, 'Local Storage', 'session'), 'utf8')).toBe('account-A-session');
  });

  it('refuses to switch away from desktop data that was never captured', async () => {
    const b = await addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'work' });
    const r = await switchAccount(env.deps, { target: 'claude-desktop', accountId: b.id, actor: 'cli' });
    expect(r.outcome).toBe('refused');
    expect(r.message).toMatch(/Capture the current/);
  });

  it('recovers a crash after the first rename from the journal', async () => {
    const { a } = await setupAB();
    const b = (await addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'other' })).id;
    env.deps.db.close();
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(import.meta.dirname, '../testing/crash-child.ts'), t.homeDir, b, 'renamed-out', 'journal', 'claude-desktop'],
      { encoding: 'utf8' },
    );
    expect(child.signal).toBe('SIGKILL');
    expect(existsSync(live)).toBe(false); // the live dir was moved out, nothing moved in
    expect(readJournal(env.paths)?.step).toBe('installing');

    env = makeEnv(t.homeDir, { appBinaries: { 'claude-desktop': process.execPath }, hostname: () => 'testhost' });
    await addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'third' }); // any locked call recovers first
    expect(readJournal(env.paths)).toBeNull();
    expect(readFileSync(path.join(live, 'Local Storage', 'session'), 'utf8')).toBe('account-A-session');
    expect(getActive(env.deps.db, 'claude-desktop')?.id).toBe(a.id);
    expect(listAudit(env.deps.db).some((e) => e.outcome === 'recovered')).toBe(true);
    // A's profile still points at real data after the rollback.
    const r = await switchAccount(env.deps, { target: 'claude-desktop', accountId: b, actor: 'cli' });
    expect(r.outcome).toBe('ok');
    expect((await switchAccount(env.deps, { target: 'claude-desktop', accountId: a.id, actor: 'cli' })).outcome).toBe('ok');
    expect(readFileSync(path.join(live, 'Local Storage', 'session'), 'utf8')).toBe('account-A-session');
  }, 30_000);

  it('has no separate codex-desktop target: the Codex desktop app shares the CLI login', async () => {
    await expect(captureAccount(env.deps, { target: 'codex-desktop', label: 'x' })).rejects.toThrow(/Unknown target/);
  });

  it('recovery refuses while the app runs, and refuses to guess when the app recreated its dir', async () => {
    const { a } = await setupAB();
    const b = (await addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'other' })).id;
    env.deps.db.close();
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(import.meta.dirname, '../testing/crash-child.ts'), t.homeDir, b, 'renamed-out', 'journal', 'claude-desktop'],
      { encoding: 'utf8' },
    );
    expect(child.signal).toBe('SIGKILL');
    // The user opens the app, which recreates an empty data dir and runs.
    mkdirSync(live, { recursive: true });
    symlinkSync(`testhost-${process.pid}`, path.join(live, 'SingletonLock'));
    env = makeEnv(t.homeDir, { appBinaries: { 'claude-desktop': process.execPath }, hostname: () => 'testhost' });
    await expect(addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'x1' })).rejects.toThrow(/Quit Claude desktop/);
    // App quit, but the recreated dir is still there: keep the journal and ask the user.
    rmSync(path.join(live, 'SingletonLock'));
    await expect(addEmptyDesktopAccount(env.deps, { target: 'claude-desktop', label: 'x2' })).rejects.toThrow(/Both .* exist/);
    expect(readJournal(env.paths)).not.toBeNull();
    expect(getActive(env.deps.db, 'claude-desktop')?.id).toBe(a.id);
  }, 30_000);
});
