import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type { SafeUser, PayrollLine } from '../../shared/types.js';
import { audit } from './audit.js';

export interface StaffDetail {
  id: number; employee_code: string; name: string; phone: string; email: string;
  designation: string; department: string; joining_date: string; status: string;
  dob: string; gender: string; address: string; pan: string; aadhaar: string;
  bank_name: string; bank_account: string; bank_ifsc: string;
}

export interface SalaryComponent { id?: number; component: string; kind: 'earning' | 'deduction'; amount: number; is_percent: number; percent_of: string }

const STAFF_COLS = `id, employee_code, name, phone, email, designation, department, joining_date,
  status, dob, gender, address, pan, aadhaar, bank_name, bank_account, bank_ifsc`;

export function listStaffFull(): StaffDetail[] {
  return getDb().prepare(`SELECT ${STAFF_COLS} FROM staff WHERE is_deleted = 0 ORDER BY name`).all() as StaffDetail[];
}

export function getStaff(id: number): (StaffDetail & { structure: SalaryComponent[] }) | null {
  const db = getDb();
  const row = db.prepare(`SELECT ${STAFF_COLS} FROM staff WHERE id = ? AND is_deleted = 0`).get(id) as StaffDetail | undefined;
  if (!row) return null;
  const structure = db.prepare('SELECT * FROM salary_structure WHERE staff_id = ? ORDER BY kind, component').all(id) as SalaryComponent[];
  return { ...row, structure };
}

