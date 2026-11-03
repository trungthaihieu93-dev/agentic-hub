import type { MiddlewareHandler } from 'hono';
import { canonicalHost, canonicalOrigin } from '../context.js';

const forbidden = (message: string) => ({ error: 'forbidden', message });

/**
 * Serve only the canonical origin (DNS-rebinding defence). Loopback aliases may reach the health
 * endpoint; pages on them are redirected to the canonical origin and other API calls are refused.
 */
export function hostGuard(port: number): MiddlewareHandler {
  const canonical = canonicalHost(port);
  const aliases = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  return async (c, next) => {
    const host = (c.req.header('host') ?? '').toLowerCase();
    if (host === canonical) return next();
    if (aliases.has(host)) {
      if (c.req.method === 'GET' && c.req.path === '/api/health') return next();
      if (c.req.path.startsWith('/api/')) return c.json(forbidden(`Use ${canonicalOrigin(port)}`), 403);
      const url = new URL(c.req.url);
      return c.redirect(`${canonicalOrigin(port)}${url.pathname}${url.search}`, 308);
    }
    return c.json(forbidden('Unknown host'), 403);
  };
}

/** Mutations need the exact canonical Origin, a same-origin fetch, and the custom header. */
export function mutationGuard(port: number): MiddlewareHandler {
  const origin = canonicalOrigin(port);
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next();
    if (c.req.header('origin') !== origin) return c.json(forbidden('Cross-origin request refused'), 403);
    const site = c.req.header('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin') return c.json(forbidden('Cross-site request refused'), 403);
    if (c.req.header('x-ah-request') !== '1') return c.json(forbidden('Missing X-AH-Request header'), 403);
    return next();
  };
}
