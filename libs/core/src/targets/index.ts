import type { TargetId } from '@agentic-hub/shared';
import type { CoreDeps } from '../context.js';
import { claudeCliTarget } from './claude-cli.js';
import { codexCliTarget } from './codex-cli.js';
import { claudeDesktopTarget } from './claude-desktop.js';
import type { AccountTarget } from './types.js';

type Factory = (deps: CoreDeps) => AccountTarget;

/**
 * The target registry: every target ah can switch. There is no separate codex-desktop target: the
 * Codex desktop app runs its own `codex app-server` on ~/.codex/auth.json, so codex-cli covers it.
 */
const FACTORIES: Partial<Record<TargetId, Factory>> = {
  'claude-cli': claudeCliTarget,
  'codex-cli': codexCliTarget,
  'claude-desktop': claudeDesktopTarget,
};

export function registeredTargets(): TargetId[] {
  return Object.keys(FACTORIES) as TargetId[];
}

export function getTarget(deps: CoreDeps, id: TargetId): AccountTarget {
  const f = FACTORIES[id];
  if (!f) throw new Error(`Unknown target ${id}`);
  return f(deps);
}

export type { AccountTarget, Account, RollbackHandle, RollbackOutcome, SwitchPlan, VerifyResult } from './types.js';
export { appProcesses, carrySharedFiles, parseSingletonLock, sameDevice, DATA_DIR } from './electron-dir.js';
