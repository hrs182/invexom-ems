import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import {
  createStaff, saveSalaryStructure, runPayroll, finalizePayroll, getPayrollRun,
} from '../electron/services/payroll';
import { saveItem, createPurchase, createIssue, lowStock } from '../electron/services/inventory';
import { createVoucher, listVouchers } from '../electron/services/accounting';
import type { SafeUser } from '../shared/types';

const admin = { id: 1, username: 'admin' } as SafeUser;

describe('payroll (FR-SAL-02..05)', () => {
  let staffId = 0;

  beforeAll(() => {
    openDatabase(':memory:');
    const db = getDb();
    db.prepare("INSERT INTO roles (id, name, is_system, permissions) VALUES (1, 'Administrator', 1, '{}')").run();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
    db.prepare("INSERT INTO numbering (key, label, pattern) VALUES ('employee', 'Employee', 'EMP-{SEQ:4}'), ('voucher', 'Voucher', 'V-{YYYY}-{SEQ:5}')").run();
    db.prepare("INSERT INTO masters (kind, name) VALUES ('ledger', 'Salary')").run();
    staffId = createStaff({ name: 'Payroll Pete', designation: 'Teacher' }, admin);
    saveSalaryStructure(staffId, [
      { component: 'Basic', kind: 'earning', amount: 30000, is_percent: 0, percent_of: 'basic' },
      { component: 'HRA', kind: 'earning', amount: 40, is_percent: 1, percent_of: 'basic' },
      { component: 'PF', kind: 'deduction', amount: 12, is_percent: 1, percent_of: 'basic' },
    ], admin);
  });

  it('computes pro-rated salary from attendance', () => {
    // 28 present + 2 absent in a 30-day month
    const db = getDb();
    for (let d = 1; d <= 28; d++) {
      db.prepare("INSERT INTO staff_attendance (staff_id, date, status) VALUES (?, ?, 'P')")
        .run(staffId, `2026-09-${String(d).padStart(2, '0')}`);
    }
    for (const d of [29, 30]) {
      db.prepare("INSERT INTO staff_attendance (staff_id, date, status) VALUES (?, ?, 'A')")
        .run(staffId, `2026-09-${d}`);
    }
    const { lines } = runPayroll('2026-09', admin);
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l.lop_days).toBe(2);
    // gross = (30000 + 12000) * 28/30 = 39200
    expect(l.gross).toBeCloseTo(39200, 0);
    // PF = 12% of 30000 * 28/30 = 3360
    const pf = l.deductions.find((x) => x.component === 'PF');
    expect(pf?.amount).toBeCloseTo(3360, 0);
    expect(l.net).toBeCloseTo(l.gross - l.total_deductions, 0);
  });

  it('finalize posts salary vouchers to accounting', () => {
    const run = getPayrollRun('2026-09');
    expect(run?.status).toBe('draft');
    const n = finalizePayroll(run!.id, admin);
    expect(n).toBe(1);
    const vouchers = listVouchers({ type: 'payment' });
    expect(vouchers.some((v) => v.ledger_name === 'Salary' && v.ref_type === undefined)).toBe(true);
    expect(getPayrollRun('2026-09')?.status).toBe('finalized');
    // cannot run again on finalized
    expect(() => runPayroll('2026-09', admin)).toThrow('payroll-finalized');
  });

  it('closes cleanly', () => {
    closeDatabase();
    expect(() => getDb()).toThrow('database-not-open');
  });
});

describe('inventory (FR-INV-01..04)', () => {
  let itemId = 0;

  beforeAll(() => {
    openDatabase(':memory:');
    const db = getDb();
    db.prepare("INSERT INTO roles (id, name, is_system, permissions) VALUES (1, 'Administrator', 1, '{}')").run();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
    itemId = saveItem({ name: 'Test Widget', unit: 'pcs', purchase_rate: 100, reorder_level: 5 }, admin);
  });

  it('purchase increases stock, issue decreases it', () => {
    createPurchase({ bill_no: 'B-1', bill_date: '2026-10-01', vendor: 'Vendor', lines: [{ item_id: itemId, qty: 20, rate: 100, tax: 0 }] }, admin);
    let stock = (getDb().prepare('SELECT current_stock FROM items WHERE id = ?').get(itemId) as { current_stock: number }).current_stock;
    expect(stock).toBe(20);
    createIssue({ date: '2026-10-02', item_id: itemId, qty: 16, issued_to: 'Class V', purpose: 'test' }, admin);
    stock = (getDb().prepare('SELECT current_stock FROM items WHERE id = ?').get(itemId) as { current_stock: number }).current_stock;
    expect(stock).toBe(4);
  });

  it('flags low stock at reorder level', () => {
    expect(lowStock().some((i) => i.id === itemId)).toBe(true);
  });

  it('blocks issue beyond stock', () => {
    expect(() => createIssue({ date: '2026-10-03', item_id: itemId, qty: 99, issued_to: 'X', purpose: 'x' }, admin))
      .toThrow('insufficient-stock');
  });

  it('vouchers validate amounts', () => {
    expect(() => createVoucher({ type: 'payment', date: '2026-10-01', ledger_id: null, ledger_name: 'Test', amount: 0, mode: 'cash', narration: '' }, admin))
      .toThrow('invalid-amount');
  });

  it('closes cleanly', () => {
    closeDatabase();
    expect(() => getDb()).toThrow('database-not-open');
  });
});
