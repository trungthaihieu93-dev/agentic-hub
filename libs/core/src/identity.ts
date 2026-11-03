import { createHash } from 'node:crypto';

export interface Identity {
  identityKey: string;
  email: string | null;
  orgName: string | null;
}

/** Who owns a set of tokens: known, rejected by the provider, or not determinable right now. */
export type OwnerCheck =
  | { kind: 'owner'; identity: Identity }
  | { kind: 'invalid'; reason: string }
  | { kind: 'unknown'; reason: string };

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function claudeIdentityKey(orgId: string, email: string): string {
  return `${orgId}:${email.toLowerCase()}`;
}

export interface ClaudeAiOauth {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  [k: string]: unknown;
}

export const CLAUDE_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';

/**
 * Ask Anthropic who owns a Claude access token, using the same profile endpoint Claude Code
 * calls. `claude auth status` cannot be used: it only echoes the cached `oauthAccount`.
 * Never refreshes the token, because a refresh may rotate it.
 */
export async function claudeOwner(oauth: ClaudeAiOauth | undefined, fetchImpl: FetchLike, now: Date): Promise<OwnerCheck> {
  if (!oauth?.accessToken) return { kind: 'unknown', reason: 'not logged in' };
  if (typeof oauth.expiresAt === 'number' && oauth.expiresAt <= now.getTime()) {
    return { kind: 'unknown', reason: 'the access token has expired; it is refreshed the next time Claude Code runs' };
  }
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(CLAUDE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${oauth.accessToken}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { kind: 'unknown', reason: `could not reach Anthropic (${(err as Error).message})` };
  }
  if (res.status === 401 || res.status === 403) return { kind: 'invalid', reason: 'Anthropic rejected the token' };
  if (res.status !== 200) return { kind: 'unknown', reason: `Anthropic answered HTTP ${res.status}` };
  const body = (await res.json().catch(() => null)) as {
    account?: { email?: string; email_address?: string };
    organization?: { uuid?: string; name?: string };
  } | null;
  // Verified 2026-11-03: the profile endpoint returns `account.email` (`email_address` appears only
  // in the token-refresh response); accept both.
  const email = body?.account?.email ?? body?.account?.email_address;
  const orgId = body?.organization?.uuid;
  if (!email || !orgId) return { kind: 'unknown', reason: 'the profile response had no account or organisation' };
  return { kind: 'owner', identity: { identityKey: claudeIdentityKey(orgId, email), email, orgName: body?.organization?.name ?? null } };
}

export interface CodexAuthFile {
  OPENAI_API_KEY?: string | null;
  auth_mode?: string | null;
  tokens?: { id_token?: string; access_token?: string; refresh_token?: string; account_id?: string; [k: string]: unknown } | null;
  last_refresh?: string;
  [k: string]: unknown;
}

/** Codex keeps the owner in its own file: `tokens.account_id`, plus the email in the id_token. */
export function codexOwner(auth: CodexAuthFile | null): OwnerCheck {
  const tokens = auth?.tokens;
  if (!tokens?.account_id) return { kind: 'unknown', reason: auth ? 'no ChatGPT login in auth.json' : 'not logged in' };
  const claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const email = typeof claims?.['email'] === 'string' ? (claims['email'] as string) : null;
  const sub = typeof claims?.['sub'] === 'string' ? (claims['sub'] as string) : null;
  const user = email?.toLowerCase() ?? sub;
  // account_id is the ChatGPT workspace, shared by every seat in a Team or Enterprise workspace,
  // so the user is part of the key; otherwise two seats would collapse into one account.
  if (!user) return { kind: 'unknown', reason: 'the id_token in auth.json names no user' };
  const authClaims = claims?.['https://api.openai.com/auth'] as { chatgpt_plan_type?: string } | undefined;
  return {
    kind: 'owner',
    identity: { identityKey: `${tokens.account_id}:${user}`, email, orgName: authClaims?.chatgpt_plan_type ? `ChatGPT ${authClaims.chatgpt_plan_type}` : null },
  };
}
