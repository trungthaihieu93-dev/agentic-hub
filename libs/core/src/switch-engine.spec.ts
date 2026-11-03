import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { captureAccount, deleteAccount, listUnsaved } from './accounts.js';
import { readJournal } from './journal.js';
import { readLockOwner, tryWithLock, withLock } from './lock.js';
import { readStartTime, readBootId } from './processes.js';
import { claudeIdentityKey } from './identity.js';
import { accountDir, currentVersionDir, listVersions } from './profiles.js';
import { getActive, getLiveStatus } from './repo.js';
import { listAudit } from './audit.js';
import { switchAccount } from './switch-engine.js';
import { checkLive } from './live-watch.js';
import { makeTempHome, type TempHome } from './testing/temp-home.js';
import {
  makeEnv,
  readClaude,
  readCodex,
  refreshClaude,
  SHARED_DEVICE,
  SHARED_MCP,
  writeClaudeLogin,
  writeCodexLogin,
  type TestEnv,
} from './testing/fixtures.js';

const A = { email: 'A@x.com', orgId: 'org-a', orgName: 'Org A' };
const B = { email: 'b@y.com', orgId: 'org-b', orgName: 'Org B' };
const C = { email: 'c@z.com', orgId: 'org-c' };

const savedOauth = (env: TestEnv, profilePath: string) =>
  readFileSync(path.join(currentVersionDir(accountDir(env.paths, profilePath))!, 'claude-ai-oauth.json'), 'utf8');

function runCrashChild(homeDir: string, accountId: string, step: string, point: 'journal' | 'commit') {
  return spawnSync(process.execPath, ['--import', 'tsx', path.join(import.meta.dirname, 'testing/crash-child.ts'), homeDir, accountId, step, point], {
    encoding: 'utf8',
  });
}

