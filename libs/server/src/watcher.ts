import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { checkLive, type CoreDeps } from '@agentic-hub/core';
import type { TargetId } from '@agentic-hub/shared';

export interface Watcher {
  close(): void;
  /** Resolves once every pending debounced check has run (for tests). */
  flush(): Promise<void>;
}

/**
 * Watch the folders that hold the CLI credential files (not the files themselves: an atomic
 * rename-replace would leave a file watch on the old inode) and re-check the live owner.
 */
export function startWatcher(deps: CoreDeps, opts: { debounceMs?: number; onError?: (err: unknown) => void } = {}): Watcher {
  const { paths } = deps;
  const debounceMs = opts.debounceMs ?? 2000;
  const specs: { dir: string; file: string; target: TargetId }[] = [
    { dir: path.dirname(paths.claudeCredentials), file: path.basename(paths.claudeCredentials), target: 'claude-cli' },
    { dir: path.dirname(paths.claudeJson), file: path.basename(paths.claudeJson), target: 'claude-cli' },
    { dir: path.dirname(paths.codexAuth), file: path.basename(paths.codexAuth), target: 'codex-cli' },
  ];
  const timers = new Map<TargetId, NodeJS.Timeout>();
  const running = new Set<Promise<void>>();
  const watchers: FSWatcher[] = [];

  const schedule = (target: TargetId) => {
    clearTimeout(timers.get(target));
    timers.set(
      target,
      setTimeout(() => {
        timers.delete(target);
        const p = checkLive(deps, target)
          .then(() => undefined)
          .catch((err) => opts.onError?.(err))
          .finally(() => running.delete(p));
        running.add(p);
      }, debounceMs),
    );
  };

  const byDir = new Map<string, typeof specs>();
  for (const s of specs) byDir.set(s.dir, [...(byDir.get(s.dir) ?? []), s]);
  for (const [dir, list] of byDir) {
    if (!existsSync(dir)) continue;
    const w = watch(dir, { persistent: false }, (_event, filename) => {
      const name = filename?.toString();
      for (const s of list) if (name === s.file) schedule(s.target);
    });
    w.on('error', (err) => opts.onError?.(err));
    watchers.push(w);
  }

  return {
    close() {
      for (const w of watchers) w.close();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
    async flush() {
      while (timers.size > 0 || running.size > 0) {
        await new Promise((r) => setTimeout(r, 20));
        await Promise.all([...running]);
      }
    },
  };
}
