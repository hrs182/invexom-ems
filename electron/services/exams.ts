import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type { SafeUser, ExamRow, ExamSubject, DatesheetRow, ResultRow, CardTemplate } from '../../shared/types.js';
import { audit } from './audit.js';


export function listExams(sessionId?: number | null): ExamRow[] {
  const db = getDb();
  const rows = (sessionId
    ? db.prepare('SELECT * FROM exams WHERE session_id = ? ORDER BY id DESC').all(sessionId)
    : db.prepare('SELECT * FROM exams ORDER BY id DESC').all()) as (Omit<ExamRow, 'classes'> & { classes: string })[];
  return rows.map((r) => ({ ...r, classes: JSON.parse(r.classes || '[]') }));
}

export function createExam(input: { name: string; term: string; session_id: number | null; classes: string[] }, user: SafeUser): number {
  const r = getDb().prepare('INSERT INTO exams (name, term, session_id, classes) VALUES (?, ?, ?, ?)')
    .run(input.name.trim(), input.term, input.session_id, JSON.stringify(input.classes));
  audit(user, 'exams.create', 'exam', Number(r.lastInsertRowid), null, { name: input.name });
  return Number(r.lastInsertRowid);
}

export function saveExamSubjects(examId: number, subjects: { subject: string; class_name: string; max_marks: number; pass_marks: number; weightage: number }[], user: SafeUser): void {
  const db = getDb();
  assertUnlocked(examId);
  const stmt = db.prepare(`INSERT INTO exam_subjects (exam_id, subject, class_name, max_marks, pass_marks, weightage)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(exam_id, subject, class_name) DO UPDATE SET max_marks = excluded.max_marks,
      pass_marks = excluded.pass_marks, weightage = excluded.weightage`);
  const txn = db.transaction(() => { for (const s of subjects) stmt.run(examId, s.subject.trim(), s.class_name, s.max_marks, s.pass_marks, s.weightage); });
  txn();
  audit(user, 'exams.subjects', 'exam', examId, null, { count: subjects.length });
}

export function listExamSubjects(examId: number): ExamSubject[] {
  return getDb().prepare('SELECT * FROM exam_subjects WHERE exam_id = ? ORDER BY class_name, subject').all(examId) as ExamSubject[];
}

function assertUnlocked(examId: number): void {
  const row = getDb().prepare('SELECT is_locked FROM exams WHERE id = ?').get(examId) as { is_locked: number } | undefined;
  if (row?.is_locked) throw new Error('exam-locked');
}

