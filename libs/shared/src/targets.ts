import { z } from 'zod';

export const TARGET_IDS = ['claude-cli', 'codex-cli', 'claude-desktop', 'codex-desktop'] as const;
export type TargetId = (typeof TARGET_IDS)[number];
export const targetIdSchema = z.enum(TARGET_IDS);

export type TargetKind = 'cli' | 'desktop';

export interface TargetInfo {
  id: TargetId;
  displayName: string;
  provider: 'Claude' | 'Codex';
  kind: TargetKind;
  /** Command the user runs to log in to another account before capturing it. */
  loginHint: string;
}

export const TARGET_INFO: Record<TargetId, TargetInfo> = {
  'claude-cli': { id: 'claude-cli', displayName: 'Claude Code CLI', provider: 'Claude', kind: 'cli', loginHint: 'claude auth login' },
  'codex-cli': { id: 'codex-cli', displayName: 'Codex (CLI and desktop app)', provider: 'Codex', kind: 'cli', loginHint: 'codex login' },
  'claude-desktop': { id: 'claude-desktop', displayName: 'Claude desktop', provider: 'Claude', kind: 'desktop', loginHint: 'Sign in inside the Claude desktop app' },
  'codex-desktop': { id: 'codex-desktop', displayName: 'Codex desktop', provider: 'Codex', kind: 'desktop', loginHint: 'Sign in inside the Codex desktop app' },
};
