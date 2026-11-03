import { parseArgs } from 'node:util';
import { AhError } from '@agentic-hub/core';
import { VERSION } from '@agentic-hub/shared';
import { parseTarget, UsageError, type CliContext } from './cli-context.js';
import { captureCommand, listCommand, switchCommand } from './commands/accounts.js';
import { initCommand } from './commands/init.js';
import { serveCommand, type ServeHandle } from './commands/serve.js';

export const HELP = `ah ${VERSION} — switch Claude and Codex accounts

Usage:
  ah init [--reset]                       set the admin password (once) and create ~/.ah
  ah [serve] [--no-open] [--port N]       start the dashboard at http://ah.localhost:7427
  ah list                                 show targets, saved accounts and the active one
  ah capture <target> <label>             save the current login as a named account
  ah switch <target> <label> [--force] [--relaunch]

Targets: claude-cli (claude), codex-cli (codex; also covers the Codex desktop app), claude-desktop
Exit codes for switch: 0 ok, 1 failed, 2 sessions running (use --force), 3 app running`;

export interface RunResult {
  code: number;
  /** Set when `serve` started a server that keeps running. */
  server?: ServeHandle;
}

export async function run(argv: string[], ctx: CliContext): Promise<RunResult> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        reset: { type: 'boolean', default: false },
        'no-open': { type: 'boolean', default: false },
        port: { type: 'string' },
        force: { type: 'boolean', default: false },
        relaunch: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (err) {
    ctx.err((err as Error).message);
    ctx.err(HELP);
    return { code: 64 };
  }
  const { values, positionals } = parsed;
  if (values.help) {
    ctx.out(HELP);
    return { code: 0 };
  }
  if (values.version) {
    ctx.out(VERSION);
    return { code: 0 };
  }
  const [command = 'serve', ...rest] = positionals;
  try {
    switch (command) {
      case 'init':
        return { code: await initCommand(ctx, { reset: values.reset }) };
      case 'serve': {
        let port: number | undefined;
        if (values.port !== undefined) {
          port = Number(values.port);
          if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UsageError(`Invalid port "${values.port}"`);
        }
        const r = await serveCommand(ctx, { open: !values['no-open'], port });
        return { code: r.code, server: r.handle };
      }
      case 'list':
        return { code: await listCommand(ctx) };
      case 'capture': {
        const [target, label] = rest;
        if (!label) throw new UsageError('Usage: ah capture <target> <label>');
        return { code: await captureCommand(ctx, parseTarget(target), label) };
      }
      case 'switch': {
        const [target, label] = rest;
        if (!label) throw new UsageError('Usage: ah switch <target> <label> [--force] [--relaunch]');
        return { code: await switchCommand(ctx, parseTarget(target), label, { force: values.force, relaunch: values.relaunch }) };
      }
      default:
        throw new UsageError(`Unknown command "${command}"`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      ctx.err(err.message);
      ctx.err('Run `ah --help` for usage.');
      return { code: 64 };
    }
    if (err instanceof AhError) {
      ctx.err(err.message);
      return { code: 1 };
    }
    throw err;
  }
}
