/**
 * Demo seed for the web demo (demo.invexom.com).
 *
 * Builds a realistic sample school through the REAL service layer
 * (setup:complete handler + service functions) — so the seed doubles as
 * live testing of the whole stack. Runs at server boot and again every
 * midnight IST (fresh demo day).
 */
import type { AppContext } from '../electron/ipc.js';
import type { SafeUser } from '../shared/types.js';
import { getDb } from '../electron/services/database.js';
import { verifyLogin } from '../electron/services/users.js';
import { createStudent } from '../electron/services/students.js';
import { saveFeeStructure, generateDues, collectFee } from '../electron/services/fees.js';
import { markAttendance } from '../electron/services/attendance.js';
import { createExam, saveExamSubjects, saveMarks } from '../electron/services/exams.js';
import { createStaff, saveSalaryStructure, runPayroll } from '../electron/services/payroll.js';
import { createVoucher, createExpense } from '../electron/services/accounting.js';
import { createEnquiry } from '../electron/services/frontoffice.js';

export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'demo1234';

type CallHandler = <K extends string>(channel: K, req: unknown) => Promise<unknown>;

/** YYYY-MM-DD in Asia/Kolkata. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir',
  'Ananya', 'Diya', 'Aadhya', 'Navya', 'Pari', 'Riya', 'Saanvi', 'Ira', 'Myra', 'Aarohi',
  'Aryan', 'Vihaan', 'Rudra', 'Yash', 'Dev', 'Aisha', 'Zara', 'Kavya', 'Tanvi', 'Meera',
  'Shourya', 'Atharv', 'Dhruv', 'Naitik', 'Sara', 'Ishita'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Yadav', 'Mishra', 'Tiwari', 'Pandey', 'Chauhan', 'Rathore'];

export async function seedDemo(ctx: AppContext, call: CallHandler): Promise<void> {
  const log = (m: string) => console.log(`[demo-seed] ${m}`);

  // ---- 1. Foundation via the real setup handler ----
  await call('setup:complete', {
    institution: {
      name: 'Sunrise Public School',
      address: '123, MG Road, Jaipur, Rajasthan 302001',
      phone: '+91-141-2345678',
      email: 'info@sunrisepublic.edu',
      upiId: 'sunrise@upi',
      principalName: 'Mrs. Anjali Gupta',
      regNo: 'RJ/2020/12345',
    },
    logoDataUrl: null,
    session: { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' },
    classes: [
      { name: 'I', sections: ['A', 'B'] },
      { name: 'II', sections: ['A', 'B'] },
      { name: 'III', sections: ['A', 'B'] },
      { name: 'IV', sections: ['A'] },
      { name: 'V', sections: ['A'] },
    ],
    admin: { username: DEMO_USERNAME, displayName: 'Demo Admin', password: DEMO_PASSWORD },
    feeHeads: [
      { name: 'Tuition Fee', type: 'periodic', defaultAmount: 1200 },
      { name: 'Transport Fee', type: 'periodic', defaultAmount: 500 },
      { name: 'Exam Fee', type: 'one-time', defaultAmount: 300 },
      { name: 'Admission Fee', type: 'one-time', defaultAmount: 2000 },
    ],
    recovery: {
      questionId: 'secQ1',
      question: "What is your mother's maiden name?",
      answer: 'demoanswer',
    },
  });
  log('setup complete');

  const db = getDb();
  const user = verifyLogin(DEMO_USERNAME, DEMO_PASSWORD);
  if (!user) throw new Error('demo login failed after seed');
  const sessionId = (db.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1').get() as { id: number }).id;
  const headId = (name: string) =>
    (db.prepare("SELECT id FROM masters WHERE kind = 'fee-head' AND name = ?").get(name) as { id: number }).id;
  const tuitionId = headId('Tuition Fee');
  const transportId = headId('Transport Fee');
  const examFeeId = headId('Exam Fee');

  const step = (name: string, fn: () => void) => {
    try { fn(); log(name + ' ok'); }
    catch (e) { log(name + ' SKIPPED: ' + (e instanceof Error ? e.message : String(e))); }
  };

  // ---- 2. Students (36 — under the 50 demo cap) ----
  const classes = ['I', 'I', 'II', 'II', 'III', 'III', 'IV', 'V'];
  const sections = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'A'];
  const studentIds: number[] = [];
  step('students', () => {
    let n = 0;
    for (let c = 0; c < classes.length && n < FIRST.length; c++) {
      for (let s = 0; s < 5 && n < FIRST.length; s++, n++) {
        const r = createStudent(
          {
            name: `${FIRST[n]} ${LAST[n % LAST.length]}`,
            class_name: classes[c],
            section: sections[c],
            gender: n % 2 === 0 ? 'Male' : 'Female',
            father_name: `Mr. ${LAST[(n + 3) % LAST.length]}`,
            father_phone: `98${String(10000000 + n * 137).slice(0, 8)}`,
            address: 'Jaipur, Rajasthan',
            admission_date: istToday(),
          },
          sessionId,
          user as SafeUser,
          true,
        );
        studentIds.push(r.id);
      }
    }
  });

  // ---- 3. Fee structure + dues + collections ----
  step('fees', () => {
    const rows: { class_name: string; head_id: number; amount: number; due_day?: number }[] = [];
    const base: Record<string, number> = { I: 1000, II: 1100, III: 1200, IV: 1300, V: 1400 };
    for (const [cls, amt] of Object.entries(base)) {
      rows.push({ class_name: cls, head_id: tuitionId, amount: amt, due_day: 10 });
      rows.push({ class_name: cls, head_id: transportId, amount: 500, due_day: 10 });
      rows.push({ class_name: cls, head_id: examFeeId, amount: 300, due_day: 10 });
    }
    saveFeeStructure(sessionId, rows, user as SafeUser);
    const monthLabel = istToday().slice(0, 7);
    generateDues(sessionId, monthLabel, user as SafeUser);
    // Collect fees from roughly half the students (tuition only, oldest-due-first).
    const dues = db.prepare(
      `SELECT d.student_id, SUM(d.amount + d.fine - d.discount - d.paid) AS payable
       FROM fee_dues d JOIN students s ON s.id = d.student_id
       WHERE d.head_id = ? AND d.status != 'paid'
       GROUP BY d.student_id LIMIT 18`,
    ).all(tuitionId) as { student_id: number; payable: number }[];
    for (const d of dues) {
      collectFee(
        { student_id: d.student_id, session_id: sessionId, tendered: Math.round(d.payable), mode: 'cash', notes: 'Demo collection' },
        user as SafeUser,
      );
    }
  });

  // ---- 4. Attendance (today, two classes) ----
  step('attendance', () => {
    for (const [cls, sec] of [['I', 'A'], ['II', 'A']] as const) {
      const roster = db.prepare(
        'SELECT id FROM students WHERE class_name = ? AND section = ? AND is_deleted = 0',
      ).all(cls, sec) as { id: number }[];
      markAttendance(
        cls, sec, istToday(),
        roster.map((r, i) => ({ student_id: r.id, status: i % 9 === 8 ? 'A' : 'P' })),
        user as SafeUser,
      );
    }
  });

  // ---- 5. Exam + marks ----
  step('exams', () => {
    const examId = createExam({ name: 'Half-Yearly Exam', term: 'Term 1', session_id: sessionId, classes: ['V'] }, user as SafeUser);
    // Subjects must exist in exam_subjects or the Marks tab dropdown stays empty.
    saveExamSubjects(examId, ['Mathematics', 'English', 'Science'].map((subject) => ({
      subject, class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100,
    })), user as SafeUser);
    const roster = db.prepare(
      "SELECT id FROM students WHERE class_name = 'V' AND is_deleted = 0",
    ).all() as { id: number }[];
    for (const subject of ['Mathematics', 'English', 'Science']) {
      saveMarks(examId, subject, 'V', roster.map((r, i) => ({
        student_id: r.id, marks_obtained: 55 + ((i * 7 + subject.length * 3) % 40), is_absent: false,
      })), user as SafeUser);
    }
  });

  // ---- 6. Staff + payroll ----
  step('payroll', () => {
    const staff: [string, string, string, number][] = [
      ['Rajesh Kumar', 'PRT', 'Academics', 28000],
      ['Sunita Devi', 'TGT', 'Academics', 35000],
      ['Amit Singh', 'Clerk', 'Administration', 18000],
      ['Pooja Rani', 'PRT', 'Academics', 26000],
    ];
    for (const [name, desig, dept, basic] of staff) {
      const id = createStaff(
        { name, designation: desig, department: dept, joining_date: '2024-04-01', gender: 'Male' },
        user as SafeUser,
      );
      saveSalaryStructure(id, [
        { component: 'Basic', kind: 'earning', amount: basic, is_percent: 0, percent_of: 'basic' },
        { component: 'HRA', kind: 'earning', amount: Math.round(basic * 0.2), is_percent: 0, percent_of: 'basic' },
        { component: 'PF', kind: 'deduction', amount: Math.round(basic * 0.12), is_percent: 0, percent_of: 'basic' },
      ], user as SafeUser);
    }
    runPayroll(istToday().slice(0, 7), user as SafeUser);
  });

  // ---- 7. Accounting vouchers ----
  step('accounting', () => {
    createVoucher({ date: istToday(), type: 'receipt', amount: 50000, narration: 'Fee collection - demo', ledger_id: null, ledger_name: 'Fee Income', mode: 'cash' }, user as SafeUser);
    createVoucher({ date: istToday(), type: 'payment', amount: 12000, narration: 'Electricity bill', ledger_id: null, ledger_name: 'Electricity', mode: 'cash' }, user as SafeUser);
    createExpense({ date: istToday(), ledger_id: null, ledger_name: 'Stationery', amount: 2500, narration: 'Paid to Sharma Stationers', bill_no: 'B-101' }, user as SafeUser);
  });

  // ---- 8. Front-office enquiries ----
  step('frontoffice', () => {
    createEnquiry({ name: 'Rahul Verma', phone: '9812345670', class_interested: 'VI', source: 'Walk-in', followup_date: '', counsellor: '', notes: 'Demo enquiry' }, user as SafeUser);
    createEnquiry({ name: 'Neha Gupta', phone: '9812345671', class_interested: 'I', source: 'Phone', followup_date: '', counsellor: '', notes: 'Demo enquiry' }, user as SafeUser);
  });

  log('demo seed finished');
}
