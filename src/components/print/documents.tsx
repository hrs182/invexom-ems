import * as React from 'react';
import { Letterhead, DocTitle, MetaBlock, Signatures, amountInWords, PrintDoc, useInstitution } from './Letterhead';

/* ================= Fee receipt ================= */

export interface ReceiptLine { head_name: string; amount: number; fine?: number; discount?: number; month_label?: string; month_display?: string; }
export interface ReceiptData {
  receipt_no: string; date: string; student_name: string; admission_no: string;
  class_name: string; section?: string; father_phone?: string; mother_phone?: string;
  mode: string; ref_no?: string; tendered: number;
  change_given: number; total: number; notes?: string; lines: ReceiptLine[];
  fee_months?: string[]; remaining_due?: number;
}

export function FeeReceiptPrint({ receipt }: { receipt: ReceiptData }) {
  const inst = useInstitution();
  const phone = receipt.father_phone || receipt.mother_phone || '';
  const fmtM = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  };
  const months = receipt.fee_months ?? [];
  const feeFor = months.length === 0 ? '' : months.length === 1 ? fmtM(months[0]) : `${fmtM(months[0])} – ${fmtM(months[months.length - 1])}`;
  const remaining = receipt.remaining_due ?? 0;
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Fee Receipt" docNo={`Receipt No: ${receipt.receipt_no}`} date={`Date: ${receipt.date}`} />
      {feeFor && <p className="p-feefor">Fee for: <strong>{feeFor}</strong></p>}
      <MetaBlock
        left={[
          ['Student:', receipt.student_name],
          ['Adm. No.:', receipt.admission_no],
          ['Class:', `${receipt.class_name}${receipt.section ? ` - ${receipt.section}` : ''}`],
          ...(phone ? [['Phone:', phone] as [string, string]] : []),
        ]}
        right={[
          ['Payment mode:', `${receipt.mode.toUpperCase()}${receipt.ref_no ? ` (${receipt.ref_no})` : ''}`],
          ['Tendered:', `₹${receipt.tendered.toFixed(2)}`],
          ...(receipt.change_given > 0 ? [['Change:', `₹${receipt.change_given.toFixed(2)}`] as [string, string]] : []),
        ]}
      />
      <table className="p-table">
        <thead>
          <tr><th style={{ width: 40 }}>#</th><th>Fee head</th><th>Month</th><th className="p-r">Amount (₹)</th></tr>
        </thead>
        <tbody>
          {receipt.lines.map((l, i) => (
            <tr key={i}><td className="p-c">{i + 1}</td><td>{l.head_name}</td><td>{l.month_display ?? '—'}</td><td className="p-r">{l.amount.toFixed(2)}</td></tr>
          ))}
          <tr className="p-total"><td colSpan={3}>Total received</td><td className="p-r">₹{receipt.total.toFixed(2)}</td></tr>
          <tr className={remaining > 0.005 ? 'p-due' : 'p-paid'}>
            <td colSpan={3}>{remaining > 0.005 ? 'Remaining due (to be paid)' : 'Remaining due'}</td>
            <td className="p-r">₹{remaining.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="p-words">{amountInWords(receipt.total)}</p>
      {receipt.notes && <p className="p-note">Note: {receipt.notes}</p>}
      <p className="p-note">This is a computer-generated receipt and does not require a physical signature to be valid; signed copies available at the office.</p>
      <Signatures left="Parent / Guardian" middle="Cashier" right={inst?.principalName ? 'Principal' : 'Authorised Signatory'} />
      <div className="p-footer">Thank you for your payment. Please preserve this receipt for your records.</div>
    </PrintDoc>
  );
}

/* ================= Salary slip ================= */

export interface SlipLine { component: string; amount: number; }
export interface SlipData {
  month: string; employee_code: string; name: string; designation: string; department?: string;
  payable_days: number; lop_days?: number; bank_name?: string; bank_account?: string;
  earnings: SlipLine[]; deductions: SlipLine[];
  gross: number; totalDeductions: number; net: number;
}

export interface PayrollRegisterLine {
  staff_name: string; employee_code: string; designation?: string;
  payable_days: number; lop_days: number; gross: number; total_deductions: number;
  arrears: number; bonus: number; net: number;
}