describe('claude-cli switching', () => {
  let t: TempHome;
  let env: TestEnv;
  beforeEach(() => {
    t = makeTempHome();
    env = makeEnv(t.homeDir);
  });
  afterEach(() => {
    env.deps.db.close();
    t.cleanup();
  });

  async function captureAB() {
    writeClaudeLogin(env, { access: 'at-a1', refresh: 'rt-a1', who: A });
    const a = (await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' })).account;
    writeClaudeLogin(env, { access: 'at-b1', refresh: 'rt-b1', who: B });
    const b = (await captureAccount(env.deps, { target: 'claude-cli', label: 'beta' })).account;
    return { a, b };
  }

  it('captures 0600 files that hold only the login, keyed by org and lowercased email', async () => {
    const { a } = await captureAB();
    expect(a.identityKey).toBe('org-a:a@x.com');
    const dir = currentVersionDir(accountDir(env.paths, a.profilePath))!;
    expect(savedOauth(env, a.profilePath)).toContain('rt-a1');
    for (const f of readdirSync(dir)) {
      expect(statSync(path.join(dir, f)).mode & 0o777).toBe(0o600);
      const raw = readFileSync(path.join(dir, f), 'utf8');
      expect(raw).not.toContain('mcpOAuth');
      expect(raw).not.toContain('trustedDeviceToken');
      expect(raw).not.toContain('mcp-secret');
    }
    expect(statSync(path.dirname(dir)).mode & 0o777).toBe(0o700);
  });

  it('A -> B -> A brings back the tokens A refreshed and leaves shared keys deep-equal', async () => {
    const { a, b } = await captureAB();
    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' })).outcome).toBe('ok');
    const before = readClaude(env);
    refreshClaude(env, 'at-a2', 'rt-a2', A); // Claude Code refreshed A while it was active

    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: b.id, actor: 'cli' })).outcome).toBe('ok');
    expect(readClaude(env).creds['claudeAiOauth'].refreshToken).toBe('rt-b1');
    expect(readClaude(env).cj['oauthAccount'].emailAddress).toBe(B.email);

    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'dashboard' });
    expect(r.outcome).toBe('ok');
    const after = readClaude(env);
    expect(after.creds['claudeAiOauth'].refreshToken).toBe('rt-a2');
    expect(after.creds['mcpOAuth']).toEqual(SHARED_MCP);
    expect(after.creds['trustedDeviceToken']).toEqual(SHARED_DEVICE);
    const { oauthAccount: _x, ...restAfter } = after.cj;
    const { oauthAccount: _y, ...restBefore } = before.cj;
    expect(restAfter).toEqual(restBefore);
    expect(getActive(env.deps.db, 'claude-cli')?.id).toBe(a.id);
  });

  it('keeps at most 3 snapshot versions per account', async () => {
    const { a } = await captureAB();
    for (let i = 0; i < 5; i++) {
      writeClaudeLogin(env, { access: `at-a${i}`, refresh: `rt-a${i}`, who: A });
      await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' });
    }
    expect(listVersions(accountDir(env.paths, a.profilePath))).toHaveLength(3);
  });

  it('files drifted tokens under their real owner, never under the account oauthAccount names', async () => {
    const { a, b } = await captureAB(); // active: B
    // A running session writes A's refreshed tokens back while oauthAccount still says B.
    const creds = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    creds.claudeAiOauth = { ...creds.claudeAiOauth, accessToken: 'at-a9', refreshToken: 'rt-a9' };
    writeFileSync(env.paths.claudeCredentials, JSON.stringify(creds));
    env.anthropic.register('at-a9', A);
    writeClaudeLogin(env, { access: 'at-c1', refresh: 'rt-c1', who: C });
    env.anthropic.register('at-c1', C);
    // Put A's tokens back with B's oauthAccount, then switch to C.
    const c2 = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    const c = (await captureAccount(env.deps, { target: 'claude-cli', label: 'gamma' })).account;
    await switchAccount(env.deps, { target: 'claude-cli', accountId: b.id, actor: 'cli' });
    c2.claudeAiOauth = { ...c2.claudeAiOauth, accessToken: 'at-a9', refreshToken: 'rt-a9' };
    writeFileSync(env.paths.claudeCredentials, JSON.stringify(c2));
    expect(readClaude(env).cj['oauthAccount'].emailAddress).toBe(B.email);

    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: c.id, actor: 'cli' })).outcome).toBe('ok');
    expect(savedOauth(env, a.profilePath)).toContain('rt-a9');
    expect(savedOauth(env, b.profilePath)).not.toContain('rt-a9');
  });

  it('switching to the account that owns the live tokens keeps those fresh tokens', async () => {
    const { a } = await captureAB(); // active B
    writeClaudeLogin(env, { access: 'at-a2', refresh: 'rt-a2', who: A }); // user logged in as A by hand
    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'dashboard' });
    expect(r.outcome).toBe('ok');
    expect(readClaude(env).creds['claudeAiOauth'].refreshToken).toBe('rt-a2');
    expect(savedOauth(env, a.profilePath)).toContain('rt-a2');
    expect(getActive(env.deps.db, 'claude-cli')?.id).toBe(a.id);

    // A drifted session left oauthAccount naming B while A's tokens are live: switching to A fixes it.
    const creds = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    writeClaudeLogin(env, { access: 'at-b1', refresh: 'rt-b1', who: B });
    await switchAccount(env.deps, { target: 'claude-cli', accountId: (await captureAccount(env.deps, { target: 'claude-cli', label: 'beta' })).account.id, actor: 'cli' }).catch(() => undefined);
    const cj = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    cj.claudeAiOauth = creds.claudeAiOauth; // A's tokens come back, oauthAccount still says B
    writeFileSync(env.paths.claudeCredentials, JSON.stringify(cj));
    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli', force: true })).outcome).toBe('ok');
    expect(readClaude(env).cj['oauthAccount'].emailAddress).toBe(A.email);
    expect(readClaude(env).creds['claudeAiOauth'].refreshToken).toBe('rt-a2');
  });

  it('saves an oauthAccount that matches the token owner, not the drifted live one', async () => {
    const { a } = await captureAB(); // active B, oauthAccount says B
    const creds = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    creds.claudeAiOauth = { ...creds.claudeAiOauth, accessToken: 'at-a5', refreshToken: 'rt-a5' };
    writeFileSync(env.paths.claudeCredentials, JSON.stringify(creds));
    env.anthropic.register('at-a5', A);
    writeClaudeLogin(env, { access: 'at-c1', refresh: 'rt-c1', who: C });
    const c = (await captureAccount(env.deps, { target: 'claude-cli', label: 'gamma' })).account;
    // Put A's tokens live again with C's oauthAccount, then switch away.
    const c2 = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
    c2.claudeAiOauth = { ...c2.claudeAiOauth, accessToken: 'at-a5', refreshToken: 'rt-a5' };
    writeFileSync(env.paths.claudeCredentials, JSON.stringify(c2));
    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: c.id, actor: 'cli' })).outcome).toBe('ok');
    const acct = JSON.parse(readFileSync(path.join(currentVersionDir(accountDir(env.paths, a.profilePath))!, 'oauth-account.json'), 'utf8'));
    expect(claudeIdentityKey(acct.organizationUuid, acct.emailAddress)).toBe(a.identityKey);
  });

  it('writes through a symlinked credentials file instead of replacing the link', async () => {
    const { a } = await captureAB();
    const real = path.join(t.homeDir, 'dotfiles-credentials.json');
    renameSync(env.paths.claudeCredentials, real);
    symlinkSync(real, env.paths.claudeCredentials);
    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' })).outcome).toBe('ok');
    expect(lstatSync(env.paths.claudeCredentials).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, 'utf8')).claudeAiOauth.refreshToken).toBe('rt-a1');
  });

  it('files tokens with an unresolvable owner under _unsaved and keeps the install', async () => {
    const { a, b } = await captureAB(); // active B
    writeClaudeLogin(env, { access: 'at-x', refresh: 'rt-x', who: C });
    env.anthropic.offline = true;
    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' });
    expect(r.outcome).toBe('ok');
    expect(r.unsavedVersion).toBeDefined();
    expect(r.message).toMatch(/verification skipped/);
    expect(listUnsaved(env.deps, 'claude-cli')).toHaveLength(1);
    for (const acc of [a, b]) expect(savedOauth(env, acc.profilePath)).not.toContain('rt-x');
  });

  it('rolls back only the swapped fields when verification fails, keeping keys a concurrent writer changed', async () => {
    const { a, b } = await captureAB(); // active B
    env.anthropic.revoked.add('at-a1'); // A's saved token was revoked server-side
    const fetch0 = env.deps.fetch!;
    env.deps.fetch = async (url, init) => {
      if (init.headers['Authorization'] === 'Bearer at-a1') {
        // Another writer changes an unrelated key between install and rollback.
        const cj = JSON.parse(readFileSync(env.paths.claudeJson, 'utf8'));
        cj.numStartups = 99;
        writeFileSync(env.paths.claudeJson, JSON.stringify(cj, null, 2));
      }
      return fetch0(url, init);
    };
    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' });
    expect(r.outcome).toBe('rolled_back');
    const now = readClaude(env);
    expect(now.creds['claudeAiOauth'].refreshToken).toBe('rt-b1');
    expect(now.cj['oauthAccount'].emailAddress).toBe(B.email);
    expect(now.cj['numStartups']).toBe(99);
    expect(getActive(env.deps.db, 'claude-cli')?.id).toBe(b.id);
    expect(listAudit(env.deps.db)[0]).toMatchObject({ outcome: 'rolled_back' });
    expect(readJournal(env.paths)).toBeNull();
  });

  it('rolls back the credentials edit when the second field edit fails', async () => {
    const { a, b } = await captureAB();
    writeFileSync(env.paths.claudeJson, '{not json');
    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' });
    expect(r.outcome).toBe('rolled_back');
    expect(JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8')).claudeAiOauth.refreshToken).toBe('rt-b1');
    expect(getActive(env.deps.db, 'claude-cli')?.id).toBe(b.id);
  });

  it('refuses with needsForce while claude sessions run, including ones on an older version path', async () => {
    const { a } = await captureAB();
    env.procs.push({ pid: 4242, exe: path.join(env.paths.claudeVersionsDir, '2.0.1'), cmdline: ['claude'] });
    env.procs.push({ pid: 4243, exe: '/usr/bin/vim', cmdline: ['vim'] });
    const r = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'dashboard' });
    expect(r).toMatchObject({ outcome: 'refused', needsForce: true });
    expect(r.warnings.map((w) => w.pid)).toEqual([4242]);
    expect(listAudit(env.deps.db)[0]).toMatchObject({ outcome: 'refused' });
    const forced = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'dashboard', force: true });
    expect(forced.outcome).toBe('ok');
    expect(forced.message).toMatch(/write the old account back/);
  });

  it('refuses switching to the account that is already live', async () => {
    const { b } = await captureAB();
    expect((await switchAccount(env.deps, { target: 'claude-cli', accountId: b.id, actor: 'cli' })).outcome).toBe('refused');
  });

  it('never deletes the active account', async () => {
    const { a, b } = await captureAB();
    await expect(deleteAccount(env.deps, b.id)).rejects.toThrow(/active/);
    await deleteAccount(env.deps, a.id);
    expect(existsSync(accountDir(env.paths, a.profilePath))).toBe(false);
  });

  it('rejects unsafe labels and duplicate labels', async () => {
    writeClaudeLogin(env, { access: 'at-a1', refresh: 'rt-a1', who: A });
    await expect(captureAccount(env.deps, { target: 'claude-cli', label: '../x' })).rejects.toThrow();
    await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' });
    writeClaudeLogin(env, { access: 'at-b1', refresh: 'rt-b1', who: B });
    await expect(captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' })).rejects.toThrow(/already exists/);
  });

  it('a DB commit failure keeps the journal and recovery completes the bookkeeping', async () => {
    const { a } = await captureAB();
    env.deps.hooks = {
      beforeCommit: () => {
        throw new Error('disk full');
      },
    };
    await expect(switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'cli' })).rejects.toThrow(/disk full/);
    expect(readJournal(env.paths)?.step).toBe('verified');
    env.deps.hooks = undefined;
    // Any locked operation recovers first.
    await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' });
    expect(readJournal(env.paths)).toBeNull();
    expect(getActive(env.deps.db, 'claude-cli')?.id).toBe(a.id);
    expect(listAudit(env.deps.db).some((e) => e.outcome === 'recovered')).toBe(true);
  });
});

