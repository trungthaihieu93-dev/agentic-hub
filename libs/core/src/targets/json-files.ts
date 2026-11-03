import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { editJsonField, ensureDir, writeFileAtomic } from '../fs-safe.js';

export function readJsonOrNull<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson0600(file: string, value: unknown): void {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n', 0o600);
}

/** Set one top-level key, creating the file (0600) and its folder when missing. */
export function setJsonField(file: string, key: string, value: unknown): void {
  if (!existsSync(file)) {
    if (value === undefined) return;
    ensureDir(path.dirname(file), 0o700);
    writeJson0600(file, {});
  }
  editJsonField(file, key, value);
}

/** Restore a file's previous contents, or remove it if it did not exist. */
export function restoreFile(file: string, previous: string | null): void {
  if (previous === null) {
    try {
      unlinkSync(file);
    } catch {
      /* already absent */
    }
    return;
  }
  ensureDir(path.dirname(file), 0o700);
  writeFileAtomic(file, previous, 0o600);
}
