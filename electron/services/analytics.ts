import { getDb } from './database.js';

/** FR-DB-01..04: analytics dashboard data. */
export interface Kpis {
  activeStudents: number;
  feesCollectedMonth: number;
  feesPendingTotal: number;
  attendanceTodayPct: number | null;
  enquiriesWeek: number;
  staffPresentToday: number;
  staffTotal: number;
}

export function getKpis(): Kpis {
  const db = getDb();
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const q = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { v: number } | undefined)?.v ?? 0;
  const activeStudents = q("SELECT COUNT(*) AS v FROM students WHERE status = 'active' AND is_deleted = 0");
  const feesCollectedMonth = q("SELECT COALESCE(SUM(total),0) AS v FROM receipts WHERE status = 'active' AND date LIKE ?", `${month}%`);
  const feesPendingTotal = q(`SELECT COALESCE(SUM(amount + fine - discount - paid),0) AS v FROM fee_dues d
    JOIN students s ON s.id = d.student_id WHERE d.status != 'paid' AND s.status = 'active'`);
  const attToday = db.prepare(`SELECT
      SUM(CASE WHEN status = 'P' THEN 1 ELSE 0 END) AS p,
      SUM(CASE WHEN status IN ('P','A','L') THEN 1 ELSE 0 END) AS t
    FROM attendance WHERE date = ?`).get(today) as { p: number; t: number } | undefined;
  const enquiriesWeek = q("SELECT COUNT(*) AS v FROM enquiries WHERE created_at >= date('now', '-7 days')");
  const staffPresent = q("SELECT COUNT(*) AS v FROM staff_attendance WHERE date = ? AND status = 'P'", today);
  const staffTotal = q("SELECT COUNT(*) AS v FROM staff WHERE status = 'active' AND is_deleted = 0");
  return {
    activeStudents, feesCollectedMonth: Math.round(feesCollectedMonth), feesPendingTotal: Math.round(feesPendingTotal),
    attendanceTodayPct: attToday && attToday.t > 0 ? Math.round((attToday.p / attToday.t) * 1000) / 10 : null,
    enquiriesWeek, staffPresentToday: staffPresent, staffTotal,
  };
}

export function feeTrend(): { month: string; total: number }[] {
  const rows = getDb().prepare(`SELECT substr(date, 1, 7) AS month, SUM(total) AS total FROM receipts
    WHERE status = 'active' AND date >= date('now', '-12 months') GROUP BY month ORDER BY month`).all() as { month: string; total: number }[];
  return rows.map((r) => ({ month: r.month, total: Math.round(r.total) }));
}

export function admissionsTrend(): { month: string; count: number }[] {
  return getDb().prepare(`SELECT substr(admission_date, 1, 7) AS month, COUNT(*) AS count FROM students
    WHERE admission_date >= date('now', '-12 months') GROUP BY month ORDER BY month`).all() as never;
}

export function classStrength(): { class: string; count: number }[] {
  return getDb().prepare(`SELECT class_name AS class, COUNT(*) AS count FROM students
    WHERE status = 'active' AND is_deleted = 0 GROUP BY class_name ORDER BY class_name`).all() as never;
}

export function expenseTrend(): { month: string; total: number }[] {
  const hasTable = getDb().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'").get();
  if (!hasTable) return [];
  const rows = getDb().prepare(`SELECT substr(date, 1, 7) AS month, SUM(amount) AS total FROM vouchers
    WHERE type = 'payment' AND date >= date('now', '-12 months') GROUP BY month ORDER BY month`).all() as { month: string; total: number }[];
  return rows.map((r) => ({ month: r.month, total: Math.round(r.total) }));
}

export interface AlertItem { kind: string; title: string; detail: string; severity: 'danger' | 'warning' | 'info' }

/** FR-DB-03: smart alerts. */
export function smartAlerts(): AlertItem[] {
  const db = getDb();
  const alerts: AlertItem[] = [];
  // Fee-defaulter spike: dues > 90 days
  const old = (db.prepare(`SELECT COUNT(DISTINCT student_id) AS v FROM fee_dues
    WHERE status != 'paid' AND julianday('now') - julianday(due_date) > 90`).get() as { v: number } | undefined)?.v ?? 0;
  if (old > 0) alerts.push({ kind: 'dues', title: `${old} students owe 90+ day dues`, detail: 'Open Fees → Defaulters', severity: 'danger' });
  // Low stock
  const low = (db.prepare('SELECT COUNT(*) AS v FROM items WHERE is_deleted = 0 AND current_stock <= reorder_level').get() as { v: number } | undefined)?.v ?? 0;
  if (low > 0) alerts.push({ kind: 'stock', title: `${low} items at/below reorder level`, detail: 'Open Inventory', severity: 'warning' });
  // Today's follow-ups
  const fu = (db.prepare("SELECT COUNT(*) AS v FROM enquiries WHERE status = 'open' AND followup_date <= date('now')").get() as { v: number } | undefined)?.v ?? 0;
  if (fu > 0) alerts.push({ kind: 'followup', title: `${fu} enquiry follow-ups due`, detail: 'Open Front Office', severity: 'warning' });
  // Warranty expiries (60d)
  const w = (db.prepare(`SELECT COUNT(*) AS v FROM assets WHERE is_deleted = 0 AND warranty_expiry != ''
    AND julianday(warranty_expiry) - julianday('now') BETWEEN 0 AND 60`).get() as { v: number } | undefined)?.v ?? 0;
  if (w > 0) alerts.push({ kind: 'warranty', title: `${w} asset warranties expiring in 60 days`, detail: 'Open Inventory → Assets', severity: 'warning' });
  // Open complaints
  const c = (db.prepare("SELECT COUNT(*) AS v FROM complaints WHERE status = 'open'").get() as { v: number } | undefined)?.v ?? 0;
  if (c > 0) alerts.push({ kind: 'complaint', title: `${c} open complaints`, detail: 'Open Front Office', severity: 'info' });
  return alerts;
}

/** FR-DB-04: birthdays today + tomorrow. */
export function birthdays(): { students: { id: number; name: string; class_name: string; phone: string }[]; staff: { id: number; name: string; phone: string }[] } {
  const db = getDb();
  const md = new Date().toISOString().slice(5, 10); // MM-DD
  const students = db.prepare(`SELECT id, name, class_name, father_phone AS phone FROM students
    WHERE status = 'active' AND is_deleted = 0 AND substr(dob, 6, 5) = ?`).all(md) as never;
  const hasStaff = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff'").get();
  const staff = hasStaff
    ? (db.prepare(`SELECT id, name, phone FROM staff WHERE status = 'active' AND is_deleted = 0 AND substr(dob, 6, 5) = ?`).all(md) as never)
    : [];
  return { students, staff };
}
