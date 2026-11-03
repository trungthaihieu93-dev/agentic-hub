import { existsSync } from 'node:fs';
import path from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { checkLive, openAhDb, readConfig, resolvePaths, type CoreDeps } from '@agentic-hub/core';
import { createApp } from './app.js';
import { Inflight } from './context.js';
import { purgeExpiredSessions } from './sessions.js';
import { startWatcher, type Watcher } from './watcher.js';

export interface StartOptions {
  homeDir: string;
  publicDir: string;
  port?: number;
  host?: string;
}

export interface RunningServer {
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Start the ah server on loopback with the live-identity watcher. */
export async function startServer(opts: StartOptions): Promise<RunningServer> {
  const publicDir = path.resolve(opts.publicDir);
  if (!existsSync(path.join(publicDir, 'index.html'))) {
    throw new Error(`The web UI is missing (${publicDir}/index.html); build it with \`nx build cli\``);
  }
  const paths = resolvePaths(opts.homeDir);
  const config = readConfig(paths);
  const port = opts.port ?? config.port;
  const host = opts.host ?? config.host;
  if (host !== '127.0.0.1') throw new Error('ah only listens on 127.0.0.1');

  const db = openAhDb(paths);
  const deps: CoreDeps = { paths, db };
  purgeExpiredSessions(db, new Date());
  const inflight = new Inflight();
  const app = createApp({ deps, port, publicDir, inflight });

  const server: ServerType = await new Promise((resolve, reject) => {
    const s = serve({ fetch: app.fetch, port, hostname: host }, () => resolve(s));
    s.once('error', reject);
  });
  const onError = (err: unknown) => console.error('ah watcher:', err instanceof Error ? err.message : err);
  const watcher: Watcher = startWatcher(deps, { onError });
  for (const t of ['claude-cli', 'codex-cli'] as const) void checkLive(deps, t).catch(onError);

  return {
    port,
    url: `http://ah.localhost:${port}`,
    // Stop accepting requests, let running switches, captures and watcher checks finish, then
    // close the database; a switch is never cut off in its critical section.
    close: async () => {
      watcher.close();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
      await inflight.drain();
      await watcher.flush();
      (server as { closeAllConnections?: () => void }).closeAllConnections?.();
      await closed;
      db.close();
    },
  };
}
