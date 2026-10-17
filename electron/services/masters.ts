import { getDb } from './database.js';

/**
 * Subject masters are stored per class in the shared `masters` table:
 *   kind = 'subject', extra = JSON '{"class":"V"}'
 * Every section of a class shares the same subjects, so sections play no role.
 * `''` means a legacy subject saved before per-class subjects existed.
 */
export function masterSubjectClass(ex: unknown): string {
  try {
    const o = typeof ex === 'string' ? JSON.parse(ex || '{}') : (ex ?? {});
    return typeof (o as { class?: unknown }).class === 'string' ? (o as { class: string }).class : '';
  } catch {
    return '';
  }
}

/** Throws 'name-exists' when the subject name is already taken within the same class. */
export function assertSubjectNameAvailable(name: string, extra: string, ignoreId?: number): void {
  const cls = masterSubjectClass(extra);
  const dup = (
    getDb()
      .prepare("SELECT id, extra FROM masters WHERE kind = 'subject' AND LOWER(name) = LOWER(?) AND is_active = 1")
      .all(name.trim()) as { id: number; extra: string }[]
  ).find((r) => r.id !== ignoreId && masterSubjectClass(r.extra) === cls);
  if (dup) throw new Error('name-exists');
}

/**
 * Assigns legacy unassigned subjects to a class. Skips rows that are already
 * assigned and names that would clash inside the target class.
 * Returns the number of rows moved.
 */
export function setSubjectsClass(ids: number[], className: string): number {
  const db = getDb();
  const target = className.trim();
  if (!target || ids.length === 0) throw new Error('invalid-input');
  const targetExtra = JSON.stringify({ class: target });
  let moved = 0;
  const upd = db.prepare("UPDATE masters SET extra = ? WHERE id = ? AND kind = 'subject' AND is_active = 1");
  const txn = db.transaction(() => {
    for (const id of ids) {
      const row = db
        .prepare("SELECT name, extra FROM masters WHERE id = ? AND kind = 'subject' AND is_active = 1")
        .get(id) as { name: string; extra: string } | undefined;
      if (!row || masterSubjectClass(row.extra) !== '') continue;
      const clash = (
        db
          .prepare("SELECT id, extra FROM masters WHERE kind = 'subject' AND LOWER(name) = LOWER(?) AND is_active = 1")
          .all(row.name) as { id: number; extra: string }[]
      ).some((r) => r.id !== id && masterSubjectClass(r.extra) === target);
      if (clash) continue;
      upd.run(targetExtra, id);
      moved++;
    }
  });
  txn();
  return moved;
}
