import type { Context } from 'hono';
import { AhError } from '@agentic-hub/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const STATUS: Record<string, ContentfulStatusCode> = {
  invalid_input: 400,
  not_found: 404,
  conflict: 409,
  concurrent_modification: 409,
  lock_busy: 503,
  not_initialized: 503,
};

/** Turn any error into `{ error, message }` without leaking stack traces. */
export function errorResponse(c: Context, err: unknown) {
  if (err instanceof AhError) return c.json({ error: err.code, message: err.message }, STATUS[err.code] ?? 400);
  console.error('ah: unexpected error', err instanceof Error ? err.message : err);
  return c.json({ error: 'internal', message: 'Something went wrong; see the server log' }, 500);
}
