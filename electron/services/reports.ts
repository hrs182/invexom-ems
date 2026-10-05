import { getDb } from './database.js';
import { collectionSummary, discountRegister, defaulters, listReceipts } from './fees.js';
import { absentees, attendancePercent, monthlyRegister } from './attendance.js';
import { admissionRegister } from './students.js';

export interface ReportDef {
  key: string;
  title: string;
  params: ('from' | 'to' | 'month' | 'date' | 'class' | 'session')[];
}

export const REPORTS: ReportDef[] = [
  { key: 'daily-collection', title: 'Daily collection summary', params: ['from', 'to'] },
  { key: 'head-wise-collection', title: 'Head-wise collection', params: ['from', 'to'] },
  { key: 'mode-wise-collection', title: 'Mode-wise collection', params: ['from', 'to'] },
  { key: 'defaulter-list', title: 'Fee defaulter list', params: ['session', 'class'] },
  { key: 'discount-register', title: 'Discount register', params: ['from', 'to'] },
  { key: 'cancelled-receipts', title: 'Cancelled receipts', params: ['from', 'to'] },
  { key: 'daily-absentees', title: 'Daily absentee list', params: ['date', 'class'] },
  { key: 'attendance-percent', title: 'Attendance % (below threshold)', params: ['from', 'to', 'class'] },
  { key: 'monthly-register', title: 'Monthly attendance register', params: ['month', 'class'] },
  { key: 'admission-register', title: 'Admission register', params: ['session', 'class'] },
];

export interface ReportResult {
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

const inr = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function runReport(key: string, p: Record<string, string>): ReportResult {
  const db = getDb();
  switch (key) {
    case 'daily-collection': {
      const rows = collectionSummary(p.from, p.to, 'day');
      return { columns: [{ header: 'Date', key: 'label' }, { header: 'Receipts', key: 'count' }, { header: 'Amount (₹)', key: 'total' }],
        rows: rows.map((r) => ({ ...r, total: inr(r.total) })) };
    }
    case 'head-wise-collection': {
      const rows = collectionSummary(p.from, p.to, 'head');
      return { columns: [{ header: 'Fee head', key: 'label' }, { header: 'Receipts', key: 'count' }, { header: 'Amount (₹)', key: 'total' }],
        rows: rows.map((r) => ({ ...r, total: inr(r.total) })) };
    }
    case 'mode-wise-collection': {
      const rows = collectionSummary(p.from, p.to, 'mode');
      return { columns: [{ header: 'Mode', key: 'label' }, { header: 'Receipts', key: 'count' }, { header: 'Amount (₹)', key: 'total' }],
        rows: rows.map((r) => ({ ...r, total: inr(r.total) })) };
    }
    case 'defaulter-list': {
      const rows = defaulters(p.session ? Number(p.session) : null, p.class || undefined);
      return { columns: [
        { header: 'Admission no.', key: 'admission_no' }, { header: 'Student', key: 'student_name' },
        { header: 'Class', key: 'class_name' }, { header: 'Phone', key: 'father_phone' },
        { header: '0–30 days', key: 'bucket_0_30' }, { header: '31–60 days', key: 'bucket_31_60' },
        { header: '61–90 days', key: 'bucket_61_90' }, { header: '90+ days', key: 'bucket_90p' },
        { header: 'Total due (₹)', key: 'total_due' }],
        rows: rows.map((r) => ({ ...r, total_due: inr(r.total_due), bucket_0_30: inr(r.bucket_0_30), bucket_31_60: inr(r.bucket_31_60), bucket_61_90: inr(r.bucket_61_90), bucket_90p: inr(r.bucket_90p) })) };
    }
    case 'discount-register': {
      const rows = discountRegister(p.from, p.to);
      return { columns: [
        { header: 'Date', key: 'date' }, { header: 'Student', key: 'student_name' },
        { header: 'Head', key: 'head_name' }, { header: 'Discount (₹)', key: 'discount' },
        { header: 'Reason', key: 'reason' }, { header: 'Approved by', key: 'approved_by' }], rows };
    }
    case 'cancelled-receipts': {
      const { rows } = listReceipts({ from: p.from, to: p.to, status: 'cancelled', limit: 2000 });
      return { columns: [
        { header: 'Receipt no.', key: 'receipt_no' }, { header: 'Date', key: 'date' },
        { header: 'Student', key: 'student_name' }, { header: 'Amount (₹)', key: 'total' }], rows };
    }
    case 'daily-absentees': {
      const rows = absentees(p.date, p.class || undefined);
      return { columns: [
        { header: 'Student', key: 'name' }, { header: 'Class', key: 'class_name' },
        { header: 'Section', key: 'section' }, { header: 'Phone', key: 'father_phone' }], rows };
    }
    case 'attendance-percent': {
      const thRow = db.prepare("SELECT value FROM app_rules WHERE key = 'attendance.threshold'").get() as { value: string } | undefined;
      const th = parseFloat(thRow?.value ?? '75');
      const [cls, sec] = (p.class || '|').split('|');
      const rows = attendancePercent(cls, sec, p.from, p.to, th).filter((r) => r.below);
      return { columns: [
        { header: 'Admission no.', key: 'admission_no' }, { header: 'Student', key: 'name' },
        { header: 'Present', key: 'present' }, { header: 'Total', key: 'total' }, { header: '%', key: 'percent' }], rows };
    }
    case 'monthly-register': {
      const [cls, sec] = (p.class || '|').split('|');
      const reg = monthlyRegister(cls, sec, p.month);
      const columns = [{ header: 'Student', key: 'name' }, ...reg.days.map((d) => ({ header: d.slice(8), key: d, width: 6 }))];
      return { columns, rows: reg.rows.map((r) => ({ name: r.name, ...r.cells })) };
    }
    case 'admission-register': {
      const rows = admissionRegister(p.session ? Number(p.session) : null, p.class || undefined);
      return { columns: [
        { header: 'Adm. no.', key: 'admission_no' }, { header: 'Name', key: 'name' },
        { header: 'Class', key: 'class_name' }, { header: 'Section', key: 'section' },
        { header: 'DOB', key: 'dob' }, { header: 'Adm. date', key: 'admission_date' },
        { header: "Father's name", key: 'father_name' }, { header: 'Phone', key: 'father_phone' },
        { header: 'Status', key: 'status' }], rows };
    }
    default: throw new Error('unknown-report');
  }
}
