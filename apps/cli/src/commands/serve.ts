import { spawn } from 'node:child_process';
import { isInitialized, readConfig, resolvePaths } from '@agentic-hub/core';
import { startServer } from '@agentic-hub/server-lib';
import type { CliContext } from '../cli-context.js';
import { defaultProbes, removePidRecord, resolveInstance, writePidRecord } from '../single-instance.js';

function xdgOpen(url: string): void {
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    .on('error', () => undefined)
    .unref();
}

export interface ServeHandle {
  url: string;
  stop(): Promise<void>;
}

/** Start (or reuse) the dashboard server. Resolves once it listens; `stop` shuts it down. */
export async function serveCommand(ctx: CliContext, opts: { open: boolean; port?: number }): Promise<{ code: number; handle?: ServeHandle }> {
  const paths = resolvePaths(ctx.homeDir);
  if (!isInitialized(paths)) {
    ctx.err('ah is not initialised yet; run `ah init` first.');
    return { code: 1 };
  }
  const port = opts.port ?? readConfig(paths).port;
  const open = ctx.openBrowser ?? xdgOpen;
  const decision = await resolveInstance(paths, port, (ctx.probes ?? defaultProbes)(paths));
  if (decision.action === 'blocked') {
    ctx.err(decision.message);
    return { code: 1 };
  }
  if (decision.action === 'reuse') {
    const url = `http://ah.localhost:${decision.port}`;
    ctx.out(`ah is already running at ${url}`);
    if (opts.open) open(url);
    return { code: 0 };
  }
  if (decision.note) ctx.out(decision.note);

  const server = await startServer({ homeDir: ctx.homeDir, publicDir: ctx.publicDir, port });
  writePidRecord(paths, port, ctx.entry);
  ctx.out(`ah dashboard: ${server.url}  (Ctrl+C to stop)`);
  if (opts.open) open(server.url);
  return {
    code: 0,
    handle: {
      url: server.url,
      stop: async () => {
        await server.close();
        removePidRecord(paths);
      },
    },
  };
}
