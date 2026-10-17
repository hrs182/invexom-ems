import { describe, it, expect, beforeAll } from 'vitest';
import { openDatabase, closeDatabase, getDb } from '../electron/services/database';
import {
  createExam, saveExamSubjects, updateExamSubject, deleteExamSubject, listUsedSubjects,
  saveDatesheet, saveMarks, computeResults, lockExam,
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
    const bad = saveDatesheet(examId, 'V', [
      { subject: 'Maths', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R1' },
      { subject: 'English', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R2' },
    ], admin);
    expect(bad.clashes.length).toBeGreaterThan(0);
    // clash-free saves fine
    const ok = saveDatesheet(examId, 'V', [
      { subject: 'Maths', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R1' },
      { subject: 'English', class_name: 'V', date: '2026-11-03', start_time: '09:00', end_time: '12:00', room: 'R1' },
    ], admin);
    expect(ok.clashes).toHaveLength(0);
  });

  it('datesheet save is class-scoped and keeps other classes intact', () => {
    const db = getDb();
    // seed another class's datesheet directly
    db.prepare(`INSERT INTO datesheet (exam_id, subject, class_name, date, start_time, end_time, room)
      VALUES (?, 'Science', 'VI', '2026-11-04', '09:00', '12:00', 'R2')`).run(examId);
    const r = saveDatesheet(examId, 'V', [
      { subject: 'Maths', class_name: 'V', date: '2026-11-05', start_time: '09:00', end_time: '12:00', room: 'R1' },
    ], admin);
    expect(r.clashes).toHaveLength(0);
    const viRows = db.prepare('SELECT * FROM datesheet WHERE exam_id = ? AND class_name = ?').all(examId, 'VI');
    expect(viRows).toHaveLength(1); // untouched
    const vRows = db.prepare('SELECT * FROM datesheet WHERE exam_id = ? AND class_name = ?').all(examId, 'V');
    expect(vRows).toHaveLength(1); // replaced
    // room double-booking against the other class is still caught
    const clash = saveDatesheet(examId, 'V', [
      { subject: 'Maths', class_name: 'V', date: '2026-11-04', start_time: '09:00', end_time: '12:00', room: 'R2' },
    ], admin);
    expect(clash.clashes.length).toBeGreaterThan(0);
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
    // report-card identity fields (section + father's name for the printed card)
    for (const r of results) {
      expect(r.section).toBe('A');
      expect(typeof r.father_name).toBe('string');
    }
  });

  it('updateExamSubject edits fields and propagates renames to marks + datesheet', () => {
    const db = getDb();
    const subj = db.prepare("SELECT id FROM exam_subjects WHERE exam_id = ? AND subject = 'Maths'").get(examId) as { id: number };
    // numeric edit keeps marks intact
    updateExamSubject(subj.id, { subject: 'Maths', max_marks: 80, pass_marks: 28, weightage: 100 }, admin);
    const after = db.prepare('SELECT max_marks FROM exam_subjects WHERE id = ?').get(subj.id) as { max_marks: number };
    expect(after.max_marks).toBe(80);
    // rename propagates to marks and datesheet rows
    saveDatesheet(examId, 'V', [
      { subject: 'Maths', class_name: 'V', date: '2026-11-06', start_time: '09:00', end_time: '12:00', room: 'R3' },
    ], admin);
    updateExamSubject(subj.id, { subject: 'Mathematics', max_marks: 80, pass_marks: 28, weightage: 100 }, admin);
    const marksSubj = db.prepare("SELECT DISTINCT subject FROM marks WHERE exam_id = ?").all(examId) as { subject: string }[];
    expect(marksSubj.map((r) => r.subject)).not.toContain('Maths');
    expect(marksSubj.map((r) => r.subject)).toContain('Mathematics');
    const dsSubj = db.prepare("SELECT DISTINCT subject FROM datesheet WHERE exam_id = ?").all(examId) as { subject: string }[];
    expect(dsSubj.map((r) => r.subject)).not.toContain('Maths');
    // duplicate name within the class is blocked
    expect(() => updateExamSubject(subj.id, { subject: 'English', max_marks: 80, pass_marks: 28, weightage: 100 }, admin))
      .toThrow('name-exists');
  });

  it('deleteExamSubject cascades to marks and datesheet rows', () => {
    const db = getDb();
    const subj = db.prepare("SELECT id FROM exam_subjects WHERE exam_id = ? AND subject = 'English'").get(examId) as { id: number };
    deleteExamSubject(subj.id, admin);
    expect(db.prepare('SELECT id FROM exam_subjects WHERE id = ?').get(subj.id)).toBeUndefined();
    expect(db.prepare("SELECT * FROM marks WHERE exam_id = ? AND subject = 'English'").all(examId)).toHaveLength(0);
    expect(db.prepare("SELECT * FROM datesheet WHERE exam_id = ? AND subject = 'English'").all(examId)).toHaveLength(0);
    expect(() => deleteExamSubject(999999, admin)).toThrow('not-found');
  });

  it('listUsedSubjects returns distinct subject names used in the class', () => {
    // 'Maths' was renamed to 'Mathematics' and 'English' deleted by the tests above
    expect(listUsedSubjects('V')).toEqual(['Mathematics']);
    expect(listUsedSubjects('VI')).toEqual([]);
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
