import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import {
  createExam, saveExamSubjects, saveDatesheet, saveMarks, computeResults, lockExam,
} from '../electron/services/exams';
import { createStudent } from '../electron/services/students';
import type { SafeUser } from '../shared/types';

const admin = { id: 1, username: 'admin' } as SafeUser;

describe('exam cycle (FR-EXM-01..05)', () => {
  let examId = 0;
  const studentIds: number[] = [];

  beforeAll(() => {
    openDatabase(':memory:');
    const db = getDb();
    db.prepare("INSERT INTO roles (id, name, is_system, permissions) VALUES (1, 'Administrator', 1, '{}')").run();
    db.prepare("INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES (1, 'admin', 'Admin', 'x', 1)").run();
    db.prepare("INSERT INTO sessions (id, name, start_date, end_date, is_active) VALUES (1, '2026-27', '2026-04-01', '2027-03-31', 1)").run();
    db.prepare("INSERT INTO numbering (key, label, pattern) VALUES ('admission', 'Admission', 'INV/{YYYY}/{SEQ:4}'), ('gatepass', 'Gatepass', 'GP-{YYYY}-{SEQ:4}')").run();
    for (const name of ['Topper Tom', 'Mid Mary', 'Fail Fred']) {
      const s = createStudent({ name, class_name: 'V', section: 'A', roll_no: '1' }, 1, admin, true);
      studentIds.push(s.id);
    }
    examId = createExam({ name: 'Unit Test', term: 'T1', session_id: 1, classes: ['V'] }, admin);
    saveExamSubjects(examId, [
      { subject: 'Maths', class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100 },
      { subject: 'English', class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100 },
    ], admin);
  });

  it('detects datesheet clashes and blocks save', () => {
    const bad = saveDatesheet(examId, [
      { subject: 'Maths', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R1' },
      { subject: 'English', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R2' },
    ], admin);
    expect(bad.clashes.length).toBeGreaterThan(0);
    // clash-free saves fine
    const ok = saveDatesheet(examId, [
      { subject: 'Maths', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R1' },
      { subject: 'English', class_name: 'V', date: '2026-11-03', start_time: '09:00', end_time: '12:00', room: 'R1' },
    ], admin);
    expect(ok.clashes).toHaveLength(0);
  });

  it('rejects marks over max', () => {
    const r = saveMarks(examId, 'Maths', 'V', [
      { student_id: studentIds[0], marks_obtained: 95, is_absent: false },
      { student_id: studentIds[1], marks_obtained: 150, is_absent: false },
      { student_id: studentIds[2], marks_obtained: 20, is_absent: false },
    ], admin);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].student_id).toBe(studentIds[1]);
  });

  it('computes totals, grades, ranks, pass/fail', () => {
    saveMarks(examId, 'English', 'V', [
      { student_id: studentIds[0], marks_obtained: 92, is_absent: false },
      { student_id: studentIds[1], marks_obtained: 60, is_absent: false },
      { student_id: studentIds[2], marks_obtained: 10, is_absent: false },
    ], admin);
    // fix Mary's maths (was rejected)
    saveMarks(examId, 'Maths', 'V', [
      { student_id: studentIds[1], marks_obtained: 65, is_absent: false },
    ], admin);
    const results = computeResults(examId, 'V');
    expect(results).toHaveLength(3);
    const [first, second, third] = results;
    expect(first.name).toBe('Topper Tom');
    expect(first.rank).toBe(1);
    expect(first.percent).toBe(93.5);
    expect(first.grade).toBe('A1');
    expect(first.pass).toBe(true);
    expect(second.rank).toBe(2);
    expect(third.pass).toBe(false);
    expect(third.grade).toBe('E');
  });

  it('lock blocks further marks entry', () => {
    lockExam(examId, admin);
    expect(() => saveMarks(examId, 'Maths', 'V', [
      { student_id: studentIds[0], marks_obtained: 50, is_absent: false },
    ], admin)).toThrow('exam-locked');
  });

  it('closes cleanly', () => {
    closeDatabase();
    expect(() => getDb()).toThrow('database-not-open');
  });
});
