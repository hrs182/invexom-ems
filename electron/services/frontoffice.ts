import { getDb } from './database.js';
import type { SafeUser } from '../../shared/types.js';
import { audit } from './audit.js';
import { createStudent } from './students.js';

export interface EnquiryRow {
  id: number; name: string; phone: string; class_interested: string; source: string;
  followup_date: string; counsellor: string; notes: string; status: string;
}

export function listEnquiries(f: { status?: string; today?: boolean; overdue?: boolean }): EnquiryRow[] {
  const db = getDb();
  const where = ['1=1']; const vals: unknown[] = [];
  if (f.status) { where.push('status = ?'); vals.push(f.status); }
  if (f.today) { where.push("followup_date = date('now')"); }
  if (f.overdue) { where.push("followup_date < date('now') AND status = 'open'"); }
  return db.prepare(`SELECT * FROM enquiries WHERE ${where.join(' AND ')} ORDER BY followup_date`).all(...vals) as EnquiryRow[];
}

export function createEnquiry(input: Omit<EnquiryRow, 'id' | 'status'>, user: SafeUser): number {
  if (!input.name.trim() || !input.phone.trim()) throw new Error('name-phone-required');
  const r = getDb().prepare(`INSERT INTO enquiries (name, phone, class_interested, source, followup_date, counsellor, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(input.name.trim(), input.phone.trim(), input.class_interested, input.source,
      input.followup_date, input.counsellor, input.notes);
  audit(user, 'frontoffice.enquiry.create', 'enquiry', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function logFollowup(enquiryId: number, outcome: string, notes: string, nextDate: string, user: SafeUser): void {
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare('INSERT INTO followups (enquiry_id, outcome, notes, created_by) VALUES (?, ?, ?, ?)')
      .run(enquiryId, outcome, notes, user.id);
    db.prepare('UPDATE enquiries SET followup_date = ? WHERE id = ?').run(nextDate, enquiryId);
  });
  txn();
  audit(user, 'frontoffice.followup', 'enquiry', enquiryId, null, { outcome });
}

/** FR-FRO-03: one-click enquiry → admission, carrying all data. */
export function convertEnquiry(enquiryId: number, className: string, section: string, user: SafeUser): { studentId: number; admission_no: string } {
  const db = getDb();
  const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(enquiryId) as EnquiryRow & { status: string } | undefined;
  if (!enq || enq.status === 'converted') throw new Error('invalid-enquiry');
  const activeSession = db.prepare('SELECT id FROM sessions WHERE is_active = 1').get() as { id: number } | undefined;
  const r = createStudent({
    name: enq.name, class_name: className, section,
    father_name: '', father_phone: enq.phone, address: enq.notes,
  }, activeSession?.id ?? null, user, true);
  db.prepare("UPDATE enquiries SET status = 'converted', converted_student_id = ? WHERE id = ?").run(r.id, enquiryId);
  audit(user, 'frontoffice.enquiry.convert', 'enquiry', enquiryId, null, { studentId: r.id });
  return { studentId: r.id, admission_no: r.admission_no };
}

export function markEnquiryLost(enquiryId: number, user: SafeUser): void {
  getDb().prepare("UPDATE enquiries SET status = 'lost' WHERE id = ?").run(enquiryId);
  audit(user, 'frontoffice.enquiry.lost', 'enquiry', enquiryId);
}

/** FR-FRO-04: conversion report by source and counsellor. */
export function conversionReport(): {
  bySource: { source: string; enquiries: number; converted: number; rate: number }[];
  byCounsellor: { counsellor: string; enquiries: number; converted: number; rate: number }[];
} {
  const db = getDb();
  const bySource = db.prepare(`SELECT source, COUNT(*) AS enquiries,
      SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
    FROM enquiries GROUP BY source ORDER BY enquiries DESC`).all() as { source: string; enquiries: number; converted: number }[];
  const byCounsellor = db.prepare(`SELECT counsellor, COUNT(*) AS enquiries,
      SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted
    FROM enquiries WHERE counsellor != '' GROUP BY counsellor ORDER BY enquiries DESC`).all() as { counsellor: string; enquiries: number; converted: number }[];
  const withRate = <T extends { enquiries: number; converted: number }>(rows: T[]) =>
    rows.map((r) => ({ ...r, rate: r.enquiries ? Math.round((r.converted / r.enquiries) * 1000) / 10 : 0 }));
  return { bySource: withRate(bySource), byCounsellor: withRate(byCounsellor) };
}

// ---------- Visitors ----------
export function listVisitors(date?: string): unknown[] {
  const db = getDb();
  return date
    ? db.prepare('SELECT * FROM visitors WHERE date = ? ORDER BY in_time DESC').all(date)
    : db.prepare('SELECT * FROM visitors ORDER BY date DESC, in_time DESC LIMIT 200').all();
}

export function logVisitor(input: { name: string; phone: string; purpose: string; whom_to_meet: string; in_time: string }, user: SafeUser): number {
  const r = getDb().prepare(`INSERT INTO visitors (name, phone, purpose, whom_to_meet, in_time)
    VALUES (?, ?, ?, ?, ?)`).run(input.name, input.phone, input.purpose, input.whom_to_meet, input.in_time);
  audit(user, 'frontoffice.visitor', 'visitor', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function visitorOut(id: number, outTime: string, user: SafeUser): void {
  getDb().prepare('UPDATE visitors SET out_time = ? WHERE id = ?').run(outTime, id);
  audit(user, 'frontoffice.visitor.out', 'visitor', id);
}

// ---------- Complaints ----------
export function listComplaints(status?: string): unknown[] {
  const db = getDb();
  return status
    ? db.prepare('SELECT * FROM complaints WHERE status = ? ORDER BY date DESC').all(status)
    : db.prepare('SELECT * FROM complaints ORDER BY date DESC LIMIT 200').all();
}

export function createComplaint(input: { complainant: string; phone: string; type: string; description: string }, user: SafeUser): number {
  const r = getDb().prepare('INSERT INTO complaints (complainant, phone, type, description) VALUES (?, ?, ?, ?)')
    .run(input.complainant, input.phone, input.type, input.description);
  audit(user, 'frontoffice.complaint', 'complaint', Number(r.lastInsertRowid));
  return Number(r.lastInsertRowid);
}

export function setComplaintStatus(id: number, status: string, notes: string, user: SafeUser): void {
  getDb().prepare(`UPDATE complaints SET status = ?, notes = ?,
    resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END WHERE id = ?`)
    .run(status, notes, status, id);
  audit(user, 'frontoffice.complaint.status', 'complaint', id, null, { status });
}
