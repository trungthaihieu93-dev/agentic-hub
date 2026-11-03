import type { TargetId } from '@agentic-hub/shared';
import type { Identity, OwnerCheck } from '../identity.js';
import type { ProcInfo } from '../processes.js';

export interface Account {
  id: string;
  target: TargetId;
  label: string;
  identityKey: string | null;
  email: string | null;
  orgName: string | null;
  tokenFingerprint: string | null;
  profilePath: string;
  createdAt: string;
  capturedAt: string;
}

/** Enough information to undo an install, written to the journal before the install starts. */
export type RollbackHandle =
  | {
      kind: 'field';
      /** `installed` is what this switch writes; rollback only touches fields that still hold it. */
      fields: { file: string; key: string; previous: unknown; existed: boolean; installed: unknown }[];
    }
  | { kind: 'file'; file: string; previous: string | null; installedHash: string }
  | { kind: 'rename'; moves: { from: string; to: string }[]; liveDir: string };

/**
 * What a rollback did: restored the previous login, found nothing to undo, or left the live login
 * alone because something other than this switch changed it after the install.
 */
export type RollbackOutcome = 'restored' | 'unchanged' | 'kept-live';

export interface SwitchPlan {
  incoming: Account;
  /** Absolute `current` version dir of the incoming account. */
  incomingDir: string;
  /** Active account before the switch (desktop targets move the live dir into it). */
  outgoing: Account | null;
  /** Absolute dir of a new version for the outgoing account (desktop targets only). */
  outgoingVersionDir: string | null;
}

export interface VerifyResult {
  ok: boolean;
  /** Set when the install could not be confirmed but was kept. */
  warning?: string;
  reason?: string;
}

export interface AccountTarget {
  id: TargetId;
  /** 'token': the owner is resolved from the tokens; 'none': the engine trusts active_accounts. */
  identity: 'token' | 'none';
  rollback: 'field' | 'file' | 'rename';
  requiresAppClosed: boolean;
  /** Whether the target can be switched at all on this machine. */
  enabled(): { ok: true } | { ok: false; reason: string };
  runningProcesses(): Promise<ProcInfo[]>;
  /** Cheap display identity read from local files. */
  readLiveIdentity(): Promise<Identity | null>;
  /** Server- or file-backed owner of the live tokens. */
  resolveLiveOwner(): Promise<OwnerCheck>;
  liveFingerprint(): Promise<string | null>;
  /** Save the live login into `versionDir`; `owner` is who the provider says owns the tokens. */
  snapshotTo(versionDir: string, owner?: Identity): Promise<void>;
  /** Owner of the tokens saved in a version dir, without network calls. */
  fingerprintOf(versionDir: string): Promise<string | null>;
  prepareRollback(plan: SwitchPlan): Promise<RollbackHandle>;
  installFrom(plan: SwitchPlan, handle: RollbackHandle): Promise<void>;
  rollbackWith(handle: RollbackHandle): Promise<RollbackOutcome>;
  verifyInstalled(plan: SwitchPlan): Promise<VerifyResult>;
  /** Runs the snapshot-and-install section, e.g. under the provider's own auth lock. */
  critical<T>(fn: () => Promise<T>): Promise<T>;
  /**
   * Token targets: make the live display metadata match a snapshot whose tokens are already live
   * (e.g. Claude's `oauthAccount` after a drifted session). Never touches tokens.
   */
  alignLiveMetadata?(versionDir: string): Promise<void>;
  /** Desktop targets: throws when there is no live data dir to capture. */
  assertCapturable?(): void;
  /** Desktop targets: files carried across every switch (shown in the UI). */
  sharedFiles?: string[];
  /** Desktop targets: create an empty data dir, holding only the shared files, inside a version dir. */
  seedEmpty?(versionDir: string): void;
  /** Optional: start the app again after a switch. */
  relaunch?(): void;
}
