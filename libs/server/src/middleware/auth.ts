import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { nowOf, type CoreDeps } from '@agentic-hub/core';
import { SESSION_COOKIE, type AppEnv } from '../context.js';
import { sessionValid } from '../sessions.js';

export function requireSession(deps: CoreDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const hash = sessionValid(deps.db, getCookie(c, SESSION_COOKIE), nowOf(deps));
    if (!hash) return c.json({ error: 'unauthenticated', message: 'Log in first' }, 401);
    c.set('sessionHash', hash);
    return next();
  };
}
