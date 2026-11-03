import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CoreDeps, CommandRunner } from '../context.js';
import { openAhDb } from '../init.js';
import type { FetchLike } from '../identity.js';
import { resolvePaths, type AhPaths } from '../paths.js';
import type { ProcInfo } from '../processes.js';

export interface ClaudePerson {
  email: string;
  orgId: string;
  orgName?: string;
}

/**
 * A fake Anthropic profile endpoint: access tokens registered with `register` answer with their
 * owner, `revoked` tokens answer 401, and `offline` makes every call throw.
 */
export class FakeAnthropic {
  owners = new Map<string, ClaudePerson>();
  revoked = new Set<string>();
  offline = false;
  calls = 0;
  register(accessToken: string, who: ClaudePerson): void {
    this.owners.set(accessToken, who);
  }
  fetch: FetchLike = async (_url, init) => {
    this.calls++;
    if (this.offline) throw new Error('network down');
    const token = init.headers['Authorization']?.replace(/^Bearer /, '') ?? '';
    if (this.revoked.has(token)) return { status: 401, json: async () => ({}) };
    const who = this.owners.get(token);
    if (!who) return { status: 401, json: async () => ({}) };
    return {
      status: 200,
      json: async () => ({ account: { uuid: 'u', email: who.email }, organization: { uuid: who.orgId, name: who.orgName ?? 'Org' } }),
    };
  };
}

export interface TestEnv {
  paths: AhPaths;
  deps: CoreDeps;
  anthropic: FakeAnthropic;
  procs: ProcInfo[];
  codexStatus: { code: number };
}

export function makeEnv(homeDir: string, extra: Partial<CoreDeps> = {}): TestEnv {
  const paths = resolvePaths(homeDir);
  const db = openAhDb(paths);
  const anthropic = new FakeAnthropic();
  const procs: ProcInfo[] = [];
  const codexStatus = { code: 0 };
  const run: CommandRunner = async () => ({ code: codexStatus.code, stdout: 'Logged in using ChatGPT\n', stderr: '' });
  let tick = Date.UTC(2026, 10, 3, 8, 0, 0);
  const deps: CoreDeps = {
    paths,
    db,
    fetch: anthropic.fetch,
    run,
    listProcesses: () => procs,
    now: () => new Date((tick += 1000)),
    ...extra,
  };
  return { paths, deps, anthropic, procs, codexStatus };
}

export const SHARED_MCP = { 'plugin:x': { accessToken: 'mcp-secret', refreshToken: 'mcp-r' } };
export const SHARED_DEVICE = { token: 'device-token' };

/** Write a Claude Code login the way Claude Code itself lays it out, including the shared keys. */
export function writeClaudeLogin(env: TestEnv, l: { access: string; refresh: string; who: ClaudePerson; expiresAt?: number }): void {
  const { paths } = env;
  mkdirSync(path.dirname(paths.claudeCredentials), { recursive: true });
  let creds: Record<string, unknown> = { mcpOAuth: SHARED_MCP, trustedDeviceToken: SHARED_DEVICE };
  try {
    creds = JSON.parse(readFileSync(paths.claudeCredentials, 'utf8'));
  } catch {
    /* first write */
  }
  creds['claudeAiOauth'] = { accessToken: l.access, refreshToken: l.refresh, expiresAt: l.expiresAt ?? Date.UTC(2099, 0, 1), scopes: ['user:inference'] };
  writeFileSync(paths.claudeCredentials, JSON.stringify(creds), { mode: 0o600 });
  let cj: Record<string, unknown> = { numStartups: 7, projects: { '/x': { allowedTools: [] } }, mcpServers: { a: { command: 'x' } } };
  try {
    cj = JSON.parse(readFileSync(paths.claudeJson, 'utf8'));
  } catch {
    /* first write */
  }
  cj['oauthAccount'] = { accountUuid: 'acc-' + l.who.email, emailAddress: l.who.email, organizationUuid: l.who.orgId, organizationName: l.who.orgName ?? 'Org' };
  writeFileSync(paths.claudeJson, JSON.stringify(cj, null, 2) + '\n', { mode: 0o600 });
  env.anthropic.register(l.access, l.who);
}

/** Simulate Claude Code refreshing its tokens in place. */
export function refreshClaude(env: TestEnv, access: string, refresh: string, who: ClaudePerson): void {
  const creds = JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8'));
  creds.claudeAiOauth = { ...creds.claudeAiOauth, accessToken: access, refreshToken: refresh };
  writeFileSync(env.paths.claudeCredentials, JSON.stringify(creds), { mode: 0o600 });
  env.anthropic.register(access, who);
}

export function readClaude(env: TestEnv): { creds: Record<string, any>; cj: Record<string, any> } {
  return {
    creds: JSON.parse(readFileSync(env.paths.claudeCredentials, 'utf8')),
    cj: JSON.parse(readFileSync(env.paths.claudeJson, 'utf8')),
  };
}

export function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}

export function writeCodexLogin(env: TestEnv, l: { accountId: string; email: string; refresh: string; access?: string }): void {
  mkdirSync(env.paths.codexDir, { recursive: true });
  const auth = {
    OPENAI_API_KEY: null,
    auth_mode: 'chatgpt',
    tokens: {
      id_token: fakeJwt({ email: l.email, 'https://api.openai.com/auth': { chatgpt_account_id: l.accountId, chatgpt_plan_type: 'pro' } }),
      access_token: l.access ?? 'at-' + l.refresh,
      refresh_token: l.refresh,
      account_id: l.accountId,
      login_owner_id: 'owner',
    },
    last_refresh: '2026-11-03T00:00:00Z',
  };
  writeFileSync(env.paths.codexAuth, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export function readCodex(env: TestEnv): Record<string, any> {
  return JSON.parse(readFileSync(env.paths.codexAuth, 'utf8'));
}
