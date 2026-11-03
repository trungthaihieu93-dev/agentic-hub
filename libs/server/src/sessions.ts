import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '@agentic-hub/core';
import { SESSION_TTL_MS } from './context.js';

export const hashSessionId = (id: string) => createHash('sha256').update(id).digest('hex');

export function createSession(db: Db, now: Date): string {
  const id = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (id_hash, expires_at, created_at) VALUES (?, ?, ?)').run(
    hashSessionId(id),
    new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    now.toISOString(),
  );
  return id;
}

export function sessionValid(db: Db, id: string | undefined, now: Date): string | null {
  if (!id || id.length > 100) return null;
  const hash = hashSessionId(id);
  const row = db.prepare('SELECT expires_at FROM sessions WHERE id_hash = ?').get(hash) as { expires_at: string } | undefined;
  return row && row.expires_at > now.toISOString() ? hash : null;
}

export function deleteSession(db: Db, hash: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hash);
}

export function purgeExpiredSessions(db: Db, now: Date): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
}

/** In-memory login back-off: after 5 failures, wait 1s, doubling up to 30s. */
export class LoginBackoff {
  private failures = 0;
  private until = 0;
  retryAfterMs(now: number): number {
    return Math.max(0, this.until - now);
  }
  fail(now: number): void {
    this.failures++;
    if (this.failures > 5) this.until = now + Math.min(30_000, 1000 * 2 ** (this.failures - 6));
  }
  succeed(): void {
    this.failures = 0;
    this.until = 0;
  }
}
