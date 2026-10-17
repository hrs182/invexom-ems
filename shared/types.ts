/**
 * Shared domain types + the typed IPC contract between the Electron main
 * process and the React renderer. Every DB access goes through these channels;
 * components never run SQL directly.
 */

export type PermissionLevel = 'none' | 'view' | 'edit' | 'print' | 'admin';
export type ModuleKey =
  | 'dashboard' | 'students' | 'fees' | 'attendance' | 'exams' | 'cards'
  | 'staff' | 'accounting' | 'inventory' | 'transport' | 'library'
  | 'frontoffice' | 'reports' | 'settings' | 'backup' | 'users';

export interface SafeUser {
  id: number;
  username: string;
  displayName: string;
  roleId: number;
  roleName: string;
  permissions: Record<ModuleKey, PermissionLevel>;
  mustChangePassword: boolean;
}

export type LicenseMode = 'licensed' | 'demo' | 'demo-expired' | 'mismatch';

export interface LicenseStatus {
  mode: LicenseMode;
  demoBuild: boolean;
  tier: string | null;
  tierLabel: string | null;
  maxStudents: number | null; // null = unlimited
  maxDevices: number | null;
  addons: { transport: boolean; library: boolean };
  machineCode: string;
  demoDaysLeft: number | null;
  demoStudentCap: number | null;
  demoStudentCount: number | null;
  issuedTo: string | null;
  watermark: boolean; // print watermark on (demo)
  readOnly: boolean; // hard block on mutations (demo-expired)
}

export interface AppStatus {
  version: string;
  electronVersion: string;
  platform: string;
  demoBuild: boolean;
  needsSetup: boolean;
  dataDir: string;
  license: LicenseStatus;
  backupHealth: BackupHealth;
}

export interface BackupHealth {
  lastBackupAt: string | null;
  overdue: boolean;
  autoEnabled: boolean;
  scheduledTime: string;
  daysSinceBackup: number | null;
  reminderDays: number;
}

export interface DriveFile {
  id: string;
  name: string;
  size: string;
  createdTime: string;
}

export interface SetupPayload {
  institution: {
    name: string;
    address: string;
    phone: string;
    email: string;
    upiId: string;
    principalName: string;
    regNo: string;
  };
  logoDataUrl: string | null;
  session: { name: string; startDate: string; endDate: string };
  classes: { name: string; sections: string[] }[];
  admin: { username: string; displayName: string; password: string };
  feeHeads: { name: string; type: 'one-time' | 'periodic' | 'optional'; defaultAmount: number }[];
  /** Password-recovery security question for the admin (answer never stored). */
  recovery: { questionId: string; question: string; answer: string };
}

export interface InstitutionProfile {
  name: string; address: string; phone: string; email: string;
  website: string; upiId: string; regNo: string;
  principalName: string; logoPath: string | null;
  headerHtml: string; footerHtml: string;
}

export interface SessionRow {
  id: number; name: string; startDate: string; endDate: string;
  isActive: boolean; isLocked: boolean; feeStartMonth: string;
}

export interface MasterItem { id: number; name: string; extra?: Record<string, unknown> }

export interface NumberingPattern {
  key: string; label: string; pattern: string; example: string;
}

export interface UserRow {
  id: number; username: string; displayName: string;
  roleId: number; roleName: string; isActive: boolean; lastLogin: string | null;
}

export interface RoleRow {
  id: number; name: string; isSystem: boolean;
  permissions: Record<ModuleKey, PermissionLevel>;
}

export interface BackupEntry {
  id: number; fileName: string; path: string;
  sizeBytes: number; createdAt: string; triggeredBy: 'auto' | 'manual' | 'pre-migration' | 'pre-restore';
  status: 'ok' | 'failed';
}

export interface DiagnosticsInfo {
  version: string; electronVersion: string; nodeVersion: string; chromeVersion: string;
  platform: string; arch: string;
  dataDir: string; dbPath: string; dbSizeBytes: number; walMode: boolean;
  integrity: 'ok' | 'failed' | 'not-run';
  license: LicenseStatus;
  backup: BackupHealth;
  schemaVersion: number;
}

