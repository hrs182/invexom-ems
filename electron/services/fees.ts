import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type {
  SafeUser, FeeStructureRow, DueRow, CollectInput, ReceiptRow, ReceiptDetail, DefaulterRow,
} from '../../shared/types.js';
import { audit } from './audit.js';

export function listFeeStructure(sessionId: number): FeeStructureRow[] {
  return getDb().prepare(`SELECT fs.id, fs.session_id, fs.class_name, fs.section, fs.head_id,
      m.name AS head_name, fs.month_label, fs.amount, fs.fine_flat, fs.fine_percent, fs.due_day
    FROM fee_structure fs JOIN masters m ON m.id = fs.head_id
    WHERE fs.session_id = ? ORDER BY fs.class_name, fs.section, fs.month_label, m.name`).all(sessionId) as FeeStructureRow[];
}

export function saveFeeStructure(sessionId: number, rows: {
  class_name: string; section?: string; head_id: number; month_label?: string;
  amount: number; fine_flat?: number; fine_percent?: number; due_day?: number;
}[], user: SafeUser): void {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO fee_structure (session_id, class_name, section, head_id, month_label, amount, fine_flat, fine_percent, due_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, class_name, section, head_id, month_label) DO UPDATE SET amount = excluded.amount,
      fine_flat = excluded.fine_flat, fine_percent = excluded.fine_percent, due_day = excluded.due_day`);
  const txn = db.transaction(() => {
    for (const r of rows) stmt.run(sessionId, r.class_name, r.section ?? '', r.head_id, r.month_label ?? '',
      r.amount, r.fine_flat ?? 0, r.fine_percent ?? 0, r.due_day ?? 10);
  });
  txn();
  audit(user, 'fees.structure.save', 'fee-structure', sessionId, null, { count: rows.length });
}

/** FR-FEE-02: copy previous session's structure with one click. */
export function copyFeeStructure(fromSessionId: number, toSessionId: number, user: SafeUser): number {
  const db = getDb();
  const rows = db.prepare('SELECT class_name, section, head_id, month_label, amount, fine_flat, fine_percent, due_day FROM fee_structure WHERE session_id = ?')
    .all(fromSessionId) as { class_name: string; section: string; head_id: number; month_label: string; amount: number; fine_flat: number; fine_percent: number; due_day: number }[];
  if (!rows.length) return 0;
  saveFeeStructure(toSessionId, rows, user);
  return rows.length;
}

/** Generate dues for all active students of a session from the structure (idempotent). */
export function generateDues(sessionId: number, monthLabel: string, user: SafeUser): number {
  const db = getDb();
  const students = db.prepare(`SELECT id, class_name, section, transport_allocated, transport_amount
      FROM students WHERE session_id = ? AND status = 'active' AND is_deleted = 0`)
    .all(sessionId) as { id: number; class_name: string; section: string; transport_allocated: number; transport_amount: number }[];
  const struct = db.prepare(`SELECT class_name, section, head_id, month_label, amount, fine_flat, fine_percent, due_day
      FROM fee_structure WHERE session_id = ?`)
    .all(sessionId) as { class_name: string; section: string; head_id: number; month_label: string; amount: number; fine_flat: number; fine_percent: number; due_day: number }[];
  const headNames = new Map((db.prepare("SELECT id, name FROM masters WHERE kind = 'fee-head'").all() as { id: number; name: string }[]).map((r) => [r.id, r.name]));
  // Transport head id (name match, case-insensitive)
  const transportHeadId = [...headNames.entries()].find(([, n]) => n.toLowerCase().includes('transport'))?.[0];
  const stmt = db.prepare(`INSERT OR IGNORE INTO fee_dues
    (student_id, session_id, head_id, head_name, amount, fine, due_date, month_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  // Resolve the applicable structure row: exact (class,section,month) -> (class,'',month) -> (class,section,'') -> (class,'','')
  const resolve = (className: string, section: string, headId: number): typeof struct[0] | undefined => {
    const cands: [string, string][] = [[section, monthLabel], ['', monthLabel], [section, ''], ['', '']];
    for (const [sec, mon] of cands) {
      const hit = struct.find((r) => r.class_name === className && r.section === sec && r.head_id === headId && r.month_label === mon);
      if (hit) return hit;
    }
    return undefined;
  };
  let n = 0;
  const txn = db.transaction(() => {
    for (const s of students) {
      const headIds = [...new Set(struct.filter((r) => r.class_name === s.class_name).map((r) => r.head_id))];
      for (const headId of headIds) {
        const fs = resolve(s.class_name, s.section || '', headId);
        if (!fs) continue;
        let amount = fs.amount;
        // Transport: per-student allocation overrides structure; skip if not allocated
        if (transportHeadId && headId === transportHeadId) {
          if (!s.transport_allocated) continue;
          amount = s.transport_amount || 0;
        }
        const dueDate = `${monthLabel.slice(0, 7)}-${String(fs.due_day).padStart(2, '0')}`;
        const r = stmt.run(s.id, sessionId, headId, headNames.get(headId) ?? '', amount, 0, dueDate, monthLabel);
        if (r.changes) n++;
      }
    }
  });
  txn();
  audit(user, 'fees.dues.generate', 'fee-dues', sessionId, null, { monthLabel, count: n });
  return n;
}

export function listDues(studentId: number, monthLabels?: string[], carryForward?: boolean): DueRow[] {
  const db = getDb();
  let sql = `SELECT d.id, d.student_id, s.name AS student_name, s.admission_no,
      s.class_name, s.section, d.head_id, d.head_name, d.amount, d.discount, d.fine, d.paid,
      d.due_date, d.month_label, d.status,
      (d.amount + d.fine - d.discount - d.paid) AS payable
    FROM fee_dues d JOIN students s ON s.id = d.student_id
    WHERE d.student_id = ? AND d.status != 'paid'`;
  const params: unknown[] = [studentId];
  if (monthLabels && monthLabels.length) {
    if (carryForward) {
      // Include all unpaid dues up to the latest selected month (previous partials/dues carry forward)
      const maxMonth = [...monthLabels].sort().pop()!;
      sql += ` AND d.month_label <= ?`;
      params.push(maxMonth);
    } else {
      sql += ` AND d.month_label IN (${monthLabels.map(() => '?').join(',')})`;
      params.push(...monthLabels);
    }
  }
  sql += ` ORDER BY d.due_date, d.id`;
  return db.prepare(sql).all(...params) as DueRow[];
}

/**
 * Sync dues to consolidated head totals edited in the collect form.
 * For each head: ensures dues exist for the given months, then adjusts the
 * latest month's due so the sum matches the edited total.
 */
export function syncDuesToHeads(studentId: number, sessionId: number, monthLabels: string[],
  heads: { head_id: number; head_name: string; amount: number }[]): void {
  const db = getDb();
  const headNames = new Map((db.prepare("SELECT id, name FROM masters WHERE kind = 'fee-head'").all() as { id: number; name: string }[]).map((r) => [r.id, r.name]));
  // Resolve head_id <= 0 (ad-hoc like Miscellaneous/Admission): find or create the master
  const resolveHeadId = (h: { head_id: number; head_name: string }): number => {
    if (h.head_id > 0) return h.head_id;
    const found = [...headNames.entries()].find(([, n]) => n.toLowerCase() === h.head_name.toLowerCase());
    if (found) return found[0];
    const r = db.prepare("INSERT INTO masters (kind, name) VALUES ('fee-head', ?)").run(h.head_name);
    const id = Number(r.lastInsertRowid);
    headNames.set(id, h.head_name);
    return id;
  };
  const sorted = [...monthLabels].sort();
  const txn = db.transaction(() => {
    for (const h of heads) {
      if (h.amount < 0) continue;
      const headId = resolveHeadId(h);
      // Current dues for this head in these months
      const dues = db.prepare(`SELECT id, amount, month_label FROM fee_dues
        WHERE student_id = ? AND head_id = ? AND month_label IN (${sorted.map(() => '?').join(',')}) AND status != 'paid'
        ORDER BY month_label`).all(studentId, headId, ...sorted) as { id: number; amount: number; month_label: string }[];
      const current = dues.reduce((a, d) => a + d.amount, 0);
      const diff = Math.round((h.amount - current) * 100) / 100;
      if (Math.abs(diff) < 0.005) continue;
      if (dues.length) {
        // Adjust the latest month's due
        const last = dues[dues.length - 1];
        const newAmt = Math.max(0, Math.round((last.amount + diff) * 100) / 100);
        db.prepare('UPDATE fee_dues SET amount = ? WHERE id = ?').run(newAmt, last.id);
      } else if (h.amount > 0.005) {
        // No dues yet: create one for the latest month
        const mon = sorted[sorted.length - 1];
        const dueDate = `${mon.slice(0, 7)}-10`;
        db.prepare(`INSERT INTO fee_dues (student_id, session_id, head_id, head_name, amount, due_date, month_label)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(studentId, sessionId, headId, h.head_name || headNames.get(headId) || '', h.amount, dueDate, mon);
      }
    }
  });
  txn();
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

export function listReceipts(f: { q?: string; from?: string; to?: string; mode?: string; status?: string; limit?: number; offset?: number; className?: string; section?: string; admissionNo?: string }):
  { rows: ReceiptRow[]; total: number } {
  const db = getDb();
  const where = ['1=1']; const vals: unknown[] = [];
  if (f.q) { where.push('(r.receipt_no LIKE ? OR s.name LIKE ?)'); vals.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.admissionNo) { where.push('s.admission_no LIKE ?'); vals.push(`%${f.admissionNo}%`); }
  if (f.from) { where.push('r.date >= ?'); vals.push(f.from); }
  if (f.to) { where.push('r.date <= ?'); vals.push(f.to); }
  if (f.mode) { where.push('r.mode = ?'); vals.push(f.mode); }
  if (f.status) { where.push('r.status = ?'); vals.push(f.status); }
  if (f.className) { where.push('s.class_name = ?'); vals.push(f.className); }
  if (f.section) { where.push('s.section = ?'); vals.push(f.section); }
  const w = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM receipts r JOIN students s ON s.id = r.student_id WHERE ${w}`).get(...vals) as { c: number }).c;
  const rows = db.prepare(`SELECT r.id, r.receipt_no, r.date, s.name AS student_name, s.admission_no,
      s.class_name, s.section, r.total, r.tendered, r.mode, r.status, r.created_at
    FROM receipts r JOIN students s ON s.id = r.student_id
    WHERE ${w} ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(...vals, f.limit ?? 100, f.offset ?? 0) as ReceiptRow[];
  return { rows, total };
}

/** Merge consecutive months: ["2026-04","2026-05","2026-07"] -> [["2026-04","2026-05"],["2026-07"]] */
function mergeConsecutiveMonths(months: string[]): string[][] {
  const ranges: string[][] = [];
  for (const m of months) {
    const last = ranges[ranges.length - 1];
    if (last) {
      const [py, pm] = last[last.length - 1].split('-').map(Number);
      const expected = pm === 12 ? `${py + 1}-01` : `${py}-${String(pm + 1).padStart(2, '0')}`;
      if (m === expected) { last.push(m); continue; }
    }
    ranges.push([m]);
  }
  return ranges;
}

export function fmtMonthShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Consolidate receipt lines for display: one row per fee head per consecutive
 * month-range, e.g. "Tuition Fee — Apr 2026 – Dec 2026 — ₹7000" instead of
 * 9 separate monthly rows. Keeps first-appearance head order.
 */
export function consolidateReceiptLines(
  lines: { head_name: string; amount: number; month_label?: string }[],
): { head_name: string; amount: number; month_label?: string; month_display: string }[] {
  const byHead = new Map<string, Map<string, number>>();
  const order: string[] = [];
  for (const l of lines) {
    if (!byHead.has(l.head_name)) { byHead.set(l.head_name, new Map()); order.push(l.head_name); }
    const mm = byHead.get(l.head_name)!;
    const key = l.month_label || '';
    mm.set(key, Math.round(((mm.get(key) || 0) + l.amount) * 100) / 100);
  }
  const out: { head_name: string; amount: number; month_label?: string; month_display: string }[] = [];
  for (const head of order) {
    const mm = byHead.get(head)!;
    const dated = [...mm.entries()].filter(([k]) => k).sort((a, b) => a[0].localeCompare(b[0]));
    let cur: string[] = [];
    let curAmt = 0;
    const flush = () => {
      if (!cur.length) return;
      out.push({
        head_name: head,
        amount: Math.round(curAmt * 100) / 100,
        month_label: cur[0],
        month_display: cur.length === 1 ? fmtMonthShort(cur[0]) : `${fmtMonthShort(cur[0])} – ${fmtMonthShort(cur[cur.length - 1])}`,
      });
      cur = []; curAmt = 0;
    };
    for (const [m, amt] of dated) {
      if (cur.length && mergeConsecutiveMonths([...cur, m]).length > 1) flush();
      cur.push(m); curAmt += amt;
    }
    flush();
    const undated = mm.get('') || 0;
    if (undated > 0.005) out.push({ head_name: head, amount: Math.round(undated * 100) / 100, month_display: '—' });
  }
  return out;
}

export function getReceipt(id: number): ReceiptDetail | null {
  const db = getDb();
  const r = db.prepare(`SELECT r.id, r.receipt_no, r.date, r.student_id, s.name AS student_name, s.admission_no, s.class_name,
      s.section, s.father_name, s.father_phone, s.mother_phone, s.address, r.total, r.tendered, r.change_given, r.mode, r.ref_no, r.bank,
      r.notes, r.status, r.cancelled_reason, r.created_at
    FROM receipts r JOIN students s ON s.id = r.student_id WHERE r.id = ?`).get(id) as (ReceiptDetail & { student_id: number }) | undefined;
  if (!r) return null;
  const lines = db.prepare(`SELECT rl.head_name, rl.amount, d.month_label
    FROM receipt_lines rl LEFT JOIN fee_dues d ON d.id = rl.due_id
    WHERE rl.receipt_id = ?`).all(id) as { head_name: string; amount: number; month_label?: string }[];
  const fee_months = [...new Set(lines.map((l) => l.month_label).filter(Boolean) as string[])].sort();
  // Remaining due across all unpaid dues for this student (0 if fully paid)
  const rem = db.prepare(`SELECT COALESCE(SUM(amount + fine - discount - paid), 0) AS due
    FROM fee_dues WHERE student_id = ? AND status != 'paid'`).get(r.student_id) as { due: number };
  const remaining_due = Math.max(0, Math.round((rem.due || 0) * 100) / 100);
  return { ...r, lines: consolidateReceiptLines(lines), fee_months, remaining_due };
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
