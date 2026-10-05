import { getDb } from './database.js';
import { nextNumber } from './numbering.js';
import type { SafeUser, StudentRow, StudentInput, StudentFilters } from '../../shared/types.js';
import { audit } from './audit.js';

const COLS = `id, admission_no, name, dob, gender, blood_group, category, religion, nationality,
  class_name, section, roll_no, admission_date, previous_school, sibling_info,
  father_name, father_occupation, father_phone, mother_name, mother_occupation, mother_phone,
  guardian_name, guardian_phone, address, photo_path, status, session_id`;

export function listStudents(f: StudentFilters): { rows: StudentRow[]; total: number } {
  const db = getDb();
  const where: string[] = ['is_deleted = 0'];
  const vals: unknown[] = [];
  if (f.q) { where.push('(name LIKE ? OR admission_no LIKE ? OR father_phone LIKE ? OR mother_phone LIKE ?)'); const q = `%${f.q}%`; vals.push(q, q, q, q); }
  if (f.class_name) { where.push('class_name = ?'); vals.push(f.class_name); }
  if (f.section) { where.push('section = ?'); vals.push(f.section); }
  if (f.status) { where.push('status = ?'); vals.push(f.status); } else { where.push("status = 'active'"); }
  if (f.session_id) { where.push('session_id = ?'); vals.push(f.session_id); }
  const w = where.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM students WHERE ${w}`).get(...vals) as { c: number }).c;
  const rows = db.prepare(
    `SELECT ${COLS} FROM students WHERE ${w} ORDER BY class_name, section, name LIMIT ? OFFSET ?`,
  ).all(...vals, f.limit ?? 200, f.offset ?? 0) as StudentRow[];
  return { rows, total };
}

export function getStudent(id: number): (StudentRow & { documents: { doc_type: string; status: string }[] }) | null {
  const db = getDb();
  const row = db.prepare(`SELECT ${COLS} FROM students WHERE id = ? AND is_deleted = 0`).get(id) as StudentRow | undefined;
  if (!row) return null;
  const documents = db.prepare('SELECT doc_type, status FROM student_documents WHERE student_id = ?').all(id) as { doc_type: string; status: string }[];
  return { ...row, documents };
}

/** FR-ADM-02: duplicate detection on name+phone or name+DOB. Returns matches; caller confirms. */
export function findDuplicates(input: StudentInput): StudentRow[] {
  const db = getDb();
  const phones = [input.father_phone, input.mother_phone, input.guardian_phone].filter(Boolean);
  const clauses: string[] = [];
  const vals: unknown[] = [];
  if (phones.length) {
    clauses.push(`(name = ? AND (father_phone IN (${phones.map(() => '?').join(',')}) OR mother_phone IN (${phones.map(() => '?').join(',')}) OR guardian_phone IN (${phones.map(() => '?').join(',')})))`);
    vals.push(input.name, ...phones, ...phones, ...phones);
  }
  if (input.dob) {
    clauses.push('(name = ? AND dob = ? AND dob != ?)');
    vals.push(input.name, input.dob, '');
  }
  if (!clauses.length) return [];
  return db.prepare(`SELECT ${COLS} FROM students WHERE is_deleted = 0 AND (${clauses.join(' OR ')}) LIMIT 10`).all(...vals) as StudentRow[];
}

export function createStudent(input: StudentInput, sessionId: number | null, user: SafeUser, force = false): { id: number; admission_no: string; duplicates: StudentRow[] } {
  const db = getDb();
  if (!input.name.trim()) throw new Error('name-required');
  if (!force) {
    const dups = findDuplicates(input);
    if (dups.length) return { id: 0, admission_no: '', duplicates: dups };
  }
  const txn = db.transaction(() => {
    const admission_no = nextNumber('admission');
    const r = db.prepare(`INSERT INTO students
      (admission_no, name, dob, gender, blood_group, category, religion, nationality, class_name, section,
       roll_no, admission_date, previous_school, sibling_info, father_name, father_occupation, father_phone,
       mother_name, mother_occupation, mother_phone, guardian_name, guardian_phone, address, photo_path, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(admission_no, input.name.trim(), input.dob ?? '', input.gender ?? '', input.blood_group ?? '',
        input.category ?? '', input.religion ?? '', input.nationality ?? 'Indian', input.class_name,
        input.section ?? '', input.roll_no ?? '', input.admission_date ?? new Date().toISOString().slice(0, 10),
        input.previous_school ?? '', input.sibling_info ?? '', input.father_name ?? '', input.father_occupation ?? '',
        input.father_phone ?? '', input.mother_name ?? '', input.mother_occupation ?? '', input.mother_phone ?? '',
        input.guardian_name ?? '', input.guardian_phone ?? '', input.address ?? '', input.photo_path ?? null, sessionId);
    const id = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO student_status_history (student_id, old_status, new_status, reason, changed_by) VALUES (?, ?, ?, ?, ?)')
      .run(id, '', 'active', 'Admission', user.id);
    audit(user, 'students.create', 'student', id, null, { admission_no, name: input.name });
    return { id, admission_no, duplicates: [] as StudentRow[] };
  });
  return txn();
}

