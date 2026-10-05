import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type { SafeUser } from '../../shared/types.js';
import { audit } from './audit.js';

export function vouchersTableExists(): boolean {
  const row = getDb().prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vouchers'",
  ).get();
  return !!row;
}

/** FR-ACC-03: fee collections auto-post as receipt vouchers (single source of truth). */
export function postFeeVoucher(
  _ctx: { dataKey: unknown },
  user: SafeUser,
  receiptId: number,
): void {
  if (!vouchersTableExists()) return;
  const db = getDb();
  const rc = db.prepare(`SELECT r.receipt_no, r.date, r.total, r.mode, r.ref_no, s.name AS student_name
    FROM receipts r JOIN students s ON s.id = r.student_id WHERE r.id = ?`).get(receiptId) as
    { receipt_no: string; date: string; total: number; mode: string; ref_no: string; student_name: string } | undefined;
  if (!rc) return;
  const exists = db.prepare('SELECT id FROM vouchers WHERE ref_type = ? AND ref_id = ?').get('receipt', receiptId);
  if (exists) return;
  const ledger = db.prepare("SELECT id FROM masters WHERE kind = 'ledger' AND name = 'Fees Income' AND is_active = 1 LIMIT 1").get() as
    { id: number } | undefined;
  const voucher_no = nextNumber('voucher');
  db.prepare(`INSERT INTO vouchers (voucher_no, type, date, ledger_id, ledger_name, amount, mode, narration, ref_type, ref_id, created_by)
    VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?, 'receipt', ?, ?)`)
    .run(voucher_no, rc.date, ledger?.id ?? null, 'Fees Income', rc.total, rc.mode,
      `Fee collection ${rc.receipt_no} — ${rc.student_name}${rc.ref_no ? ` (ref ${rc.ref_no})` : ''}`,
      receiptId, user.id);
}

export interface VoucherInput {
  type: 'receipt' | 'payment' | 'journal' | 'contra';
  date: string; ledger_id: number | null; ledger_name: string;
  amount: number; mode: string; narration: string;
}