describe('live watch', () => {
  let t: TempHome;
  let env: TestEnv;
  beforeEach(() => {
    t = makeTempHome();
    env = makeEnv(t.homeDir);
  });
  afterEach(() => {
    env.deps.db.close();
    t.cleanup();
  });

  it('saves refreshed tokens of the active account, skips while locked, and flags drift', async () => {
    writeClaudeLogin(env, { access: 'at-a1', refresh: 'rt-a1', who: A });
    const a = (await captureAccount(env.deps, { target: 'claude-cli', label: 'alpha' })).account;
    const calls0 = env.anthropic.calls;
    expect(await checkLive(env.deps, 'claude-cli')).toMatchObject({ drift: false, snapshotted: false });
    expect(env.anthropic.calls).toBe(calls0); // unchanged tokens need no network call

    refreshClaude(env, 'at-a2', 'rt-a2', A);
    const locked = await withLock(env.paths.lockFile, () => checkLive(env.deps, 'claude-cli'));
    expect(locked).toMatchObject({ skippedLocked: true, snapshotted: false });
    expect(await checkLive(env.deps, 'claude-cli')).toMatchObject({ snapshotted: true });
    expect(savedOauth(env, a.profilePath)).toContain('rt-a2');

    refreshClaude(env, 'at-b9', 'rt-b9', B);
    expect(await checkLive(env.deps, 'claude-cli')).toMatchObject({ drift: true });
    expect(getLiveStatus(env.deps.db, 'claude-cli')?.drift).toBe(true);

    // "Switch back" to the active account is allowed while drift is flagged, and clears it.
    const back = await switchAccount(env.deps, { target: 'claude-cli', accountId: a.id, actor: 'dashboard' });
    expect(back.outcome).toBe('ok');
    expect(readClaude(env).creds['claudeAiOauth'].refreshToken).toBe('rt-a2');
    expect(getLiveStatus(env.deps.db, 'claude-cli')?.drift).toBe(false);
  });
});