export function PayrollRegisterPrint({ month, lines }: { month: string; lines: PayrollRegisterLine[] }) {
  const inst = useInstitution();
  const tot = (k: keyof PayrollRegisterLine) => lines.reduce((a, l) => a + (Number(l[k]) || 0), 0);
  const fmtMonth = (m: string) => {
    const d = new Date(m + '-01T00:00:00');
    return isNaN(d.getTime()) ? m : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Salary Register" docNo={`Pay month: ${fmtMonth(month)}`} date={`Generated: ${new Date().toLocaleDateString()}`} />
      <table className="p-table">
        <thead><tr>
          <th>#</th><th>Employee</th><th>Designation</th>
          <th className="p-r">Payable days</th><th className="p-r">LOP</th>
          <th className="p-r">Gross (₹)</th><th className="p-r">Deductions (₹)</th>
          <th className="p-r">Arrears (₹)</th><th className="p-r">Bonus (₹)</th><th className="p-r">Net (₹)</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="p-c">{i + 1}</td>
              <td>{l.staff_name}<br /><span className="p-dim">{l.employee_code}</span></td>
              <td>{l.designation || '—'}</td>
              <td className="p-r">{l.payable_days}</td>
              <td className="p-r">{l.lop_days}</td>
              <td className="p-r">{l.gross.toFixed(2)}</td>
              <td className="p-r">{l.total_deductions.toFixed(2)}</td>
              <td className="p-r">{l.arrears.toFixed(2)}</td>
              <td className="p-r">{l.bonus.toFixed(2)}</td>
              <td className="p-r"><strong>{l.net.toFixed(2)}</strong></td>
            </tr>
          ))}
          <tr className="p-total">
            <td colSpan={5}>Total ({lines.length} employee{lines.length === 1 ? '' : 's'})</td>
            <td className="p-r">{tot('gross').toFixed(2)}</td>
            <td className="p-r">{tot('total_deductions').toFixed(2)}</td>
            <td className="p-r">{tot('arrears').toFixed(2)}</td>
            <td className="p-r">{tot('bonus').toFixed(2)}</td>
            <td className="p-r">{tot('net').toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="p-footer">Generated by Invexom EMS</div>
      <Signatures left="Accountant" middle="HR Manager" right="Principal" />
    </PrintDoc>
  );
}

export function SalarySlipPrint({ slip }: { slip: SlipData }) {
  const inst = useInstitution();
  const fmtMonth = (m: string) => {
    const d = new Date(m + '-01T00:00:00');
    return isNaN(d.getTime()) ? m : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Salary Slip" docNo={`Pay month: ${fmtMonth(slip.month)}`} date={`Generated: ${new Date().toLocaleDateString()}`} />
      <MetaBlock
        left={[
          ['Name:', slip.name],
          ['Employee Code:', slip.employee_code],
          ['Designation:', slip.designation || '—'],
          ['Department:', slip.department || '—'],
        ]}
        right={[
          ['Payable days:', String(slip.payable_days)],
          ['LOP days:', String(slip.lop_days ?? 0)],
        ]}
      />
      <table className="p-table">
        <thead><tr><th>Earnings</th><th className="p-r">Amount (₹)</th><th>Deductions</th><th className="p-r">Amount (₹)</th></tr></thead>
        <tbody>
          {Array.from({ length: Math.max(slip.earnings.length, slip.deductions.length) }).map((_, i) => (
            <tr key={i}>
              <td>{slip.earnings[i]?.component ?? ''}</td>
              <td className="p-r">{slip.earnings[i] ? slip.earnings[i].amount.toFixed(2) : ''}</td>
              <td>{slip.deductions[i]?.component ?? ''}</td>
              <td className="p-r">{slip.deductions[i] ? slip.deductions[i].amount.toFixed(2) : ''}</td>
            </tr>
          ))}
          <tr className="p-total"><td>Gross</td><td className="p-r">₹{slip.gross.toFixed(2)}</td><td>Total deductions</td><td className="p-r">₹{slip.totalDeductions.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <p className="p-words">Net pay: ₹{slip.net.toFixed(2)} — {amountInWords(slip.net)}</p>
      {(slip.bank_name || slip.bank_account) && (
        <p className="p-note">Bank: {slip.bank_name || '—'}{slip.bank_account ? ` · A/c ${slip.bank_account}` : ''}</p>
      )}
      <Signatures left="Employee" middle="Accountant" right="Principal" />
    </PrintDoc>
  );
}

/* ================= Gatepass ================= */

export interface GatepassData {
  gatepass_no: string; date: string; student_name: string; class_name: string;
  reason: string; valid_until: string; authorized_by: string; receiver_name: string;
}

export function GatepassPrint({ pass }: { pass: GatepassData }) {
  const inst = useInstitution();
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Gate Pass" docNo={`Pass No: ${pass.gatepass_no}`} date={`Date: ${pass.date}`} />
      <MetaBlock
        left={[
          ['Student:', pass.student_name],
          ['Class:', pass.class_name],
          ['Reason:', pass.reason],
        ]}
        right={[
          ['Valid until:', pass.valid_until],
          ['Authorised by:', pass.authorized_by],
          ['Receiver:', pass.receiver_name],
        ]}
      />
      <p className="p-note">The bearer is permitted to leave the school premises with the above student. Please verify the receiver's identity at the gate.</p>
      <Signatures left="Receiver" middle="Gate Security" right="Authorised Signatory" />
    </PrintDoc>
  );
}

