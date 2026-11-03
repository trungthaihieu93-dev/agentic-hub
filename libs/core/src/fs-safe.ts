import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { ConcurrentModificationError, ValidationError } from './errors.js';

/** fsync a directory so a rename inside it survives a crash. */
function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function fsyncDir(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Write a file atomically: exclusive temp file at the final mode, fsync, rename, fsync the directory.
 * The temp file is removed if anything fails before the rename.
 */
export function writeFileAtomic(target: string, data: string | Uint8Array, mode = 0o600): void {
  // Write through symlinks (dotfile managers) instead of replacing the link with a regular file.
  const file = isSymlink(target) ? realpathSync(target) : target;
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.ah-tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
  const fd = openSync(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
  let renamed = false;
  try {
    try {
      fchmodSync(fd, mode); // the umask may have narrowed or widened the requested mode
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      let off = 0;
      while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
    renamed = true;
    fsyncDir(dir);
  } finally {
    if (!renamed) {
      try {
        unlinkSync(tmp);
      } catch {
        /* already gone */
      }
    }
  }
}

export function ensureDir(dir: string, mode = 0o700): void {
  mkdirSync(dir, { recursive: true, mode });
  chmodSync(dir, mode);
}

/** Resolve `rel` under `root` and refuse anything that escapes it. */
export function resolveInside(root: string, rel: string): string {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  const relative = path.relative(base, full);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ValidationError(`Path ${rel} is outside ${root}`);
  }
  return full;
}

export function readJsonFile<T = Record<string, unknown>>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Detect the indentation a JSON file was written with so edits keep its formatting. */
function detectIndent(raw: string): string | number | undefined {
  const m = /^\{\r?\n([ \t]+)"/.exec(raw);
  return m ? m[1] : undefined;
}

export interface FieldEdit {
  /** The key's value before the edit; `undefined` when the key was absent. */
  previous: unknown;
}

/**
 * Change one top-level key of a JSON object file and leave every other key as it is.
 * The file's mtime is checked before the rename; on a concurrent change the edit is redone once,
 * then the call fails. Passing `undefined` removes the key.
 */
export function editJsonField(file: string, key: string, value: unknown, hooks?: { beforeCommit?: () => void }): FieldEdit {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = statSync(file, { bigint: true });
    const raw = readFileSync(file, 'utf8');
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Never echo the parser message: it quotes the file's contents, which may include tokens.
      throw new ValidationError(`${file} is not valid JSON`);
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ValidationError(`${file} does not hold a JSON object`);
    }
    const previous = obj[key];
    if (value === undefined) delete obj[key];
    else obj[key] = value;
    const indent = detectIndent(raw);
    const out = JSON.stringify(obj, null, indent) + (raw.endsWith('\n') ? '\n' : '');
    hooks?.beforeCommit?.();
    const now = statSync(file, { bigint: true });
    if (now.mtimeNs !== before.mtimeNs || now.size !== before.size) continue;
    writeFileAtomic(file, out, Number(before.mode & 0o777n));
    return { previous };
  }
  throw new ConcurrentModificationError(file);
}
