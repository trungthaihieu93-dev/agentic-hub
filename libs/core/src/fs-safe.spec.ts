import { mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { editJsonField, resolveInside, writeFileAtomic } from './fs-safe.js';
import { makeTempHome, type TempHome } from './testing/temp-home.js';

describe('fs-safe', () => {
  let t: TempHome;
  beforeEach(() => (t = makeTempHome()));
  afterEach(() => t.cleanup());

  it('writes atomically at the requested mode even with a loose umask', () => {
    const old = process.umask(0o002);
    try {
      const f = path.join(t.homeDir, 'a.json');
      writeFileAtomic(f, '{"a":1}', 0o600);
      expect(statSync(f).mode & 0o777).toBe(0o600);
      expect(readFileSync(f, 'utf8')).toBe('{"a":1}');
    } finally {
      process.umask(old);
    }
  });

  it('leaves no temp file when the write fails', () => {
    const f = path.join(t.homeDir, 'missing-dir', 'a.json');
    expect(() => writeFileAtomic(f, 'x')).toThrow();
    // Renaming onto an existing directory fails after the temp file was written.
    const dir = path.join(t.homeDir, 'sub');
    mkdirSync(dir);
    mkdirSync(path.join(dir, 'taken'));
    writeFileSync(path.join(dir, 'taken', 'keep'), '1');
    expect(() => writeFileAtomic(path.join(dir, 'taken'), 'x')).toThrow();
    expect(readdirSync(dir).filter((n) => n.includes('ah-tmp'))).toEqual([]);
  });

  it('edits one key and keeps the others, the mode and the indentation', () => {
    const f = path.join(t.homeDir, 'c.json');
    writeFileSync(f, JSON.stringify({ a: 1, b: { x: [1, 2] }, c: 'z' }, null, 2) + '\n', { mode: 0o640 });
    const { previous } = editJsonField(f, 'b', { y: 1 });
    expect(previous).toEqual({ x: [1, 2] });
    const raw = readFileSync(f, 'utf8');
    expect(JSON.parse(raw)).toEqual({ a: 1, b: { y: 1 }, c: 'z' });
    expect(raw).toMatch(/^\{\n {2}"a"/);
    expect(statSync(f).mode & 0o777).toBe(0o640);
  });

  it('retries once and then fails when the file keeps changing', () => {
    const f = path.join(t.homeDir, 'd.json');
    writeFileSync(f, '{"a":1}');
    let n = 0;
    const bump = () => {
      n++;
      const when = new Date(Date.now() + n * 10_000);
      utimesSync(f, when, when);
    };
    expect(() => editJsonField(f, 'a', 2, { beforeCommit: bump })).toThrow(/kept changing/);
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });

    let once = false;
    editJsonField(f, 'a', 3, {
      beforeCommit: () => {
        if (!once) {
          once = true;
          bump();
        }
      },
    });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 3 });
  });

  it('resolveInside rejects paths that leave the root', () => {
    expect(resolveInside('/r', 'a/b')).toBe('/r/a/b');
    expect(() => resolveInside('/r', '../x')).toThrow();
    expect(() => resolveInside('/r', 'a/../../x')).toThrow();
    expect(() => resolveInside('/r', '/etc/passwd')).toThrow();
    expect(() => resolveInside('/r', '.')).toThrow();
  });
});
