import type { CoreDeps } from '@agentic-hub/core';

export interface ServerOptions {
  /** Core dependencies (paths, db and injectable providers). */
  deps: CoreDeps;
  port: number;
  /** Absolute directory of the built web UI. */
  publicDir: string;
  inflight?: Inflight;
}

/** Tracks requests that change state so shutdown can wait for them. */
export class Inflight {
  private readonly pending = new Set<Promise<unknown>>();
  track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p)).catch(() => undefined);
    return p;
  }
  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}

export type AppEnv = { Variables: { sessionHash?: string } };

export const SESSION_COOKIE = 'ah_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function canonicalHost(port: number): string {
  return `ah.localhost:${port}`;
}

export function canonicalOrigin(port: number): string {
  return `http://${canonicalHost(port)}`;
}
