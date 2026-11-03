import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { readBootId, readStartTime, resolvePaths, procIdentity, type AhPaths } from '@agentic-hub/core';
import { makeEnv, makeTempHome, writeCodexLogin, type TempHome } from '@agentic-hub/core/testing';
import type { CliContext } from './cli-context.js';
import { promptPassword } from './prompt-password.js';
import { run } from './run.js';
import { resolveInstance, type InstanceProbes, type PidRecord } from './single-instance.js';

function makeCtx(homeDir: string, answers: string[] = []): CliContext & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    homeDir,
    publicDir: '/nonexistent',
    entry: '/opt/ah/main.js',
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    prompt: async () => answers.shift() ?? '',
    lines,
    errors,
  };
}

describe('ah cli', () => {
  let t: TempHome;
  beforeEach(() => (t = makeTempHome()));
  afterEach(() => t.cleanup());

  it('prints help and rejects unknown commands, targets and options', async () => {
    const ctx = makeCtx(t.homeDir);
    expect((await run(['--help'], ctx)).code).toBe(0);
    expect(ctx.lines.join('\n')).toContain('ah switch <target> <label>');
    expect((await run(['frobnicate'], ctx)).code).toBe(64);
    expect((await run(['switch', 'gemini', 'x'], ctx)).code).toBe(64);
    expect((await run(['--bogus'], ctx)).code).toBe(64);
    expect((await run(['serve', '--port', 'abc'], ctx)).code).toBe(64);
  });

  it('init asks twice, refuses a mismatch, and refuses a second run without --reset', async () => {
    expect((await run(['init'], makeCtx(t.homeDir, ['password-1', 'password-2']))).code).toBe(1);
    expect((await run(['init'], makeCtx(t.homeDir, ['short', 'short']))).code).toBe(1);
    const ok = makeCtx(t.homeDir, ['password-1', 'password-1']);
    expect((await run(['init'], ok)).code).toBe(0);
    const again = makeCtx(t.homeDir, ['password-2', 'password-2']);
    expect((await run(['init'], again)).code).toBe(1);
    expect(again.errors.join()).toMatch(/already initialised/);
    expect((await run(['init', '--reset'], makeCtx(t.homeDir, ['password-2', 'password-2']))).code).toBe(0);
  });

  it('serve and list require init first', async () => {
    const ctx = makeCtx(t.homeDir);
    expect((await run(['--no-open'], ctx)).code).toBe(1);
    expect(ctx.errors.join()).toMatch(/ah init/);
    expect((await run(['list'], ctx)).code).toBe(1);
  });

  it('captures, lists and switches codex accounts, with alias targets', async () => {
    await run(['init'], makeCtx(t.homeDir, ['password-1', 'password-1']));
    const env = makeEnv(t.homeDir);
    const ctx = () => Object.assign(makeCtx(t.homeDir), { deps: { listProcesses: () => [], run: async () => ({ code: 0, stdout: '', stderr: '' }) } });
    writeCodexLogin(env, { accountId: 'acct-x', email: 'x@o.com', refresh: 'r-x' });
    expect((await run(['capture', 'codex', 'x'], ctx())).code).toBe(0);
    writeCodexLogin(env, { accountId: 'acct-y', email: 'y@o.com', refresh: 'r-y' });
    expect((await run(['capture', 'codex-cli', 'y'], ctx())).code).toBe(0);
    const l = ctx();
    expect((await run(['list'], l)).code).toBe(0);
    expect(l.lines.join('\n')).toMatch(/\* y {2}y@o\.com/);
    const s = ctx();
    expect((await run(['switch', 'codex', 'x'], s)).code).toBe(0);
    expect(JSON.parse(readFileSync(env.paths.codexAuth, 'utf8')).tokens.account_id).toBe('acct-x');
    const missing = ctx();
    expect((await run(['switch', 'codex', 'nobody'], missing)).code).toBe(1);
    expect(missing.errors.join()).toMatch(/No Codex \(CLI and desktop app\) account named "nobody"/);
    env.deps.db.close();
  });

  it('switch exits 2 when sessions run and --force is missing', async () => {
    await run(['init'], makeCtx(t.homeDir, ['password-1', 'password-1']));
    const env = makeEnv(t.homeDir);
    const procs = [{ pid: 77, exe: '/x/codex', cmdline: ['codex'] }];
    const ctx = () => Object.assign(makeCtx(t.homeDir), { deps: { listProcesses: () => procs, run: async () => ({ code: 0, stdout: '', stderr: '' }) } });
    writeCodexLogin(env, { accountId: 'acct-x', email: 'x@o.com', refresh: 'r-x' });
    await run(['capture', 'codex', 'x'], ctx());
    writeCodexLogin(env, { accountId: 'acct-y', email: 'y@o.com', refresh: 'r-y' });
    await run(['capture', 'codex', 'y'], ctx());
    const c = ctx();
    expect((await run(['switch', 'codex', 'x'], c)).code).toBe(2);
    expect(c.errors.join('\n')).toMatch(/--force/);
    expect((await run(['switch', 'codex', 'x', '--force'], ctx())).code).toBe(0);
    env.deps.db.close();
  });
});