/* ================= Generic table report ================= */

export function ReportPrint({ title, subtitle, columns, rows }: {
  title: string; subtitle?: string;
  columns: { header: string; key: string }[];
  rows: Record<string, unknown>[];
}) {
  const inst = useInstitution();
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title={title} docNo={subtitle} date={`Generated: ${new Date().toLocaleDateString()}`} />
      <table className="p-table">
        <thead><tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key}>{String(r[c.key] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <div className="p-footer">{rows.length} record(s) · Generated by Invexom EMS</div>
    </PrintDoc>
  );
}

/* ================= Datesheet ================= */

export interface DatesheetPrintRow { date: string; subject: string; class_name: string; start_time: string; end_time: string; room: string }

export function DatesheetPrint({ examName, className, rows }: { examName: string; className?: string; rows: DatesheetPrintRow[] }) {
  const inst = useInstitution();
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
  const fmtDate = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title={`Datesheet — ${examName}`} docNo={className ? `Class ${className}` : undefined} date={`Generated: ${new Date().toLocaleDateString()}`} />
      <table className="p-table">
        <thead><tr><th>Date</th><th>Subject</th><th>Time</th><th>Room</th></tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              <td>{fmtDate(r.date)}</td>
              <td>{r.subject || '—'}</td>
              <td>{r.start_time}–{r.end_time}</td>
              <td>{r.room || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-footer">{sorted.length} paper(s) · Generated by Invexom EMS</div>
      <Signatures left="Class Teacher" middle="Exam In-charge" right="Principal" />
    </PrintDoc>
  );
}

/* ================= Report card ================= */

export interface ReportSubject { subject: string; marks: number | null; max: number; absent?: boolean; }
export interface ReportCardData {
  examName: string; className: string; section?: string; name: string; admission_no: string;
  roll_no: string; father_name?: string; rank?: number; subjects: ReportSubject[];
  total: number; maxTotal: number; percent: number; grade: string; pass: boolean;
  remarks?: string; photo?: string | null; showPhoto?: boolean;
}

export function ReportCardPrint({ card }: { card: ReportCardData }) {
  const inst = useInstitution();
  const classLine = card.section ? `${card.className} – ${card.section}` : card.className;
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Report Card" docNo={`${card.examName} · Class ${classLine}`} />
      <div className="p-rc-head">
        {card.showPhoto !== false && (
          card.photo
            ? <img src={card.photo} alt="" className="p-rc-photo" />
            : <div className="p-rc-photo p-rc-photo-empty">Photo</div>
        )}
        <div className="p-rc-meta">
          <MetaBlock
            left={[
              ['Name:', card.name],
              ["Father's Name:", card.father_name || '—'],
              ['Adm. No.:', card.admission_no],
            ]}
            right={[
              ['Class:', classLine],
              ['Roll No.:', card.roll_no],
            ]}
          />
        </div>
      </div>
      <table className="p-table">
        <thead>
          <tr><th style={{ width: 40 }}>#</th><th>Subject</th><th className="p-r">Marks</th><th className="p-r">Max</th></tr>
        </thead>
        <tbody>
          {card.subjects.map((sub, i) => (
            <tr key={i}>
              <td className="p-c">{i + 1}</td>
              <td>{sub.subject}</td>
              <td className="p-r">{sub.absent ? 'Absent' : sub.marks}</td>
              <td className="p-r">{sub.max}</td>
            </tr>
          ))}
          <tr className="p-total"><td colSpan={2}>Total</td><td className="p-r">{card.total}</td><td className="p-r">{card.maxTotal}</td></tr>
        </tbody>
      </table>
      <div className="p-meta">
        <table><tbody>
          <tr><td className="p-k">Percentage:</td><td className="p-v">{card.percent}%</td></tr>
        </tbody></table>
        <table><tbody>
          <tr><td className="p-k">Grade:</td><td className="p-v">{card.grade}</td></tr>
        </tbody></table>
        <table><tbody>
          <tr><td className="p-k">Result:</td><td className="p-v">{card.pass ? 'Pass' : 'Fail'}</td></tr>
        </tbody></table>
      </div>
      {card.remarks && <p className="p-note">Remarks: {card.remarks}</p>}
      <Signatures left="Class Teacher" middle="Parent / Guardian" right="Principal" />
    </PrintDoc>
  );
}

