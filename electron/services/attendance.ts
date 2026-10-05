import { getDb } from './database.js';
import type { SafeUser } from '../../shared/types.js';
import { audit } from './audit.js';

export interface AttendanceCell { student_id: number; status: string }

export function classRoster(className: string, section: string): { id: number; name: string; admission_no: string; roll_no: string }[] {
  return getDb().prepare(`SELECT id, name, admission_no, roll_no FROM students
    WHERE class_name = ? AND section = ? AND status = 'active' AND is_deleted = 0
    ORDER BY roll_no, name`).all(className, section) as never;
}

/** FR-ATT-01: bulk upsert for a class/date. */
export function markAttendance(className: string, section: string, date: string, cells: AttendanceCell[], user: SafeUser): number {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO attendance (student_id, class_name, section, date, status, marked_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by, marked_at = datetime('now')`);
  const txn = db.transaction(() => {
    for (const c of cells) stmt.run(c.student_id, className, section, date, c.status, user.id);
  });
  txn();
  audit(user, 'attendance.mark', 'attendance', 0, null, { className, section, date, count: cells.length });
  return cells.length;
}

export function getAttendance(className: string, section: string, date: string): Record<number, string> {
  const rows = getDb().prepare('SELECT student_id, status FROM attendance WHERE class_name = ? AND section = ? AND date = ?')
    .all(className, section, date) as { student_id: number; status: string }[];
  return Object.fromEntries(rows.map((r) => [r.student_id, r.status]));
}

/** FR-ATT-04: attendance % per student for a date range; below-threshold flagged. */
export function attendancePercent(className: string, section: string, from: string, to: string, threshold: number):
  { student_id: number; name: string; admission_no: string; present: number; total: number; percent: number; below: boolean }[] {
  const db = getDb();
  const roster = classRoster(className, section);
  const rows = db.prepare(`SELECT student_id,
      SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN status IN ('P','A','L') THEN 1 ELSE 0 END) AS total
    FROM attendance WHERE class_name = ? AND section = ? AND date BETWEEN ? AND ?
    GROUP BY student_id`).all(className, section, from, to) as { student_id: number; present: number; total: number }[];
  const map = new Map(rows.map((r) => [r.student_id, r]));
  return roster.map((s) => {
    const r = map.get(s.id);
    const present = r?.present ?? 0; const total = r?.total ?? 0;
    const percent = total ? Math.round((present / total) * 1000) / 10 : 100;
    return { student_id: s.id, name: s.name, admission_no: s.admission_no, present, total, percent, below: percent < threshold };
  });
}

export function absentees(date: string, className?: string): { student_id: number; name: string; class_name: string; section: string; father_phone: string }[] {
  const db = getDb();
  const where = ["a.date = ?", "a.status = 'A'"];
  const vals: unknown[] = [date];
  if (className) { where.push('a.class_name = ?'); vals.push(className); }
  return db.prepare(`SELECT a.student_id, s.name, a.class_name, a.section, s.father_phone
    FROM attendance a JOIN students s ON s.id = a.student_id WHERE ${where.join(' AND ')}`).all(...vals) as never;
}

/** FR-ATT-02: staff attendance. */
export function markStaffAttendance(date: string, cells: { staff_id: number; status: string; in_time?: string; late?: boolean }[], user: SafeUser): number {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO staff_attendance (staff_id, date, status, in_time, late, marked_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(staff_id, date) DO UPDATE SET status = excluded.status, in_time = excluded.in_time,
      late = excluded.late, marked_by = excluded.marked_by`);
  const txn = db.transaction(() => {
    for (const c of cells) stmt.run(c.staff_id, date, c.status, c.in_time ?? '', c.late ? 1 : 0, user.id);
  });
  txn();
  audit(user, 'attendance.staff.mark', 'staff-attendance', 0, null, { date, count: cells.length });
  return cells.length;
}

