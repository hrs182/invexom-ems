import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptFile, secureWipe, withFileRetry } from './secure-store.js';

/**
 * SQLite data layer (better-sqlite3, WAL mode).
 * - One database file per institution, encrypted at rest by secure-store.ts.
 * - Versioned migrations in ./migrations/*.sql, tracked in schema_migrations.
 * - Installer upgrades auto-migrate with a pre-migration safety backup.
 * - All writes that allocate document numbers run inside transactions (BR-01).
 */

export type Db = Database.Database;

let db: Db | null = null;
let dbPath = '';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDatabase(workingDbPath: string): Db {
  closeDatabase();
  dbPath = workingDbPath;
  // Retry: Windows AV can briefly lock the file right after decrypt/wipe.
  const d = withFileRetry(() => new Database(workingDbPath));
  // Crash safety: WAL + synchronous NORMAL is the recommended durable combo.
  d.pragma('journal_mode = WAL');
  d.pragma('synchronous = NORMAL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  db = d;
  runMigrations(d);
  return d;
}

export function getDb(): Db {
  if (!db) throw new Error('database-not-open');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
  dbPath = '';
}

export function databaseFilePath(): string {
  return dbPath;
}

/** Run pending migrations in filename order; record each in schema_migrations. */
export function runMigrations(d: Db): { applied: number; fromVersion: number; toVersion: number } {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set<number>(
    (d.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  const fromVersion = applied.size === 0 ? 0 : Math.max(...applied);
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const txn = d.transaction(() => {
      d.exec(sql);
      d.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, file);
    });
    txn();
    count++;
  }
  const toVersion = Math.max(fromVersion, ...[...applied, ...files.map((f) => parseInt(f.split('_')[0], 10))].filter((v) => !Number.isNaN(v)), 0);
  return { applied: count, fromVersion, toVersion };
}

export function schemaVersion(d?: Db): number {
  const database = d ?? getDb();
  try {
    const row = database.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
    return row?.v ?? 0;
  } catch { return 0; }
}

/** PRAGMA integrity_check for the Diagnostics screen. */
export function integrityCheck(): { ok: boolean; detail: string } {  try {
    const rows = getDb().prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
    return { ok, detail: ok ? 'ok' : rows.map((r) => r.integrity_check).join('; ') };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Session working files — the reliable replacement for a fixed working copy.
 *
 * Each app launch decrypts the vault to a UNIQUE file
 * (working/session-<pid>-<timestamp>.db) instead of a fixed
 * working/invexom-ems.db. Why this matters on Windows: the OS refuses to
 * rename/replace a file that any process still has open (EPERM) — an
 * antivirus scan, a lingering previous process, or a SQLite viewer could
 * wedge the entire app when every launch fights over one fixed path.
 * Unique session files never collide, so there is nothing to replace and
 * EPERM-on-rename disappears as a failure class. Stale sessions are swept
 * (best-effort) once the new session is open.
 */
const SESSION_PREFIX = 'session-';
/** Fixed working copy used by pre-session versions — a recovery candidate, then swept. */
const LEGACY_WORKING = 'invexom-ems.db';
/** Sweep spares files touched very recently — they may belong to a live process. */
const SWEEP_GRACE_MS = 120_000;

let sessionSeq = 0;
export function newSessionDbPath(workingDir: string): string {
  // pid + timestamp + per-process counter + random: unique even for two
  // calls in the same millisecond (the test caught a same-ms collision).
  sessionSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join(workingDir, `${SESSION_PREFIX}${process.pid}-${Date.now()}-${sessionSeq}-${rand}.db`);
}

function statMtime(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

/** Session candidates: session-*.db plus the legacy fixed working file. */
function sessionCandidates(workingDir: string): string[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(workingDir);
  } catch {
    return [];
  }
  return files
    .filter((f) => (f.startsWith(SESSION_PREFIX) && f.endsWith('.db')) || f === LEGACY_WORKING)
    .map((f) => path.join(workingDir, f));
}

/**
 * Crash recovery: the newest session file newer than the encrypted snapshot
 * is the freshest copy (the app was killed mid-session). Returns null when
 * there is nothing usable to recover.
 */
export function findCrashSession(workingDir: string, dbEnc: string): string | null {
  const encMtime = fs.existsSync(dbEnc) ? statMtime(dbEnc) : 0;
  let best: string | null = null;
  let bestMtime = encMtime ?? 0;
  for (const f of sessionCandidates(workingDir)) {
    const m = statMtime(f);
    if (m !== null && m > bestMtime) {
      bestMtime = m;
      best = f;
    }
  }
  return best;
}

/**
 * Best-effort cleanup of stale session files. Locked or very recently
 * touched files are left alone for a later boot — never force-delete
 * something another live process might be using.
 */
export function sweepStaleSessions(workingDir: string, keepPath?: string): void {
  const now = Date.now();
  const keep = keepPath ? path.resolve(keepPath) : '';
  for (const f of sessionCandidates(workingDir)) {
    if (path.resolve(f) === keep) continue;
    const m = statMtime(f);
    if (m !== null && now - m < SWEEP_GRACE_MS) continue;
    try {
      fs.unlinkSync(`${f}-wal`);
    } catch { /* ignore */ }
    try {
      fs.unlinkSync(`${f}-shm`);
    } catch { /* ignore */ }
    try {
      secureWipe(f);
    } catch { /* locked — leave it for the next boot */ }
  }
}

function dropStaleWal(dbFile: string): void {
  try {
    fs.unlinkSync(`${dbFile}-wal`);
  } catch { /* ignore */ }
  try {
    fs.unlinkSync(`${dbFile}-shm`);
  } catch { /* ignore */ }
}

function isSqliteError(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  const raw = e instanceof Error ? e.message : String(e ?? '');
  return (typeof code === 'string' && code.startsWith('SQLITE_')) || /SQLITE_[A-Z_]+/.test(raw);
}

/**
 * Open the vault database with self-healing (used by login + setup).
 *
 * - 'fresh':    no vault snapshot exists (first-time setup) — better-sqlite3
 *               creates a brand-new session file.
 * - 'recover':  a session file newer than the snapshot survived a crash —
 *               it is opened as-is (WAL replay); if it turns out unreadable
 *               AND a snapshot exists, we fall back to the last-good snapshot
 *               instead of hard-failing the login.
 * - 'decrypt':  normal unlock — the snapshot is decrypted to a unique
 *               session file. No fixed path is ever replaced, so a stale
 *               lock from another process cannot wedge the login.
 */
export function openVaultDatabase(dataKey: Buffer, workingDir: string, dbEnc: string): void {
  fs.mkdirSync(workingDir, { recursive: true });
  const openFresh = (p: string) => {
    closeDatabase();
    dropStaleWal(p);
    openDatabase(p);
  };

  // 1. Crash recovery.
  const crash = findCrashSession(workingDir, dbEnc);
  if (crash) {
    try {
      openFresh(crash);
      sweepStaleSessions(workingDir, crash);
      return;
    } catch (e) {
      if (!isSqliteError(e) || !fs.existsSync(dbEnc)) throw e;
      // Corrupt crash copy — fall through and decrypt the last-good snapshot.
    }
  }

  // 2. Fresh install: nothing to decrypt.
  if (!fs.existsSync(dbEnc)) {
    const fresh = newSessionDbPath(workingDir);
    openFresh(fresh);
    sweepStaleSessions(workingDir, fresh);
    return;
  }

  // 3. Normal unlock: decrypt to a unique session file.
  const session = newSessionDbPath(workingDir);
  decryptFile(dataKey, dbEnc, session);
  openFresh(session);
  sweepStaleSessions(workingDir, session);
}