/* ================= ID / Admit card ================= */

export interface IdCardData {
  name: string; admission_no: string; class_name: string; roll_no?: string;
  father_name?: string; parent_phone?: string; address?: string; photo?: string | null;
}

/**
 * ID cards sheet — 3 columns, as many rows as fit on the page.
 * One PrintDoc for the whole batch so cards flow across pages instead of
 * one card per page.
 */
export function IdCardsSheetPrint({ schoolName, cards }: { schoolName?: string; cards: IdCardData[] }) {
  return (
    <PrintDoc>
      <div className="p-idgrid">
        {cards.map((card, i) => (
          <div className="p-idcard" key={i}>
            <div className="p-idcard-head">
              <p className="p-s">{schoolName || 'School'}</p>
              <p className="p-t">Student ID Card</p>
            </div>
            <div className="p-idcard-body">
              {card.photo
                ? <img src={card.photo} alt="" className="p-idcard-photo" />
                : <div className="p-idcard-photo p-idcard-photo-empty">Photo</div>}
              <div className="p-idcard-fields">
                <div className="p-idcard-name">{card.name}</div>
                <div>Class {card.class_name}{card.roll_no ? ` · Roll ${card.roll_no}` : ''}</div>
                <div>Adm: {card.admission_no}</div>
                {card.father_name && <div>Father: {card.father_name}</div>}
                {card.parent_phone && <div>Phone: {card.parent_phone}</div>}
                {card.address && <div className="p-idcard-addr">Addr: {card.address}</div>}
                <div className="p-idcard-qr">QR:{card.admission_no}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PrintDoc>
  );
}

export interface AdmitCardData {
  name: string; admission_no: string; roll_no?: string; class_name: string;
  photo?: string | null;
  schedule: { date: string; subject: string; start_time: string }[];
}

/**
 * Admit cards sheet — 4 cards per A4 sheet (2×2), flowing across pages.
 */
export function AdmitCardsSheetPrint({ schoolName, examName, cards }: {
  schoolName?: string; examName: string; cards: AdmitCardData[];
}) {
  return (
    <PrintDoc>
      <div className="p-admitgrid">
        {cards.map((card, i) => (
          <div className="p-admitcard" key={i}>
            <div className="p-admitcard-head">
              <p className="p-s">{schoolName || 'School'}</p>
              <p className="p-t">Admit Card — {examName}</p>
            </div>
            <div className="p-admitcard-id">
              {card.photo
                ? <img src={card.photo} alt="" className="p-admitcard-photo" />
                : <div className="p-admitcard-photo p-admitcard-photo-empty">Photo</div>}
              <div>
                <div className="p-admitcard-name">{card.name}</div>
                <div>Adm: {card.admission_no}{card.roll_no ? ` · Roll: ${card.roll_no}` : ''}</div>
                <div>Class: {card.class_name}</div>
              </div>
            </div>
            <table className="p-table p-admitcard-table">
              <thead><tr><th>Date</th><th>Subject</th><th>Time</th></tr></thead>
              <tbody>
                {card.schedule.map((d, j) => (
                  <tr key={j}><td>{d.date}</td><td>{d.subject}</td><td>{d.start_time}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="p-admitcard-sign">
              <span>Seal</span><span>Invigilator signature</span>
            </div>
          </div>
        ))}
      </div>
    </PrintDoc>
  );
}