describe('codex-cli switching', () => {
  let t: TempHome;
  let env: TestEnv;
  beforeEach(() => {
    t = makeTempHome();
    env = makeEnv(t.homeDir);
  });
  afterEach(() => {
    env.deps.db.close();
    t.cleanup();
  });

  async function captureXY() {
    writeCodexLogin(env, { accountId: 'acct-x', email: 'x@o.com', refresh: 'r-x1' });
    const x = (await captureAccount(env.deps, { target: 'codex-cli', label: 'x' })).account;
    writeCodexLogin(env, { accountId: 'acct-y', email: 'y@o.com', refresh: 'r-y1' });
    const y = (await captureAccount(env.deps, { target: 'codex-cli', label: 'y' })).account;
    return { x, y };
  }

  it('takes the owner from tokens.account_id and the id_token email', async () => {
    const { x } = await captureXY();
    expect(x).toMatchObject({ identityKey: 'acct-x:x@o.com', email: 'x@o.com' });
  });

  it('keeps two seats of one ChatGPT workspace apart', async () => {
    writeCodexLogin(env, { accountId: 'team', email: 'u1@o.com', refresh: 'r-u1' });
    const u1 = (await captureAccount(env.deps, { target: 'codex-cli', label: 'user1' })).account;
    writeCodexLogin(env, { accountId: 'team', email: 'u2@o.com', refresh: 'r-u2' });
    const u2 = await captureAccount(env.deps, { target: 'codex-cli', label: 'user2' });
    expect(u2.created).toBe(true);
    expect(u2.account.id).not.toBe(u1.id);
    await switchAccount(env.deps, { target: 'codex-cli', accountId: u1.id, actor: 'cli' });
    expect(readCodex(env)['tokens'].refresh_token).toBe('r-u1');
  });

  it('recovery never overwrites a login made after the crash', async () => {
    const { x } = await captureXY();
    env.deps.db.close();
    expect(runCrashChild(t.homeDir, x.id, 'installing', 'journal').signal).toBe('SIGKILL');
    // Before ah runs again, the user logs in to a third account.
    writeCodexLogin(env, { accountId: 'acct-z', email: 'z@o.com', refresh: 'r-z' });
    env = makeEnv(t.homeDir);
    await captureAccount(env.deps, { target: 'codex-cli', label: 'z' });
    expect(readJournal(env.paths)).toBeNull();
    expect(readCodex(env)['tokens'].refresh_token).toBe('r-z');
    expect(listAudit(env.deps.db).some((e) => /live login changed after the crash/.test(e.message ?? ''))).toBe(true);
  }, 30_000);

  it('switches X -> Y -> X keeping refreshed tokens, under the auth.lock flock', async () => {
    const { x, y } = await captureXY();
    await switchAccount(env.deps, { target: 'codex-cli', accountId: x.id, actor: 'cli' });
    writeCodexLogin(env, { accountId: 'acct-x', email: 'x@o.com', refresh: 'r-x2' });
    await switchAccount(env.deps, { target: 'codex-cli', accountId: y.id, actor: 'cli' });
    expect(readCodex(env)['tokens'].refresh_token).toBe('r-y1');
    await switchAccount(env.deps, { target: 'codex-cli', accountId: x.id, actor: 'cli' });
    expect(readCodex(env)['tokens'].refresh_token).toBe('r-x2');
    expect(statSync(env.paths.codexAuth).mode & 0o777).toBe(0o600);
    expect(existsSync(env.paths.codexAuthLock)).toBe(true);
  });

  it('rolls back when codex login status fails', async () => {
    const { x } = await captureXY();
    env.codexStatus.code = 1;
    const r = await switchAccount(env.deps, { target: 'codex-cli', accountId: x.id, actor: 'cli' });
    expect(r.outcome).toBe('rolled_back');
    expect(readCodex(env)['tokens'].account_id).toBe('acct-y');
  });

  it('counts the app-server daemon only when its boot id and start ticks match', async () => {
    const { x } = await captureXY();
    mkdirSync(path.dirname(env.paths.codexDaemonPid), { recursive: true });
    const pidJson = (ticks: string) =>
      JSON.stringify({ pid: process.pid, processStartTime: 'x', processIdentity: { bootId: readBootId(), startTicks: Number(ticks) }, executableIdentity: {} });
    writeFileSync(env.paths.codexDaemonPid, pidJson(readStartTime(process.pid)!));
    expect(await switchAccount(env.deps, { target: 'codex-cli', accountId: x.id, actor: 'cli' })).toMatchObject({ outcome: 'refused', needsForce: true });
    writeFileSync(env.paths.codexDaemonPid, pidJson('1')); // PID reused by another process
    expect((await switchAccount(env.deps, { target: 'codex-cli', accountId: x.id, actor: 'cli' })).outcome).toBe('ok');
  });

  it.each([
    ['started', 'acct-y'],
    ['installing', 'acct-y'],
    ['installed', 'acct-y'],
    ['verified', 'acct-x'],
  ])('recovers a crash after journal step %s', async (stepName, expectedLive) => {
    const { x, y } = await captureXY();
    env.deps.db.close();
    const child = runCrashChild(t.homeDir, x.id, stepName, 'journal');
    expect(child.stderr).toBe('');
    expect(child.signal).toBe('SIGKILL');
    expect(readJournal(env.paths)?.step).toBe(stepName);
    env = makeEnv(t.homeDir);
    // The killed process left a stale lock; the next operation takes it over and recovers.
    await captureAccount(env.deps, { target: 'codex-cli', label: expectedLive === 'acct-x' ? 'x' : 'y' });
    expect(readJournal(env.paths)).toBeNull();
    expect(readCodex(env)['tokens'].account_id).toBe(expectedLive);
    expect(getActive(env.deps.db, 'codex-cli')?.id).toBe(expectedLive === 'acct-x' ? x.id : y.id);
    expect(listAudit(env.deps.db).some((e) => e.outcome === 'recovered' && e.actor === 'recovery')).toBe(true);
  }, 30_000);

  it('a crash inside the commit is completed by recovery', async () => {
    const { x } = await captureXY();
    env.deps.db.close();
    const child = runCrashChild(t.homeDir, x.id, '', 'commit');
    expect(child.signal).toBe('SIGKILL');
    env = makeEnv(t.homeDir);
    expect(getActive(env.deps.db, 'codex-cli')?.id).not.toBe(x.id);
    await captureAccount(env.deps, { target: 'codex-cli', label: 'x' });
    expect(getActive(env.deps.db, 'codex-cli')?.id).toBe(x.id);
  }, 30_000);
});

