import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Actor, TargetId } from '@agentic-hub/shared';
import { fsyncDir, writeFileAtomic } from './fs-safe.js';
import type { AhPaths } from './paths.js';
import type { RollbackHandle } from './targets/types.js';

export type JournalStep = 'started' | 'installing' | 'installed' | 'verified';

export interface Journal {
  step: JournalStep;
  target: TargetId;
  from: string | null;
  to: string;
  actor: Actor;
  handle: RollbackHandle | null;
  startedAt: string;
}

export function readJournal(paths: AhPaths): Journal | null {
  if (!existsSync(paths.journalFile)) return null;
  return JSON.parse(readFileSync(paths.journalFile, 'utf8')) as Journal;
}

/** Write the journal durably (atomic write plus directory fsync) before the step it names. */
export function writeJournal(paths: AhPaths, j: Journal): void {
  writeFileAtomic(paths.journalFile, JSON.stringify(j), 0o600);
}

export function clearJournal(paths: AhPaths): void {
  try {
    unlinkSync(paths.journalFile);
    fsyncDir(path.dirname(paths.journalFile));
  } catch {
    /* already gone */
  }
}
