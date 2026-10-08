import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptFile, withFileRetry } from './secure-store.js';

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
 * How the encrypted vault should be opened. Pure and unit-tested.
 *
 * - 'use-working': crash recovery — a surviving working file newer than the
 *   encrypted snapshot wins (WAL replay), so no data is lost.
 * - 'decrypt':     a vault snapshot exists — decrypt it to the working file.
 * - 'fresh':       no vault exists yet (first-time setup). There is nothing
 *                  to decrypt; better-sqlite3 creates the file on open.
 *                  (Previously this case fell through to decryptFile and
 *                  crashed with ENOENT on the missing .db.enc file.)
 */
export type VaultOpenStrategy = 'use-working' | 'decrypt' | 'fresh';

export function vaultOpenStrategy(workingDb: string, dbEnc: string): VaultOpenStrategy {
  const workingExists = fs.existsSync(workingDb);
  const encExists = fs.existsSync(dbEnc);
  if (workingExists && encExists) {
    try {
      if (fs.statSync(workingDb).mtimeMs > fs.statSync(dbEnc).mtimeMs) return 'use-working';
    } catch {
      /* fall through to decrypt */
    }
  }
  if (encExists) return 'decrypt';
  return 'fresh';
}

/**
 * Open the vault database with self-healing (used by login + setup).
 *
 * - 'fresh': nothing to decrypt; better-sqlite3 creates the file.
 * - 'decrypt': stale -wal/-shm from a crashed session are dropped first —
 *   opening a freshly decrypted file with a stale WAL throws SQLITE_CORRUPT.
 * - 'use-working': the working copy is opened as-is; if it turns out to be
 *   unreadable (torn write, garbage) AND a vault snapshot exists, we fall
 *   back to the last known-good snapshot instead of hard-failing the login.
 *   The corrupt working file is replaced atomically — never wiped blindly.
 */
export function openVaultDatabase(dataKey: Buffer, workingDb: string, dbEnc: string): void {
  const strategy = vaultOpenStrategy(workingDb, dbEnc);
  const dropStaleWal = () => {
    try { fs.unlinkSync(workingDb + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(workingDb + '-shm'); } catch { /* ignore */ }
  };
  if (strategy === 'decrypt') {
    dropStaleWal();
    decryptFile(dataKey, dbEnc, workingDb);
  }
  try {
    openDatabase(workingDb);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    const raw = e instanceof Error ? e.message : String(e ?? '');
    const looksCorrupt =
      (typeof code === 'string' && code.startsWith('SQLITE_')) || /SQLITE_[A-Z_]+/.test(raw);
    if (looksCorrupt && strategy !== 'decrypt' && fs.existsSync(dbEnc)) {
      dropStaleWal();
      decryptFile(dataKey, dbEnc, workingDb);
      openDatabase(workingDb);
      return;
    }
    throw e;
  }
}
