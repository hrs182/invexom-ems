import { getDb } from './database.js';

/**
 * Atomic document numbering (BR-01): receipt/voucher/admission numbers are
 * sequential with no gaps. Generation runs inside a DB transaction, so a
 * power cut mid-save can never create a gap or a duplicate (NFR-R-01).
 *
 * Patterns support tokens: {YYYY} {YY} {MM} {SEQ:n} {PREFIX? no—prefix is literal}
 * Examples: "R-{YYYY}-{SEQ:5}" -> R-2026-00001 ; "INV/2026/{SEQ:4}" -> INV/2026/0001
 */

export interface NumberingRow { key: string; label: string; pattern: string; last_seq: number }

const TOKEN_RE = /\{(YYYY|YY|MM|SEQ:(\d+))\}/g;

export function formatPattern(pattern: string, seq: number, date = new Date()): string {
  return pattern.replace(TOKEN_RE, (_m, token: string, seqWidth: string) => {
    if (token === 'YYYY') return String(date.getFullYear());
    if (token === 'YY') return String(date.getFullYear()).slice(2);
    if (token === 'MM') return String(date.getMonth() + 1).padStart(2, '0');
    if (token.startsWith('SEQ')) return String(seq).padStart(parseInt(seqWidth, 10), '0');
    return _m;
  });
}

/** Allocate the next number for `key`, atomically. */
export function nextNumber(key: string, date = new Date()): string {
  const db = getDb();
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT key, label, pattern, last_seq FROM numbering WHERE key = ?').get(key) as NumberingRow | undefined;
    if (!row) throw new Error(`unknown-numbering-key:${key}`);
    const next = row.last_seq + 1;
    db.prepare('UPDATE numbering SET last_seq = ? WHERE key = ?').run(next, key);
    return formatPattern(row.pattern, next, date);
  });
  return txn();
}

/** Peek what the next number would look like (does not allocate). */
export function peekNumber(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT pattern, last_seq FROM numbering WHERE key = ?').get(key) as { pattern: string; last_seq: number } | undefined;
  if (!row) throw new Error(`unknown-numbering-key:${key}`);
  return formatPattern(row.pattern, row.last_seq + 1);
}

export function listNumbering(): (NumberingRow & { example: string })[] {
  const db = getDb();
  const rows = db.prepare('SELECT key, label, pattern, last_seq FROM numbering ORDER BY key').all() as NumberingRow[];
  return rows.map((r) => ({ ...r, example: formatPattern(r.pattern, r.last_seq + 1) }));
}

export function setPattern(key: string, pattern: string): void {
  if (!pattern.includes('{SEQ')) throw new Error('pattern must contain a {SEQ:n} token');
  // Validate tokens
  const stripped = pattern.replace(TOKEN_RE, '');
  if (/\{.*?\}/.test(stripped)) throw new Error('pattern contains unknown tokens');
  getDb().prepare('UPDATE numbering SET pattern = ? WHERE key = ?').run(pattern, key);
}

export const DEFAULT_NUMBERING: { key: string; label: string; pattern: string }[] = [
  { key: 'receipt', label: 'Fee receipt', pattern: 'R-{YYYY}-{SEQ:5}' },
  { key: 'voucher', label: 'Accounting voucher', pattern: 'V-{YYYY}-{SEQ:5}' },
  { key: 'admission', label: 'Admission number', pattern: 'INV/{YYYY}/{SEQ:4}' },
  { key: 'employee', label: 'Employee code', pattern: 'EMP-{SEQ:4}' },
  { key: 'gatepass', label: 'Gate pass', pattern: 'GP-{YYYY}-{SEQ:4}' },
];