export function updateStudent(id: number, patch: Partial<StudentInput>, user: SafeUser): void {
  const db = getDb();
  const map: Record<string, string> = {
    name: 'name', dob: 'dob', gender: 'gender', blood_group: 'blood_group', category: 'category',
    religion: 'religion', nationality: 'nationality', class_name: 'class_name', section: 'section',
    roll_no: 'roll_no', admission_date: 'admission_date', previous_school: 'previous_school',
    sibling_info: 'sibling_info', father_name: 'father_name', father_occupation: 'father_occupation',
    father_phone: 'father_phone', mother_name: 'mother_name', mother_occupation: 'mother_occupation',
    mother_phone: 'mother_phone', guardian_name: 'guardian_name', guardian_phone: 'guardian_phone',
    address: 'address', photo_path: 'photo_path',
  };
  const sets: string[] = []; const vals: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (!sets.length) return;
  db.prepare(`UPDATE students SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
  audit(user, 'students.update', 'student', id, null, patch);
}

/** FR-ADM-03: status change with reason + audit. */
export function changeStudentStatus(id: number, newStatus: string, reason: string, user: SafeUser): void {
  const db = getDb();
  const valid = ['active', 'inactive', 'tc-issued', 'dropout', 'alumni'];
  if (!valid.includes(newStatus)) throw new Error('invalid-status');
  const row = db.prepare('SELECT status FROM students WHERE id = ?').get(id) as { status: string } | undefined;
  if (!row) throw new Error('not-found');
  db.transaction(() => {
    db.prepare('UPDATE students SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, id);
    db.prepare('INSERT INTO student_status_history (student_id, old_status, new_status, reason, changed_by) VALUES (?, ?, ?, ?, ?)')
      .run(id, row.status, newStatus, reason, user.id);
  })();
  audit(user, 'students.status', 'student', id, { status: row.status }, { status: newStatus, reason });
}

/** FR-ADM-04: bulk promote a class/section into the next session mapping. */
export function promoteStudents(ids: number[], toClass: string, toSection: string, sessionId: number | null, user: SafeUser): number {
  const db = getDb();
  const stmt = db.prepare(`UPDATE students SET class_name = ?, section = ?, session_id = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'active' AND is_deleted = 0`);
  const hist = db.prepare(`INSERT INTO class_history (student_id, from_class, from_section, to_class, to_section, session_id, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  const txn = db.transaction(() => {
    for (const id of ids) {
      const s = db.prepare('SELECT class_name, section FROM students WHERE id = ?').get(id) as { class_name: string; section: string } | undefined;
      if (!s) continue;
      stmt.run(toClass, toSection, sessionId, id);
      hist.run(id, s.class_name, s.section, toClass, toSection, sessionId, user.id);
      n++;
    }
  });
  txn();
  audit(user, 'students.promote', 'student', 0, null, { count: n, toClass, toSection });
  return n;
}

/** FR-ADM-05: TC generation — blocks when dues pending unless admin override. */
export function tcEligibility(studentId: number): { eligible: boolean; pendingDues: number; student: StudentRow | null } {
  const db = getDb();
  const student = db.prepare(`SELECT ${COLS} FROM students WHERE id = ?`).get(studentId) as StudentRow | undefined ?? null;
  if (!student) return { eligible: false, pendingDues: 0, student: null };
  const row = db.prepare(`SELECT COALESCE(SUM(amount + fine - discount - paid), 0) AS due
    FROM fee_dues WHERE student_id = ? AND status != 'paid'`).get(studentId) as { due: number };
  return { eligible: row.due <= 0.005, pendingDues: Math.round(row.due * 100) / 100, student };
}

export function issueTC(studentId: number, reason: string, override: boolean, user: SafeUser): { tcNo: string } {
  const db = getDb();
  const { eligible } = tcEligibility(studentId);
  if (!eligible && !override) throw new Error('dues-pending');
  const tcNo = nextNumber('tc');
  changeStudentStatus(studentId, 'tc-issued', `TC ${tcNo}: ${reason}${override ? ' (admin override of dues)' : ''}`, user);
  audit(user, 'students.tc', 'student', studentId, null, { tcNo, reason, override });
  return { tcNo };
}

export function setDocuments(studentId: number, docs: { doc_type: string; status: string }[], user: SafeUser): void {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO student_documents (student_id, doc_type, status)
    VALUES (?, ?, ?) ON CONFLICT(student_id, doc_type) DO UPDATE SET status = excluded.status`);
  const txn = db.transaction(() => { for (const d of docs) stmt.run(studentId, d.doc_type, d.status); });
  txn();
  audit(user, 'students.documents', 'student', studentId);
}

/** FR-ADM-07: admission register (session-wise, class-wise). */
export function admissionRegister(sessionId: number | null, className?: string): StudentRow[] {
  const db = getDb();
  const where = ['is_deleted = 0'];
  const vals: unknown[] = [];
  if (sessionId) { where.push('session_id = ?'); vals.push(sessionId); }
  if (className) { where.push('class_name = ?'); vals.push(className); }
  return db.prepare(`SELECT ${COLS} FROM students WHERE ${where.join(' AND ')} ORDER BY admission_date, name`).all(...vals) as StudentRow[];
}

export function activeStudentCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS c FROM students WHERE status = 'active' AND is_deleted = 0").get() as { c: number }).c;
}
