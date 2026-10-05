import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { collectFee, listDues, cancelReceipt, defaulters } from '../electron/services/fees';
import { createStudent } from '../electron/services/students';
import type { SafeUser } from '../shared/types';

const admin = { id: 1, username: 'admin' } as SafeUser;

describe('fee collection (FR-FEE-03, FR-FEE-06, FR-FEE-07)', () => {
  let studentId = 0;

  beforeAll(() => {
    openDatabase(':memory:');
    const db = getDb();
    // Minimal seed: session, fee-head masters, structure, numbering
    db.prepare("INSERT INTO sessions (id, name, start_date, end_date, is_active) VALUES (1, '2026-27', '2026-04-01', '2027-03-31', 1)").run();
    db.prepare("INSERT INTO roles (id, name, is_system, permissions) VALUES (1, 'Administrator', 1, '{}')").run();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
    db.prepare("INSERT INTO masters (id, kind, name) VALUES (1, 'fee-head', 'Tuition Fee'), (2, 'fee-head', 'Exam Fee')").run();
    db.prepare("INSERT INTO numbering (key, label, pattern) VALUES ('receipt', 'Fee receipt', 'R-{YYYY}-{SEQ:5}'), ('admission', 'Admission', 'INV/{YYYY}/{SEQ:4}')").run();
    db.prepare(`INSERT INTO fee_structure (session_id, class_name, head_id, amount, due_day)
      VALUES (1, 'V', 1, 1500, 10), (1, 'V', 2, 500, 10)`).run();
    const s = createStudent({ name: 'Test Student', class_name: 'V', section: 'A', father_phone: '9999999999' }, 1, admin, true);
    studentId = s.id;
    // Two months of dues: Sep (older) + Oct
    const dues = db.prepare(`INSERT INTO fee_dues (student_id, session_id, head_id, head_name, amount, due_date, month_label)
      VALUES (?, 1, ?, ?, ?, ?, ?)`);
    dues.run(studentId, 1, 'Tuition Fee', 1500, '2026-09-10', '2026-09');
    dues.run(studentId, 2, 'Exam Fee', 500, '2026-09-10', '2026-09');
    dues.run(studentId, 1, 'Tuition Fee', 1500, '2026-10-10', '2026-10');
  });

  it('splits tendered oldest-due-first', () => {
    const r = collectFee({ student_id: studentId, session_id: 1, tendered: 2000, mode: 'cash' }, admin);
    expect(r.receipt_no).toMatch(/^R-\d{4}-\d{5}$/);
    const lines = getDb().prepare('SELECT head_name, amount FROM receipt_lines WHERE receipt_id = ? ORDER BY id').all(r.receipt_id) as { head_name: string; amount: number }[];
    // Oldest dues first: Sep Tuition 1500 + Sep Exam 500 = 2000
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ head_name: 'Tuition Fee', amount: 1500 });
    expect(lines[1]).toMatchObject({ head_name: 'Exam Fee', amount: 500 });
    // Oct tuition still due
    const remaining = listDues(studentId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payable).toBe(1500);
  });

  it('receipt numbers are gap-free and sequential', () => {
    const a = collectFee({ student_id: studentId, session_id: 1, tendered: 500, mode: 'upi', ref_no: 'UPI123' }, admin);
    const seqA = parseInt(a.receipt_no.split('-')[2], 10);
    // create another due + collect to get next number
    getDb().prepare(`INSERT INTO fee_dues (student_id, session_id, head_id, head_name, amount, due_date, month_label)
      VALUES (?, 1, 1, 'Tuition Fee', 100, '2026-11-10', '2026-11')`).run(studentId);
    const b = collectFee({ student_id: studentId, session_id: 1, tendered: 100, mode: 'cash' }, admin);
    const seqB = parseInt(b.receipt_no.split('-')[2], 10);
    expect(seqB).toBe(seqA + 1);
  });

  it('cancel reinstates dues and keeps the receipt struck through', () => {
    const rc = getDb().prepare('SELECT id FROM receipts ORDER BY id DESC LIMIT 1').get() as { id: number };
    cancelReceipt(rc.id, 'test cancel', admin);
    const row = getDb().prepare('SELECT status FROM receipts WHERE id = ?').get(rc.id) as { status: string };
    expect(row.status).toBe('cancelled');
    const dues = listDues(studentId);
    expect(dues.length).toBeGreaterThan(0);
  });

  it('defaulter aging buckets add up to total', () => {
    const rows = defaulters(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const sum = r.bucket_0_30 + r.bucket_31_60 + r.bucket_61_90 + r.bucket_90p;
      expect(Math.abs(sum - r.total_due)).toBeLessThan(0.02);
    }
  });

  it('closes cleanly', () => {
    closeDatabase();
    expect(() => getDb()).toThrow('database-not-open');
  });
});
