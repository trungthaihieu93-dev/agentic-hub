import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getLiveStatus, initAh, withLock, listVersions, accountDir, captureAccount } from '@agentic-hub/core';
import { makeEnv, makeTempHome, writeClaudeLogin, refreshClaude, type TempHome, type TestEnv } from '@agentic-hub/core/testing';
import { createApp } from './app.js';
import { startServer } from './start.js';
import { startWatcher } from './watcher.js';

const PORT = 7427;
const ORIGIN = `http://ah.localhost:${PORT}`;
const A = { email: 'a@x.com', orgId: 'org-a' };
const B = { email: 'b@y.com', orgId: 'org-b' };

describe('ah server', () => {
  let t: TempHome;
  let env: TestEnv;
  let app: ReturnType<typeof createApp>;
  let publicDir: string;

  beforeEach(async () => {
    t = makeTempHome();
    await initAh({ homeDir: t.homeDir, password: 'correct-horse' });
    env = makeEnv(t.homeDir);
    publicDir = path.join(t.homeDir, 'public');
    mkdirSync(publicDir);
    writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><div id="root"></div>');
    app = createApp({ deps: env.deps, port: PORT, publicDir });
  });
  afterEach(() => {
    env.deps.db.close();
    t.cleanup();
  });

  const req = (p: string, init: RequestInit & { host?: string; cookie?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set('host', init.host ?? `ah.localhost:${PORT}`);
    if (init.cookie) headers.set('cookie', init.cookie);
    return app.request(`http://ah.localhost:${PORT}${p}`, { ...init, headers });
  };
  const mutate = (p: string, method: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) =>
    req(p, {
      method,
      cookie,
      headers: { origin: ORIGIN, 'x-ah-request': '1', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function login(): Promise<string> {
    const r = await mutate('/api/auth/login', 'POST', { password: 'correct-horse' });
    expect(r.status).toBe(200);
    const set = r.headers.get('set-cookie') ?? '';
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    expect(set).not.toMatch(/Domain=/i);
    return set.split(';')[0];
  }

  it('serves health without a session and refuses accounts without one', async () => {
    const h = await req('/api/health');
    expect(h.status).toBe(200);
    expect(await h.json() as any).toMatchObject({ app: 'ah' });
    expect((await req('/api/accounts')).status).toBe(401);
    expect(h.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(h.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects a wrong password and backs off after five failures', async () => {
    for (let i = 0; i < 6; i++) expect((await mutate('/api/auth/login', 'POST', { password: 'nope-nope' })).status).toBe(401);
    const r = await mutate('/api/auth/login', 'POST', { password: 'correct-horse' });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('1');
  });

  it('runs login -> accounts -> switch -> audit end to end, with the 409 path audited', async () => {
    const cookie = await login();
    expect(await (await req('/api/auth/me', { cookie })).json() as any).toEqual({ authenticated: true });

    writeClaudeLogin(env, { access: 'at-a', refresh: 'rt-a', who: A });
    const cap = await mutate('/api/accounts/capture', 'POST', { target: 'claude-cli', label: 'alpha' }, cookie);
    expect(cap.status).toBe(200);
    const alpha = (await cap.json() as any).account;
    writeClaudeLogin(env, { access: 'at-b', refresh: 'rt-b', who: B });
    await mutate('/api/accounts/capture', 'POST', { target: 'claude-cli', label: 'beta' }, cookie);

    const accounts = await (await req('/api/accounts', { cookie })).json() as any;
    const claude = accounts.targets.find((x: { target: string }) => x.target === 'claude-cli');
    expect(claude.accounts).toHaveLength(2);
    expect(claude.active.label).toBe('beta');
    expect(accounts.targets.map((x: { target: string }) => x.target)).toEqual(['claude-cli', 'codex-cli', 'claude-desktop']);

    env.procs.push({ pid: 999, exe: path.join(env.paths.claudeVersionsDir, '2.1.0'), cmdline: ['claude'] });
    const refused = await mutate('/api/switch', 'POST', { target: 'claude-cli', accountId: alpha.id }, cookie);
    expect(refused.status).toBe(409);
    const rb = await refused.json() as any;
    expect(rb.needsForce).toBe(true);
    expect(rb.warnings[0].pid).toBe(999);

    const ok = await mutate('/api/switch', 'POST', { target: 'claude-cli', accountId: alpha.id, force: true }, cookie);
    expect(ok.status).toBe(200);
    expect((await ok.json() as any).outcome).toBe('ok');

    const audit = await (await req('/api/audit?limit=50', { cookie })).json() as any;
    expect(audit.entries.map((e: { outcome: string }) => e.outcome)).toEqual(['ok', 'refused']);
    expect(audit.entries[0]).toMatchObject({ fromLabel: 'beta', toLabel: 'alpha', actor: 'dashboard' });

    const all = JSON.stringify([accounts, audit, rb]);
    for (const secret of ['accessToken', 'refresh_token', 'refreshToken', 'fingerprint', 'rt-a', 'at-a', 'identityKey', 'profilePath']) {
      expect(all).not.toContain(secret);
    }

    expect((await mutate('/api/auth/logout', 'POST', undefined, cookie)).status).toBe(200);
    expect((await req('/api/accounts', { cookie })).status).toBe(401);
  });

  it('answers 423 when a desktop app runs', async () => {
    const cookie = await login();
    const live = env.paths.claudeDesktopDir;
    mkdirSync(live, { recursive: true });
    const a = (await (await mutate('/api/accounts/capture', 'POST', { target: 'claude-desktop', label: 'home' }, cookie)).json() as any).account;
    const b = (await (await mutate('/api/accounts/empty', 'POST', { target: 'claude-desktop', label: 'work' }, cookie)).json() as any).account;
    expect(a.isActive).toBe(true);
    const sleeper = (await import('node:child_process')).spawn('sleep', ['10'], { cwd: live });
    try {
      await new Promise((r) => setTimeout(r, 100));
      env.deps.listProcesses = undefined; // scan the real /proc
      const r = await mutate('/api/switch', 'POST', { target: 'claude-desktop', accountId: b.id }, cookie);
      expect(r.status).toBe(423);
      expect((await r.json() as any).appRunning).toBe(true);
    } finally {
      sleeper.kill('SIGKILL');
    }
  });

  it('refuses foreign hosts and limits loopback aliases to health', async () => {
    expect((await req('/api/health', { host: 'evil.com' })).status).toBe(403);
    expect((await req('/', { host: 'evil.com:7427' })).status).toBe(403);
    expect((await req('/api/health', { host: `localhost:${PORT}` })).status).toBe(200);
    const page = await req('/accounts?x=1', { host: `localhost:${PORT}` });
    expect(page.status).toBe(308);
    expect(page.headers.get('location')).toBe(`${ORIGIN}/accounts?x=1`);
    expect((await req('/api/accounts', { host: `127.0.0.1:${PORT}` })).status).toBe(403);
  });

  it('refuses mutations without the exact origin, same-origin fetch, or the custom header', async () => {
    const cases: Record<string, string>[] = [
      { origin: '' },
      { origin: 'null' },
      { origin: 'http://evil.com' },
      { origin: 'http://localhost:7427' },
      { 'x-ah-request': '' },
      { 'sec-fetch-site': 'cross-site' },
    ];
    for (const extra of cases) {
      const headers: Record<string, string> = { origin: ORIGIN, 'x-ah-request': '1', 'content-type': 'application/json' };
      for (const [k, v] of Object.entries(extra)) {
        if (v === '') delete headers[k];
        else headers[k] = v;
      }
      const r = await req('/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ password: 'correct-horse' }) });
      expect(r.status, JSON.stringify(extra)).toBe(403);
    }
  });

  it('serves the SPA for page routes and 404 JSON for unknown API paths', async () => {
    const r = await req('/audit');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<div id="root">');
    expect((await req('/api/nope')).status).toBe(404);
  });
});

describe('startServer', () => {
  let t: TempHome;
  const cwd = process.cwd();
  beforeEach(async () => {
    t = makeTempHome();
    await initAh({ homeDir: t.homeDir, password: 'correct-horse' });
  });
  afterEach(() => {
    process.chdir(cwd);
    t.cleanup();
  });

  it('serves the real publicDir even when the working directory has a decoy public/index.html', async () => {
    const real = path.join(t.homeDir, 'ui');
    mkdirSync(real);
    writeFileSync(path.join(real, 'index.html'), 'REAL UI <div id="root"></div>');
    const decoy = path.join(t.homeDir, 'cwd');
    mkdirSync(path.join(decoy, 'public'), { recursive: true });
    writeFileSync(path.join(decoy, 'public', 'index.html'), 'DECOY');
    process.chdir(decoy);
    const s = await startServer({ homeDir: t.homeDir, publicDir: real, port: 0 + 47_000 + Math.floor(Math.random() * 1000) });
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/`, { headers: { host: `ah.localhost:${s.port}` } });
      expect(await res.text()).toContain('REAL UI');
    } finally {
      await s.close();
    }
  });

  it('refuses to start without the built UI', async () => {
    await expect(startServer({ homeDir: t.homeDir, publicDir: path.join(t.homeDir, 'missing') })).rejects.toThrow(/web UI is missing/);
  });
});

describe('watcher', () => {
  let t: TempHome;
  let env: TestEnv;
  beforeEach(async () => {
    t = makeTempHome();
    env = makeEnv(t.homeDir);
  });
  afterEach(() => {
    env.deps.db.close();
    t.cleanup();
  });

  const replaceByRename = (file: string, mutate: (o: Record<string, unknown>) => void) => {
    const o = JSON.parse(readFileSync(file, 'utf8'));
    mutate(o);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(o));
    renameSync(tmp, file);
  };

  it('flags drift when the credential file switches owner, even after two rename-replaces', async () => {
    writeClaudeLogin(env, { access: 'at-a', refresh: 'rt-a', who: A });
    await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' });
    const w = startWatcher(env.deps, { debounceMs: 30 });
    try {
      env.anthropic.register('at-a2', A);
      replaceByRename(env.paths.claudeCredentials, (o) => ((o['claudeAiOauth'] as Record<string, string>).accessToken = 'at-a2'));
      await new Promise((r) => setTimeout(r, 100));
      await w.flush();
      expect(getLiveStatus(env.deps.db, 'claude-cli')?.drift).toBe(false);

      env.anthropic.register('at-b', B);
      replaceByRename(env.paths.claudeCredentials, (o) => (o['claudeAiOauth'] = { accessToken: 'at-b', refreshToken: 'rt-b', expiresAt: Date.UTC(2099, 0) }));
      await new Promise((r) => setTimeout(r, 100));
      await w.flush();
      expect(getLiveStatus(env.deps.db, 'claude-cli')?.drift).toBe(true);
    } finally {
      w.close();
    }
  });

  it('writes no snapshot while the lock is held and writes one after release', async () => {
    writeClaudeLogin(env, { access: 'at-a', refresh: 'rt-a', who: A });
    const a = (await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' })).account;
    const versions = () => listVersions(accountDir(env.paths, a.profilePath)).length;
    const before = versions();
    const w = startWatcher(env.deps, { debounceMs: 30 });
    try {
      await withLock(env.paths.lockFile, async () => {
        refreshClaude(env, 'at-a2', 'rt-a2', A);
        await new Promise((r) => setTimeout(r, 100));
        await w.flush();
        expect(versions()).toBe(before);
      });
      refreshClaude(env, 'at-a3', 'rt-a3', A);
      await new Promise((r) => setTimeout(r, 100));
      await w.flush();
      expect(versions()).toBe(before + 1);
    } finally {
      w.close();
    }
  });
});
