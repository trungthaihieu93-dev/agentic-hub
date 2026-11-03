import type { AuditEntry } from '@agentic-hub/shared';
import type { Db } from './db/index.js';

export function listAudit(db: Db, limit = 50): AuditEntry[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.target, f.label AS from_label, t.label AS to_label, l.actor, l.outcome, l.message, l.created_at
       FROM switch_log l
       LEFT JOIN accounts f ON f.id = l.from_account_id
       LEFT JOIN accounts t ON t.id = l.to_account_id
       ORDER BY l.id DESC LIMIT ?`,
    )
    .all(Math.max(1, Math.min(500, limit))) as unknown as {
    id: number;
    target: AuditEntry['target'];
    from_label: string | null;
    to_label: string | null;
    actor: AuditEntry['actor'];
    outcome: AuditEntry['outcome'];
    message: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    target: r.target,
    fromLabel: r.from_label,
    toLabel: r.to_label,
    actor: r.actor,
    outcome: r.outcome,
    message: r.message,
    createdAt: r.created_at,
  }));
}
