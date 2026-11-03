import { z } from 'zod';
import {
  accountDtoSchema,
  auditResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  switchResultSchema,
  targetDtoSchema,
  type AccountDto,
  type AuditEntry,
  type SwitchRequest,
  type SwitchResult,
  type TargetId,
} from '@agentic-hub/shared';

/**
 * The server adds these fields to each target; they are optional here so an
 * older server still parses. The shared schema is left untouched, and zod would
 * otherwise strip the unknown keys.
 */
export const uiTargetSchema = targetDtoSchema.extend({
  enabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
  sharedFiles: z.array(z.string()).optional(),
});
export type UiTarget = z.infer<typeof uiTargetSchema>;

const uiAccountsResponseSchema = z.object({ targets: z.array(uiTargetSchema) });
const okSchema = z.object({ ok: z.literal(true) });
const captureResponseSchema = z.object({
  account: accountDtoSchema,
  created: z.boolean(),
  note: z.string().optional(),
});
const emptyAccountResponseSchema = z.object({ account: accountDtoSchema });

export type CaptureResponse = z.infer<typeof captureResponseSchema>;

/** A non-2xx response (or an unreadable body) from the API. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}

type Method = 'GET' | 'POST' | 'DELETE';

async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'X-AH-Request': '1', Accept: 'application/json' };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the ah server. Is it still running?');
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(res.status, 'bad_response', `Unexpected response from the server (HTTP ${res.status}).`);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let data: unknown = null;
  try {
    data = await readJson(res);
  } catch {
    // Fall through to the generic message below.
  }
  const parsed = errorResponseSchema.safeParse(data);
  if (parsed.success) return new ApiError(res.status, parsed.data.error, parsed.data.message);
  return new ApiError(res.status, 'http_error', `Request failed (HTTP ${res.status}).`);
}

function parse<T>(schema: z.ZodType<T>, data: unknown, status: number): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(status, 'bad_response', 'The server sent a response this dashboard does not understand.');
  }
  return parsed.data;
}

async function request<T>(method: Method, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  if (!res.ok) throw await toApiError(res);
  return parse(schema, await readJson(res), res.status);
}

/** HTTP status of a switch attempt: 200 (see outcome), 409 needs force, 423 app running. */
export interface SwitchResponse {
  status: 200 | 409 | 423;
  result: SwitchResult;
}

export const api = {
  me: () => request('GET', '/api/auth/me', meResponseSchema),

  login: (password: string) => request('POST', '/api/auth/login', okSchema, { password }),

  logout: async (): Promise<void> => {
    const res = await send('POST', '/api/auth/logout');
    if (!res.ok && res.status !== 401) throw await toApiError(res);
  },

  accounts: () => request('GET', '/api/accounts', uiAccountsResponseSchema),

  capture: (target: TargetId, label: string): Promise<CaptureResponse> =>
    request('POST', '/api/accounts/capture', captureResponseSchema, { target, label }),

  createEmpty: (target: TargetId, label: string): Promise<{ account: AccountDto }> =>
    request('POST', '/api/accounts/empty', emptyAccountResponseSchema, { target, label }),

  deleteAccount: async (id: string): Promise<void> => {
    const res = await send('DELETE', `/api/accounts/${encodeURIComponent(id)}`);
    if (!res.ok) throw await toApiError(res);
  },

  deleteUnsaved: async (target: TargetId, version: string): Promise<void> => {
    const res = await send(
      'DELETE',
      `/api/accounts/unsaved/${encodeURIComponent(target)}/${encodeURIComponent(version)}`,
    );
    if (!res.ok) throw await toApiError(res);
  },

  switchAccount: async (req: SwitchRequest): Promise<SwitchResponse> => {
    const res = await send('POST', '/api/switch', req);
    const status = res.status;
    if (status === 200 || status === 409 || status === 423) {
      return { status, result: parse(switchResultSchema, await readJson(res), status) };
    }
    throw await toApiError(res);
  },

  audit: async (limit = 50): Promise<AuditEntry[]> =>
    (await request('GET', `/api/audit?limit=${limit}`, auditResponseSchema)).entries,
};
