import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type {
  SafeUser, FeeStructureRow, DueRow, CollectInput, ReceiptRow, ReceiptDetail, DefaulterRow,
} from '../../shared/types.js';
import { audit } from './audit.js';

export function listFeeStructure(sessionId: number): FeeStructureRow[] {
  return getDb().prepare(`SELECT fs.id, fs.session_id, fs.class_name, fs.head_id,
      m.name AS head_name, fs.amount, fs.fine_flat, fs.fine_percent, fs.due_day
    FROM fee_structure fs JOIN masters m ON m.id = fs.head_id
    WHERE fs.session_id = ? ORDER BY fs.class_name, m.name`).all(sessionId) as FeeStructureRow[];
}

export function saveFeeStructure(sessionId: number, rows: {
  class_name: string; head_id: number; amount: number; fine_flat?: number; fine_percent?: number; due_day?: number;
}[], user: SafeUser): void {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO fee_structure (session_id, class_name, head_id, amount, fine_flat, fine_percent, due_day)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, class_name, head_id) DO UPDATE SET amount = excluded.amount,
      fine_flat = excluded.fine_flat, fine_percent = excluded.fine_percent, due_day = excluded.due_day`);
  const txn = db.transaction(() => {
    for (const r of rows) stmt.run(sessionId, r.class_name, r.head_id, r.amount, r.fine_flat ?? 0, r.fine_percent ?? 0, r.due_day ?? 10);
  });
  txn();
  audit(user, 'fees.structure.save', 'fee-structure', sessionId, null, { count: rows.length });
}

/** FR-FEE-02: copy previous session's structure with one click. */
export function copyFeeStructure(fromSessionId: number, toSessionId: number, user: SafeUser): number {
  const db = getDb();
  const rows = db.prepare('SELECT class_name, head_id, amount, fine_flat, fine_percent, due_day FROM fee_structure WHERE session_id = ?')
    .all(fromSessionId) as { class_name: string; head_id: number; amount: number; fine_flat: number; fine_percent: number; due_day: number }[];
  if (!rows.length) return 0;
  saveFeeStructure(toSessionId, rows, user);
  return rows.length;
}

/** Generate dues for all active students of a session from the structure (idempotent). */
export function generateDues(sessionId: number, monthLabel: string, user: SafeUser): number {
  const db = getDb();
  const students = db.prepare("SELECT id, class_name FROM students WHERE session_id = ? AND status = 'active' AND is_deleted = 0")
    .all(sessionId) as { id: number; class_name: string }[];
  const struct = db.prepare('SELECT class_name, head_id, amount, fine_flat, fine_percent, due_day FROM fee_structure WHERE session_id = ?')
    .all(sessionId) as { class_name: string; head_id: number; amount: number; fine_flat: number; fine_percent: number; due_day: number }[];
  const headNames = new Map((db.prepare("SELECT id, name FROM masters WHERE kind = 'fee-head'").all() as { id: number; name: string }[]).map((r) => [r.id, r.name]));
  const stmt = db.prepare(`INSERT OR IGNORE INTO fee_dues
    (student_id, session_id, head_id, head_name, amount, fine, due_date, month_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  const txn = db.transaction(() => {
    for (const s of students) {
      for (const fs of struct) {
        if (fs.class_name !== s.class_name) continue;
        const dueDate = `${monthLabel.slice(0, 7)}-${String(fs.due_day).padStart(2, '0')}`;
        const r = stmt.run(s.id, sessionId, fs.head_id, headNames.get(fs.head_id) ?? '', fs.amount, 0, dueDate, monthLabel);
        if (r.changes) n++;
      }
    }
  });
  txn();
  audit(user, 'fees.dues.generate', 'fee-dues', sessionId, null, { monthLabel, count: n });
  return n;
}

export function listDues(studentId: number): DueRow[] {
  return getDb().prepare(`SELECT d.id, d.student_id, s.name AS student_name, s.admission_no,
      s.class_name, s.section, d.head_id, d.head_name, d.amount, d.discount, d.fine, d.paid,
      d.due_date, d.month_label, d.status,
      (d.amount + d.fine - d.discount - d.paid) AS payable
    FROM fee_dues d JOIN students s ON s.id = d.student_id
    WHERE d.student_id = ? AND d.status != 'paid'
    ORDER BY d.due_date, d.id`).all(studentId) as DueRow[];
}

