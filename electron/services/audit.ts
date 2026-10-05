import { getDb } from './database.js';

/** Append-only audit trail (NFR-S-02). Never delete from this table. */
export function audit(
  user: { id: number | null; username: string } | null,
  action: string,
  entity: string,
  entityId: string | number = '',
  oldValue: unknown = null,
  newValue: unknown = null,
): void {
  try {
    getDb().prepare(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user?.id ?? null,
      user?.username ?? 'system',
      action,
      entity,
      String(entityId),
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
    );
  } catch {
    // Audit must never break the operation it records.
  }
}

export function recentAudit(limit = 100): unknown[] {
  return getDb()
    .prepare('SELECT id, created_at AS createdAt, username, action, entity, entity_id AS entityId, old_value AS oldValue, new_value AS newValue FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(limit);
}
