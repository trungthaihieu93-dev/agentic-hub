import { TARGET_IDS, type TargetId } from '@agentic-hub/shared';
import { openAhDb, readConfig, resolvePaths, type AhPaths, type CoreDeps } from '@agentic-hub/core';
import type { PasswordPrompt } from './prompt-password.js';
import type { InstanceProbes } from './single-instance.js';

export interface CliContext {
  homeDir: string;
  publicDir: string;
  /** Path of the running bundle, recorded in the pid file. */
  entry: string;
  out(line: string): void;
  err(line: string): void;
  prompt: PasswordPrompt;
  probes?: (paths: AhPaths) => InstanceProbes;
  openBrowser?: (url: string) => void;
  /** Extra core dependencies (tests inject fake providers). */
  deps?: Partial<CoreDeps>;
}

export class UsageError extends Error {}

// The Codex desktop app shares ~/.codex/auth.json with the CLI, so both names mean codex-cli.
const ALIASES: Record<string, TargetId> = { claude: 'claude-cli', codex: 'codex-cli', 'codex-desktop': 'codex-cli' };

export function parseTarget(input: string | undefined): TargetId {
  if (!input) throw new UsageError(`Missing target; use one of: ${TARGET_IDS.join(', ')} (or claude, codex)`);
  const id = ALIASES[input] ?? input;
  if (!(TARGET_IDS as readonly string[]).includes(id)) throw new UsageError(`Unknown target "${input}"; use one of: ${TARGET_IDS.join(', ')}`);
  return id as TargetId;
}

/** Open ~/.ah (it must be initialised) and build core dependencies. */
export function openCore(ctx: CliContext): CoreDeps {
  const paths = resolvePaths(ctx.homeDir);
  readConfig(paths); // throws NotInitializedError with an `ah init` hint
  return { paths, db: openAhDb(paths), ...ctx.deps };
}
