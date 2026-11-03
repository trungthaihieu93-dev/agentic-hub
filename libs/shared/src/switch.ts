export interface Proc {
  pid: number;
  /** Short process name, e.g. `claude` or `codex app-server daemon`. */
  name: string;
  cmdline: string;
}

export type SwitchOutcome = 'ok' | 'refused' | 'rolled_back' | 'failed';
export type LogOutcome = SwitchOutcome | 'recovered';
export type Actor = 'cli' | 'dashboard' | 'recovery';

export interface SwitchResult {
  outcome: SwitchOutcome;
  /** Running processes that made the switch need `force`, or that blocked a desktop switch. */
  warnings: Proc[];
  message: string;
  /** True when CLI sessions are running and the caller must confirm with `force`. */
  needsForce: boolean;
  /** True when a desktop app is running; desktop switches are always refused then. */
  appRunning: boolean;
  /** Set when the outgoing tokens had no known owner and were filed under `_unsaved`. */
  unsavedVersion?: string;
}