describe('switch lock', () => {
  let t: TempHome;
  beforeEach(() => (t = makeTempHome()));
  afterEach(() => t.cleanup());

  it('makes a second operation wait and time out while the first holds the lock', async () => {
    const lock = path.join(t.homeDir, 'switch.lock');
    let release!: () => void;
    const first = withLock(lock, () => new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 20));
    await expect(withLock(lock, async () => 1, { timeoutMs: 150 })).rejects.toThrow(/in progress/);
    release();
    await first;
    expect(await withLock(lock, async () => 2)).toBe(2);
  });

  it('is not blocked by an empty or leftover lock file, and records the holder while held', async () => {
    const lock = path.join(t.homeDir, 'switch.lock');
    writeFileSync(lock, '');
    expect(await withLock(lock, async () => 'ok', { timeoutMs: 200 })).toBe('ok');
    writeFileSync(lock, JSON.stringify({ pid: 1, startTime: '1', bootId: readBootId() }));
    expect(readLockOwner(lock)).toBeNull(); // nobody holds the kernel lock
    const owner = await withLock(lock, async () => readLockOwner(lock));
    expect(owner?.pid).toBe(process.pid);
    expect(readLockOwner(lock)).toBeNull();
  });

  it('tryWithLock skips while another holder has the lock', async () => {
    const lock = path.join(t.homeDir, 'switch.lock');
    const r = await withLock(lock, () => tryWithLock(lock, async () => 1));
    expect(r).toEqual({ acquired: false });
    expect(await tryWithLock(lock, async () => 2)).toEqual({ acquired: true, value: 2 });
  });
});