describe('password prompt', () => {
  it('refuses to run without a TTY', async () => {
    const input = new PassThrough() as unknown as NodeJS.ReadStream;
    const output = new PassThrough() as unknown as NodeJS.WriteStream;
    await expect(promptPassword('pw: ', { input, output })).rejects.toThrow(/interactive terminal/);
  });

  it('reads a line without echoing it', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => input }) as unknown as NodeJS.ReadStream;
    const output = new PassThrough();
    let echoed = '';
    output.on('data', (d) => (echoed += d.toString()));
    const p = promptPassword('pw: ', { input, output: output as unknown as NodeJS.WriteStream });
    input.push('secret1\u007f2\r');
    expect(await p).toBe('secret2');
    expect(echoed).not.toContain('secret');
  });
});

describe('single instance', () => {
  let t: TempHome;
  let paths: AhPaths;
  beforeEach(() => {
    t = makeTempHome();
    paths = resolvePaths(t.homeDir);
    mkdirSync(paths.ahDir, { recursive: true });
  });
  afterEach(() => t.cleanup());

  const probes = (over: Partial<InstanceProbes> = {}): InstanceProbes & { killed: [number, string][] } => {
    const killed: [number, string][] = [];
    return {
      identity: procIdentity,
      health: async () => false,
      portOwner: async () => null,
      lockHolder: () => null,
      kill: (pid, sig) => {
        killed.push([pid, sig]);
        process.kill(pid, sig);
      },
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      killed,
      ...over,
    };
  };
  const record = (pid: number, entry: string, startTime = readStartTime(pid) ?? ''): PidRecord => ({ pid, port: 7427, startTime, bootId: readBootId(), entry });
  const writeRec = (r: PidRecord) => writeFileSync(paths.pidFile, JSON.stringify(r));

  it('recognises a server started through a symlinked bin (the pid file keeps the cmdline path)', async () => {
    const child = spawn('sh', ['-c', 'sleep 30; : /home/u/.bun/bin/ah']);
    try {
      await new Promise((r) => setTimeout(r, 50));
      writeRec(record(child.pid!, '/home/u/.bun/bin/ah'));
      const p = probes({ health: async () => true });
      expect(await resolveInstance(paths, 7427, p)).toEqual({ action: 'reuse', port: 7427 });
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('reuses a healthy ah server whose identity matches', async () => {
    writeRec(record(process.pid, process.argv[1] ?? 'node'));
    const p = probes({ health: async () => true });
    expect(await resolveInstance(paths, 7427, p)).toEqual({ action: 'reuse', port: 7427 });
    expect(p.killed).toEqual([]);
  });

  it('stops a stale ah server that matches and owns the port', async () => {
    const child = spawn('sh', ['-c', 'sleep 30; : ah-entry-marker']);
    await new Promise((r) => setTimeout(r, 50));
    writeRec(record(child.pid!, 'ah-entry-marker'));
    let owner: number | null = child.pid!;
    child.on('exit', () => (owner = null));
    const p = probes({ portOwner: async () => owner });
    const d = await resolveInstance(paths, 7427, p);
    expect(d.action).toBe('start');
    expect(p.killed[0]).toEqual([child.pid, 'SIGTERM']);
  });

  it('does not signal a stale ah server that holds the switch lock', async () => {
    const child = spawn('sh', ['-c', 'sleep 30; : ah-entry-marker']);
    try {
      await new Promise((r) => setTimeout(r, 50));
      writeRec(record(child.pid!, 'ah-entry-marker'));
      const p = probes({ portOwner: async () => child.pid!, lockHolder: () => child.pid! });
      expect((await resolveInstance(paths, 7427, p)).action).toBe('blocked');
      expect(p.killed).toEqual([]);
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('signals nothing when the PID was reused (start time differs) and just drops the pid file', async () => {
    const child = spawn('sh', ['-c', 'sleep 30; : ah-entry-marker']);
    try {
      await new Promise((r) => setTimeout(r, 50));
      writeRec(record(child.pid!, 'ah-entry-marker', '1'));
      const p = probes({ portOwner: async () => null });
      expect(await resolveInstance(paths, 7427, p)).toEqual({ action: 'start', note: 'Removed a stale pid file' });
      expect(p.killed).toEqual([]);
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('refuses to start when a non-ah process holds the port, naming its PID', async () => {
    const p = probes({ portOwner: async () => 4321 });
    const d = await resolveInstance(paths, 7427, p);
    expect(d).toMatchObject({ action: 'blocked' });
    expect((d as { message: string }).message).toMatch(/PID 4321/);
    expect(p.killed).toEqual([]);
  });
});
