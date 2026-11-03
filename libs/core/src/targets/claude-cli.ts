import { existsSync } from 'node:fs';
import path from 'node:path';
import { fetchOf, nowOf, procsOf, type CoreDeps } from '../context.js';
import { claudeIdentityKey, claudeOwner, sha256, type ClaudeAiOauth, type Identity } from '../identity.js';
import type { AccountTarget, RollbackHandle } from './types.js';
import { readJsonOrNull, setJsonField, writeJson0600 } from './json-files.js';

const OAUTH_FILE = 'claude-ai-oauth.json';
const ACCOUNT_FILE = 'oauth-account.json';

interface OauthAccount {
  emailAddress?: string;
  organizationUuid?: string;
  organizationName?: string;
  [k: string]: unknown;
}

/**
 * The `oauthAccount` saved with a snapshot must describe the token owner. When the live
 * `~/.claude.json` names someone else (a drifted session), save a minimal record built from the
 * owner the provider confirmed instead.
 */
function accountFor(live: OauthAccount | undefined, owner: Identity | undefined): OauthAccount | null {
  if (!owner) return live ?? null;
  if (live?.emailAddress && live.organizationUuid && claudeIdentityKey(live.organizationUuid, live.emailAddress) === owner.identityKey) return live;
  const orgUuid = owner.identityKey.slice(0, owner.identityKey.indexOf(':'));
  return { emailAddress: owner.email ?? undefined, organizationUuid: orgUuid, organizationName: owner.orgName ?? undefined };
}

/**
 * Claude Code CLI: swaps only `claudeAiOauth` in ~/.claude/.credentials.json and `oauthAccount`
 * in ~/.claude.json. `mcpOAuth`, `trustedDeviceToken` and every other key stay shared.
 */
export function claudeCliTarget(deps: CoreDeps): AccountTarget {
  const { paths } = deps;
  const liveOauth = () => readJsonOrNull<{ claudeAiOauth?: ClaudeAiOauth }>(paths.claudeCredentials)?.claudeAiOauth;
  const liveAccount = () => readJsonOrNull<{ oauthAccount?: OauthAccount }>(paths.claudeJson)?.oauthAccount;

  return {
    id: 'claude-cli',
    identity: 'token',
    rollback: 'field',
    requiresAppClosed: false,
    enabled: () => ({ ok: true }),

    async runningProcesses() {
      const prefix = paths.claudeVersionsDir + path.sep;
      // A running session keeps the path of the version it started from, so match the folder.
      return procsOf(deps).filter((p) => p.exe?.startsWith(prefix));
    },

    async readLiveIdentity() {
      const a = liveAccount();
      if (!a?.emailAddress || !a.organizationUuid) return null;
      return { identityKey: claudeIdentityKey(a.organizationUuid, a.emailAddress), email: a.emailAddress, orgName: a.organizationName ?? null };
    },

    resolveLiveOwner: () => claudeOwner(liveOauth(), fetchOf(deps), nowOf(deps)),

    async liveFingerprint() {
      const t = liveOauth()?.refreshToken;
      return t ? sha256(t) : null;
    },

    async snapshotTo(dir, owner) {
      const oauth = liveOauth();
      if (!oauth) throw new Error('Claude Code is not logged in (no claudeAiOauth in .credentials.json)');
      writeJson0600(path.join(dir, OAUTH_FILE), oauth);
      writeJson0600(path.join(dir, ACCOUNT_FILE), accountFor(liveAccount(), owner));
    },

    async fingerprintOf(dir) {
      const t = readJsonOrNull<ClaudeAiOauth>(path.join(dir, OAUTH_FILE))?.refreshToken;
      return t ? sha256(t) : null;
    },

    async prepareRollback(plan): Promise<RollbackHandle> {
      const oauth = readJsonOrNull<ClaudeAiOauth>(path.join(plan.incomingDir, OAUTH_FILE));
      if (!oauth) throw new Error(`The saved profile for ${plan.incoming.label} has no Claude login`);
      const account = readJsonOrNull<OauthAccount>(path.join(plan.incomingDir, ACCOUNT_FILE)) ?? undefined;
      const creds = readJsonOrNull<Record<string, unknown>>(paths.claudeCredentials);
      const cj = readJsonOrNull<Record<string, unknown>>(paths.claudeJson);
      return {
        kind: 'field',
        fields: [
          { file: paths.claudeCredentials, key: 'claudeAiOauth', previous: creds?.['claudeAiOauth'], existed: !!creds && 'claudeAiOauth' in creds, installed: oauth },
          { file: paths.claudeJson, key: 'oauthAccount', previous: cj?.['oauthAccount'], existed: !!cj && 'oauthAccount' in cj, installed: account },
        ],
      };
    },

    async installFrom(_plan, handle) {
      if (handle.kind !== 'field') throw new Error('claude-cli expects a field rollback handle');
      for (const f of handle.fields) setJsonField(f.file, f.key, f.installed);
    },

    async rollbackWith(handle) {
      if (handle.kind !== 'field') throw new Error('claude-cli expects a field rollback handle');
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const states = handle.fields.map((f) => {
        const previous = f.existed ? f.previous : undefined;
        const file = readJsonOrNull<Record<string, unknown>>(f.file);
        // ah writes only valid JSON, so an unreadable file was never edited by this install.
        if (file === null && existsSync(f.file)) return { f, previous, state: 'previous' as const };
        const current = file?.[f.key];
        const state = same(current, previous) ? ('previous' as const) : same(current, f.installed) ? ('installed' as const) : ('changed' as const);
        return { f, previous, state };
      });
      // Someone else (a login, a refresh) changed the login after the install: never overwrite it.
      if (states.some((s) => s.state === 'changed')) return 'kept-live';
      const toRestore = states.filter((s) => s.state === 'installed').reverse();
      for (const s of toRestore) setJsonField(s.f.file, s.f.key, s.previous);
      return toRestore.length > 0 ? 'restored' : 'unchanged';
    },

    async verifyInstalled(plan) {
      const owner = await claudeOwner(liveOauth(), fetchOf(deps), nowOf(deps));
      if (owner.kind === 'owner') {
        return owner.identity.identityKey === plan.incoming.identityKey
          ? { ok: true }
          : { ok: false, reason: `the installed tokens belong to ${owner.identity.email ?? 'another account'}` };
      }
      if (owner.kind === 'invalid') return { ok: false, reason: `${owner.reason}; log in again and capture ${plan.incoming.label} again` };
      return { ok: true, warning: `verification skipped: ${owner.reason}` };
    },

    async alignLiveMetadata(dir) {
      const saved = readJsonOrNull<OauthAccount>(path.join(dir, ACCOUNT_FILE));
      if (saved && JSON.stringify(saved) !== JSON.stringify(liveAccount())) setJsonField(paths.claudeJson, 'oauthAccount', saved);
    },

    critical: (fn) => fn(),
  };
}
