import * as React from 'react';
import { Letterhead, DocTitle, MetaBlock, Signatures, amountInWords, PrintDoc, useInstitution } from './Letterhead';

/* ================= Fee receipt ================= */

export interface ReceiptLine { head_name: string; amount: number; fine?: number; discount?: number; }
export interface ReceiptData {
  receipt_no: string; date: string; student_name: string; admission_no: string;
  class_name: string; mode: string; ref_no?: string; tendered: number;
  change_given: number; total: number; notes?: string; lines: ReceiptLine[];
}

export function FeeReceiptPrint({ receipt }: { receipt: ReceiptData }) {
  const inst = useInstitution();
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Fee Receipt" docNo={`Receipt No: ${receipt.receipt_no}`} date={`Date: ${receipt.date}`} />
      <MetaBlock
        left={[
          ['Student:', receipt.student_name],
          ['Adm. No.:', receipt.admission_no],
          ['Class:', receipt.class_name],
        ]}
        right={[
          ['Payment mode:', `${receipt.mode.toUpperCase()}${receipt.ref_no ? ` (${receipt.ref_no})` : ''}`],
          ['Tendered:', `₹${receipt.tendered.toFixed(2)}`],
          ...(receipt.change_given > 0 ? [['Change:', `₹${receipt.change_given.toFixed(2)}`] as [string, string]] : []),
        ]}
      />
      <table className="p-table">
        <thead>
          <tr><th style={{ width: 40 }}>#</th><th>Fee head</th><th className="p-r">Amount (₹)</th></tr>
        </thead>
        <tbody>
          {receipt.lines.map((l, i) => (
            <tr key={i}><td className="p-c">{i + 1}</td><td>{l.head_name}</td><td className="p-r">{l.amount.toFixed(2)}</td></tr>
          ))}
          <tr className="p-total"><td colSpan={2}>Total received</td><td className="p-r">₹{receipt.total.toFixed(2)}</td></tr>
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
  month: string; employee_code: string; name: string; designation: string;
  payable_days: number; earnings: SlipLine[]; deductions: SlipLine[];
  gross: number; totalDeductions: number; net: number;
}

export function SalarySlipPrint({ slip }: { slip: SlipData }) {
  const inst = useInstitution();
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Salary Slip" docNo={`Employee Code: ${slip.employee_code}`} date={`Pay month: ${slip.month}`} />
      <MetaBlock
        left={[['Name:', slip.name], ['Designation:', slip.designation]]}
        right={[['Payable days:', String(slip.payable_days)]]}
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

/* ================= Report card ================= */

export interface ReportSubject { subject: string; marks: number | null; max: number; absent?: boolean; }
export interface ReportCardData {
  examName: string; className: string; name: string; admission_no: string;
  roll_no: string; rank: number; subjects: ReportSubject[];
  total: number; maxTotal: number; percent: number; grade: string; pass: boolean;
  remarks?: string;
}

export function ReportCardPrint({ card }: { card: ReportCardData }) {
  const inst = useInstitution();
  return (
    <PrintDoc>
      <Letterhead inst={inst} />
      <DocTitle title="Report Card" docNo={`${card.examName} · Class ${card.className}`} />
      <MetaBlock
        left={[
          ['Name:', card.name],
          ['Adm. No.:', card.admission_no],
        ]}
        right={[
          ['Roll No.:', card.roll_no],
          ['Rank:', String(card.rank)],
        ]}
      />
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
  schoolName?: string; title: string; name: string; admission_no: string;
  class_name: string; roll_no?: string; dob?: string; phone?: string;
  validTill?: string; extra?: [string, string][];
}

export function IdCardPrint({ card }: { card: IdCardData }) {
  return (
    <PrintDoc>
      <div className="p-card">
        <div className="p-card-head">
          <p className="p-s">{card.schoolName || 'School'}</p>
          <p className="p-t">{card.title}</p>
        </div>
        <div className="p-card-body">
          <div className="p-photo">Photo</div>
          <div className="p-fields">
            <div><span className="p-k">Name: </span><span className="p-v">{card.name}</span></div>
            <div><span className="p-k">Adm. No.: </span><span className="p-v">{card.admission_no}</span></div>
            <div><span className="p-k">Class: </span><span className="p-v">{card.class_name}</span></div>
            {card.roll_no && <div><span className="p-k">Roll: </span><span className="p-v">{card.roll_no}</span></div>}
            {card.dob && <div><span className="p-k">DOB: </span><span className="p-v">{card.dob}</span></div>}
            {card.phone && <div><span className="p-k">Phone: </span><span className="p-v">{card.phone}</span></div>}
            {card.validTill && <div><span className="p-k">Valid till: </span><span className="p-v">{card.validTill}</span></div>}
            {card.extra?.map(([k, v]) => <div key={k}><span className="p-k">{k}: </span><span className="p-v">{v}</span></div>)}
          </div>
        </div>
      </div>
    </PrintDoc>
  );
}
