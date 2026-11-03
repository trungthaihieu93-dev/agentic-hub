import { AlreadyInitializedError, initAh, isInitialized, MIN_PASSWORD_LENGTH, resolvePaths } from '@agentic-hub/core';
import type { CliContext } from '../cli-context.js';

export async function initCommand(ctx: CliContext, opts: { reset: boolean }): Promise<number> {
  const paths = resolvePaths(ctx.homeDir);
  if (!opts.reset && isInitialized(paths)) {
    ctx.err(new AlreadyInitializedError(paths.ahDir).message);
    return 1;
  }
  const password = await ctx.prompt(opts.reset ? 'New admin password: ' : 'Admin password: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.err(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
    return 1;
  }
  const again = await ctx.prompt('Repeat the password: ');
  if (again !== password) {
    ctx.err('The passwords do not match.');
    return 1;
  }
  try {
    const r = await initAh({ homeDir: ctx.homeDir, password, reset: opts.reset });
    ctx.out(r.reset ? `Admin password changed; all dashboard sessions were signed out. (${r.paths.ahDir})` : `Initialised ${r.paths.ahDir}. Run \`ah\` to open the dashboard.`);
    return 0;
  } catch (err) {
    if (err instanceof AlreadyInitializedError) {
      ctx.err(err.message);
      return 1;
    }
    throw err;
  }
}