/** FR-EXM-02: datesheet with clash detection. Returns clashes found (blocks save when clashes). */
export function saveDatesheet(examId: number, rows: Omit<DatesheetRow, 'id'>[], user: SafeUser): { clashes: string[] } {
  const db = getDb();
  assertUnlocked(examId);
  const clashes: string[] = [];
  // Clash: same class two exams same date+slot; same room double-booked same date+slot.
  const seen = new Map<string, string>();
  for (const r of rows) {
    const slot = `${r.date}|${r.start_time}`;
    const ck = `class:${r.class_name}|${slot}`;
    if (seen.has(ck)) clashes.push(`${r.class_name} has two exams on ${r.date} at ${r.start_time} (${seen.get(ck)} vs ${r.subject})`);
    else seen.set(ck, r.subject);
    if (r.room) {
      const rk = `room:${r.room}|${slot}`;
      if (seen.has(rk)) clashes.push(`Room ${r.room} double-booked on ${r.date} at ${r.start_time}`);
      else seen.set(rk, r.subject);
    }
  }
  if (clashes.length) return { clashes };
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM datesheet WHERE exam_id = ?').run(examId);
    const stmt = db.prepare(`INSERT INTO datesheet (exam_id, subject, class_name, date, start_time, end_time, room)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const r of rows) stmt.run(examId, r.subject, r.class_name, r.date, r.start_time, r.end_time, r.room);
  });
  txn();
  audit(user, 'exams.datesheet', 'exam', examId, null, { count: rows.length });
  return { clashes: [] };
}

export function listDatesheet(examId: number): DatesheetRow[] {
  return getDb().prepare('SELECT * FROM datesheet WHERE exam_id = ? ORDER BY date, start_time').all(examId) as DatesheetRow[];
}

/** FR-EXM-03: marks entry grid save with max-marks validation. */
export function saveMarks(examId: number, subject: string, className: string, entries: {
  student_id: number; marks_obtained: number | null; is_absent: boolean; grace?: number; grace_note?: string;
}[], user: SafeUser): { rejected: { student_id: number; reason: string }[] } {
  const db = getDb();
  assertUnlocked(examId);
  const subj = db.prepare('SELECT max_marks FROM exam_subjects WHERE exam_id = ? AND subject = ? AND class_name = ?')
    .get(examId, subject, className) as { max_marks: number } | undefined;
  const max = subj?.max_marks ?? 100;
  const rejected: { student_id: number; reason: string }[] = [];
  const stmt = db.prepare(`INSERT INTO marks (exam_id, subject, student_id, marks_obtained, is_absent, grace, grace_note, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(exam_id, subject, student_id) DO UPDATE SET marks_obtained = excluded.marks_obtained,
      is_absent = excluded.is_absent, grace = excluded.grace, grace_note = excluded.grace_note,
      entered_by = excluded.entered_by, updated_at = datetime('now')`);
  const txn = db.transaction(() => {
    for (const e of entries) {
      if (!e.is_absent && e.marks_obtained != null && e.marks_obtained > max) {
        rejected.push({ student_id: e.student_id, reason: `>${max}` });
        continue;
      }
      stmt.run(examId, subject, e.student_id, e.is_absent ? null : e.marks_obtained, e.is_absent ? 1 : 0, e.grace ?? 0, e.grace_note ?? '', user.id);
    }
  });
  txn();
  audit(user, 'exams.marks', 'exam', examId, null, { subject, className, count: entries.length - rejected.length });
  return { rejected };
}

export function getMarks(examId: number, subject: string, className: string): Record<number, { marks: number | null; absent: boolean; grace: number }> {
  const rows = getDb().prepare(`SELECT m.student_id, m.marks_obtained, m.is_absent, m.grace FROM marks m
    JOIN students s ON s.id = m.student_id
    WHERE m.exam_id = ? AND m.subject = ? AND s.class_name = ?`).all(examId, subject, className) as
    { student_id: number; marks_obtained: number | null; is_absent: number; grace: number }[];
  return Object.fromEntries(rows.map((r) => [r.student_id, { marks: r.marks_obtained, absent: !!r.is_absent, grace: r.grace }]));
}

/** FR-EXM-04: computation — totals, %, grades, rank, pass/fail. */

export function computeResults(examId: number, className: string): ResultRow[] {
  const db = getDb();
  const subjects = db.prepare('SELECT subject, max_marks, pass_marks, weightage FROM exam_subjects WHERE exam_id = ? AND class_name = ?')
    .all(examId, className) as { subject: string; max_marks: number; pass_marks: number; weightage: number }[];
  if (!subjects.length) return [];
  const bands = db.prepare('SELECT min_percent, grade FROM grade_bands ORDER BY min_percent DESC').all() as { min_percent: number; grade: string }[];
  const students = db.prepare(`SELECT id, name, admission_no, roll_no FROM students
    WHERE class_name = ? AND status = 'active' AND is_deleted = 0 ORDER BY name`).all(className) as
    { id: number; name: string; admission_no: string; roll_no: string }[];
  const marksRows = db.prepare('SELECT student_id, subject, marks_obtained, is_absent, grace FROM marks WHERE exam_id = ?')
    .all(examId) as { student_id: number; subject: string; marks_obtained: number | null; is_absent: number; grace: number }[];
  const markMap = new Map<string, { marks_obtained: number | null; is_absent: number; grace: number }>();
  for (const m of marksRows) markMap.set(`${m.student_id}|${m.subject}`, m);

  const gradeFor = (p: number) => bands.find((b) => p >= b.min_percent)?.grade ?? 'E';
  const maxTotal = subjects.reduce((a, s) => a + s.max_marks * (s.weightage / 100), 0);

  const results: ResultRow[] = students.map((st) => {
    let total = 0; let pass = true;
    const subs = subjects.map((sub) => {
      const m = markMap.get(`${st.id}|${sub.subject}`);
      const marks = m && !m.is_absent ? (m.marks_obtained ?? 0) + (m.grace ?? 0) : null;
      const weighted = marks == null ? 0 : marks * (sub.weightage / 100);
      total += weighted;
      if (marks == null || marks < sub.pass_marks) pass = false;
      return { subject: sub.subject, marks, max: sub.max_marks, absent: !!m?.is_absent, grace: m?.grace ?? 0 };
    });
    const percent = maxTotal ? Math.round((total / maxTotal) * 1000) / 10 : 0;
    return {
      id: st.id, student_id: st.id, name: st.name, admission_no: st.admission_no, roll_no: st.roll_no,
      subjects: subs, total: Math.round(total * 100) / 100, maxTotal: Math.round(maxTotal * 100) / 100,
      percent, grade: gradeFor(percent), rank: 0, pass,
    };
  });
  // Rank by total (dense ranking)
  const sorted = [...results].sort((a, b) => b.total - a.total);
  let rank = 0; let lastTotal = -1;
  for (const r of sorted) {
    if (r.total !== lastTotal) { rank++; lastTotal = r.total; }
    r.rank = rank;
  }
  return results.sort((a, b) => a.rank - b.rank);
}

/** FR-EXM-05: lock/unlock (unlock needs admin password — verified at IPC layer). */
export function lockExam(examId: number, user: SafeUser): void {
  getDb().prepare('UPDATE exams SET is_locked = 1, locked_by = ?, locked_at = datetime(\'now\') WHERE id = ?').run(user.id, examId);
  audit(user, 'exams.lock', 'exam', examId);
}
export function unlockExam(examId: number, user: SafeUser): void {
  getDb().prepare('UPDATE exams SET is_locked = 0 WHERE id = ?').run(examId);
  audit(user, 'exams.unlock', 'exam', examId);
}

/** FR-EXM-09: analysis reports. */
export function resultAnalysis(examId: number, className: string): {
  subjectStats: { subject: string; avg: number; highest: number; lowest: number; passPercent: number }[];
  toppers: { name: string; percent: number }[];
  failList: { name: string; subjects: string[] }[];
} {
  const results = computeResults(examId, className);
  const db = getDb();
  const subjects = db.prepare('SELECT subject, max_marks, pass_marks FROM exam_subjects WHERE exam_id = ? AND class_name = ?')
    .all(examId, className) as { subject: string; max_marks: number; pass_marks: number }[];
  const subjectStats = subjects.map((sub) => {
    const vals = results.map((r) => r.subjects.find((s) => s.subject === sub.subject)).filter((s) => s && s.marks != null) as { marks: number }[];
    const nums = vals.map((v) => v.marks);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const passed = vals.filter((v) => v.marks >= sub.pass_marks).length;
    return {
      subject: sub.subject, avg: Math.round(avg * 10) / 10,
      highest: nums.length ? Math.max(...nums) : 0, lowest: nums.length ? Math.min(...nums) : 0,
      passPercent: vals.length ? Math.round((passed / vals.length) * 1000) / 10 : 0,
    };
  });
  return {
    subjectStats,
    toppers: results.slice(0, 10).map((r) => ({ name: r.name, percent: r.percent })),
    failList: results.filter((r) => !r.pass).map((r) => ({
      name: r.name,
      subjects: r.subjects.filter((s) => s.marks == null || s.marks < (subjects.find((x) => x.subject === s.subject)?.pass_marks ?? 0)).map((s) => s.subject),
    })),
  };
}

// ---------- Card templates ----------

export function listTemplates(kind: string): CardTemplate[] {
  const rows = getDb().prepare('SELECT * FROM card_templates WHERE kind = ? ORDER BY is_default DESC, name').all(kind) as
    (Omit<CardTemplate, 'config'> & { config: string })[];
  return rows.map((r) => ({ ...r, config: JSON.parse(r.config || '{}') }));
}

export function saveTemplate(kind: string, name: string, className: string, config: Record<string, unknown>, makeDefault: boolean, user: SafeUser): number {
  const db = getDb();
  const txn = db.transaction(() => {
    if (makeDefault) db.prepare('UPDATE card_templates SET is_default = 0 WHERE kind = ?').run(kind);
    const existing = db.prepare('SELECT id, version FROM card_templates WHERE kind = ? AND name = ?').get(kind, name) as { id: number; version: number } | undefined;
    if (existing) {
      db.prepare('UPDATE card_templates SET config = ?, version = ?, is_default = ? WHERE id = ?')
        .run(JSON.stringify(config), existing.version + 1, makeDefault ? 1 : 0, existing.id);
      return existing.id;
    }
    const r = db.prepare('INSERT INTO card_templates (kind, name, class_name, config, is_default) VALUES (?, ?, ?, ?, ?)')
      .run(kind, name, className, JSON.stringify(config), makeDefault ? 1 : 0);
    return Number(r.lastInsertRowid);
  });
  const id = txn();
  audit(user, 'cards.template.save', 'template', id, null, { kind, name });
  return id;
}

// ---------- Gatepass ----------
export function createGatepass(input: { student_id: number; reason: string; valid_until: string; authorized_by: string; receiver_name: string }, user: SafeUser): { id: number; gatepass_no: string } {
  const db = getDb();
  const gatepass_no = nextNumber('gatepass');
  const r = db.prepare(`INSERT INTO gatepasses (gatepass_no, student_id, reason, valid_until, authorized_by, receiver_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(gatepass_no, input.student_id, input.reason, input.valid_until, input.authorized_by, input.receiver_name, user.id);
  audit(user, 'cards.gatepass', 'gatepass', Number(r.lastInsertRowid));
  return { id: Number(r.lastInsertRowid), gatepass_no };
}

export function listGatepasses(limit = 100): unknown[] {
  return getDb().prepare(`SELECT g.*, s.name AS student_name, s.class_name, s.section FROM gatepasses g
    JOIN students s ON s.id = g.student_id ORDER BY g.id DESC LIMIT ?`).all(limit);
}
