import type { IpcChannels, SafeUser, LicenseStatus } from '@shared/types';

/**
 * Dev/browser fallback adapter (http:// only — never in the packaged app).
 * Lets the UI run standalone for development and screenshots.
 */
const demoLicense: LicenseStatus = {
  mode: 'demo', demoBuild: false, tier: null, tierLabel: null,
  maxStudents: 50, maxDevices: 1, addons: { transport: false, library: false },
  machineCode: 'KX7Q-9M2A-4DPE-77XZ', demoDaysLeft: 24, demoStudentCap: 50,
  demoStudentCount: 12, issuedTo: null, watermark: true, readOnly: false,
};

const adminUser: SafeUser = {
  id: 1, username: 'admin', displayName: 'Administrator', roleId: 1, roleName: 'Administrator',
  permissions: {
    dashboard: 'admin', students: 'admin', fees: 'admin', attendance: 'admin', exams: 'admin',
    cards: 'admin', staff: 'admin', accounting: 'admin', inventory: 'admin', transport: 'admin',
    library: 'admin', frontoffice: 'admin', reports: 'admin', settings: 'admin', backup: 'admin', users: 'admin',
  },
  mustChangePassword: false,
};

let loggedIn: SafeUser | null = null;
let needsSetup = false;

const handlers: { [K in keyof IpcChannels]: (req: IpcChannels[K]['req']) => Promise<IpcChannels[K]['res']> } = {
  'app:status': async () => ({
    version: '1.0.0', electronVersion: '44.5.1', platform: 'win32', demoBuild: false,
    needsSetup, dataDir: 'C:\\Users\\Demo\\AppData\\Roaming\\Invexom EMS',
    license: demoLicense,
    backupHealth: { lastBackupAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), overdue: false, autoEnabled: true, scheduledTime: '20:00', daysSinceBackup: 0, reminderDays: 7 },
  }),
  'app:checkForUpdates': async () => ({ available: false }),
  'setup:needed': async () => needsSetup,
  'setup:complete': async () => { needsSetup = false; loggedIn = adminUser; return { ok: true as const }; },
  'auth:login': async ({ username, password }) => {
    if (username === 'admin' && password === 'admin1234') { loggedIn = adminUser; return { ok: true as const, user: adminUser }; }
    return { ok: false as const, error: 'Invalid username or password.' };
  },
  'auth:logout': async () => { loggedIn = null; return { ok: true as const }; },
  'auth:me': async () => loggedIn,
  'auth:changePassword': async () => ({ ok: true as const }),
  'auth:recoveryQuestion': async () => ({ ok: true as const, question: 'What is your mother\u2019s maiden name?' }),
  'auth:recoverAccess': async () => ({ ok: true as const, user: adminUser }),
  'license:status': async () => demoLicense,
  'license:machineCode': async () => ({ machineCode: demoLicense.machineCode }),
  'license:hwInfo': async () => ({ machineCode: demoLicense.machineCode, disk: 'mock-disk-hash', board: 'mock-board-hash', cpu: 'mock-cpu-hash' }),
  'license:activate': async () => ({ ok: false as const, error: 'Paste a real .inelic file in the desktop app.' }),
  'license:clear': async () => ({ ok: true as const }),
  'settings:institution:get': async () => ({
    name: 'Sunrise Public School', address: '12 MG Road, Bengaluru 560001', phone: '+91 98765 43210',
    email: 'office@sunrise.edu', website: 'www.sunrise.edu', upiId: 'sunrise@upi', regNo: 'AFF-12345',
    principalName: 'Meera Krishnan', logoPath: null, headerHtml: '', footerHtml: '',
  }),
  'settings:institution:set': async () => ({ ok: true as const }),
  'settings:sessions:list': async () => [
    { id: 1, name: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', isActive: true, isLocked: false, feeStartMonth: '2026-04' },
  ],
  'settings:sessions:create': async () => ({ ok: true as const, id: 2 }),
  'settings:sessions:update': async () => ({ ok: true as const }),
  'masters:list': async ({ kind }) => {
    const seed: Record<string, string[]> = {
      class: ['Nursery', 'LKG', 'UKG', 'I', 'II', 'III', 'IV', 'V'],
      section: ['A', 'B'],
      subject: ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science'],
      'fee-head': ['Tuition Fee', 'Transport Fee', 'Exam Fee', 'Admission Fee'],
      ledger: ['Fees Income', 'Salary', 'Rent', 'Utilities', 'Stationery'],
      'leave-type': ['Sick Leave', 'Casual Leave', 'Earned Leave'],
      'enquiry-source': ['Walk-in', 'Reference', 'Banner', 'Instagram', 'Google'],
      'complaint-type': ['Fee Issue', 'Transport', 'Staff Behaviour', 'Facility'],
    };
    return (seed[kind] ?? []).map((name, i) => ({ id: i + 1, name }));
  },
  'masters:add': async () => ({ ok: true as const, id: 99 }),
  'masters:rename': async () => ({ ok: true as const }),
  'masters:remove': async () => ({ ok: true as const }),
  'masters:reorder': async () => ({ ok: true as const }),
  'masters:subjects:set-class': async () => ({ ok: true as const, moved: 0 }),
  'numbering:list': async () => [
    { key: 'receipt', label: 'Fee receipt', pattern: 'R-{YYYY}-{SEQ:5}', last_seq: 128, example: 'R-2026-00129' },
    { key: 'voucher', label: 'Accounting voucher', pattern: 'V-{YYYY}-{SEQ:5}', last_seq: 42, example: 'V-2026-00043' },
    { key: 'admission', label: 'Admission number', pattern: 'INV/{YYYY}/{SEQ:4}', last_seq: 12, example: 'INV/2026/0013' },
  ],
  'numbering:set': async () => ({ ok: true as const }),
  'rules:get': async () => ({ 'attendance.threshold': '75', 'lock.timeoutMinutes': '15' }),
  'rules:set': async () => ({ ok: true as const }),
  'users:list': async () => [
    { id: 1, username: 'admin', displayName: 'Administrator', roleId: 1, roleName: 'Administrator', isActive: true, lastLogin: new Date().toISOString() },
    { id: 2, username: 'accounts', displayName: 'Ramesh Gupta', roleId: 2, roleName: 'Accountant', isActive: true, lastLogin: null },
  ],
  'users:create': async () => ({ ok: true as const, id: 3 }),
  'users:update': async () => ({ ok: true as const }),
  'users:resetPassword': async () => ({ ok: true as const }),
  'roles:list': async () => [
    { id: 1, name: 'Administrator', isSystem: true, permissions: adminUser.permissions },
    { id: 2, name: 'Accountant', isSystem: true, permissions: { ...adminUser.permissions, settings: 'none', users: 'none', backup: 'none' } },
    { id: 3, name: 'Teacher', isSystem: true, permissions: { ...adminUser.permissions, fees: 'none', accounting: 'none', settings: 'none' } },
  ],
  'roles:save': async ({ id }) => ({ ok: true as const, id: id ?? 4 }),
  'backup:now': async () => ({ ok: true as const, path: 'C:\\backups\\invexom-ems-backup.enc' }),
  'backup:list': async () => [
    { id: 1, fileName: 'invexom-ems-backup-20261004-200000.db.enc', path: 'C:\\backups\\…', sizeBytes: 245760, createdAt: new Date(Date.now() - 86400000).toISOString(), triggeredBy: 'auto', status: 'ok' },
  ],
  'backup:restore': async () => ({ ok: true as const }),
  'backup:config:get': async () => ({ enabled: true, time: '20:00', keepLast: 30, usbPath: '', reminderDays: 7 }),
  'backup:config:set': async () => ({ ok: true as const }),
  'backup:health': async () => ({ lastBackupAt: new Date().toISOString(), overdue: false, autoEnabled: true, scheduledTime: '20:00', daysSinceBackup: 0, reminderDays: 7 }),
  'backup:download': async () => ({ ok: true as const, filePath: 'C:\\backups\\backup.db.enc' }),
  'drive:status': async () => ({ connected: false, clientIdSet: false }),
  'drive:clientId:get': async () => ({ clientId: '' }),
  'drive:clientId:set': async () => ({ ok: true as const }),
  'drive:connect': async () => ({ ok: true as const, email: 'demo@gmail.com' }),
  'drive:disconnect': async () => ({ ok: true as const }),
  'drive:upload': async () => ({ ok: true as const, fileName: 'Invexom-EMS-Backup-2026-10-11.db.enc' }),
  'drive:list': async () => ({ ok: true as const, files: [] }),
  'drive:download': async () => ({ ok: true as const, path: 'C:\\backups\\drive.db.enc' }),
  'diagnostics:info': async () => ({
    version: '1.0.0', electronVersion: '44.5.1', nodeVersion: '22.x', chromeVersion: '14x',
    platform: 'win32 x64', arch: 'x64', dataDir: 'C:\\Users\\Demo\\…\\Invexom EMS',
    dbPath: '…\\invexom-ems.db.enc', dbSizeBytes: 245760, walMode: true, integrity: 'not-run' as const,
    license: demoLicense,
    backup: { lastBackupAt: new Date().toISOString(), overdue: false, autoEnabled: true, scheduledTime: '20:00', daysSinceBackup: 0, reminderDays: 7 },
    schemaVersion: 1,
  }),
  'diagnostics:integrityCheck': async () => ({ ok: true, detail: 'ok' }),
  'audit:recent': async () => [],
  'search:query': async ({ q }) => q.length < 2 ? [] : [
    { kind: 'student' as const, id: 1, title: 'Aarav Sharma', subtitle: 'INV/2026/0001 · V-A' },
    { kind: 'receipt' as const, id: 1, title: 'R-2026-00129', subtitle: '₹4,500 · 2026-10-01' },
  ],
  // ---- Milestone 2 mocks ----
  'students:list': async () => ({
    rows: [
      { id: 1, admission_no: 'INV/2026/0001', name: 'Aarav Sharma', dob: '2018-05-12', gender: 'Male', blood_group: 'B+', category: 'Gen', religion: 'Hindu', nationality: 'Indian', class_name: 'V', section: 'A', roll_no: '3', admission_date: '2026-04-02', previous_school: '', sibling_info: '', father_name: 'Rohit Sharma', father_occupation: 'Engineer', father_phone: '9876500001', mother_name: 'Priya Sharma', mother_occupation: 'Teacher', mother_phone: '9876500002', guardian_name: '', guardian_phone: '', address: '12 MG Road', photo_path: null, status: 'active', session_id: 1, transport_allocated: 0, transport_amount: 0 },
      { id: 2, admission_no: 'INV/2026/0002', name: 'Diya Patel', dob: '2018-08-21', gender: 'Female', blood_group: 'O+', category: 'OBC', religion: 'Hindu', nationality: 'Indian', class_name: 'V', section: 'A', roll_no: '7', admission_date: '2026-04-03', previous_school: '', sibling_info: '', father_name: 'Amit Patel', father_occupation: 'Doctor', father_phone: '9876500003', mother_name: 'Neha Patel', mother_occupation: '', mother_phone: '', guardian_name: '', guardian_phone: '', address: '45 Park Street', photo_path: null, status: 'active', session_id: 1, transport_allocated: 0, transport_amount: 0 },
    ], total: 2,
  }),
  'students:get': async ({ id }: { id: number }) => {
    const rows = [
      { id: 1, admission_no: 'INV/2026/0001', name: 'Aarav Sharma', dob: '2018-05-12', gender: 'Male', blood_group: 'B+', category: 'Gen', religion: 'Hindu', nationality: 'Indian', class_name: 'V', section: 'A', roll_no: '3', admission_date: '2026-04-02', previous_school: '', sibling_info: '', father_name: 'Rohit Sharma', father_occupation: 'Engineer', father_phone: '9876500001', mother_name: 'Priya Sharma', mother_occupation: 'Teacher', mother_phone: '9876500002', guardian_name: '', guardian_phone: '', address: '12 MG Road', photo_path: null, status: 'active', session_id: 1, transport_allocated: 0, transport_amount: 0 },
      { id: 2, admission_no: 'INV/2026/0002', name: 'Diya Patel', dob: '2018-08-21', gender: 'Female', blood_group: 'O+', category: 'OBC', religion: 'Hindu', nationality: 'Indian', class_name: 'V', section: 'A', roll_no: '7', admission_date: '2026-04-03', previous_school: '', sibling_info: '', father_name: 'Amit Patel', father_occupation: 'Doctor', father_phone: '9876500003', mother_name: 'Neha Patel', mother_occupation: '', mother_phone: '', guardian_name: '', guardian_phone: '', address: '45 Park Street', photo_path: null, status: 'active', session_id: 1, transport_allocated: 0, transport_amount: 0 },
    ];
    const r = rows.find((r) => r.id === id) ?? null;
    return r ? { ...r, documents: [] } : null;
  },
  'students:create': async () => ({ ok: true as const, id: 3, admission_no: 'INV/2026/0003' }),
  'students:update': async () => ({ ok: true as const }),
  'students:changeStatus': async () => ({ ok: true as const }),
  'students:promote': async () => ({ ok: true as const, count: 2 }),
  'students:tcEligibility': async () => ({ eligible: true, pendingDues: 0 }),
  'students:issueTC': async () => ({ ok: true as const, tcNo: 'TC-2026-0001' }),
  'students:documents': async () => ({ ok: true as const }),
  'fees:structure:list': async () => [
    { id: 1, session_id: 1, class_name: 'V', section: '', head_id: 1, head_name: 'Tuition Fee', month_label: '', amount: 1500, fine_flat: 50, fine_percent: 0, due_day: 10 },
    { id: 2, session_id: 1, class_name: 'V', section: '', head_id: 3, head_name: 'Exam Fee', month_label: '', amount: 500, fine_flat: 0, fine_percent: 0, due_day: 10 },
  ],
  'fees:structure:save': async () => ({ ok: true as const }),
  'fees:structure:copy': async () => ({ ok: true as const, count: 4 }),
  'fees:dues:generate': async () => ({ ok: true as const, count: 8 }),
  'fees:dues:list': async () => [
    { id: 1, student_id: 1, student_name: 'Aarav Sharma', admission_no: 'INV/2026/0001', class_name: 'V', section: 'A', head_id: 1, head_name: 'Tuition Fee', amount: 1500, discount: 0, fine: 50, paid: 0, due_date: '2026-10-10', month_label: '2026-10', status: 'due', payable: 1550 },
    { id: 2, student_id: 1, student_name: 'Aarav Sharma', admission_no: 'INV/2026/0001', class_name: 'V', section: 'A', head_id: 3, head_name: 'Exam Fee', amount: 500, discount: 0, fine: 0, paid: 0, due_date: '2026-10-10', month_label: '2026-10', status: 'due', payable: 500 },
  ],
  'fees:collect': async () => ({ ok: true as const, receipt_id: 1, receipt_no: 'R-2026-00129', change: 0 }),
  'fees:dues:sync': async () => ({ ok: true as const }),
  'fees:receipts:list': async () => ({
    rows: [
      { id: 1, receipt_no: 'R-2026-00129', date: '2026-10-01', student_name: 'Aarav Sharma', admission_no: 'INV/2026/0001', class_name: 'V', section: 'A', total: 2050, tendered: 2050, mode: 'cash', status: 'active', created_at: '2026-10-01T10:00:00' },
    ], total: 1,
  }),
  'fees:receipts:get': async ({ id }: { id: number }) => ({
    id, receipt_no: 'R-2026-00129', date: '2026-10-04', student_name: 'Aarav Sharma',
    admission_no: 'INV/2026/0001', class_name: 'V', section: 'A', father_phone: '9810000000', mother_phone: '', total: 4500, tendered: 4500,
    mode: 'cash', status: 'active', created_at: '2026-10-04',
    ref_no: '', bank: '', notes: '', cancelled_reason: '', father_name: 'Rohit Sharma',
    address: '12 MG Road', change_given: 0,
    lines: [
      { head_name: 'Tuition Fee — October', amount: 4000, month_label: '2026-10', month_display: 'Oct 2026' },
      { head_name: 'Transport Fee — October', amount: 500, month_label: '2026-10', month_display: 'Oct 2026' },
    ],
    fee_months: ['2026-10'], remaining_due: 0,
  }),
  'fees:receipts:cancel': async () => ({ ok: true as const }),
  'fees:chequeBounce': async () => ({ ok: true as const }),
  'fees:defaulters': async () => [
    { id: 2, student_id: 2, student_name: 'Diya Patel', admission_no: 'INV/2026/0002', class_name: 'V', section: 'A', father_phone: '9876500003', total_due: 3100, bucket_0_30: 1550, bucket_31_60: 1550, bucket_61_90: 0, bucket_90p: 0 },
  ],
  'attendance:roster': async () => [
    { id: 1, name: 'Aarav Sharma', admission_no: 'INV/2026/0001', roll_no: '3' },
    { id: 2, name: 'Diya Patel', admission_no: 'INV/2026/0002', roll_no: '7' },
  ],
  'attendance:mark': async () => ({ ok: true as const }),
  'attendance:get': async () => ({ 1: 'P', 2: 'A' }),
  'attendance:percent': async () => [
    { student_id: 2, name: 'Diya Patel', admission_no: 'INV/2026/0002', present: 14, total: 20, percent: 70, below: true },
  ],
  'attendance:absentees': async () => [
    { student_id: 2, name: 'Diya Patel', class_name: 'V', section: 'A', father_phone: '9876500003' },
  ],
  'staff:list': async () => [
    { id: 1, employee_code: 'EMP-0001', name: 'Ramesh Gupta', phone: '9876500010', email: '', designation: 'Accountant', department: 'Office', joining_date: '2024-06-01', status: 'active' },
    { id: 2, employee_code: 'EMP-0002', name: 'Sunita Verma', phone: '9876500011', email: '', designation: 'Teacher', department: 'Primary', joining_date: '2023-07-01', status: 'active' },
  ],
  'staff-attendance:mark': async () => ({ ok: true as const }),
  'staff-attendance:get': async () => ({ 1: { status: 'P', in_time: '08:55', late: 0 } }),
  'leaves:list': async () => [
    { id: 1, applicant_type: 'staff', applicant_id: 2, from_date: '2026-10-06', to_date: '2026-10-07', leave_type: 'Sick Leave', reason: 'Fever', status: 'pending', decided_by_name: null, created_at: '2026-10-04T09:00:00' },
  ],
  'leaves:apply': async () => ({ ok: true as const, id: 2 }),
  'leaves:decide': async () => ({ ok: true as const }),
  'reports:list': async () => [
    { key: 'daily-collection', title: 'Daily collection summary', params: ['from', 'to'] },
    { key: 'defaulter-list', title: 'Fee defaulter list', params: ['session', 'class'] },
    { key: 'daily-absentees', title: 'Daily absentee list', params: ['date', 'class'] },
  ],
  'reports:run': async () => ({
    columns: [{ header: 'Date', key: 'label' }, { header: 'Amount (₹)', key: 'total' }],
    rows: [{ label: '2026-10-01', total: 12500 }, { label: '2026-10-02', total: 8300 }],
  }),
  'reports:export': async () => ({ ok: true as const, filePath: 'C:\\Users\\Demo\\Documents\\report.xlsx' }),
  'export:everything': async () => ({ ok: true as const, filePath: 'C:\\Users\\Demo\\Documents\\invexom-ems-full-export.xlsx' }),
  // ---- Milestone 3 mocks ----
  'exams:list': async () => [
    { id: 1, name: 'Half-Yearly Exam', term: 'Term 1', session_id: 1, transport_allocated: 0, transport_amount: 0, classes: ['V'], is_locked: 0 },
  ],
  'exams:create': async () => ({ ok: true as const, id: 2 }),
  'exams:subjects:list': async () => [
    { id: 1, subject: 'Mathematics', class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100 },
    { id: 2, subject: 'English', class_name: 'V', max_marks: 100, pass_marks: 33, weightage: 100 },
  ],
  'exams:subjects:save': async () => ({ ok: true as const }),
  'exams:datesheet:list': async () => [
    { id: 1, subject: 'Mathematics', class_name: 'V', date: '2026-11-02', start_time: '09:00', end_time: '12:00', room: 'R-1' },
  ],
  'exams:datesheet:save': async () => ({ ok: true as const, clashes: [] }),
  'exams:marks:get': async () => ({ 1: { marks: 78, absent: false, grace: 0 } }),
  'exams:marks:save': async () => ({ ok: true as const, rejected: [] }),
  'exams:results': async () => [
    { id: 1, student_id: 1, name: 'Aarav Sharma', admission_no: 'INV/2026/0001', roll_no: '3', section: 'A', father_name: 'Rohit Sharma', photo_path: null,
      subjects: [{ subject: 'Mathematics', marks: 78, max: 100, absent: false, grace: 0 }], total: 78, maxTotal: 100, percent: 78, grade: 'B1', rank: 1, pass: true },
  ],
  'exams:subjects:update': async () => ({ ok: true as const }),
  'exams:subjects:delete': async () => ({ ok: true as const }),
  'exams:subjects:used': async () => ['English', 'Hindi', 'Mathematics'],
  'exams:lock': async () => ({ ok: true as const }),
  'exams:unlock': async () => ({ ok: true as const }),
  'exams:analysis': async () => ({
    subjectStats: [{ subject: 'Mathematics', avg: 72.5, highest: 95, lowest: 41, passPercent: 92 }],
    toppers: [{ name: 'Aarav Sharma', percent: 78 }],
    failList: [],
  }),
  'cards:templates:list': async () => [
    { id: 1, kind: 'report-card', name: 'Classic', class_name: '', config: { showPhoto: true }, version: 1, is_default: 1 },
  ],
  'cards:templates:save': async () => ({ ok: true as const, id: 2 }),
  'gatepass:create': async () => ({ ok: true as const, id: 1, gatepass_no: 'GP-2026-0001' }),
  'gatepass:list': async () => [
    { id: 1, gatepass_no: 'GP-2026-0001', student_name: 'Aarav Sharma', class_name: 'V', reason: 'Doctor visit', out_time: '2026-10-04T11:00:00' },
  ],
  // ---- Milestone 4 mocks ----
  'staff:full:list': async () => [
    { id: 1, employee_code: 'EMP-0001', name: 'Ramesh Gupta', phone: '9876500010', email: '', designation: 'Accountant', department: 'Office', joining_date: '2024-06-01', status: 'active', dob: '', gender: '', address: '', pan: '', aadhaar: '', bank_name: 'SBI', bank_account: '1234567890', bank_ifsc: 'SBIN0001' },
  ],
  'staff:full:get': async () => null,
  'staff:full:create': async () => ({ ok: true as const, id: 2 }),
  'staff:full:update': async () => ({ ok: true as const }),
  'staff:salary:save': async () => ({ ok: true as const }),
  'payroll:run': async () => ({ ok: true as const, runId: 1, lines: [] }),
  'payroll:get': async () => ({ run: { id: 1, month: '2026-10', status: 'draft' }, lines: [] }),
  'payroll:adjust': async () => ({ ok: true as const }),
  'payroll:finalize': async () => ({ ok: true as const, count: 1 }),
  'vouchers:create': async () => ({ ok: true as const, id: 1, voucher_no: 'V-2026-00043' }),
  'vouchers:list': async () => [
    { id: 1, voucher_no: 'V-2026-00043', type: 'receipt', date: '2026-10-01', ledger_name: 'Fees Income', amount: 2050, mode: 'cash', narration: 'Fee collection' },
  ],
  'accounting:incomeExpense': async () => ({
    income: [{ ledger: 'Fees Income', total: 125000 }], expense: [{ ledger: 'Salary', total: 80000 }],
    totalIncome: 125000, totalExpense: 80000,
  }),
  'accounting:ledgerStatement': async () => ({ rows: [], total: 0 }),
  'expenses:create': async () => ({ ok: true as const, id: 1 }),
  'expenses:list': async () => [
    { id: 1, date: '2026-10-03', ledger_name: 'Stationery', amount: 2500, narration: 'Exam paper', bill_no: 'B-12', status: 'pending', entered_by_name: 'Ramesh Gupta' },
  ],
  'expenses:decide': async () => ({ ok: true as const }),
  'pettycash:get': async () => null,
  'pettycash:save': async () => ({ ok: true as const }),
  'accounting:tallyExport': async () => ({ ok: true as const, filePath: 'C:\\tally-export.xml' }),
  'items:list': async () => [
    { id: 1, name: 'A4 Paper Rim', category: 'Stationery', unit: 'rim', purchase_rate: 240, reorder_level: 10, barcode: '', current_stock: 8 },
  ],
  'items:save': async () => ({ ok: true as const, id: 2 }),
  'inventory:purchase': async () => ({ ok: true as const, id: 1 }),
  'inventory:issue': async () => ({ ok: true as const, id: 1 }),
  'inventory:lowStock': async () => [
    { id: 1, name: 'A4 Paper Rim', category: 'Stationery', unit: 'rim', purchase_rate: 240, reorder_level: 10, barcode: '', current_stock: 8 },
  ],
  'inventory:valuation': async () => ({ items: [], total: 1920 }),
  'assets:list': async () => [
    { id: 1, name: 'Projector Epson', category: 'Electronics', purchase_date: '2024-01-15', cost: 45000, location: 'Lab 1', custodian: 'Sunita Verma', condition: 'good', warranty_expiry: '2026-11-15' },
  ],
  'assets:save': async () => ({ ok: true as const, id: 2 }),
  'assets:warrantyExpiring': async () => [],
  // ---- Milestone 5 mocks ----
  'enquiries:list': async () => [
    { id: 1, name: 'Kavya Reddy', phone: '9876500020', class_interested: 'VI', source: 'Walk-in', followup_date: '2026-10-05', counsellor: 'Meera', notes: '', status: 'open' },
  ],
  'enquiries:create': async () => ({ ok: true as const, id: 2 }),
  'enquiries:followup': async () => ({ ok: true as const }),
  'enquiries:convert': async () => ({ ok: true as const, studentId: 5, admission_no: 'INV/2026/0005' }),
  'enquiries:lost': async () => ({ ok: true as const }),
  'frontoffice:conversionReport': async () => ({
    bySource: [{ source: 'Walk-in', enquiries: 12, converted: 5, rate: 41.7 }],
    byCounsellor: [{ counsellor: 'Meera', enquiries: 12, converted: 5, rate: 41.7 }],
  }),
  'visitors:list': async () => [
    { id: 1, name: 'Suresh Kumar', phone: '9876500030', purpose: 'Admission info', whom_to_meet: 'Principal', in_time: '10:30', out_time: '' },
  ],
  'visitors:log': async () => ({ ok: true as const, id: 2 }),
  'visitors:out': async () => ({ ok: true as const }),
  'complaints:list': async () => [
    { id: 1, date: '2026-10-02', complainant: 'Rohit Sharma', phone: '9876500001', type: 'Transport', description: 'Bus late by 20 min', status: 'open' },
  ],
  'complaints:create': async () => ({ ok: true as const, id: 2 }),
  'complaints:status': async () => ({ ok: true as const }),
  'transport:vehicles': async () => [
    { id: 1, vehicle_no: 'KA-05-AB-1234', type: 'bus', capacity: 40, driver_name: 'Ramesh', driver_phone: '9876500010', insurance_expiry: '2027-03-31', fitness_expiry: '2027-03-31', is_active: 1 },
  ],
  'transport:saveVehicle': async () => ({ ok: true as const, id: 1 }),
  'transport:routes': async () => [
    { id: 1, name: 'Route A — North', vehicle_id: 1, monthly_fee: 1200, is_active: 1, vehicle_no: 'KA-05-AB-1234' },
  ],
  'transport:saveRoute': async () => ({ ok: true as const, id: 1 }),
  'transport:stops': async () => [
    { id: 1, route_id: 1, stop_name: 'Main Gate', stop_order: 1, pickup_time: '07:30' },
    { id: 2, route_id: 1, stop_name: 'Market Circle', stop_order: 2, pickup_time: '07:45' },
  ],
  'transport:saveStops': async () => ({ ok: true as const }),
  'transport:allocations': async () => [],
  'transport:allocate': async () => ({ ok: true as const }),
  'transport:strength': async () => [{ route: 'Route A — North', count: 0, capacity: 40 }],
  'library:books': async () => [
    { id: 1, title: 'Wings of Fire', author: 'A.P.J. Abdul Kalam', isbn: '9788173711466', category: 'Biography', rack_no: 'A-3', total_copies: 5, available_copies: 4 },
  ],
  'library:saveBook': async () => ({ ok: true as const, id: 1 }),
  'library:deleteBook': async () => ({ ok: true as const }),
  'library:issue': async () => ({ ok: true as const, id: 1 }),
  'library:return': async () => ({ ok: true as const, fine: 0 }),
  'library:openLoans': async () => [],
  'library:overdue': async () => [],
  'library:stats': async () => ({ books: 1, copies: 5, issued: 1, overdue: 0 }),
  'analytics:kpis': async () => ({
    activeStudents: 342, feesCollectedMonth: 486500, feesPendingTotal: 125400,
    attendanceTodayPct: 94.2, enquiriesWeek: 8, staffPresentToday: 24, staffTotal: 28,
  }),
  'analytics:feeTrend': async () => [
    { month: '2026-05', total: 420000 }, { month: '2026-06', total: 445000 }, { month: '2026-07', total: 470000 },
    { month: '2026-08', total: 452000 }, { month: '2026-09', total: 490000 }, { month: '2026-10', total: 486500 },
  ],
  'analytics:admissionsTrend': async () => [
    { month: '2026-04', count: 120 }, { month: '2026-05', count: 45 }, { month: '2026-06', count: 30 },
  ],
  'analytics:classStrength': async () => [
    { class: 'V', count: 68 }, { class: 'VI', count: 72 }, { class: 'VII', count: 65 },
  ],
  'analytics:expenseTrend': async () => [
    { month: '2026-08', total: 310000 }, { month: '2026-09', total: 325000 }, { month: '2026-10', total: 298000 },
  ],
  'analytics:alerts': async () => [
    { kind: 'followup', title: '3 enquiry follow-ups due', detail: 'Open Front Office', severity: 'warning' as const },
  ],
  'analytics:birthdays': async () => ({
    students: [{ id: 1, name: 'Aarav Sharma', class_name: 'V', phone: '9876500001' }],
    staff: [],
  }),
};

export async function mockInvoke<K extends keyof IpcChannels>(
  channel: K,
  req: IpcChannels[K]['req'],
): Promise<IpcChannels[K]['res']> {
  await new Promise((r) => setTimeout(r, 60));
  return handlers[channel](req) as Promise<IpcChannels[K]['res']>;
}