export function createStaff(input: Partial<StaffDetail>, user: SafeUser): number {
  const db = getDb();
  if (!input.name?.trim()) throw new Error('name-required');
  const code = nextNumber('employee');
  const r = db.prepare(`INSERT INTO staff (employee_code, name, phone, email, designation, department,
      joining_date, dob, gender, address, pan, aadhaar, bank_name, bank_account, bank_ifsc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(code, input.name.trim(), input.phone ?? '', input.email ?? '', input.designation ?? '',
      input.department ?? '', input.joining_date ?? new Date().toISOString().slice(0, 10),
      input.dob ?? '', input.gender ?? '', input.address ?? '', input.pan ?? '', input.aadhaar ?? '',
      input.bank_name ?? '', input.bank_account ?? '', input.bank_ifsc ?? '');
  const id = Number(r.lastInsertRowid);
  // Default structure: Basic 20000, HRA 40% of basic, PF 12% of basic, ESI auto
  const def: SalaryComponent[] = [
    { component: 'Basic', kind: 'earning', amount: 20000, is_percent: 0, percent_of: 'basic' },
    { component: 'HRA', kind: 'earning', amount: 40, is_percent: 1, percent_of: 'basic' },
    { component: 'PF', kind: 'deduction', amount: 12, is_percent: 1, percent_of: 'basic' },
    { component: 'ESI', kind: 'deduction', amount: 3.25, is_percent: 1, percent_of: 'gross' },
  ];
  const stmt = db.prepare('INSERT INTO salary_structure (staff_id, component, kind, amount, is_percent, percent_of) VALUES (?, ?, ?, ?, ?, ?)');
  for (const d of def) stmt.run(id, d.component, d.kind, d.amount, d.is_percent, d.percent_of);
  audit(user, 'staff.create', 'staff', id, null, { name: input.name });
  return id;
}

export function updateStaff(id: number, patch: Partial<StaffDetail>, user: SafeUser): void {
  const db = getDb();
  const map: Record<string, string> = {
    name: 'name', phone: 'phone', email: 'email', designation: 'designation', department: 'department',
    joining_date: 'joining_date', status: 'status', dob: 'dob', gender: 'gender', address: 'address',
    pan: 'pan', aadhaar: 'aadhaar', bank_name: 'bank_name', bank_account: 'bank_account', bank_ifsc: 'bank_ifsc',
  };
  const sets: string[] = []; const vals: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (sets.length) db.prepare(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  audit(user, 'staff.update', 'staff', id, null, patch);
}

export function saveSalaryStructure(staffId: number, components: SalaryComponent[], user: SafeUser): void {
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM salary_structure WHERE staff_id = ?').run(staffId);
    const stmt = db.prepare('INSERT INTO salary_structure (staff_id, component, kind, amount, is_percent, percent_of) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of components) {
      if (!c.component.trim()) continue;
      stmt.run(staffId, c.component.trim(), c.kind, c.amount, c.is_percent ? 1 : 0, c.percent_of || 'basic');
    }
  });
  txn();
  audit(user, 'staff.salaryStructure', 'staff', staffId);
}

/** FR-SAL-03: monthly payroll — payable days auto from staff attendance; LOP auto. */
export function runPayroll(month: string, user: SafeUser): { runId: number; lines: PayrollLine[] } {
  const db = getDb();
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const staff = listStaffFull().filter((s) => s.status === 'active');

  let runRow = db.prepare('SELECT id, status FROM payroll_runs WHERE month = ?').get(month) as { id: number; status: string } | undefined;
  if (runRow?.status === 'finalized') throw new Error('payroll-finalized');
  if (!runRow) {
    const r = db.prepare('INSERT INTO payroll_runs (month, created_by) VALUES (?, ?)').run(month, user.id);
    runRow = { id: Number(r.lastInsertRowid), status: 'draft' };
  }
  const runId = runRow.id;
  db.prepare('DELETE FROM payroll_lines WHERE run_id = ?').run(runId);

  const lines: PayrollLine[] = [];
  const insert = db.prepare(`INSERT INTO payroll_lines
    (run_id, staff_id, payable_days, lop_days, earnings, deductions, arrears, bonus, gross, total_deductions, net)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`);
  const txn = db.transaction(() => {
    for (const s of staff) {
      // Attendance for the month: P/L/H count as payable; A counts as LOP
      const att = db.prepare(`SELECT status, COUNT(*) AS n FROM staff_attendance
        WHERE staff_id = ? AND date LIKE ? GROUP BY status`).all(s.id, `${month}%`) as { status: string; n: number }[];
      const byStatus = Object.fromEntries(att.map((a) => [a.status, a.n]));
      const absent = byStatus['A'] ?? 0;
      const present = (byStatus['P'] ?? 0) + (byStatus['L'] ?? 0) + (byStatus['H'] ?? 0);
      // If no attendance marked at all, assume full month payable (small schools)
      const payableDays = present + absent === 0 ? daysInMonth : present + (byStatus['H'] ?? 0);
      const lopDays = present + absent === 0 ? 0 : absent;
      const comps = db.prepare('SELECT * FROM salary_structure WHERE staff_id = ?').all(s.id) as SalaryComponent[];
      const basic = comps.find((c) => c.component === 'Basic' && c.kind === 'earning');
      const basicAmt = basic ? (basic.is_percent ? 0 : basic.amount) : 0;
      const factor = payableDays / daysInMonth;
      const earnings: { component: string; amount: number }[] = [];
      const deductions: { component: string; amount: number }[] = [];
      for (const c of comps) {
        let amt = c.amount;
        if (c.is_percent) amt = basicAmt * (c.amount / 100);
        amt = Math.round(amt * factor * 100) / 100; // pro-rate by payable days
        (c.kind === 'earning' ? earnings : deductions).push({ component: c.component, amount: amt });
      }
      const gross = Math.round(earnings.reduce((a, e) => a + e.amount, 0) * 100) / 100;
      // ESI as % of gross (recompute since gross now known)
      for (const d of deductions) {
        const comp = comps.find((c) => c.component === d.component && c.kind === 'deduction');
        if (comp?.is_percent && comp.percent_of === 'gross') d.amount = Math.round(gross * (comp.amount / 100) * 100) / 100;
      }
      const totalDed = Math.round(deductions.reduce((a, d) => a + d.amount, 0) * 100) / 100;
      const net = Math.round((gross - totalDed) * 100) / 100;
      insert.run(runId, s.id, Math.round(payableDays * 10) / 10, lopDays,
        JSON.stringify(earnings), JSON.stringify(deductions), gross, totalDed, net);
      lines.push({
        id: 0, staff_id: s.id, staff_name: s.name, employee_code: s.employee_code,
        designation: s.designation, department: s.department,
        payable_days: payableDays, lop_days: lopDays, earnings, deductions,
        arrears: 0, bonus: 0, gross, total_deductions: totalDed, net,
        bank_account: s.bank_account, bank_name: s.bank_name,
      });
    }
  });
  txn();
  audit(user, 'payroll.run', 'payroll', runId, null, { month, count: lines.length });
  return { runId, lines: getPayrollLines(runId) };
}

export function getPayrollLines(runId: number): PayrollLine[] {
  const rows = getDb().prepare(`SELECT pl.*, s.name AS staff_name, s.employee_code, s.bank_account, s.bank_name,
      s.designation, s.department
    FROM payroll_lines pl JOIN staff s ON s.id = pl.staff_id WHERE pl.run_id = ? ORDER BY s.name`).all(runId) as
    (Omit<PayrollLine, 'earnings' | 'deductions'> & { earnings: string; deductions: string })[];
  return rows.map((r) => ({ ...r, earnings: JSON.parse(r.earnings), deductions: JSON.parse(r.deductions) }));
}

export function getPayrollRun(month: string): { id: number; month: string; status: string } | null {
  return (getDb().prepare('SELECT id, month, status FROM payroll_runs WHERE month = ?').get(month) as never) ?? null;
}

/** Adjust arrears/bonus on a line before finalizing. */
export function adjustPayrollLine(lineId: number, arrears: number, bonus: number, user: SafeUser): void {
  const db = getDb();
  const line = db.prepare(`SELECT pl.*, pr.status FROM payroll_lines pl
    JOIN payroll_runs pr ON pr.id = pl.run_id WHERE pl.id = ?`).get(lineId) as
    { gross: number; total_deductions: number; status: string } | undefined;
  if (!line || line.status === 'finalized') throw new Error('payroll-finalized');
  const net = Math.round((line.gross + arrears + bonus - line.total_deductions) * 100) / 100;
  db.prepare('UPDATE payroll_lines SET arrears = ?, bonus = ?, net = ? WHERE id = ?').run(arrears, bonus, net, lineId);
  audit(user, 'payroll.adjust', 'payroll-line', lineId, null, { arrears, bonus });
}

/** FR-SAL-05: finalize — auto-post net salary to Accounting as payment vouchers. */
export function finalizePayroll(runId: number, user: SafeUser): number {
  const db = getDb();
  const run = db.prepare('SELECT month, status FROM payroll_runs WHERE id = ?').get(runId) as { month: string; status: string } | undefined;
  if (!run || run.status === 'finalized') throw new Error('payroll-finalized');
  const lines = getPayrollLines(runId);
  const salaryLedger = db.prepare("SELECT id FROM masters WHERE kind = 'ledger' AND name = 'Salary' AND is_active = 1 LIMIT 1").get() as { id: number } | undefined;
  // Ensure a Salary ledger exists
  let ledgerId = salaryLedger?.id;
  if (!ledgerId) {
    const r = db.prepare("INSERT INTO masters (kind, name) VALUES ('ledger', 'Salary')").run();
    ledgerId = Number(r.lastInsertRowid);
  }
  const date = `${run.month}-28`;
  const txn = db.transaction(() => {
    for (const l of lines) {
      const voucher_no = nextNumber('voucher');
      db.prepare(`INSERT INTO vouchers (voucher_no, type, date, ledger_id, ledger_name, amount, mode, narration, ref_type, ref_id, created_by)
        VALUES (?, 'payment', ?, ?, 'Salary', ?, 'bank', ?, 'payroll', ?, ?)`)
        .run(voucher_no, date, ledgerId, l.net, `Salary ${run.month} — ${l.staff_name} (${l.employee_code})`, runId, user.id);
    }
    db.prepare("UPDATE payroll_runs SET status = 'finalized' WHERE id = ?").run(runId);
  });
  txn();
  audit(user, 'payroll.finalize', 'payroll', runId, null, { month: run.month, total: lines.reduce((a, l) => a + l.net, 0) });
  return lines.length;
}

export function salaryRegister(month: string): PayrollLine[] {
  const run = getPayrollRun(month);
  return run ? getPayrollLines(run.id) : [];
}
