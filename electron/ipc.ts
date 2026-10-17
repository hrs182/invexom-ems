import { ipcMain, dialog, shell, BrowserWindow } from './services/electron-shim.js';
import fs from 'node:fs';
import path from 'node:path';
import type { IpcChannels, SafeUser, MasterKind } from '../shared/types.js';
import { ensureDirs, type EmsPaths } from './services/paths.js';
import { toUserError, errorDetail } from './services/errors.js';
import { databaseFilePath, getDb, integrityCheck, schemaVersion, sweepStaleSessions } from './services/database.js';
import {
  createVault, unlockDataKey, addUserWrap, removeUserWrap, hashPassword,
  encryptFile, secureWipe, verifyPassword,
  setRecoveryInfo, getRecoveryInfo, unlockWithRecovery,
} from './services/secure-store.js';
import { isRecoveryQuestionId } from '../shared/recovery.js';
import { audit, recentAudit } from './services/audit.js';
import {
  licenseStatus, activateLicense, clearLicense, machineCode, getHardwareBinding,
  assertWritable, assertStudentCap, readInstallDate,
} from './services/license.js';
import {
  runBackup, listBackups, restoreBackup, getBackupConfig, setBackupConfig, backupHealth,
} from './services/backup.js';
import {
  driveStatus, driveConnect, driveDisconnect, driveUploadBackup, driveListBackups,
  driveDownloadBackup, getDriveClientId, setDriveClientId,
} from './services/drive.js';
import { nextNumber, listNumbering, setPattern } from './services/numbering.js';
import { verifyLogin, listUsers, createUser, listRoles, saveRole, seedRoles, can } from './services/users.js';
import { seedSetupMasters } from './services/setup.js';
import { assertSubjectNameAvailable, setSubjectsClass } from './services/masters.js';
import { checkForUpdates } from './services/updater.js';
import {
  listStudents, getStudent, createStudent, updateStudent, changeStudentStatus,
  promoteStudents, tcEligibility, issueTC, setDocuments, admissionRegister,
} from './services/students.js';
import {
  listFeeStructure, saveFeeStructure, copyFeeStructure, generateDues, listDues, syncDuesToHeads,
  collectFee, listReceipts, getReceipt, cancelReceipt, chequeBounce, defaulters, discountRegister,
} from './services/fees.js';
import {
  classRoster, markAttendance, getAttendance, attendancePercent, absentees,
  markStaffAttendance, getStaffAttendance, listLeaves, applyLeave, decideLeave,
} from './services/attendance.js';
import { globalSearch } from './services/search.js';
import { REPORTS, runReport } from './services/reports.js';
import { exportExcel, exportEverything } from './services/export.js';
import { postFeeVoucher } from './services/accounting.js';
import {
  listExams, createExam, saveExamSubjects, listExamSubjects, updateExamSubject, deleteExamSubject,
  listUsedSubjects, saveDatesheet, listDatesheet,
  saveMarks, getMarks, computeResults, lockExam, unlockExam, resultAnalysis,
  listTemplates, saveTemplate, createGatepass, listGatepasses,
} from './services/exams.js';
import {
  listStaffFull, getStaff, createStaff, updateStaff, saveSalaryStructure,
  runPayroll, getPayrollLines, getPayrollRun, adjustPayrollLine, finalizePayroll,
} from './services/payroll.js';
import {
  createVoucher, listVouchers, incomeExpense, ledgerStatement,
  createExpense, listExpenses, decideExpense, getPettyCash, savePettyCash, tallyExport,
} from './services/accounting.js';
import {
  listItems, saveItem, createPurchase, createIssue, lowStock, stockValuation,
  listAssets, saveAsset, warrantyExpiring,
} from './services/inventory.js';
import {
  listEnquiries, createEnquiry, logFollowup, convertEnquiry, markEnquiryLost, conversionReport,
  listVisitors, logVisitor, visitorOut, listComplaints, createComplaint, setComplaintStatus,
} from './services/frontoffice.js';
import {
  listVehicles, saveVehicle, listRoutes, saveRoute, listStops, saveStops,
  listAllocations, allocate, routeStrength,
} from './services/transport.js';
import {
  listBooks, saveBook, deleteBook, issueBook, returnBook,
  openLoans, overdueLoans, libraryStats,
} from './services/library.js';
import {
  getKpis, feeTrend, admissionsTrend, classStrength, expenseTrend, smartAlerts, birthdays,
} from './services/analytics.js';

export interface AppContext {
  paths: EmsPaths;
  dataKey: Buffer | null;
  currentUser: SafeUser | null;
  demoBuild: boolean;
  version: string;
  /** True when running under the web-demo server (no Electron APIs). */
  webMode: boolean;
  openDatabaseWithKey: (key: Buffer) => void;
  lockVault: () => void;
  relaunch: () => void;
}

type Handler<K extends keyof IpcChannels> = (
  req: IpcChannels[K]['req'],
  ctx: AppContext,
) => Promise<IpcChannels[K]['res']> | IpcChannels[K]['res'];

/**
 * Handler-table builder with an injectable transport.
 * The Electron app passes an `on` wired to ipcMain; the web-demo server
 * passes one wired to Express routes — both run the SAME 158 handlers.
 */
export type IpcOn = <K extends keyof IpcChannels>(channel: K, handler: Handler<K>) => void;

/** Shared shape for a failed handler call (used by both transports). */
export function ipcErrorPayload(e: unknown): { ok: false; error: string; errorMessage: string; errorDetail: string } {
  // Never leak raw system errors (ENOENT, SQLITE_*, paths, stacks) to
  // the UI. `error` stays a stable machine-readable code (the renderer
  // branches on well-known codes); `errorMessage` is display-safe.
  const ue = toUserError(e);
  return { ok: false as const, error: ue.code, errorMessage: ue.message, errorDetail: errorDetail(e) };
}

function needAuth(ctx: AppContext): SafeUser {
  if (!ctx.currentUser || !ctx.dataKey) throw new Error('not-authenticated');
  return ctx.currentUser;
}

function needAdmin(ctx: AppContext): SafeUser {
  const u = needAuth(ctx);
  if (!can(u, 'users', 'admin') && u.roleName !== 'Administrator') throw new Error('admin-required');
  return u;
}

/** Mutations are blocked when the demo expired or the license mismatches. */
function needWritable(ctx: AppContext): SafeUser {
  const u = needAuth(ctx);
  assertWritable(licenseStatus({ demoBuild: ctx.demoBuild, installJsonPath: ctx.paths.installJson }));
  return u;
}

function verifyAdminPassword(ctx: AppContext, password: string): void {
  const admin = getDb().prepare(
    `SELECT u.password_hash FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'Administrator' AND u.is_active = 1 AND u.is_deleted = 0 LIMIT 1`,
  ).get() as { password_hash: string } | undefined;
  if (!admin || !verifyPassword(password, admin.password_hash)) throw new Error('admin-password-invalid');
}

