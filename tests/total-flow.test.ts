/**
 * TOTAL-FLOW integration test: a complete school term end-to-end through the
 * real service layer (the same functions the IPC handlers call):
 * setup seed -> students -> fee structure -> dues -> collection -> attendance
 * -> exams/marks -> payroll -> accounting -> numbering.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { seedSetupMasters } from '../electron/services/setup';
import { seedRoles } from '../electron/services/users';
import { createStudent, activeStudentCount } from '../electron/services/students';
import {
  saveFeeStructure, generateDues, listDues, collectFee, listReceipts, defaulters,
} from '../electron/services/fees';
import { markAttendance, getAttendance, attendancePercent } from '../electron/services/attendance';
import { createExam, saveExamSubjects, saveMarks, getMarks } from '../electron/services/exams';
import { createStaff, runPayroll, getPayrollLines } from '../electron/services/payroll';
import { createVoucher, dayBook } from '../electron/services/accounting';
import { nextNumber } from '../electron/services/numbering';
import type { SafeUser } from '../shared/types';

const admin = { id: 1, username: 'admin' } as SafeUser;
const SID = 1;

describe('total flow: one school term', () => {
  let studentA = 0;
  let studentB = 0;
  let examId = 0;

  beforeAll(() => {
    closeDatabase();
    openDatabase(':memory:');
    const db = getDb();
    seedRoles();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
    db.prepare("INSERT INTO sessions (id, name, start_date, end_date, is_active) VALUES (1, '2026-27', '2026-04-01', '2027-03-31', 1)").run();
    db.prepare(`INSERT INTO numbering (key, label, pattern) VALUES
      ('receipt', 'Fee receipt', 'R-{YYYY}-{SEQ:5}'),
      ('voucher', 'Voucher', 'V-{YYYY}-{SEQ:5}'),
      ('admission', 'Admission', 'INV/{YYYY}/{SEQ:4}'),
      ('employee', 'Employee', 'EMP-{SEQ:4}')`).run();
    // Setup wizard seed (with duplicates — must not throw).
    seedSetupMasters(
      db,
      [{ name: 'V', sections: ['A', 'B'] }, { name: 'V', sections: [] }],
      [
        { name: 'Tuition Fee', type: 'periodic' },
        { name: 'Exam Fee', type: 'periodic' },
        { name: 'Tuition Fee', type: 'optional' },
      ],
    );
  });

  it('admits students', () => {
    const a = createStudent({ name: 'Aarav Sharma', class_name: 'V', section: 'A', father_phone: '9811111111' }, SID, admin, true);
    const b = createStudent({ name: 'Diya Verma', class_name: 'V', section: 'A', father_phone: '9822222222' }, SID, admin, true);
    studentA = a.id; studentB = b.id;
    expect(a.admission_no).toMatch(/^INV\//);
    expect(activeStudentCount()).toBe(2);
  });

  it('sets fee structure, generates dues, collects fees', () => {
    const db = getDb();
    const heads = db.prepare("SELECT id, name FROM masters WHERE kind = 'fee-head'").all() as { id: number; name: string }[];
    const tuition = heads.find((h) => h.name === 'Tuition Fee')!;
    const exam = heads.find((h) => h.name === 'Exam Fee')!;
    saveFeeStructure(SID, [
      { class_name: 'V', head_id: tuition.id, amount: 1500, due_day: 10 },
      { class_name: 'V', head_id: exam.id, amount: 500, due_day: 10 },
    ], admin);
    const n = generateDues(SID, '2026-10', admin);
    expect(n).toBeGreaterThan(0);
    // Aarav pays in full; Diya pays nothing (becomes a defaulter).
    const duesA = listDues(studentA);
    const totalA = duesA.reduce((s, d) => s + d.payable, 0);
    const r = collectFee({ student_id: studentA, session_id: SID, tendered: totalA, mode: 'cash' }, admin);
    expect(r.receipt_no).toMatch(/^R-\d{4}-\d{5}$/);
    expect(listDues(studentA)).toHaveLength(0);
    expect(listReceipts({}).total).toBe(1);
    const defs = defaulters(SID, 'V');
    expect(defs.some((d) => d.student_id === studentB)).toBe(true);
    expect(defs.some((d) => d.student_id === studentA)).toBe(false);
  });

  it('marks attendance and computes percentages', () => {
    const day = '2026-10-07';
    const count = markAttendance('V', 'A', day, [
      { student_id: studentA, status: 'P' },
      { student_id: studentB, status: 'A' },
    ], admin);
    expect(count).toBe(2);
    const grid = getAttendance('V', 'A', day);
    expect(grid[studentA]).toBe('P');
    expect(grid[studentB]).toBe('A');
    const pct = attendancePercent('V', 'A', '2026-10-01', '2026-10-31', 75);
    expect(pct.length).toBeGreaterThan(0);
  });

  it('runs exams: datesheet subjects, marks entry, retrieval', () => {
    examId = createExam({ name: 'Half-Yearly', term: 'Term 1', session_id: SID, classes: ['V'] }, admin);
    saveExamSubjects(examId, [{ subject: 'Mathematics', class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100 }], admin);
    const rej = saveMarks(examId, 'Mathematics', 'V', [
      { student_id: studentA, marks_obtained: 88, is_absent: false },
      { student_id: studentB, marks_obtained: null, is_absent: true },
    ], admin);
    expect(rej.rejected).toHaveLength(0);
    const marks = getMarks(examId, 'Mathematics', 'V');
    expect(marks[studentA].marks).toBe(88);
    expect(marks[studentB].absent).toBe(true);
  });

  it('runs payroll for staff', () => {
    const staffId = createStaff({ name: 'Ramesh Kumar', designation: 'Teacher' }, admin);
    expect(staffId).toBeGreaterThan(0);
    const run = runPayroll('2026-10', admin);
    expect(run.lines.length).toBeGreaterThan(0);
    const line = run.lines.find((l) => l.staff_id === staffId)!;
    expect(line.net).toBeGreaterThan(0);
    expect(getPayrollLines(run.runId).length).toBe(run.lines.length);
  });

  it('posts accounting vouchers and reads the day book', () => {
    const v = createVoucher({
      type: 'payment', date: '2026-10-07', ledger_id: null,
      ledger_name: 'Electricity Bill', amount: 2500, mode: 'cash', narration: 'Oct power bill',
    }, admin);
    expect(v.voucher_no).toMatch(/^V-\d{4}-\d{5}$/);
    const book = dayBook('2026-10-01', '2026-10-31');
    expect(book.some((r) => r.voucher_no === v.voucher_no)).toBe(true);
  });

  it('document numbers stay gap-free across modules', () => {
    const a = nextNumber('receipt');
    const b = nextNumber('receipt');
    expect(parseInt(b.split('-')[2], 10)).toBe(parseInt(a.split('-')[2], 10) + 1);
  });
});
