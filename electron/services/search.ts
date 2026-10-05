import { getDb } from './database.js';
import type { SearchResult } from '../../shared/types.js';

/** FR-GLB-01: global search (Ctrl+K) over the FTS5 index. */
export function globalSearch(q: string, limit = 25): SearchResult[] {
  const query = q.trim();
  if (query.length < 2) return [];
  const db = getDb();
  // Trigram tokenization handles partial matches; quote user input safely.
  const safe = query.replace(/"/g, '""').replace(/[*^:()\-+]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return [];
  try {
    const rows = db.prepare(`SELECT kind, ref_id, title, subtitle
      FROM global_search WHERE global_search MATCH ? ORDER BY rank LIMIT ?`).all(`"${safe}"`, limit) as
      { kind: string; ref_id: number; title: string; subtitle: string }[];
    return rows.map((r) => ({
      kind: r.kind as SearchResult['kind'],
      id: r.ref_id,
      title: r.title,
      subtitle: r.subtitle,
    }));
  } catch {
    return [];
  }
}

/** Rebuild the FTS index (used after bulk imports). */
export function rebuildSearchIndex(): void {
  const db = getDb();
  db.exec(`DELETE FROM global_search;
    INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
    SELECT 'student', id, name, admission_no || ' · ' || class_name || '-' || section,
           name || ' ' || admission_no || ' ' || father_phone || ' ' || mother_phone || ' ' || guardian_phone
    FROM students WHERE is_deleted = 0;
    INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
    SELECT 'receipt', id, receipt_no, '₹' || total || ' · ' || date, receipt_no FROM receipts;
    INSERT INTO global_search (kind, ref_id, title, subtitle, tokens)
    SELECT 'staff', id, name, employee_code || ' · ' || designation,
           name || ' ' || employee_code || ' ' || phone FROM staff WHERE is_deleted = 0;`);
}
