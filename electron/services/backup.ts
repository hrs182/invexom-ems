import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDatabase } from './database.js';
import type { BackupEntry } from '../../shared/types.js';
import { decryptFile, encryptFile, secureWipe } from './secure-store.js';

/**
 * Smart backup & restore (FLOW-12, FR-BKP-01..03).
 * - Backs up the ENCRYPTED .enc file, so backups stay encrypted at rest.
 * - Daily auto-backup at a configurable time + optional USB mirror.
 * - Rotation: keeps last N (default 30), deletes older.
 * - Restore: takes a safety snapshot of current data first, then restores.
 */

export interface BackupConfig { enabled: boolean; time: string; keepLast: number; usbPath: string }

const DEFAULT_CONFIG: BackupConfig = { enabled: true, time: '20:00', keepLast: 30, usbPath: '' };

export function getBackupConfig(): BackupConfig {
  try {
    const row = getDb().prepare("SELECT value FROM app_rules WHERE key = 'backup.config'").get() as { value: string } | undefined;
    if (row) return { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<BackupConfig>) };
  } catch { /* not set up yet */ }
  return { ...DEFAULT_CONFIG };
}

export function setBackupConfig(cfg: BackupConfig): void {
  getDb().prepare(
    "INSERT INTO app_rules (key, value) VALUES ('backup.config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
  ).run(JSON.stringify(cfg));
}

function stampName(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.db.enc`;
}

/**
 * Run a backup of the encrypted DB file. Must be called with the DB flushed:
 * we checkpoint WAL, then copy the .enc snapshot (re-encrypt current state).
 */
export function runBackup(
  paths: { dbEnc: string; backupsDir: string; workingDb: string },
  dataKey: Buffer,
  triggeredBy: 'auto' | 'manual' | 'pre-migration' | 'pre-restore',
): { ok: true; path: string } | { ok: false; error: string } {
  try {
    fs.mkdirSync(paths.backupsDir, { recursive: true });
    // Flush current working state into the encrypted snapshot first.
    const db = getDb();
    db.pragma('wal_checkpoint(TRUNCATE)');
    encryptFile(dataKey, paths.workingDb, paths.dbEnc);

    const cfg = getBackupConfig();
    const fileName = stampName('invexom-ems-backup');
    const dest = path.join(paths.backupsDir, fileName);
    fs.copyFileSync(paths.dbEnc, dest);

    // Optional USB mirror (only if the configured path exists right now).
    if (cfg.usbPath) {
      try {
        if (fs.existsSync(cfg.usbPath) && fs.statSync(cfg.usbPath).isDirectory()) {
          fs.copyFileSync(paths.dbEnc, path.join(cfg.usbPath, fileName));
        }
      } catch { /* USB mirror is best-effort */ }
    }

    const size = fs.statSync(dest).size;
    getDb().prepare(
      'INSERT INTO backup_log (file_name, path, size_bytes, triggered_by, status) VALUES (?, ?, ?, ?, ?)',
    ).run(fileName, dest, size, triggeredBy, 'ok');

    rotateBackups(paths.backupsDir, cfg.keepLast);
    return { ok: true, path: dest };
  } catch (e) {
    try {
      getDb().prepare('INSERT INTO backup_log (file_name, path, size_bytes, triggered_by, status) VALUES (?, ?, ?, ?, ?)')
        .run('', '', 0, triggeredBy, 'failed');
    } catch { /* ignore */ }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function rotateBackups(backupsDir: string, keepLast: number): void {
  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db.enc'))
    .map((f) => ({ f, t: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const extra of files.slice(Math.max(keepLast, 1))) {
    try { fs.unlinkSync(path.join(backupsDir, extra.f)); } catch { /* ignore */ }
  }
}

export function listBackups(): BackupEntry[] {
  try {
    const rows = getDb().prepare(
      'SELECT id, file_name AS fileName, path, size_bytes AS sizeBytes, created_at AS createdAt, triggered_by AS triggeredBy, status FROM backup_log ORDER BY id DESC LIMIT 60',
    ).all() as { id: number; fileName: string; path: string; sizeBytes: number; createdAt: string; triggeredBy: string; status: string }[];
    return rows.map((r) => ({
      ...r,
      triggeredBy: r.triggeredBy as BackupEntry['triggeredBy'],
      status: r.status as BackupEntry['status'],
    }));
  } catch { return []; }
}

/**
 * Restore a backup. Takes a safety snapshot of the CURRENT data first
 * (FR-BKP-03), then swaps in the backup file and re-opens the DB.
 * The caller must relaunch the app window afterwards.
 */
export function restoreBackup(
  backupId: number,
  paths: { dbEnc: string; backupsDir: string; workingDb: string; workingDir: string },
  dataKey: Buffer,
): { ok: true } | { ok: false; error: string } {
  try {
    const row = getDb().prepare('SELECT path FROM backup_log WHERE id = ?').get(backupId) as { path: string } | undefined;
    if (!row || !fs.existsSync(row.path)) return { ok: false, error: 'Backup file not found.' };

    // 1. Safety snapshot of current data.
    const snap = runBackup(paths, dataKey, 'pre-restore');
    if (!snap.ok) return { ok: false, error: `Safety snapshot failed: ${snap.error}` };

    // 2. Close DB, replace encrypted snapshot, re-decrypt to working copy.
    closeDatabase();
    fs.copyFileSync(row.path, paths.dbEnc);
    secureWipe(paths.workingDb);
    decryptFile(dataKey, paths.dbEnc, paths.workingDb);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Backup health for the dashboard dot (FR-BKP-02). */
export function backupHealth(): { lastBackupAt: string | null; overdue: boolean; autoEnabled: boolean; scheduledTime: string } {
  const cfg = getBackupConfig();
  let last: string | null = null;
  try {
    const row = getDb().prepare("SELECT created_at AS c FROM backup_log WHERE status='ok' ORDER BY id DESC LIMIT 1").get() as { c: string } | undefined;
    last = row?.c ?? null;
  } catch { /* ignore */ }
  const overdue = !last || Date.now() - new Date(last).getTime() > 36 * 3600 * 1000;
  return { lastBackupAt: last, overdue, autoEnabled: cfg.enabled, scheduledTime: cfg.time };
}

/** Scheduler tick: call every minute from main; runs the daily backup when due. */
let lastAutoBackupDay = '';
export function schedulerTick(
  paths: { dbEnc: string; backupsDir: string; workingDb: string },
  dataKey: Buffer,
): void {
  const cfg = getBackupConfig();
  if (!cfg.enabled) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastAutoBackupDay === today) return;
  const [hh, mm] = cfg.time.split(':').map(Number);
  if (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)) {
    const r = runBackup(paths, dataKey, 'auto');
    if (r.ok) lastAutoBackupDay = today;
  }
}