export function buildIpcHandlers(on: IpcOn, ctx: AppContext): void {
  // ---- app ----
  on('app:status', () => {
    const needsSetup = !fs.existsSync(ctx.paths.dbEnc);
    return {
      version: ctx.version,
      electronVersion: process.versions.electron ?? '',
      platform: process.platform,
      demoBuild: ctx.demoBuild,
      needsSetup,
      dataDir: ctx.paths.dataDir,
      license: licenseStatusSafe(ctx),
      backupHealth: ctx.dataKey ? backupHealth() : { lastBackupAt: null, overdue: true, autoEnabled: true, scheduledTime: '20:00', daysSinceBackup: null, reminderDays: 7 },
    };
  });

  on('app:checkForUpdates', async () => checkForUpdates(ctx.version));

  // ---- setup ----
  on('setup:needed', () => !fs.existsSync(ctx.paths.dbEnc));

  on('setup:complete', async (payload) => {
    // Self-heal: the data dir may have been removed mid-session; recreate it.
    ctx.paths = ensureDirs();
    if (fs.existsSync(ctx.paths.dbEnc)) throw new Error('already-initialized');
    const s = payload;
    if (!s.institution.name.trim()) throw new Error('institution-name-required');
    if (!s.admin.username.trim() || s.admin.password.length < 8) throw new Error('admin-credentials-invalid');
    if (!s.recovery || !isRecoveryQuestionId(s.recovery.questionId)) throw new Error('recovery-question-required');
    if (!s.recovery.answer || s.recovery.answer.trim().length < 3) throw new Error('recovery-answer-required');

    // 1. Create encrypted vault (key from admin password).
    const dataKey = createVault(ctx.paths.keymeta, s.admin.username.trim(), s.admin.password);
    ctx.dataKey = dataKey;
    // Recovery wrap: the security answer can re-unwrap the same data key, so a
    // forgotten password never means lost data.
    setRecoveryInfo(ctx.paths.keymeta, dataKey, s.admin.username.trim(), s.recovery.questionId, s.recovery.question, s.recovery.answer);

    // 2. Fresh DB in a new session file + migrations.
    sweepStaleSessions(ctx.paths.workingDir);
    ctx.openDatabaseWithKey(dataKey);
    const db = getDb();

    // 3. Seed everything inside one transaction.
    const seed = db.transaction(() => {
      seedRoles();
      db.prepare('INSERT INTO institution (id, name, address, phone, email, upi_id, reg_no, principal_name) VALUES (1, ?, ?, ?, ?, ?, ?, ?)')
        .run(s.institution.name.trim(), s.institution.address, s.institution.phone, s.institution.email,
          s.institution.upiId, s.institution.regNo, s.institution.principalName);
      db.prepare('INSERT INTO sessions (name, start_date, end_date, is_active) VALUES (?, ?, ?, 1)')
        .run(s.session.name, s.session.startDate, s.session.endDate);
      const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'Administrator'").get() as { id: number };
      db.prepare('INSERT INTO users (username, display_name, password_hash, role_id) VALUES (?, ?, ?, ?)')
        .run(s.admin.username.trim(), s.admin.displayName.trim() || s.admin.username.trim(), hashPassword(s.admin.password), adminRole.id);
      seedSetupMasters(db, s.classes, s.feeHeads);
      const numbering = [
        ['receipt', 'Fee receipt', 'R-{YYYY}-{SEQ:5}'],
        ['voucher', 'Accounting voucher', 'V-{YYYY}-{SEQ:5}'],
        ['admission', 'Admission number', 'INV/{YYYY}/{SEQ:4}'],
        ['employee', 'Employee code', 'EMP-{SEQ:4}'],
        ['gatepass', 'Gate pass', 'GP-{YYYY}-{SEQ:4}'],
      ] as const;
      for (const [key, label, pattern] of numbering) {
        db.prepare('INSERT OR IGNORE INTO numbering (key, label, pattern) VALUES (?, ?, ?)').run(key, label, pattern);
      }
      const rules: [string, string][] = [
        ['attendance.threshold', '75'],
        ['backup.config', JSON.stringify({ enabled: true, time: '20:00', keepLast: 30, usbPath: '' })],
        ['password.minLength', '8'],
        ['lock.timeoutMinutes', '15'],
      ];
      for (const [k, v] of rules) db.prepare('INSERT OR IGNORE INTO app_rules (key, value) VALUES (?, ?)').run(k, v);
      const checklist = ['institution-profile', 'add-students', 'fee-structure', 'collect-fee', 'mark-attendance', 'backup-now'];
      for (const k of checklist) db.prepare('INSERT OR IGNORE INTO checklist (key) VALUES (?)').run(k);
    });
    seed();

    // Logo -> assets dir (accepts a data URL or a filesystem path from the file picker).
    if (s.logoDataUrl) {
      const m = s.logoDataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
      const ext = m ? (m[1] === 'png' ? 'png' : 'jpg') : path.extname(s.logoDataUrl).replace('.', '') || 'png';
      const dest = path.join(ctx.paths.assetsDir, `logo.${ext}`);
      if (m) fs.writeFileSync(dest, Buffer.from(m[2], 'base64'));
      else if (fs.existsSync(s.logoDataUrl)) fs.copyFileSync(s.logoDataUrl, dest);
      if (fs.existsSync(dest)) db.prepare('UPDATE institution SET logo_path = ? WHERE id = 1').run(dest);
    }

    // 4. Encrypt snapshot, audit, auto-login as admin.
    db.pragma('wal_checkpoint(TRUNCATE)');
    encryptFile(dataKey, databaseFilePath(), ctx.paths.dbEnc);
    const admin = verifyLogin(s.admin.username.trim(), s.admin.password);
    ctx.currentUser = admin;
    audit(admin, 'setup.complete', 'institution', 1, null, { name: s.institution.name });
    return { ok: true as const };
  });

  // ---- auth ----
  on('auth:login', async ({ username, password }) => {
    // First login after boot: unlock the vault with the user's password.
    if (!ctx.dataKey) {
      if (!fs.existsSync(ctx.paths.dbEnc)) return { ok: false as const, error: 'not-initialized' };
      let key: Buffer;
      try {
        key = unlockDataKey(ctx.paths.keymeta, username, password);
      } catch {
        return { ok: false as const, error: 'Invalid username or password.' };
      }
      // Crash recovery + fresh-install handling live in openDatabaseWithKey.
      ctx.openDatabaseWithKey(key);
      ctx.dataKey = key;
    }
    const user = verifyLogin(username, password);
    if (!user) return { ok: false as const, error: 'Invalid username or password.' };
    ctx.currentUser = user;
    audit(user, 'auth.login', 'user', user.id);
    return { ok: true as const, user };
  });

  on('auth:logout', async () => {
    const u = ctx.currentUser;
    ctx.currentUser = null;
    ctx.lockVault();
    if (u) audit(null, 'auth.logout', 'user', u.id, { username: u.username });
    return { ok: true as const };
  });

  on('auth:me', () => ctx.currentUser);

  on('auth:changePassword', async ({ currentPassword, newPassword }) => {
    const u = needAuth(ctx);
    if (newPassword.length < 8) throw new Error('password-too-short');
    const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id) as { password_hash: string };
    if (!verifyPassword(currentPassword, row.password_hash)) throw new Error('current-password-wrong');
    getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), u.id);
    if (ctx.dataKey) addUserWrap(ctx.paths.keymeta, ctx.dataKey, u.username, newPassword);
    audit(u, 'auth.changePassword', 'user', u.id);
    return { ok: true as const };
  });

  // ---- password recovery (security question set during setup) ----
  on('auth:recoveryQuestion', async ({ username }) => {
    // Works while the vault is locked: the question text is non-secret and
    // lives in keymeta.json, outside the encrypted database.
    const info = getRecoveryInfo(ctx.paths.keymeta, username.trim());
    return { ok: true as const, question: info?.question ?? null };
  });

  on('auth:recoverAccess', async ({ username, answer, newPassword }) => {
    const uname = username.trim();
    if (!uname) throw new Error('unknown-user');
    if (newPassword.length < 8) throw new Error('admin-credentials-invalid');
    const info = getRecoveryInfo(ctx.paths.keymeta, uname);
    if (!info) throw new Error('no-recovery');
    let dataKey: Buffer;
    try {
      dataKey = unlockWithRecovery(ctx.paths.keymeta, uname, info.questionId, answer);
    } catch (e) {
      // Slow down brute-forcing of the answer (offline app, local attacker).
      await new Promise((r) => setTimeout(r, 1500));
      throw e;
    }
    if (!ctx.dataKey) {
      ctx.openDatabaseWithKey(dataKey);
      ctx.dataKey = dataKey;
    }
    // Replace the password wrap with the new password; the recovery wrap
    // (user 'recovery:<name>') is untouched, so recovery keeps working.
    addUserWrap(ctx.paths.keymeta, dataKey, uname, newPassword);
    const row = getDb().prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(uname) as
      | { id: number }
      | undefined;
    if (!row) throw new Error('unknown-user');
    getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(newPassword), row.id);
    const user = verifyLogin(uname, newPassword);
    if (!user) throw new Error('unexpected-error');
    ctx.currentUser = user;
    audit(user, 'auth.recover', 'user', user.id);
    return { ok: true as const, user };
  });

  // ---- licensing ----
  on('license:status', () => licenseStatusSafe(ctx));
  on('license:machineCode', () => ({ machineCode: machineCode() }));
  on('license:hwInfo', () => { const hw = getHardwareBinding(); return { machineCode: machineCode(), ...hw }; });
  on('license:activate', async ({ licenseText }) => {
    const u = needAdmin(ctx);
    // Renderer sandbox can't read files: it passes __FILE__:<path>, main reads it.
    let text = licenseText;
    if (text.startsWith('__FILE__:')) {
      const p = text.slice('__FILE__:'.length);
      try { text = fs.readFileSync(p, 'utf8'); }
      catch { return { ok: false as const, error: 'Could not read the license file.' }; }
    }
    const r = activateLicense(text);
    if (r.ok) audit(u, 'license.activate', 'license', 1);
    return r;
  });
  on('license:clear', async ({ adminPassword }) => {
    const u = needAdmin(ctx);
    verifyAdminPassword(ctx, adminPassword);
    clearLicense();
    audit(u, 'license.clear', 'license', 1);
    return { ok: true as const };
  });

  // ---- settings ----
  on('settings:institution:get', () => {
    needAuth(ctx);
    const row = getDb().prepare('SELECT * FROM institution WHERE id = 1').get() as Record<string, unknown> | undefined;
    return {
      name: String(row?.name ?? ''), address: String(row?.address ?? ''), phone: String(row?.phone ?? ''),
      email: String(row?.email ?? ''), website: String(row?.website ?? ''), upiId: String(row?.upi_id ?? ''),
      regNo: String(row?.reg_no ?? ''), principalName: String(row?.principal_name ?? ''),
      logoPath: (row?.logo_path as string) ?? null, headerHtml: String(row?.header_html ?? ''),
      footerHtml: String(row?.footer_html ?? ''),
    };
  });

  on('settings:institution:set', async (patch) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    const cols: string[] = [];
    const vals: unknown[] = [];
    const map: Record<string, string> = {
      name: 'name', address: 'address', phone: 'phone', email: 'email', website: 'website',
      upiId: 'upi_id', regNo: 'reg_no', principalName: 'principal_name', headerHtml: 'header_html', footerHtml: 'footer_html',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (patch as Record<string, unknown>)[k];
      if (v !== undefined) { cols.push(`${col} = ?`); vals.push(v); }
    }
    if (cols.length) {
      getDb().prepare(`UPDATE institution SET ${cols.join(', ')}, updated_at = datetime('now') WHERE id = 1`).run(...vals);
      audit(u, 'settings.institution.update', 'institution', 1, null, patch);
    }
    return { ok: true as const };
  });

  on('settings:sessions:list', () => {
    needAuth(ctx);
    return getDb().prepare(
      'SELECT id, name, start_date AS startDate, end_date AS endDate, is_active AS isActive, is_locked AS isLocked, fee_start_month AS feeStartMonth FROM sessions ORDER BY start_date DESC',
    ).all() as never;
  });

  on('settings:sessions:create', async ({ name, startDate, endDate, feeStartMonth }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'admin')) throw new Error('forbidden');
    const fsm = feeStartMonth || startDate.slice(0, 7);
    const r = getDb().prepare('INSERT INTO sessions (name, start_date, end_date, fee_start_month) VALUES (?, ?, ?, ?)').run(name.trim(), startDate, endDate, fsm);
    audit(u, 'settings.session.create', 'session', Number(r.lastInsertRowid), null, { name });
    return { ok: true as const, id: Number(r.lastInsertRowid) };
  });

  on('settings:sessions:update', async ({ id, feeStartMonth }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'admin')) throw new Error('forbidden');
    if (!/^\d{4}-\d{2}$/.test(feeStartMonth)) throw new Error('invalid-month');
    getDb().prepare('UPDATE sessions SET fee_start_month = ? WHERE id = ?').run(feeStartMonth, id);
    audit(u, 'settings.session.update', 'session', id, null, { feeStartMonth });
    return { ok: true as const };
  });

  // ---- masters ----
  const masterKinds: MasterKind[] = ['class', 'section', 'subject', 'fee-head', 'ledger', 'leave-type', 'enquiry-source', 'complaint-type'];
  on('masters:list', ({ kind }) => {
    needAuth(ctx);
    if (!masterKinds.includes(kind)) throw new Error('unknown-master-kind');
    return getDb().prepare("SELECT id, name, extra FROM masters WHERE kind = ? AND is_active = 1 ORDER BY sort_order, name")
      .all(kind) as never;
  });

  // One-click fix for subjects saved before per-class subjects existed:
  // assigns legacy global subjects (no class) to the chosen class.
  on('masters:subjects:set-class', async ({ ids, className }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    const moved = setSubjectsClass(ids, className);
    audit(u, 'masters.subjects.set-class', 'master:subject', 0, null, { className, moved });
    return { ok: true as const, moved };
  });
  on('masters:add', async ({ kind, name, extra }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    if (!name.trim()) throw new Error('name-required');
    const ex = extra ?? '{}';
    const db = getDb();
    // Sections: same name allowed in different classes (DB unique is on kind,name,extra).
    // Subjects: saved per class — same name allowed in different classes, unique within a class.
    // Other kinds: names unique globally regardless of extra.
    if (kind === 'subject') {
      assertSubjectNameAvailable(name, ex);
    } else if (kind !== 'section') {
      const dup = db.prepare('SELECT id FROM masters WHERE kind = ? AND LOWER(name) = LOWER(?) AND is_active = 1')
        .get(kind, name.trim()) as { id: number } | undefined;
      if (dup) throw new Error('name-exists');
    }
    try {
      const r = db.prepare('INSERT INTO masters (kind, name, extra) VALUES (?, ?, ?)')
        .run(kind, name.trim(), ex);
      audit(u, 'masters.add', `master:${kind}`, Number(r.lastInsertRowid), null, { name });
      return { ok: true as const, id: Number(r.lastInsertRowid) };
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) {
        throw new Error(kind === 'section' ? 'section-exists' : 'name-exists');
      }
      throw e;
    }
  });
  on('masters:rename', async ({ kind, id, name }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    const db = getDb();
    const old = db.prepare('SELECT name FROM masters WHERE id = ? AND kind = ?').get(id, kind) as { name: string } | undefined;
    db.prepare('UPDATE masters SET name = ? WHERE id = ? AND kind = ?').run(name.trim(), id, kind);
    // If a class is renamed, update the linked sections' extra JSON too.
    if (kind === 'class' && old && old.name !== name.trim()) {
      const secs = db.prepare("SELECT id, extra FROM masters WHERE kind = 'section' AND is_active = 1").all() as { id: number; extra: string }[];
      const upd = db.prepare('UPDATE masters SET extra = ? WHERE id = ?');
      for (const s of secs) {
        try {
          const ex = JSON.parse(s.extra || '{}');
          if (ex.class === old.name) { ex.class = name.trim(); upd.run(JSON.stringify(ex), s.id); }
        } catch { /* ignore bad JSON */ }
      }
    }
    audit(u, 'masters.rename', `master:${kind}`, id, null, { name });
    return { ok: true as const };
  });
  on('masters:reorder', async ({ kind, id, direction }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    const db = getDb();
    // Normalize sort_order, then swap with the neighbor in the given direction.
    const rows = db.prepare('SELECT id, sort_order FROM masters WHERE kind = ? AND is_active = 1 ORDER BY sort_order, id').all(kind) as { id: number; sort_order: number }[];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('not-found');
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return { ok: true as const }; // already at edge
    const txn = db.transaction(() => {
      // Ensure dense ordering first
      const norm = db.prepare('UPDATE masters SET sort_order = ? WHERE id = ?');
      rows.forEach((r, i) => norm.run(i, r.id));
      // Swap the two
      norm.run(swapIdx, rows[idx].id);
      norm.run(idx, rows[swapIdx].id);
    });
    txn();
    audit(u, 'masters.reorder', `master:${kind}`, id, null, { direction });
    return { ok: true as const };
  });
  on('masters:remove', async ({ kind, id }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'edit')) throw new Error('forbidden');
    getDb().prepare('UPDATE masters SET is_active = 0 WHERE id = ? AND kind = ?').run(id, kind); // soft delete
    audit(u, 'masters.remove', `master:${kind}`, id);
    return { ok: true as const };
  });

  // ---- numbering & rules ----
  on('numbering:list', () => { needAuth(ctx); return listNumbering(); });
  on('numbering:set', async ({ key, pattern }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'admin')) throw new Error('forbidden');
    setPattern(key, pattern);
    audit(u, 'numbering.set', 'numbering', key, null, { pattern });
    return { ok: true as const };
  });
  on('rules:get', () => {
    needAuth(ctx);
    const rows = getDb().prepare('SELECT key, value FROM app_rules').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });
  on('rules:set', async ({ key, value }) => {
    const u = needWritable(ctx);
    if (!can(u, 'settings', 'admin')) throw new Error('forbidden');
    getDb().prepare("INSERT INTO app_rules (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')")
      .run(key, value);
    audit(u, 'rules.set', 'rule', key, null, { value });
    return { ok: true as const };
  });

  // ---- users & roles ----
  on('users:list', () => { needAdmin(ctx); return listUsers(); });
  on('users:create', async ({ username, displayName, password, roleId }) => {
    const u = needWritable(ctx);
    if (!can(u, 'users', 'admin')) throw new Error('forbidden');
    const id = createUser(username, displayName, password, roleId);
    if (ctx.dataKey) addUserWrap(ctx.paths.keymeta, ctx.dataKey, username.trim(), password);
    audit(u, 'users.create', 'user', id, null, { username });
    return { ok: true as const, id };
  });
  on('users:update', async ({ id, displayName, roleId, isActive }) => {
    const u = needWritable(ctx);
    if (!can(u, 'users', 'admin')) throw new Error('forbidden');
    const sets: string[] = []; const vals: unknown[] = [];
    if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
    if (roleId !== undefined) { sets.push('role_id = ?'); vals.push(roleId); }
    if (isActive !== undefined) { sets.push('is_active = ?'); vals.push(isActive ? 1 : 0); }
    if (sets.length) {
      getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
      if (isActive === false) {
        const row = getDb().prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;
        if (row) removeUserWrap(ctx.paths.keymeta, row.username);
      }
      audit(u, 'users.update', 'user', id, null, { displayName, roleId, isActive });
    }
    return { ok: true as const };
  });
  on('users:resetPassword', async ({ id, newPassword, adminPassword }) => {
    const u = needWritable(ctx);
    if (!can(u, 'users', 'admin')) throw new Error('forbidden');
    verifyAdminPassword(ctx, adminPassword);
    if (newPassword.length < 8) throw new Error('password-too-short');
    getDb().prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(newPassword), id);
    const row = getDb().prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string };
    if (ctx.dataKey) addUserWrap(ctx.paths.keymeta, ctx.dataKey, row.username, newPassword);
    audit(u, 'users.resetPassword', 'user', id);
    return { ok: true as const };
  });
  on('roles:list', () => { needAuth(ctx); return listRoles(); });
  on('roles:save', async ({ id, name, permissions }) => {
    const u = needWritable(ctx);
    if (!can(u, 'users', 'admin')) throw new Error('forbidden');
    const savedId = saveRole(id, name, permissions);
    audit(u, 'roles.save', 'role', savedId, null, { name });
    return { ok: true as const, id: savedId };
  });

  // ---- backup ----
  on('backup:now', async () => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'edit')) throw new Error('forbidden');
    const r = runBackup({ ...ctx.paths, workingDb: databaseFilePath() }, ctx.dataKey!, 'manual');
    if (r.ok) audit(u, 'backup.manual', 'backup', 0, null, { path: r.path });
    return r.ok ? { ok: true as const, path: r.path } : { ok: false as const, error: r.error };
  });
  on('backup:list', () => { needAuth(ctx); return listBackups(); });
  on('backup:download', async () => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'edit')) throw new Error('forbidden');
    const r = runBackup({ ...ctx.paths, workingDb: databaseFilePath() }, ctx.dataKey!, 'manual');
    if (!r.ok) return r;
    const { dialog: dlg, BrowserWindow: BW } = await import('electron');
    const win = BW.getFocusedWindow();
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const fileName = `Invexom-EMS-Backup-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.db.enc`;
    const s = await dlg.showSaveDialog(win ?? undefined as never, {
      title: 'Download backup',
      defaultPath: fileName,
      filters: [{ name: 'EMS backup', extensions: ['enc'] }],
    });
    if (s.canceled || !s.filePath) return { ok: false as const, error: 'cancelled' };
    fs.copyFileSync(r.path, s.filePath);
    audit(u, 'backup.download', 'backup', 0, null, { filePath: s.filePath });
    return { ok: true as const, filePath: s.filePath };
  });
  on('backup:restore', async ({ id, adminPassword }) => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'admin')) throw new Error('forbidden');
    verifyAdminPassword(ctx, adminPassword); // PERM-02
    const r = restoreBackup(id, { ...ctx.paths, workingDb: databaseFilePath() }, ctx.dataKey!);
    if (r.ok) { audit(u, 'backup.restore', 'backup', id); ctx.relaunch(); }
    return r;
  });
  on('backup:config:get', () => { needAuth(ctx); return getBackupConfig(); });
  on('backup:config:set', async (cfg) => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'admin')) throw new Error('forbidden');
    setBackupConfig(cfg);
    audit(u, 'backup.config', 'backup', 0, null, cfg);
    return { ok: true as const };
  });
  on('backup:health', () => backupHealth());

  // ---- Google Drive backup (opt-in online feature) ----
  on('drive:status', () => { needAuth(ctx); return driveStatus(); });
  on('drive:clientId:get', () => { needAuth(ctx); return { clientId: getDriveClientId() }; });
  on('drive:clientId:set', async ({ clientId }: { clientId: string }) => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'admin')) throw new Error('forbidden');
    setDriveClientId(clientId);
    audit(u, 'drive.clientId', 'backup', 0);
    return { ok: true as const };
  });
  on('drive:connect', async () => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'edit')) throw new Error('forbidden');
    const r = await driveConnect();
    if (r.ok) audit(u, 'drive.connect', 'backup', 0, null, { email: r.email });
    return r;
  });
  on('drive:disconnect', async () => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'edit')) throw new Error('forbidden');
    driveDisconnect();
    audit(u, 'drive.disconnect', 'backup', 0);
    return { ok: true as const };
  });
  on('drive:upload', async () => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'edit')) throw new Error('forbidden');
    const r = await driveUploadBackup({ ...ctx.paths, workingDb: databaseFilePath() }, ctx.dataKey!);
    if (r.ok) audit(u, 'drive.upload', 'backup', 0, null, { fileName: r.fileName });
    return r;
  });
  on('drive:list', async () => { needAuth(ctx); return driveListBackups(); });
  on('drive:download', async ({ id, name }: { id: string; name: string }) => {
    const u = needWritable(ctx);
    if (!can(u, 'backup', 'admin')) throw new Error('forbidden');
    const r = await driveDownloadBackup(id, name, ctx.paths.backupsDir);
    if (r.ok) audit(u, 'drive.download', 'backup', 0, null, { name });
    return r;
  });

  // ---- diagnostics / audit / search ----
  on('diagnostics:info', () => {
    needAuth(ctx);
    let dbSize = 0;
    try { dbSize = fs.statSync(databaseFilePath()).size; } catch { /* ignore */ }
    return {
      version: ctx.version,
      electronVersion: process.versions.electron ?? '',
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome ?? '',
      platform: `${process.platform} ${process.arch}`,
      arch: process.arch,
      dataDir: ctx.paths.dataDir,
      dbPath: ctx.paths.dbEnc,
      dbSizeBytes: dbSize,
      walMode: true,
      integrity: 'not-run' as const,
      license: licenseStatusSafe(ctx),
      backup: backupHealth(),
      schemaVersion: schemaVersion(),
    };
  });
  on('diagnostics:integrityCheck', () => { needAuth(ctx); return integrityCheck(); });
  on('audit:recent', ({ limit }) => {
    const u = needAuth(ctx);
    if (!can(u, 'settings', 'admin')) throw new Error('forbidden');
    return recentAudit(Math.min(limit, 500)) as never;
  });
  on('search:query', ({ q }) => {
    needAuth(ctx);
    return globalSearch(q);
  });

  // ---- Milestone 2: students ----
  on('students:list', (f) => { needAuth(ctx); return listStudents(f); });
  on('students:get', ({ id }) => { needAuth(ctx); return getStudent(id); });
  on('students:create', async ({ input, sessionId, force }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'edit')) throw new Error('forbidden');
    assertStudentCap(licenseStatus({ demoBuild: ctx.demoBuild, installJsonPath: ctx.paths.installJson }));
    const r = createStudent(input, sessionId, u, force);
    if (r.duplicates.length) return { ok: false as const, error: 'duplicate-found', duplicates: r.duplicates };
    return { ok: true as const, id: r.id, admission_no: r.admission_no };
  });
  on('students:update', async ({ id, patch }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'edit')) throw new Error('forbidden');
    updateStudent(id, patch, u);
    return { ok: true as const };
  });
  on('students:changeStatus', async ({ id, status, reason }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'edit')) throw new Error('forbidden');
    changeStudentStatus(id, status, reason, u);
    return { ok: true as const };
  });
  on('students:promote', async ({ ids, toClass, toSection, sessionId }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'admin')) throw new Error('forbidden');
    const count = promoteStudents(ids, toClass, toSection, sessionId, u);
    return { ok: true as const, count };
  });
  on('students:tcEligibility', ({ id }) => {
    needAuth(ctx);
    const { eligible, pendingDues } = tcEligibility(id);
    return { eligible, pendingDues };
  });
  on('students:issueTC', async ({ id, reason, override }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'admin')) throw new Error('forbidden');
    const { tcNo } = issueTC(id, reason, override, u);
    return { ok: true as const, tcNo };
  });
  on('students:documents', async ({ id, docs }) => {
    const u = needWritable(ctx);
    if (!can(u, 'students', 'edit')) throw new Error('forbidden');
    setDocuments(id, docs, u);
    return { ok: true as const };
  });

  // ---- Milestone 2: fees ----
  on('fees:structure:list', ({ sessionId }) => { needAuth(ctx); return listFeeStructure(sessionId); });
  on('fees:structure:save', async ({ sessionId, rows }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'admin')) throw new Error('forbidden');
    saveFeeStructure(sessionId, rows, u);
    return { ok: true as const };
  });
  on('fees:structure:copy', async ({ fromSessionId, toSessionId }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'admin')) throw new Error('forbidden');
    const count = copyFeeStructure(fromSessionId, toSessionId, u);
    return { ok: true as const, count };
  });
  on('fees:dues:generate', async ({ sessionId, monthLabel }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'admin')) throw new Error('forbidden');
    const count = generateDues(sessionId, monthLabel, u);
    return { ok: true as const, count };
  });
  on('fees:dues:list', ({ studentId, monthLabels, carryForward }) => { needAuth(ctx); return listDues(studentId, monthLabels, carryForward); });
  on('fees:dues:sync', async ({ studentId, sessionId, monthLabels, heads }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'edit')) throw new Error('forbidden');
    syncDuesToHeads(studentId, sessionId, monthLabels, heads);
    audit(u, 'fees.dues.sync', 'fee-dues', studentId, null, { monthLabels });
    return { ok: true as const };
  });
  on('fees:collect', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'edit')) throw new Error('forbidden');
    const r = collectFee(input, u);
    postFeeVoucher(ctx, u, r.receipt_id);
    return { ok: true as const, ...r };
  });
  on('fees:receipts:list', (f) => { needAuth(ctx); return listReceipts(f); });
  on('fees:receipts:get', ({ id }) => { needAuth(ctx); return getReceipt(id); });
  on('fees:receipts:cancel', async ({ id, reason, adminPassword }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'admin')) throw new Error('forbidden');
    verifyAdminPassword(ctx, adminPassword);
    cancelReceipt(id, reason, u);
    return { ok: true as const };
  });
  on('fees:chequeBounce', async ({ id, bounceCharge }) => {
    const u = needWritable(ctx);
    if (!can(u, 'fees', 'admin')) throw new Error('forbidden');
    chequeBounce(id, bounceCharge, u);
    return { ok: true as const };
  });
  on('fees:defaulters', ({ sessionId, className }) => { needAuth(ctx); return defaulters(sessionId, className); });

  // ---- Milestone 2: attendance ----
  on('attendance:roster', ({ className, section }) => { needAuth(ctx); return classRoster(className, section); });
  on('attendance:mark', async ({ className, section, date, cells }) => {
    const u = needWritable(ctx);
    if (!can(u, 'attendance', 'edit')) throw new Error('forbidden');
    markAttendance(className, section, date, cells, u);
    return { ok: true as const };
  });
  on('attendance:get', ({ className, section, date }) => { needAuth(ctx); return getAttendance(className, section, date); });
  on('attendance:percent', ({ className, section, from, to }) => {
    needAuth(ctx);
    const th = parseFloat((getDb().prepare("SELECT value FROM app_rules WHERE key = 'attendance.threshold'").get() as { value: string } | undefined)?.value ?? '75');
    return attendancePercent(className, section, from, to, th);
  });
  on('attendance:absentees', ({ date, className }) => { needAuth(ctx); return absentees(date, className); });
  on('staff:list', () => {
    needAuth(ctx);
    return getDb().prepare('SELECT id, employee_code, name, phone, email, designation, department, joining_date, status FROM staff WHERE is_deleted = 0 ORDER BY name').all() as never;
  });
  on('staff-attendance:mark', async ({ date, cells }) => {
    const u = needWritable(ctx);
    if (!can(u, 'attendance', 'edit')) throw new Error('forbidden');
    markStaffAttendance(date, cells, u);
    return { ok: true as const };
  });
  on('staff-attendance:get', ({ date }) => { needAuth(ctx); return getStaffAttendance(date); });
  on('leaves:list', ({ status }) => { needAuth(ctx); return listLeaves(status) as never; });
  on('leaves:apply', async (input) => {
    const u = needWritable(ctx);
    const id = applyLeave(input, u);
    return { ok: true as const, id };
  });
  on('leaves:decide', async ({ id, approve }) => {
    const u = needWritable(ctx);
    if (!can(u, 'attendance', 'admin')) throw new Error('forbidden');
    decideLeave(id, approve, u);
    return { ok: true as const };
  });

  // ---- Milestone 2: reports ----
  on('reports:list', () => { needAuth(ctx); return REPORTS; });
  on('reports:run', ({ key, params }) => { needAuth(ctx); return runReport(key, params); });
  on('reports:export', async ({ key, params, title }) => {
    const u = needAuth(ctx);
    if (!can(u, 'reports', 'print')) throw new Error('forbidden');
    const r = runReport(key, params);
    return exportExcel(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`, r.columns, r.rows);
  });
  on('export:everything', async () => {
    const u = needAuth(ctx);
    if (!can(u, 'reports', 'admin')) throw new Error('forbidden');
    const db = getDb();
    const sheets = [
      { name: 'Students', columns: [{ header: 'Admission no.', key: 'admission_no' }, { header: 'Name', key: 'name' }, { header: 'Class', key: 'class_name' }, { header: 'Section', key: 'section' }, { header: 'Status', key: 'status' }],
        rows: db.prepare('SELECT admission_no, name, class_name, section, status FROM students WHERE is_deleted = 0').all() as Record<string, unknown>[] },
      { name: 'Receipts', columns: [{ header: 'Receipt no.', key: 'receipt_no' }, { header: 'Date', key: 'date' }, { header: 'Total', key: 'total' }, { header: 'Mode', key: 'mode' }, { header: 'Status', key: 'status' }],
        rows: db.prepare('SELECT receipt_no, date, total, mode, status FROM receipts').all() as Record<string, unknown>[] },
      { name: 'Staff', columns: [{ header: 'Code', key: 'employee_code' }, { header: 'Name', key: 'name' }, { header: 'Designation', key: 'designation' }],
        rows: db.prepare('SELECT employee_code, name, designation FROM staff WHERE is_deleted = 0').all() as Record<string, unknown>[] },
    ];
    return exportEverything(sheets);
  });

  // ---- Milestone 3: exams ----
  on('exams:list', ({ sessionId }) => { needAuth(ctx); return listExams(sessionId); });
  on('exams:create', async ({ name, term, sessionId, classes }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createExam({ name, term, session_id: sessionId, classes }, u) };
  });
  on('exams:subjects:list', ({ examId }) => { needAuth(ctx); return listExamSubjects(examId); });
  on('exams:subjects:used', ({ className }) => { needAuth(ctx); return listUsedSubjects(className); });
  on('exams:subjects:save', async ({ examId, subjects }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    saveExamSubjects(examId, subjects, u);
    return { ok: true as const };
  });
  on('exams:subjects:update', async ({ id, subject, max_marks, pass_marks, weightage }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    updateExamSubject(id, { subject, max_marks, pass_marks, weightage }, u);
    return { ok: true as const };
  });
  on('exams:subjects:delete', async ({ id }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    deleteExamSubject(id, u);
    return { ok: true as const };
  });
  on('exams:datesheet:list', ({ examId }) => { needAuth(ctx); return listDatesheet(examId); });
  on('exams:datesheet:save', async ({ examId, className, rows }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    const { clashes } = saveDatesheet(examId, className, rows, u);
    return { ok: true as const, clashes };
  });
  on('exams:marks:get', ({ examId, subject, className }) => { needAuth(ctx); return getMarks(examId, subject, className); });
  on('exams:marks:save', async ({ examId, subject, className, entries }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'edit')) throw new Error('forbidden');
    const { rejected } = saveMarks(examId, subject, className, entries, u);
    return { ok: true as const, rejected };
  });
  on('exams:results', ({ examId, className }) => { needAuth(ctx); return computeResults(examId, className); });
  on('exams:lock', async ({ examId }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'admin')) throw new Error('forbidden');
    lockExam(examId, u);
    return { ok: true as const };
  });
  on('exams:unlock', async ({ examId, adminPassword }) => {
    const u = needWritable(ctx);
    if (!can(u, 'exams', 'admin')) throw new Error('forbidden');
    verifyAdminPassword(ctx, adminPassword);
    unlockExam(examId, u);
    return { ok: true as const };
  });
  on('exams:analysis', ({ examId, className }) => { needAuth(ctx); return resultAnalysis(examId, className); });

  // ---- Milestone 3: cards ----
  on('cards:templates:list', ({ kind }) => { needAuth(ctx); return listTemplates(kind); });
  on('cards:templates:save', async ({ kind, name, className, config, makeDefault }) => {
    const u = needWritable(ctx);
    if (!can(u, 'cards', 'admin')) throw new Error('forbidden');
    return { ok: true as const, id: saveTemplate(kind, name, className, config, makeDefault, u) };
  });
  on('gatepass:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'cards', 'edit')) throw new Error('forbidden');
    const r = createGatepass(input, u);
    return { ok: true as const, ...r };
  });
  on('gatepass:list', () => { needAuth(ctx); return listGatepasses() as never; });

  // ---- Milestone 4: staff & payroll ----
  on('staff:full:list', () => { needAuth(ctx); return listStaffFull(); });
  on('staff:full:get', ({ id }) => { needAuth(ctx); return getStaff(id); });
  on('staff:full:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createStaff(input, u) };
  });
  on('staff:full:update', async ({ id, patch }) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'edit')) throw new Error('forbidden');
    updateStaff(id, patch, u);
    return { ok: true as const };
  });
  on('staff:salary:save', async ({ staffId, components }) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'admin')) throw new Error('forbidden');
    saveSalaryStructure(staffId, components, u);
    return { ok: true as const };
  });
  on('payroll:run', async ({ month }) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'admin')) throw new Error('forbidden');
    const { runId, lines } = runPayroll(month, u);
    return { ok: true as const, runId, lines };
  });
  on('payroll:get', ({ month }) => {
    needAuth(ctx);
    const run = getPayrollRun(month);
    return { run, lines: run ? getPayrollLines(run.id) : [] };
  });
  on('payroll:adjust', async ({ lineId, arrears, bonus }) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'admin')) throw new Error('forbidden');
    adjustPayrollLine(lineId, arrears, bonus, u);
    return { ok: true as const };
  });
  on('payroll:finalize', async ({ runId }) => {
    const u = needWritable(ctx);
    if (!can(u, 'staff', 'admin')) throw new Error('forbidden');
    const count = finalizePayroll(runId, u);
    return { ok: true as const, count };
  });

  // ---- Milestone 4: accounting ----
  on('vouchers:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'accounting', 'edit')) throw new Error('forbidden');
    const r = createVoucher(input, u);
    return { ok: true as const, ...r };
  });
  on('vouchers:list', (f) => { needAuth(ctx); return listVouchers(f); });
  on('accounting:incomeExpense', ({ from, to }) => { needAuth(ctx); return incomeExpense(from, to); });
  on('accounting:ledgerStatement', ({ ledgerName, from, to }) => { needAuth(ctx); return ledgerStatement(ledgerName, from, to); });
  on('expenses:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'accounting', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createExpense(input, u) };
  });
  on('expenses:list', ({ status }) => { needAuth(ctx); return listExpenses(status) as never; });
  on('expenses:decide', async ({ id, approve }) => {
    const u = needWritable(ctx);
    if (!can(u, 'accounting', 'admin')) throw new Error('forbidden');
    decideExpense(id, approve, u);
    return { ok: true as const };
  });
  on('pettycash:get', ({ date }) => { needAuth(ctx); return getPettyCash(date); });
  on('pettycash:save', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'accounting', 'edit')) throw new Error('forbidden');
    savePettyCash(input, u);
    return { ok: true as const };
  });
  on('accounting:tallyExport', async ({ from, to }) => {
    const u = needAuth(ctx);
    if (!can(u, 'accounting', 'print')) throw new Error('forbidden');
    const xml = tallyExport(from, to);
    const fileName = `tally-export-${from}-${to}.xml`;
    if (ctx.webMode) {
      // Browser download instead of a native save dialog.
      return {
        ok: true as const,
        fileName,
        mime: 'text/xml',
        dataBase64: Buffer.from(xml, 'utf8').toString('base64'),
      };
    }
    // Save via dialog in main (same pattern as Excel export)
    const { dialog: dlg, BrowserWindow: BW } = await import('electron');
    const win = BW.getFocusedWindow();
    const r = await dlg.showSaveDialog(win ?? undefined as never, {
      title: 'Tally export (XML)',
      defaultPath: fileName,
      filters: [{ name: 'Tally XML', extensions: ['xml'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false as const, error: 'cancelled' };
    const { default: fs } = await import('node:fs');
    fs.writeFileSync(r.filePath, xml, 'utf8');
    return { ok: true as const, filePath: r.filePath };
  });

  // ---- Milestone 4: inventory ----
  on('items:list', () => { needAuth(ctx); return listItems(); });
  on('items:save', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'inventory', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: saveItem(input, u) };
  });
  on('inventory:purchase', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'inventory', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createPurchase(input, u) };
  });
  on('inventory:issue', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'inventory', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createIssue(input, u) };
  });
  on('inventory:lowStock', () => { needAuth(ctx); return lowStock(); });
  on('inventory:valuation', () => { needAuth(ctx); return stockValuation(); });
  on('assets:list', () => { needAuth(ctx); return listAssets(); });
  on('assets:save', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'inventory', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: saveAsset(input, u) };
  });
  on('assets:warrantyExpiring', ({ days }) => { needAuth(ctx); return warrantyExpiring(days); });

  // ---- Milestone 5: front office ----
  on('enquiries:list', (f) => { needAuth(ctx); return listEnquiries(f); });
  on('enquiries:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createEnquiry(input, u) };
  });
  on('enquiries:followup', async ({ id, outcome, notes, nextDate }) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    logFollowup(id, outcome, notes, nextDate, u);
    return { ok: true as const };
  });
  on('enquiries:convert', async ({ id, className, section }) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    const r = convertEnquiry(id, className, section, u);
    return { ok: true as const, ...r };
  });
  on('enquiries:lost', async ({ id }) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    markEnquiryLost(id, u);
    return { ok: true as const };
  });
  on('frontoffice:conversionReport', () => { needAuth(ctx); return conversionReport(); });
  on('visitors:list', ({ date }) => { needAuth(ctx); return listVisitors(date) as never; });
  on('visitors:log', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: logVisitor(input, u) };
  });
  on('visitors:out', async ({ id, outTime }) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    visitorOut(id, outTime, u);
    return { ok: true as const };
  });
  on('complaints:list', ({ status }) => { needAuth(ctx); return listComplaints(status) as never; });
  on('complaints:create', async (input) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: createComplaint(input, u) };
  });
  on('complaints:status', async ({ id, status, notes }) => {
    const u = needWritable(ctx);
    if (!can(u, 'frontoffice', 'edit')) throw new Error('forbidden');
    setComplaintStatus(id, status, notes, u);
    return { ok: true as const };
  });

  // ---- Add-ons: transport + library (license-flag-gated) ----
  const needAddon = (key: 'transport' | 'library') => {
    const lic = licenseStatus({ demoBuild: ctx.demoBuild, installJsonPath: ctx.paths.installJson });
    if (!lic.addons?.[key]) throw new Error('addon-not-licensed');
  };
  on('transport:vehicles', () => { needAuth(ctx); needAddon('transport'); return listVehicles(); });
  on('transport:saveVehicle', async (v) => {
    const u = needWritable(ctx); needAddon('transport');
    if (!can(u, 'transport', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: saveVehicle(v) };
  });
  on('transport:routes', () => { needAuth(ctx); needAddon('transport'); return listRoutes(); });
  on('transport:saveRoute', async (r) => {
    const u = needWritable(ctx); needAddon('transport');
    if (!can(u, 'transport', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: saveRoute(r) };
  });
  on('transport:stops', ({ routeId }) => { needAuth(ctx); needAddon('transport'); return listStops(routeId); });
  on('transport:saveStops', async ({ routeId, stops }) => {
    const u = needWritable(ctx); needAddon('transport');
    if (!can(u, 'transport', 'edit')) throw new Error('forbidden');
    saveStops(routeId, stops);
    return { ok: true as const };
  });
  on('transport:allocations', ({ session }) => { needAuth(ctx); needAddon('transport'); return listAllocations(session) as never; });
  on('transport:allocate', async ({ studentId, routeId, stopId, session }) => {
    const u = needWritable(ctx); needAddon('transport');
    if (!can(u, 'transport', 'edit')) throw new Error('forbidden');
    allocate(studentId, routeId, stopId ?? null, session);
    return { ok: true as const };
  });
  on('transport:strength', ({ session }) => { needAuth(ctx); needAddon('transport'); return routeStrength(session); });
  on('library:books', ({ q }) => { needAuth(ctx); needAddon('library'); return listBooks(q ?? ''); });
  on('library:saveBook', async (b) => {
    const u = needWritable(ctx); needAddon('library');
    if (!can(u, 'library', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: saveBook(b) };
  });
  on('library:deleteBook', async ({ id }) => {
    const u = needWritable(ctx); needAddon('library');
    if (!can(u, 'library', 'edit')) throw new Error('forbidden');
    deleteBook(id);
    return { ok: true as const };
  });
  on('library:issue', async ({ bookId, memberType, memberId, dueDays }) => {
    const u = needWritable(ctx); needAddon('library');
    if (!can(u, 'library', 'edit')) throw new Error('forbidden');
    return { ok: true as const, id: issueBook(bookId, memberType, memberId, dueDays ?? 14) };
  });
  on('library:return', async ({ loanId }) => {
    const u = needWritable(ctx); needAddon('library');
    if (!can(u, 'library', 'edit')) throw new Error('forbidden');
    return { ok: true as const, fine: returnBook(loanId) };
  });
  on('library:openLoans', () => { needAuth(ctx); needAddon('library'); return openLoans() as never; });
  on('library:overdue', () => { needAuth(ctx); needAddon('library'); return overdueLoans() as never; });
  on('library:stats', () => { needAuth(ctx); needAddon('library'); return libraryStats(); });

  // ---- Milestone 5: analytics ----
  on('analytics:kpis', () => { needAuth(ctx); return getKpis(); });
  on('analytics:feeTrend', () => { needAuth(ctx); return feeTrend(); });
  on('analytics:admissionsTrend', () => { needAuth(ctx); return admissionsTrend(); });
  on('analytics:classStrength', () => { needAuth(ctx); return classStrength(); });
  on('analytics:expenseTrend', () => { needAuth(ctx); return expenseTrend(); });
  on('analytics:alerts', () => { needAuth(ctx); return smartAlerts(); });
  on('analytics:birthdays', () => { needAuth(ctx); return birthdays(); });

  // Native dialogs (used by license activation + logo upload + backup restore).
  // Electron only: the web demo uses a browser file picker instead (see webPickFile).
  if (!ctx.webMode) {
    ipcMain.handle('dialog:openFile', async (_e, opts: { title: string; filters: { name: string; extensions: string[] }[] }) => {
      const win = BrowserWindow.getFocusedWindow();
      const options = { title: opts.title, filters: opts.filters, properties: ['openFile' as const] };
      const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return r.canceled ? null : r.filePaths[0];
    });
    ipcMain.handle('dialog:openExternal', async (_e, url: string) => { await shell.openExternal(url); });
  }
}

/** Electron transport: wire the shared handler table to ipcMain. */
export function registerIpc(ctx: AppContext): void {
  const on: IpcOn = (channel, handler) => {
    ipcMain.handle(channel, async (_e, req) => {
      try {
        return await handler(req, ctx);
      } catch (e) {
        return ipcErrorPayload(e) as never;
      }
    });
  };
  buildIpcHandlers(on, ctx);
}

function licenseStatusSafe(ctx: AppContext) {
  try {
    return licenseStatus({ demoBuild: ctx.demoBuild, installJsonPath: ctx.paths.installJson });
  } catch {
    return licenseStatus({ demoBuild: ctx.demoBuild, installJsonPath: ctx.paths.installJson });
  }
}

// Re-export for main.ts convenience
export { nextNumber };
