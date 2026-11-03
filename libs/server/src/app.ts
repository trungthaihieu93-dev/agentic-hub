import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { serveStatic } from '@hono/node-server/serve-static';
import type { z } from 'zod';
import {
  addEmptyDesktopAccount,
  captureAccount,
  deleteAccount,
  deleteUnsaved,
  getActiveId,
  listAudit,
  nowOf,
  readConfig,
  registeredTargets,
  switchAccount,
  verifyPassword,
} from '@agentic-hub/core';
import {
  VERSION,
  captureRequestSchema,
  emptyAccountRequestSchema,
  loginRequestSchema,
  switchRequestSchema,
  targetIdSchema,
} from '@agentic-hub/shared';
import { SESSION_COOKIE, SESSION_TTL_MS, type AppEnv, type ServerOptions } from './context.js';
import { errorResponse } from './errors.js';
import { requireSession } from './middleware/auth.js';
import { hostGuard, mutationGuard } from './middleware/origin-guard.js';
import { securityHeaders } from './middleware/security-headers.js';
import { targetDto, toAccountDto } from './routes/dto.js';
import { createSession, deleteSession, LoginBackoff } from './sessions.js';

async function body<S extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: S): Promise<z.infer<S> | null> {
  const raw = await c.req.json().catch(() => null);
  const r = schema.safeParse(raw);
  return r.success ? r.data : null;
}

const invalid = { error: 'invalid_input', message: 'The request body is invalid' };

export function createApp(opts: ServerOptions): Hono<AppEnv> {
  const { deps, port, publicDir } = opts;
  const app = new Hono<AppEnv>();
  const backoff = new LoginBackoff();
  const auth = requireSession(deps);

  app.use('*', securityHeaders);
  app.use('*', hostGuard(port));
  app.use('*', mutationGuard(port));
  app.onError((err, c) => errorResponse(c, err));
  const inflight = opts.inflight;
  if (inflight) {
    app.use('/api/*', async (c, next) => {
      if (c.req.method === 'GET') return next();
      await inflight.track(next());
    });
  }

  app.get('/api/health', (c) => c.json({ app: 'ah', version: VERSION }));

  app.post('/api/auth/login', async (c) => {
    const now = Date.now();
    const wait = backoff.retryAfterMs(now);
    if (wait > 0) {
      c.header('Retry-After', String(Math.ceil(wait / 1000)));
      return c.json({ error: 'too_many_attempts', message: `Too many failed attempts; try again in ${Math.ceil(wait / 1000)}s` }, 429);
    }
    const b = await body(c, loginRequestSchema);
    if (!b) return c.json(invalid, 400);
    if (!(await verifyPassword(b.password, readConfig(deps.paths).admin))) {
      backoff.fail(Date.now());
      return c.json({ error: 'wrong_password', message: 'Wrong password' }, 401);
    }
    backoff.succeed();
    const id = createSession(deps.db, nowOf(deps));
    setCookie(c, SESSION_COOKIE, id, { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: SESSION_TTL_MS / 1000 });
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', auth, (c) => {
    const hash = c.get('sessionHash');
    if (hash) deleteSession(deps.db, hash);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', (c) => {
    // Reuse the session middleware without failing the request.
    let authenticated = false;
    return auth(c, async () => {
      authenticated = true;
    }).then(() => c.json({ authenticated }));
  });

  app.get('/api/accounts', auth, async (c) => {
    const targets = [];
    for (const id of registeredTargets()) targets.push(await targetDto(deps, id));
    return c.json({ targets });
  });

  app.post('/api/accounts/capture', auth, async (c) => {
    const b = await body(c, captureRequestSchema);
    if (!b) return c.json(invalid, 400);
    const r = await captureAccount(deps, b);
    return c.json({ account: toAccountDto(r.account, getActiveId(deps.db, b.target)), created: r.created, ...(r.note ? { note: r.note } : {}) });
  });

  app.post('/api/accounts/empty', auth, async (c) => {
    const b = await body(c, emptyAccountRequestSchema);
    if (!b) return c.json(invalid, 400);
    const a = await addEmptyDesktopAccount(deps, b);
    return c.json({ account: toAccountDto(a, getActiveId(deps.db, b.target)) });
  });

  app.delete('/api/accounts/unsaved/:target/:version', auth, async (c) => {
    const target = targetIdSchema.safeParse(c.req.param('target'));
    if (!target.success) return c.json(invalid, 400);
    await deleteUnsaved(deps, target.data, c.req.param('version'));
    return c.json({ ok: true });
  });

  app.delete('/api/accounts/:id', auth, async (c) => {
    await deleteAccount(deps, c.req.param('id'));
    return c.json({ ok: true });
  });

  app.post('/api/switch', auth, async (c) => {
    const b = await body(c, switchRequestSchema);
    if (!b) return c.json(invalid, 400);
    const r = await switchAccount(deps, { ...b, actor: 'dashboard' });
    return c.json(r, r.appRunning ? 423 : r.needsForce ? 409 : 200);
  });

  app.get('/api/audit', auth, (c) => {
    const limit = Number(c.req.query('limit') ?? 50);
    return c.json({ entries: listAudit(deps.db, Number.isFinite(limit) ? limit : 50) });
  });

  app.all('/api/*', (c) => c.json({ error: 'not_found', message: 'No such endpoint' }, 404));

  // The built UI, from an absolute directory; unknown paths fall back to index.html (SPA routes).
  const root = path.resolve(publicDir);
  app.use('*', serveStatic({ root }));
  app.get('*', (c) => c.html(readFileSync(path.join(root, 'index.html'), 'utf8')));

  return app;
}