/**
 * FR-FEE-03: collect fee — discounts applied first, then tendered auto-split
 * oldest-due-first. Receipt number allocated atomically inside the same
 * transaction (BR-01: no gaps even on crash).
 */
export function collectFee(input: CollectInput, user: SafeUser): { receipt_id: number; receipt_no: string; change: number } {
  const db = getDb();
  if (input.tendered < 0) throw new Error('invalid-amount');
  const result = db.transaction(() => {
    // 1. Apply discounts
    if (input.discounts?.length) {
      const dStmt = db.prepare(`UPDATE fee_dues SET discount = discount + ?, discount_reason = ?, discount_approved_by = ?
        WHERE id = ? AND student_id = ?`);
      for (const d of input.discounts) {
        if (d.amount <= 0) continue;
        dStmt.run(d.amount, d.reason, d.approved_by, d.due_id, input.student_id);
      }
    }
    // 2. Oldest-due-first split
    const dues = db.prepare(`SELECT id, head_id, head_name, (amount + fine - discount - paid) AS payable
      FROM fee_dues WHERE student_id = ? AND status != 'paid' ORDER BY due_date, id`).all(input.student_id) as
      { id: number; head_id: number; head_name: string; payable: number }[];
    let remaining = Math.round(input.tendered * 100) / 100;
    const lines: { due_id: number; head_id: number; head_name: string; amount: number }[] = [];
    const paidStmt = db.prepare(`UPDATE fee_dues SET paid = paid + ?,
      status = CASE WHEN (paid + ?) >= (amount + fine - discount) - 0.005 THEN 'paid'
                   WHEN (paid + ?) > 0.005 THEN 'partial' ELSE status END WHERE id = ?`);
    for (const due of dues) {
      if (remaining <= 0.005) break;
      const pay = Math.min(remaining, Math.round(due.payable * 100) / 100);
      if (pay <= 0.005) continue;
      paidStmt.run(pay, pay, pay, due.id);
      lines.push({ due_id: due.id, head_id: due.head_id, head_name: due.head_name, amount: pay });
      remaining = Math.round((remaining - pay) * 100) / 100;
    }
    const total = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    if (total <= 0) throw new Error('nothing-to-collect');
    // 3. Receipt (number allocated here — inside the txn, no gaps on crash)
    const receipt_no = nextNumber('receipt');
    const r = db.prepare(`INSERT INTO receipts
      (receipt_no, student_id, session_id, total, tendered, change_given, mode, ref_no, bank, cheque_date, notes,
       cheque_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(receipt_no, input.student_id, input.session_id, total, input.tendered,
        Math.round((input.tendered - total) * 100) / 100,
        input.mode, input.ref_no ?? '', input.bank ?? '', input.cheque_date ?? '',
        input.notes ?? '', input.mode === 'cheque' ? 'pending' : '', user.id);
    const receipt_id = Number(r.lastInsertRowid);
    const lStmt = db.prepare('INSERT INTO receipt_lines (receipt_id, due_id, head_id, head_name, amount) VALUES (?, ?, ?, ?, ?)');
    for (const l of lines) lStmt.run(receipt_id, l.due_id, l.head_id, l.head_name, l.amount);
    audit(user, 'fees.collect', 'receipt', receipt_id, null, { receipt_no, total, mode: input.mode });
    return { receipt_id, receipt_no, change: Math.round((input.tendered - total) * 100) / 100 };
  })();
  return result;
}

/** FR-FEE-07: cancel (never delete) with reason; dues reinstated. */
export function cancelReceipt(receiptId: number, reason: string, user: SafeUser): void {
  const db = getDb();
  if (!reason.trim()) throw new Error('reason-required');
  const txn = db.transaction(() => {
    const rc = db.prepare('SELECT status FROM receipts WHERE id = ?').get(receiptId) as { status: string } | undefined;
    if (!rc || rc.status === 'cancelled') throw new Error('already-cancelled');
    const lines = db.prepare('SELECT due_id, amount FROM receipt_lines WHERE receipt_id = ?').all(receiptId) as { due_id: number; amount: number }[];
    const back = db.prepare(`UPDATE fee_dues SET paid = paid - ?,
      status = CASE WHEN (paid - ?) <= 0.005 THEN 'due' ELSE 'partial' END WHERE id = ?`);
    for (const l of lines) back.run(l.amount, l.amount, l.due_id);
    db.prepare(`UPDATE receipts SET status = 'cancelled', cancelled_reason = ?, cancelled_by = ?, cancelled_at = datetime('now') WHERE id = ?`)
      .run(reason.trim(), user.id, receiptId);
  });
  txn();
  audit(user, 'fees.receipt.cancel', 'receipt', receiptId, null, { reason });
}

/** FR-FEE-04: cheque bounce — dues reinstated + bounce charge due added. */
export function chequeBounce(receiptId: number, bounceCharge: number, user: SafeUser): void {
  const db = getDb();
  const txn = db.transaction(() => {
    const rc = db.prepare("SELECT student_id, session_id, mode, cheque_status FROM receipts WHERE id = ?").get(receiptId) as
      { student_id: number; session_id: number | null; mode: string; cheque_status: string } | undefined;
    if (!rc || rc.mode !== 'cheque' || rc.cheque_status === 'bounced') throw new Error('invalid-cheque');
    cancelReceiptInner(db, receiptId, 'Cheque bounced', user.id);
    db.prepare("UPDATE receipts SET cheque_status = 'bounced' WHERE id = ?").run(receiptId);
    if (bounceCharge > 0) {
      const head = db.prepare("SELECT id, name FROM masters WHERE kind = 'fee-head' AND name LIKE '%bounce%' AND is_active = 1 LIMIT 1").get() as
        { id: number; name: string } | undefined;
      const headId = head?.id ?? 0; const headName = head?.name ?? 'Cheque Bounce Charge';
      db.prepare(`INSERT INTO fee_dues (student_id, session_id, head_id, head_name, amount, due_date, month_label)
        VALUES (?, ?, ?, ?, ?, date('now'), 'bounce')`).run(rc.student_id, rc.session_id, headId, headName, bounceCharge);
    }
  });
  txn();
  audit(user, 'fees.cheque.bounce', 'receipt', receiptId, null, { bounceCharge });
}

function cancelReceiptInner(db: ReturnType<typeof getDb>, receiptId: number, reason: string, userId: number): void {
  const lines = db.prepare('SELECT due_id, amount FROM receipt_lines WHERE receipt_id = ?').all(receiptId) as { due_id: number; amount: number }[];
  const back = db.prepare(`UPDATE fee_dues SET paid = paid - ?,
    status = CASE WHEN (paid - ?) <= 0.005 THEN 'due' ELSE 'partial' END WHERE id = ?`);
  for (const l of lines) back.run(l.amount, l.amount, l.due_id);
  db.prepare(`UPDATE receipts SET status = 'cancelled', cancelled_reason = ?, cancelled_by = ?, cancelled_at = datetime('now') WHERE id = ?`)
    .run(reason, userId, receiptId);
}

export function listReceipts(f: { q?: string; from?: string; to?: string; mode?: string; status?: string; limit?: number; offset?: number }):
  { rows: ReceiptRow[]; total: number } {
  const db = getDb();
  const where = ['1=1']; const vals: unknown[] = [];
  if (f.q) { where.push('(r.receipt_no LIKE ? OR s.name LIKE ?)'); vals.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.from) { where.push('r.date >= ?'); vals.push(f.from); }
  if (f.to) { where.push('r.date <= ?'); vals.push(f.to); }
  if (f.mode) { where.push('r.mode = ?'); vals.push(f.mode); }
  if (f.status) { where.push('r.status = ?'); vals.push(f.status); }
  const w = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM receipts r JOIN students s ON s.id = r.student_id WHERE ${w}`).get(...vals) as { c: number }).c;
  const rows = db.prepare(`SELECT r.id, r.receipt_no, r.date, s.name AS student_name, s.admission_no,
      s.class_name, r.total, r.tendered, r.mode, r.status, r.created_at
    FROM receipts r JOIN students s ON s.id = r.student_id
    WHERE ${w} ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(...vals, f.limit ?? 100, f.offset ?? 0) as ReceiptRow[];
  return { rows, total };
}

export function getReceipt(id: number): ReceiptDetail | null {
  const db = getDb();
  const r = db.prepare(`SELECT r.id, r.receipt_no, r.date, s.name AS student_name, s.admission_no, s.class_name,
      s.father_name, s.address, r.total, r.tendered, r.change_given, r.mode, r.ref_no, r.bank,
      r.notes, r.status, r.cancelled_reason, r.created_at
    FROM receipts r JOIN students s ON s.id = r.student_id WHERE r.id = ?`).get(id) as ReceiptDetail | undefined;
  if (!r) return null;
  const lines = db.prepare('SELECT head_name, amount FROM receipt_lines WHERE receipt_id = ?').all(id) as { head_name: string; amount: number }[];
  return { ...r, lines };
}

/** FR-FEE-08: defaulter engine with aging buckets. */
export function defaulters(sessionId: number | null, className?: string): DefaulterRow[] {
  const db = getDb();
  const where = ["d.status != 'paid'", "s.status = 'active'", 's.is_deleted = 0'];
  const vals: unknown[] = [];
  if (sessionId) { where.push('d.session_id = ?'); vals.push(sessionId); }
  if (className) { where.push('s.class_name = ?'); vals.push(className); }
  const w = where.join(' AND ');
  return db.prepare(`SELECT d.student_id AS id, d.student_id, s.name AS student_name, s.admission_no, s.class_name, s.section,
      s.father_phone,
      SUM(d.amount + d.fine - d.discount - d.paid) AS total_due,
      SUM(CASE WHEN julianday('now') - julianday(d.due_date) <= 30 THEN d.amount + d.fine - d.discount - d.paid ELSE 0 END) AS bucket_0_30,
      SUM(CASE WHEN julianday('now') - julianday(d.due_date) BETWEEN 31 AND 60 THEN d.amount + d.fine - d.discount - d.paid ELSE 0 END) AS bucket_31_60,
      SUM(CASE WHEN julianday('now') - julianday(d.due_date) BETWEEN 61 AND 90 THEN d.amount + d.fine - d.discount - d.paid ELSE 0 END) AS bucket_61_90,
      SUM(CASE WHEN julianday('now') - julianday(d.due_date) > 90 THEN d.amount + d.fine - d.discount - d.paid ELSE 0 END) AS bucket_90p
    FROM fee_dues d JOIN students s ON s.id = d.student_id
    WHERE ${w}
    GROUP BY d.student_id HAVING total_due > 0.005
    ORDER BY total_due DESC`).all(...vals) as DefaulterRow[];
}

/** FR-FEE-05: discount register. */
export function discountRegister(from: string, to: string): { due_id: number; student_name: string; admission_no: string; head_name: string; discount: number; reason: string; approved_by: string; date: string }[] {
  return getDb().prepare(`SELECT d.id AS due_id, s.name AS student_name, s.admission_no, d.head_name,
      d.discount, d.discount_reason AS reason, d.discount_approved_by AS approved_by, d.created_at AS date
    FROM fee_dues d JOIN students s ON s.id = d.student_id
    WHERE d.discount > 0 AND date(d.created_at) BETWEEN ? AND ?
    ORDER BY d.created_at DESC`).all(from, to) as never;
}

/** FR-FEE-09: collection summaries. */
export function collectionSummary(from: string, to: string, groupBy: 'day' | 'head' | 'mode'): { label: string; total: number; count: number }[] {
  const db = getDb();
  if (groupBy === 'day') {
    return db.prepare(`SELECT r.date AS label, SUM(r.total) AS total, COUNT(*) AS count
      FROM receipts r WHERE r.status = 'active' AND r.date BETWEEN ? AND ? GROUP BY r.date ORDER BY r.date`).all(from, to) as never;
  }
  if (groupBy === 'mode') {
    return db.prepare(`SELECT r.mode AS label, SUM(r.total) AS total, COUNT(*) AS count
      FROM receipts r WHERE r.status = 'active' AND r.date BETWEEN ? AND ? GROUP BY r.mode`).all(from, to) as never;
  }
  return db.prepare(`SELECT l.head_name AS label, SUM(l.amount) AS total, COUNT(*) AS count
    FROM receipt_lines l JOIN receipts r ON r.id = l.receipt_id
    WHERE r.status = 'active' AND r.date BETWEEN ? AND ? GROUP BY l.head_name ORDER BY total DESC`).all(from, to) as never;
}
