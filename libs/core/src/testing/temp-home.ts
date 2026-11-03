import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Throws when code running under vitest resolves paths against the real home directory. */
export function assertNotRealHome(homeDir: string): void {
  if (process.env['VITEST'] && path.resolve(homeDir) === path.resolve(os.homedir())) {
    throw new Error('Refusing to use the real home directory inside tests; use makeTempHome()');
  }
}

export interface TempHome {
  homeDir: string;
  cleanup(): void;
}

export function makeTempHome(prefix = 'ah-test-'): TempHome {
  const homeDir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { homeDir, cleanup: () => rmSync(homeDir, { recursive: true, force: true }) };
}