export function createVoucher(input: VoucherInput, user: SafeUser): { id: number; voucher_no: string } {
  const db = getDb();
  if (input.amount <= 0) throw new Error('invalid-amount');
  const voucher_no = nextNumber('voucher');
  const r = db.prepare(`INSERT INTO vouchers (voucher_no, type, date, ledger_id, ledger_name, amount, mode, narration, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(voucher_no, input.type, input.date, input.ledger_id, input.ledger_name, input.amount, input.mode, input.narration, user.id);
  audit(user, 'accounting.voucher', 'voucher', Number(r.lastInsertRowid), null, { voucher_no, type: input.type });
  return { id: Number(r.lastInsertRowid), voucher_no };
}

export interface VoucherRow {
  id: number; voucher_no: string; type: string; date: string; ledger_name: string;
  amount: number; mode: string; narration: string;
}

export function listVouchers(f: { from?: string; to?: string; type?: string; q?: string; limit?: number }): VoucherRow[] {
  const db = getDb();
  const where = ['1=1']; const vals: unknown[] = [];
  if (f.from) { where.push('date >= ?'); vals.push(f.from); }
  if (f.to) { where.push('date <= ?'); vals.push(f.to); }
  if (f.type) { where.push('type = ?'); vals.push(f.type); }
  if (f.q) { where.push('(voucher_no LIKE ? OR narration LIKE ? OR ledger_name LIKE ?)'); vals.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  return db.prepare(`SELECT id, voucher_no, type, date, ledger_name, amount, mode, narration FROM vouchers
    WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ?`).all(...vals, f.limit ?? 200) as VoucherRow[];
}

/** FR-ACC-05: day book for a date range. */
export function dayBook(from: string, to: string): VoucherRow[] {
  return listVouchers({ from, to, limit: 5000 });
}

/** FR-ACC-05: ledger statement. */
export function ledgerStatement(ledgerName: string, from: string, to: string): { rows: VoucherRow[]; total: number } {
  const db = getDb();
  const rows = db.prepare(`SELECT id, voucher_no, type, date, ledger_name, amount, mode, narration FROM vouchers
    WHERE ledger_name = ? AND date BETWEEN ? AND ? ORDER BY date, id`).all(ledgerName, from, to) as VoucherRow[];
  return { rows, total: rows.reduce((a, r) => a + r.amount, 0) };
}

/** FR-ACC-05: income vs expense summary. */
export function incomeExpense(from: string, to: string): { income: { ledger: string; total: number }[]; expense: { ledger: string; total: number }[]; totalIncome: number; totalExpense: number } {
  const db = getDb();
  const income = db.prepare(`SELECT ledger_name AS ledger, SUM(amount) AS total FROM vouchers
    WHERE type = 'receipt' AND date BETWEEN ? AND ? GROUP BY ledger_name ORDER BY total DESC`).all(from, to) as { ledger: string; total: number }[];
  const expense = db.prepare(`SELECT ledger_name AS ledger, SUM(amount) AS total FROM vouchers
    WHERE type = 'payment' AND date BETWEEN ? AND ? GROUP BY ledger_name ORDER BY total DESC`).all(from, to) as { ledger: string; total: number }[];
  return {
    income, expense,
    totalIncome: income.reduce((a, r) => a + r.total, 0),
    totalExpense: expense.reduce((a, r) => a + r.total, 0),
  };
}

// ---------- Expenses with approval (FR-ACC-04) ----------
export function createExpense(input: { date: string; ledger_id: number | null; ledger_name: string; amount: number; narration: string; bill_no: string }, user: SafeUser): number {
  const r = getDb().prepare(`INSERT INTO expenses (date, ledger_id, ledger_name, amount, narration, bill_no, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(input.date, input.ledger_id, input.ledger_name, input.amount, input.narration, input.bill_no, user.id);
  audit(user, 'accounting.expense.create', 'expense', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function listExpenses(status?: string): unknown[] {
  const db = getDb();
  const where = status ? 'WHERE e.status = ?' : '';
  const vals = status ? [status] : [];
  return db.prepare(`SELECT e.*, u.display_name AS entered_by_name FROM expenses e
    LEFT JOIN users u ON u.id = e.entered_by ${where} ORDER BY e.date DESC, e.id DESC`).all(...vals);
}

/** Approve → posts a payment voucher automatically. Reject → stays out of the books. */
export function decideExpense(id: number, approve: boolean, user: SafeUser): void {
  const db = getDb();
  const txn = db.transaction(() => {
    const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as
      { status: string; amount: number; date: string; ledger_id: number | null; ledger_name: string; narration: string; bill_no: string } | undefined;
    if (!exp || exp.status !== 'pending') throw new Error('invalid-expense');
    db.prepare("UPDATE expenses SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?")
      .run(approve ? 'approved' : 'rejected', user.id, id);
    if (approve) {
      const voucher_no = nextNumber('voucher');
      db.prepare(`INSERT INTO vouchers (voucher_no, type, date, ledger_id, ledger_name, amount, mode, narration, ref_type, ref_id, created_by)
        VALUES (?, 'payment', ?, ?, ?, ?, 'cash', ?, 'expense', ?, ?)`)
        .run(voucher_no, exp.date, exp.ledger_id, exp.ledger_name, exp.amount,
          `Expense: ${exp.narration}${exp.bill_no ? ` (bill ${exp.bill_no})` : ''}`, id, user.id);
    }
  });
  txn();
  audit(user, 'accounting.expense.decide', 'expense', id, null, { approve });
}

// ---------- Petty cash (FR-ACC-07) ----------
export function getPettyCash(date: string): { date: string; opening: number; closing: number; physical_count: number | null; difference: number | null; notes: string } | null {
  return (getDb().prepare('SELECT * FROM petty_cash WHERE date = ?').get(date) as never) ?? null;
}

export function savePettyCash(input: { date: string; opening: number; closing: number; physical_count?: number | null; notes?: string }, user: SafeUser): void {
  const db = getDb();
  const difference = input.physical_count != null ? Math.round((input.physical_count - input.closing) * 100) / 100 : null;
  db.prepare(`INSERT INTO petty_cash (date, opening, closing, physical_count, difference, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET opening = excluded.opening, closing = excluded.closing,
      physical_count = excluded.physical_count, difference = excluded.difference, notes = excluded.notes`)
    .run(input.date, input.opening, input.closing, input.physical_count ?? null, difference, input.notes ?? '');
  audit(user, 'accounting.pettyCash', 'petty-cash', 0, null, { date: input.date, difference });
}

// ---------- Tally export (FR-ACC-06) ----------
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Tally-compatible XML for the external accountant. */
export function tallyExport(from: string, to: string): string {
  const vouchers = listVouchers({ from, to, limit: 100000 });
  const tallyDate = (d: string) => d.replace(/-/g, '');
  const lines = vouchers.map((v) => {
    const isReceipt = v.type === 'receipt';
    return `   <VOUCHER>
    <VOUCHERTYPENAME>${v.type === 'receipt' ? 'Receipt' : v.type === 'payment' ? 'Payment' : v.type === 'contra' ? 'Contra' : 'Journal'}</VOUCHERTYPENAME>
    <DATE>${tallyDate(v.date)}</DATE>
    <NARRATION>${xmlEscape(v.narration)}</NARRATION>
    <VOUCHERNUMBER>${xmlEscape(v.voucher_no)}</VOUCHERNUMBER>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>${xmlEscape(v.ledger_name || 'Cash')}</LEDGERNAME>
     <ISDEEMEDPOSITIVE>${isReceipt ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
     <AMOUNT>${isReceipt ? '' : '-'}${v.amount.toFixed(2)}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST>
     <LEDGERNAME>Cash</LEDGERNAME>
     <ISDEEMEDPOSITIVE>${isReceipt ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
     <AMOUNT>${isReceipt ? '-' : ''}${v.amount.toFixed(2)}</AMOUNT>
    </ALLLEDGERENTRIES.LIST>
   </VOUCHER>`;
  }).join('\n');
  return `<ENVELOPE>
 <HEADER><VERSION>1</VERSION></HEADER>
 <BODY>
  <DATA>
${lines}
  </DATA>
 </BODY>
</ENVELOPE>`;
}