export interface AuditEntry {
  id: number; createdAt: string; username: string;
  action: string; entity: string; entityId: string;
  oldValue: string | null; newValue: string | null;
}

/** Typed IPC channel map: request -> response. */
/** File-export result. Desktop returns a saved filePath (save dialog);
 * the web demo returns a browser download (fileName + base64 payload). */
export type ExportResult =
  | { ok: true; filePath: string }
  | { ok: true; fileName: string; mime: string; dataBase64: string }
  | { ok: false; error: string };

export interface IpcChannels {
  'app:status': { req: void; res: AppStatus };
  'app:checkForUpdates': { req: void; res: { available: boolean; version?: string; url?: string; notes?: string; error?: string } };
  'setup:needed': { req: void; res: boolean };
  'setup:complete': { req: SetupPayload; res: { ok: true } | { ok: false; error: string } };
  'auth:login': { req: { username: string; password: string }; res: { ok: true; user: SafeUser } | { ok: false; error: string } };
  'auth:logout': { req: void; res: { ok: true } };
  'auth:me': { req: void; res: SafeUser | null };
  'auth:changePassword': { req: { currentPassword: string; newPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'auth:recoveryQuestion': { req: { username: string }; res: { ok: true; question: string | null } | { ok: false; error: string } };
  'auth:recoverAccess': { req: { username: string; answer: string; newPassword: string }; res: { ok: true; user: SafeUser } | { ok: false; error: string } };
  'license:status': { req: void; res: LicenseStatus };
  'license:machineCode': { req: void; res: { machineCode: string } };
  'license:hwInfo': { req: void; res: { machineCode: string; disk: string; board: string; cpu: string } };
  'license:activate': { req: { licenseText: string }; res: { ok: true } | { ok: false; error: string } };
  'license:clear': { req: { adminPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'settings:institution:get': { req: void; res: InstitutionProfile };
  'settings:institution:set': { req: Partial<InstitutionProfile>; res: { ok: true } | { ok: false; error: string } };
  'settings:sessions:list': { req: void; res: SessionRow[] };
  'settings:sessions:update': { req: { id: number; feeStartMonth: string }; res: { ok: true } | { ok: false; error: string } };
  'settings:sessions:create': { req: { name: string; startDate: string; endDate: string; feeStartMonth?: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'masters:list': { req: { kind: MasterKind }; res: MasterItem[] };
  'masters:add': { req: { kind: MasterKind; name: string; extra?: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'masters:rename': { req: { kind: MasterKind; id: number; name: string }; res: { ok: true } | { ok: false; error: string } };
  'masters:remove': { req: { kind: MasterKind; id: number }; res: { ok: true } | { ok: false; error: string } };
  'masters:reorder': { req: { kind: MasterKind; id: number; direction: 'up' | 'down' }; res: { ok: true } | { ok: false; error: string } };
  'masters:subjects:set-class': { req: { ids: number[]; className: string }; res: { ok: true; moved: number } | { ok: false; error: string } };
  'numbering:list': { req: void; res: NumberingPattern[] };
  'numbering:set': { req: { key: string; pattern: string }; res: { ok: true } | { ok: false; error: string } };
  'rules:get': { req: void; res: Record<string, string> };
  'rules:set': { req: { key: string; value: string }; res: { ok: true } | { ok: false; error: string } };
  'users:list': { req: void; res: UserRow[] };
  'users:create': { req: { username: string; displayName: string; password: string; roleId: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'users:update': { req: { id: number; displayName?: string; roleId?: number; isActive?: boolean }; res: { ok: true } | { ok: false; error: string } };
  'users:resetPassword': { req: { id: number; newPassword: string; adminPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'roles:list': { req: void; res: RoleRow[] };
  'roles:save': { req: { id?: number; name: string; permissions: Record<ModuleKey, PermissionLevel> }; res: { ok: true; id: number } | { ok: false; error: string } };
  'backup:now': { req: void; res: { ok: true; path: string } | { ok: false; error: string } };
  'backup:download': { req: void; res: { ok: true; filePath: string } | { ok: false; error: string } };
  'backup:list': { req: void; res: BackupEntry[] };
  'backup:restore': { req: { id: number; adminPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'backup:config:get': { req: void; res: { enabled: boolean; time: string; keepLast: number; usbPath: string; reminderDays: number } };
  'backup:config:set': { req: { enabled: boolean; time: string; keepLast: number; usbPath: string; reminderDays: number }; res: { ok: true } | { ok: false; error: string } };
  'backup:health': { req: void; res: BackupHealth };
  'drive:status': { req: void; res: { connected: boolean; email?: string; clientIdSet: boolean } };
  'drive:clientId:get': { req: void; res: { clientId: string } };
  'drive:clientId:set': { req: { clientId: string }; res: { ok: true } | { ok: false; error: string } };
  'drive:connect': { req: void; res: { ok: true; email: string } | { ok: false; error: string } };
  'drive:disconnect': { req: void; res: { ok: true } | { ok: false; error: string } };
  'drive:upload': { req: void; res: { ok: true; fileName: string } | { ok: false; error: string } };
  'drive:list': { req: void; res: { ok: true; files: DriveFile[] } | { ok: false; error: string } };
  'drive:download': { req: { id: string; name: string }; res: { ok: true; path: string } | { ok: false; error: string } };
  'diagnostics:info': { req: void; res: DiagnosticsInfo };
  'diagnostics:integrityCheck': { req: void; res: { ok: boolean; detail: string } };
  'audit:recent': { req: { limit: number }; res: AuditEntry[] };
  'search:query': { req: { q: string }; res: SearchResult[] };
  // ---- Milestone 2: students / admissions ----
  'students:list': { req: StudentFilters; res: { rows: StudentRow[]; total: number } };
  'students:get': { req: { id: number }; res: (StudentRow & { documents: { doc_type: string; status: string }[] }) | null };
  'students:create': { req: { input: StudentInput; sessionId: number | null; force?: boolean }; res: { ok: true; id: number; admission_no: string } | { ok: false; error: string; duplicates?: StudentRow[] } };
  'students:update': { req: { id: number; patch: Partial<StudentInput> }; res: { ok: true } | { ok: false; error: string } };
  'students:changeStatus': { req: { id: number; status: string; reason: string }; res: { ok: true } | { ok: false; error: string } };
  'students:promote': { req: { ids: number[]; toClass: string; toSection: string; sessionId: number | null }; res: { ok: true; count: number } | { ok: false; error: string } };
  'students:tcEligibility': { req: { id: number }; res: { eligible: boolean; pendingDues: number } };
  'students:issueTC': { req: { id: number; reason: string; override: boolean }; res: { ok: true; tcNo: string } | { ok: false; error: string } };
  'students:documents': { req: { id: number; docs: { doc_type: string; status: string }[] }; res: { ok: true } | { ok: false; error: string } };
  // ---- Milestone 2: fees ----
  'fees:structure:list': { req: { sessionId: number }; res: FeeStructureRow[] };
  'fees:structure:save': { req: { sessionId: number; rows: { class_name: string; section?: string; head_id: number; month_label?: string; amount: number; fine_flat?: number; fine_percent?: number; due_day?: number }[] }; res: { ok: true } | { ok: false; error: string } };
  'fees:structure:copy': { req: { fromSessionId: number; toSessionId: number }; res: { ok: true; count: number } | { ok: false; error: string } };
  'fees:dues:generate': { req: { sessionId: number; monthLabel: string }; res: { ok: true; count: number } | { ok: false; error: string } };
  'fees:dues:list': { req: { studentId: number; monthLabels?: string[]; carryForward?: boolean }; res: DueRow[] };
  'fees:dues:sync': { req: { studentId: number; sessionId: number; monthLabels: string[]; heads: { head_id: number; head_name: string; amount: number }[] }; res: { ok: true } | { ok: false; error: string } };
  'fees:collect': { req: CollectInput; res: { ok: true; receipt_id: number; receipt_no: string; change: number } | { ok: false; error: string } };
  'fees:receipts:list': { req: { q?: string; from?: string; to?: string; mode?: string; status?: string; limit?: number; offset?: number; className?: string; section?: string; admissionNo?: string }; res: { rows: ReceiptRow[]; total: number } };
  'fees:receipts:get': { req: { id: number }; res: ReceiptDetail | null };
  'fees:receipts:cancel': { req: { id: number; reason: string; adminPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'fees:chequeBounce': { req: { id: number; bounceCharge: number }; res: { ok: true } | { ok: false; error: string } };
  'fees:defaulters': { req: { sessionId: number | null; className?: string }; res: DefaulterRow[] };
  // ---- Milestone 2: attendance ----
  'attendance:roster': { req: { className: string; section: string }; res: { id: number; name: string; admission_no: string; roll_no: string }[] };
  'attendance:mark': { req: { className: string; section: string; date: string; cells: AttendanceCell[] }; res: { ok: true } | { ok: false; error: string } };
  'attendance:get': { req: { className: string; section: string; date: string }; res: Record<number, string> };
  'attendance:percent': { req: { className: string; section: string; from: string; to: string }; res: { student_id: number; name: string; admission_no: string; present: number; total: number; percent: number; below: boolean }[] };
  'attendance:absentees': { req: { date: string; className?: string }; res: { student_id: number; name: string; class_name: string; section: string; father_phone: string }[] };
  'staff:list': { req: void; res: StaffRow[] };
  'staff-attendance:mark': { req: { date: string; cells: { staff_id: number; status: string; in_time?: string; late?: boolean }[] }; res: { ok: true } | { ok: false; error: string } };
  'staff-attendance:get': { req: { date: string }; res: Record<number, { status: string; in_time: string; late: number }> };
  'leaves:list': { req: { status?: string }; res: LeaveRow[] };
  'leaves:apply': { req: { applicant_type: string; applicant_id: number; from_date: string; to_date: string; leave_type: string; reason: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'leaves:decide': { req: { id: number; approve: boolean }; res: { ok: true } | { ok: false; error: string } };
  // ---- Milestone 2: reports ----
  'reports:list': { req: void; res: ReportDef[] };
  'reports:run': { req: { key: string; params: Record<string, string> }; res: ReportResult };
  'reports:export': { req: { key: string; params: Record<string, string>; title: string }; res: ExportResult };
  'export:everything': { req: void; res: ExportResult };
  // ---- Milestone 3: exams ----
  'exams:list': { req: { sessionId?: number | null }; res: ExamRow[] };
  'exams:create': { req: { name: string; term: string; sessionId: number | null; classes: string[] }; res: { ok: true; id: number } | { ok: false; error: string } };
  'exams:subjects:list': { req: { examId: number }; res: ExamSubject[] };
  'exams:subjects:used': { req: { className: string }; res: string[] };
  'exams:subjects:update': { req: { id: number; subject: string; max_marks: number; pass_marks: number; weightage: number }; res: { ok: true } | { ok: false; error: string } };
  'exams:subjects:delete': { req: { id: number }; res: { ok: true } | { ok: false; error: string } };
  'exams:subjects:save': { req: { examId: number; subjects: { subject: string; class_name: string; max_marks: number; pass_marks: number; weightage: number }[] }; res: { ok: true } | { ok: false; error: string } };
  'exams:datesheet:list': { req: { examId: number }; res: DatesheetRow[] };
  'exams:datesheet:save': { req: { examId: number; className: string; rows: Omit<DatesheetRow, 'id'>[] }; res: { ok: true; clashes: string[] } | { ok: false; error: string } };
  'exams:marks:get': { req: { examId: number; subject: string; className: string }; res: Record<number, { marks: number | null; absent: boolean; grace: number }> };
  'exams:marks:save': { req: { examId: number; subject: string; className: string; entries: { student_id: number; marks_obtained: number | null; is_absent: boolean; grace?: number; grace_note?: string }[] }; res: { ok: true; rejected: { student_id: number; reason: string }[] } | { ok: false; error: string } };
  'exams:results': { req: { examId: number; className: string }; res: ResultRow[] };
  'exams:lock': { req: { examId: number }; res: { ok: true } | { ok: false; error: string } };
  'exams:unlock': { req: { examId: number; adminPassword: string }; res: { ok: true } | { ok: false; error: string } };
  'exams:analysis': { req: { examId: number; className: string }; res: { subjectStats: { subject: string; avg: number; highest: number; lowest: number; passPercent: number }[]; toppers: { name: string; percent: number }[]; failList: { name: string; subjects: string[] }[] } };
  // ---- Milestone 3: cards ----
  'cards:templates:list': { req: { kind: string }; res: CardTemplate[] };
  'cards:templates:save': { req: { kind: string; name: string; className: string; config: Record<string, unknown>; makeDefault: boolean }; res: { ok: true; id: number } | { ok: false; error: string } };
  'gatepass:create': { req: { student_id: number; reason: string; valid_until: string; authorized_by: string; receiver_name: string }; res: { ok: true; id: number; gatepass_no: string } | { ok: false; error: string } };
  'gatepass:list': { req: void; res: { id: number; gatepass_no: string; student_name: string; class_name: string; reason: string; out_time: string }[] };
  // ---- Milestone 4: staff & payroll ----
  'staff:full:list': { req: void; res: StaffDetail[] };
  'staff:full:get': { req: { id: number }; res: (StaffDetail & { structure: SalaryComponent[] }) | null };
  'staff:full:create': { req: Partial<StaffDetail>; res: { ok: true; id: number } | { ok: false; error: string } };
  'staff:full:update': { req: { id: number; patch: Partial<StaffDetail> }; res: { ok: true } | { ok: false; error: string } };
  'staff:salary:save': { req: { staffId: number; components: SalaryComponent[] }; res: { ok: true } | { ok: false; error: string } };
  'payroll:run': { req: { month: string }; res: { ok: true; runId: number; lines: PayrollLine[] } | { ok: false; error: string } };
  'payroll:get': { req: { month: string }; res: { run: { id: number; month: string; status: string } | null; lines: PayrollLine[] } };
  'payroll:adjust': { req: { lineId: number; arrears: number; bonus: number }; res: { ok: true } | { ok: false; error: string } };
  'payroll:finalize': { req: { runId: number }; res: { ok: true; count: number } | { ok: false; error: string } };
  // ---- Milestone 4: accounting ----
  'vouchers:create': { req: VoucherInput; res: { ok: true; id: number; voucher_no: string } | { ok: false; error: string } };
  'vouchers:list': { req: { from?: string; to?: string; type?: string; q?: string; limit?: number }; res: VoucherRow[] };
  'accounting:incomeExpense': { req: { from: string; to: string }; res: { income: { ledger: string; total: number }[]; expense: { ledger: string; total: number }[]; totalIncome: number; totalExpense: number } };
  'accounting:ledgerStatement': { req: { ledgerName: string; from: string; to: string }; res: { rows: VoucherRow[]; total: number } };
  'expenses:create': { req: { date: string; ledger_id: number | null; ledger_name: string; amount: number; narration: string; bill_no: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'expenses:list': { req: { status?: string }; res: { id: number; date: string; ledger_name: string; amount: number; narration: string; bill_no: string; status: string; entered_by_name: string }[] };
  'expenses:decide': { req: { id: number; approve: boolean }; res: { ok: true } | { ok: false; error: string } };
  'pettycash:get': { req: { date: string }; res: { date: string; opening: number; closing: number; physical_count: number | null; difference: number | null; notes: string } | null };
  'pettycash:save': { req: { date: string; opening: number; closing: number; physical_count?: number | null; notes?: string }; res: { ok: true } | { ok: false; error: string } };
  'accounting:tallyExport': { req: { from: string; to: string }; res: ExportResult };
  // ---- Milestone 4: inventory ----
  'items:list': { req: void; res: ItemRow[] };
  'items:save': { req: Partial<ItemRow> & { id?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'inventory:purchase': { req: { bill_no: string; bill_date: string; vendor: string; lines: { item_id: number; qty: number; rate: number; tax: number }[] }; res: { ok: true; id: number } | { ok: false; error: string } };
  'inventory:issue': { req: { date: string; item_id: number; qty: number; issued_to: string; purpose: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'inventory:lowStock': { req: void; res: ItemRow[] };
  'inventory:valuation': { req: void; res: { items: (ItemRow & { value: number })[]; total: number } };
  'assets:list': { req: void; res: AssetRow[] };
  'assets:save': { req: Partial<AssetRow> & { id?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'assets:warrantyExpiring': { req: { days: number }; res: AssetRow[] };
  // ---- Milestone 5: front office ----
  'enquiries:list': { req: { status?: string; today?: boolean; overdue?: boolean }; res: EnquiryRow[] };
  'enquiries:create': { req: { name: string; phone: string; class_interested: string; source: string; followup_date: string; counsellor: string; notes: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'enquiries:followup': { req: { id: number; outcome: string; notes: string; nextDate: string }; res: { ok: true } | { ok: false; error: string } };
  'enquiries:convert': { req: { id: number; className: string; section: string }; res: { ok: true; studentId: number; admission_no: string } | { ok: false; error: string } };
  'enquiries:lost': { req: { id: number }; res: { ok: true } | { ok: false; error: string } };
  'frontoffice:conversionReport': { req: void; res: { bySource: { source: string; enquiries: number; converted: number; rate: number }[]; byCounsellor: { counsellor: string; enquiries: number; converted: number; rate: number }[] } };
  'visitors:list': { req: { date?: string }; res: { id: number; name: string; phone: string; purpose: string; whom_to_meet: string; in_time: string; out_time: string }[] };
  'visitors:log': { req: { name: string; phone: string; purpose: string; whom_to_meet: string; in_time: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'visitors:out': { req: { id: number; outTime: string }; res: { ok: true } | { ok: false; error: string } };
  'complaints:list': { req: { status?: string }; res: { id: number; date: string; complainant: string; phone: string; type: string; description: string; status: string }[] };
  'complaints:create': { req: { complainant: string; phone: string; type: string; description: string }; res: { ok: true; id: number } | { ok: false; error: string } };
  'complaints:status': { req: { id: number; status: string; notes: string }; res: { ok: true } | { ok: false; error: string } };
  // ---- Add-ons: transport + library (license-flag-gated) ----
  'transport:vehicles': { req: void; res: { id: number; vehicle_no: string; type: string; capacity: number; driver_name: string | null; driver_phone: string | null; insurance_expiry: string | null; fitness_expiry: string | null; is_active: number }[] };
  'transport:saveVehicle': { req: { id?: number; vehicle_no: string; type?: string; capacity?: number; driver_name?: string; driver_phone?: string; insurance_expiry?: string; fitness_expiry?: string; is_active?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'transport:routes': { req: void; res: { id: number; name: string; vehicle_id: number | null; monthly_fee: number; is_active: number; vehicle_no?: string }[] };
  'transport:saveRoute': { req: { id?: number; name: string; vehicle_id?: number | null; monthly_fee?: number; is_active?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'transport:stops': { req: { routeId: number }; res: { id: number; route_id: number; stop_name: string; stop_order: number; pickup_time: string | null }[] };
  'transport:saveStops': { req: { routeId: number; stops: { stop_name: string; stop_order: number; pickup_time?: string }[] }; res: { ok: true } | { ok: false; error: string } };
  'transport:allocations': { req: { session: string }; res: { id: number; student_id: number; route_id: number; stop_id: number | null; session: string; student_name?: string; class_name?: string; route_name?: string; stop_name?: string }[] };
  'transport:allocate': { req: { studentId: number; routeId: number; stopId?: number | null; session: string }; res: { ok: true } | { ok: false; error: string } };
  'transport:strength': { req: { session: string }; res: { route: string; count: number; capacity: number }[] };
  'library:books': { req: { q?: string }; res: { id: number; title: string; author: string | null; isbn: string | null; category: string | null; rack_no: string | null; total_copies: number; available_copies: number }[] };
  'library:saveBook': { req: { id?: number; title: string; author?: string; isbn?: string; category?: string; rack_no?: string; total_copies?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'library:deleteBook': { req: { id: number }; res: { ok: true } | { ok: false; error: string } };
  'library:issue': { req: { bookId: number; memberType: 'student' | 'staff'; memberId: number; dueDays?: number }; res: { ok: true; id: number } | { ok: false; error: string } };
  'library:return': { req: { loanId: number }; res: { ok: true; fine: number } | { ok: false; error: string } };
  'library:openLoans': { req: void; res: { id: number; book_id: number; member_type: string; member_id: number; issue_date: string; due_date: string; fine: number; title?: string; member_name?: string }[] };
  'library:overdue': { req: void; res: { id: number; book_id: number; member_type: string; member_id: number; due_date: string; title?: string; member_name?: string; overdue_days: number; computed_fine: number }[] };
  'library:stats': { req: void; res: { books: number; copies: number; issued: number; overdue: number } };
  // ---- Milestone 5: analytics ----
  'analytics:kpis': { req: void; res: Kpis };
  'analytics:feeTrend': { req: void; res: { month: string; total: number }[] };
  'analytics:admissionsTrend': { req: void; res: { month: string; count: number }[] };
  'analytics:classStrength': { req: void; res: { class: string; count: number }[] };
  'analytics:expenseTrend': { req: void; res: { month: string; total: number }[] };
  'analytics:alerts': { req: void; res: AlertItem[] };
  'analytics:birthdays': { req: void; res: { students: { id: number; name: string; class_name: string; phone: string }[]; staff: { id: number; name: string; phone: string }[] } };
}

export type MasterKind =
  | 'class' | 'section' | 'subject' | 'fee-head' | 'ledger'
  | 'leave-type' | 'enquiry-source' | 'complaint-type';

export interface SearchResult {
  kind: 'student' | 'staff' | 'receipt' | 'voucher' | 'enquiry';
  id: string | number;
  title: string;
  subtitle: string;
}

// ---------- Milestone 2: core school ops ----------
export type StudentRow = {
  id: number; admission_no: string; name: string; dob: string; gender: string;
  blood_group: string; category: string; religion: string; nationality: string;
  class_name: string; section: string; roll_no: string; admission_date: string;
  previous_school: string; sibling_info: string;
  father_name: string; father_occupation: string; father_phone: string;
  mother_name: string; mother_occupation: string; mother_phone: string;
  guardian_name: string; guardian_phone: string; address: string;
  photo_path: string | null; status: string; session_id: number | null;
  transport_allocated: number; transport_amount: number;
}

export interface StudentInput {
  name: string; dob?: string; gender?: string; blood_group?: string; category?: string;
  religion?: string; nationality?: string; class_name: string; section?: string; roll_no?: string;
  admission_date?: string; previous_school?: string; sibling_info?: string;
  father_name?: string; father_occupation?: string; father_phone?: string;
  mother_name?: string; mother_occupation?: string; mother_phone?: string;
  guardian_name?: string; guardian_phone?: string; address?: string; photo_path?: string | null;
  transport_allocated?: boolean; transport_amount?: number;
};

export interface StudentFilters {
  q?: string; class_name?: string; section?: string; status?: string;
  gender?: string; category?: string;
  session_id?: number; limit?: number; offset?: number;
}

export interface FeeStructureRow {
  id: number; session_id: number; class_name: string; section: string; head_id: number; head_name: string;
  month_label: string; amount: number; fine_flat: number; fine_percent: number; due_day: number;
}

export interface DueRow {
  id: number; student_id: number; student_name: string; admission_no: string;
  class_name: string; section: string; head_id: number; head_name: string;
  amount: number; discount: number; fine: number; paid: number; due_date: string;
  month_label: string; status: string; payable: number;
}

export interface CollectInput {
  student_id: number; session_id: number | null;
  tendered: number; mode: 'cash' | 'upi' | 'cheque' | 'neft';
  ref_no?: string; bank?: string; cheque_date?: string; notes?: string;
  discounts?: { due_id: number; amount: number; reason: string; approved_by: string }[];
}

export type ReceiptRow = {
  id: number; receipt_no: string; date: string; student_name: string; admission_no: string;
  class_name: string; section: string; total: number; tendered: number; mode: string; status: string; created_at: string;
}

export interface ReceiptDetail extends ReceiptRow {
  lines: { head_name: string; amount: number; month_label?: string; month_display?: string }[];
  ref_no: string; bank: string; notes: string; cancelled_reason: string;
  father_name: string; father_phone: string; mother_phone: string; address: string; change_given: number;
  fee_months: string[]; remaining_due: number;
};

export type DefaulterRow = {
  id: number; student_id: number; student_name: string; admission_no: string; class_name: string; section: string;
  father_phone: string; total_due: number;
  bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90p: number;
};

export interface AttendanceCell { student_id: number; status: string }

export interface StaffRow {
  id: number; employee_code: string; name: string; phone: string; email: string;
  designation: string; department: string; joining_date: string; status: string;
}

export interface LeaveRow {
  id: number; applicant_type: string; applicant_id: number;
  from_date: string; to_date: string; leave_type: string; reason: string;
  status: string; decided_by_name: string | null; created_at: string;
}

export interface ReportDef { key: string; title: string; params: string[] }
export interface ReportResult {
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

// ---------- Milestone 3: exams & cards ----------
export interface ExamRow { id: number; name: string; term: string; session_id: number | null; classes: string[]; is_locked: number }
export interface ExamSubject { id: number; subject: string; class_name: string; max_marks: number; pass_marks: number; weightage: number }
export interface DatesheetRow { id: number; subject: string; class_name: string; date: string; start_time: string; end_time: string; room: string }
export interface ResultRow {
  id: number; student_id: number; name: string; admission_no: string; roll_no: string;
  section: string; father_name: string; photo_path: string | null;
  subjects: { subject: string; marks: number | null; max: number; absent: boolean; grace: number }[];
  total: number; maxTotal: number; percent: number; grade: string; rank: number; pass: boolean;
}
export interface CardTemplate { id: number; kind: string; name: string; class_name: string; config: Record<string, unknown>; version: number; is_default: number }

// ---------- Milestone 4: money ----------
export interface StaffDetail {
  id: number; employee_code: string; name: string; phone: string; email: string;
  designation: string; department: string; joining_date: string; status: string;
  dob: string; gender: string; address: string; pan: string; aadhaar: string;
  bank_name: string; bank_account: string; bank_ifsc: string;
}
export interface SalaryComponent { id?: number; component: string; kind: 'earning' | 'deduction'; amount: number; is_percent: number; percent_of: string }
export interface PayrollLine {
  id: number; staff_id: number; staff_name: string; employee_code: string;
  designation: string; department: string;
  payable_days: number; lop_days: number;
  earnings: { component: string; amount: number }[]; deductions: { component: string; amount: number }[];
  arrears: number; bonus: number; gross: number; total_deductions: number; net: number;
  bank_account: string; bank_name: string;
}
export interface VoucherInput {
  type: 'receipt' | 'payment' | 'journal' | 'contra';
  date: string; ledger_id: number | null; ledger_name: string;
  amount: number; mode: string; narration: string;
}
export interface VoucherRow {
  id: number; voucher_no: string; type: string; date: string; ledger_name: string;
  amount: number; mode: string; narration: string;
}
export interface ItemRow { id: number; name: string; category: string; unit: string; purchase_rate: number; reorder_level: number; barcode: string; current_stock: number }
export interface AssetRow { id: number; name: string; category: string; purchase_date: string; cost: number; location: string; custodian: string; condition: string; warranty_expiry: string }

// ---------- Milestone 5: front office ----------
export interface EnquiryRow {
  id: number; name: string; phone: string; class_interested: string; source: string;
  followup_date: string; counsellor: string; notes: string; status: string;
}
export interface Kpis {
  activeStudents: number; feesCollectedMonth: number; feesPendingTotal: number;
  attendanceTodayPct: number | null; enquiriesWeek: number; staffPresentToday: number; staffTotal: number;
}
export interface AlertItem { kind: string; title: string; detail: string; severity: 'danger' | 'warning' | 'info' }