export function staffRoster(): { id: number; name: string; employee_code: string; designation: string }[] {
  return getDb().prepare(`SELECT id, name, employee_code, designation FROM staff
    WHERE status = 'active' AND is_deleted = 0 ORDER BY name`).all() as never;
}

export function getStaffAttendance(date: string): Record<number, { status: string; in_time: string; late: number }> {
  const rows = getDb().prepare('SELECT staff_id, status, in_time, late FROM staff_attendance WHERE date = ?').all(date) as
    { staff_id: number; status: string; in_time: string; late: number }[];
  return Object.fromEntries(rows.map((r) => [r.staff_id, { status: r.status, in_time: r.in_time, late: r.late }]));
}

/** FR-ATT-03: leave applications. */
export function listLeaves(status?: string): unknown[] {
  const db = getDb();
  const where = status ? 'WHERE l.status = ?' : '';
  const vals = status ? [status] : [];
  return db.prepare(`SELECT l.*, u.display_name AS decided_by_name FROM leave_applications l
    LEFT JOIN users u ON u.id = l.decided_by ${where} ORDER BY l.created_at DESC`).all(...vals);
}

export function applyLeave(input: { applicant_type: string; applicant_id: number; from_date: string; to_date: string; leave_type: string; reason: string }, user: SafeUser): number {
  const r = getDb().prepare(`INSERT INTO leave_applications
    (applicant_type, applicant_id, from_date, to_date, leave_type, reason) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(input.applicant_type, input.applicant_id, input.from_date, input.to_date, input.leave_type, input.reason);
  audit(user, 'attendance.leave.apply', 'leave', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function decideLeave(id: number, approve: boolean, user: SafeUser): void {
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare("UPDATE leave_applications SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?")
      .run(approve ? 'approved' : 'rejected', user.id, id);
    if (approve) {
      // Auto-reflect in attendance (FR-ATT-03)
      const l = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(id) as
        { applicant_type: string; applicant_id: number; from_date: string; to_date: string };
      const days: string[] = [];
      const d = new Date(l.from_date); const end = new Date(l.to_date);
      while (d <= end) { days.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
      if (l.applicant_type === 'student') {
        const s = db.prepare('SELECT class_name, section FROM students WHERE id = ?').get(l.applicant_id) as { class_name: string; section: string } | undefined;
        const stmt = db.prepare(`INSERT INTO attendance (student_id, class_name, section, date, status, marked_by)
          VALUES (?, ?, ?, ?, 'L', ?) ON CONFLICT(student_id, date) DO UPDATE SET status = 'L'`);
        for (const day of days) stmt.run(l.applicant_id, s?.class_name ?? '', s?.section ?? '', day, user.id);
      } else {
        const stmt = db.prepare(`INSERT INTO staff_attendance (staff_id, date, status, marked_by)
          VALUES (?, ?, 'L', ?) ON CONFLICT(staff_id, date) DO UPDATE SET status = 'L'`);
        for (const day of days) stmt.run(l.applicant_id, day, user.id);
      }
    }
  });
  txn();
  audit(user, 'attendance.leave.decide', 'leave', id, null, { approve });
}

export function monthlyRegister(className: string, section: string, month: string): { days: string[]; rows: { student_id: number; name: string; cells: Record<string, string> }[] } {
  const db = getDb();
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(`${month}-${String(d).padStart(2, '0')}`);
  const roster = classRoster(className, section);
  const att = db.prepare('SELECT student_id, date, status FROM attendance WHERE class_name = ? AND section = ? AND date LIKE ?')
    .all(className, section, `${month}%`) as { student_id: number; date: string; status: string }[];
  const map = new Map<string, string>();
  for (const a of att) map.set(`${a.student_id}|${a.date}`, a.status);
  return {
    days,
    rows: roster.map((s) => ({
      student_id: s.id, name: s.name,
      cells: Object.fromEntries(days.map((d) => [d, map.get(`${s.id}|${d}`) ?? ''])),
    })),
  };
}
