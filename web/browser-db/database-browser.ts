/**
 * Browser database backend (sql.js / SQLite-WASM).
 *
 * Vite aliases `electron/services/database.js` to this file for the
 * VITE_BROWSER_DEMO build, so every service keeps calling getDb() with
 * zero changes. Same SQL, same migrations, same handler code — the only
 * difference is the engine underneath.
 *
 * There are no files here: the "working DB path" is virtual
 * ('/browser/working.db'); the memfs `node:fs` shim serves live
 * db.export() bytes for it (see browser-registry.ts), so the vault
 * ceremony (createVault/encryptFile/decryptFile) runs for real.
 */
import type { Db, DbRunResult, DbStatement } from '../../electron/services/db-types.js';
import { setDbExporter, VIRTUAL_DB_PATH } from './browser-registry.js';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

// Migrations bundled as text (same files the desktop app runs).
import mig001 from '../../electron/services/migrations/001_foundation.sql?raw';
import mig002 from '../../electron/services/migrations/002_core.sql?raw';
import mig003 from '../../electron/services/migrations/003_exams.sql?raw';
import mig004 from '../../electron/services/migrations/004_money.sql?raw';
import mig005 from '../../electron/services/migrations/005_frontoffice.sql?raw';
import mig006 from '../../electron/services/migrations/006_addons.sql?raw';
import mig007 from '../../electron/services/migrations/007_sections.sql?raw';
import mig008 from '../../electron/services/migrations/008_fee_structure.sql?raw';
import mig009 from '../../electron/services/migrations/009_fee_start_month.sql?raw';

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  { version: 1, name: '001_foundation.sql', sql: mig001 },
  { version: 2, name: '002_core.sql', sql: mig002 },
  { version: 3, name: '003_exams.sql', sql: mig003 },
  { version: 4, name: '004_money.sql', sql: mig004 },
  { version: 5, name: '005_frontoffice.sql', sql: mig005 },
  { version: 6, name: '006_addons.sql', sql: mig006 },
  { version: 7, name: '007_sections.sql', sql: mig007 },
  { version: 8, name: '008_fee_structure.sql', sql: mig008 },
  { version: 9, name: '009_fee_start_month.sql', sql: mig009 },
];

class SqlJsStatement implements DbStatement {
  constructor(private raw: any, private sql: string) {}

  /** better-sqlite3 binds undefined as NULL; sql.js rejects it — normalize. */
  private normParams(params: unknown[]): any[] {
    return params.map((p) => (p === undefined ? null : p));
  }

  private queryAll(params: unknown[]): Record<string, any>[] {
    const stmt = this.raw.prepare(this.sql);
    try {
      const ps = this.normParams(params);
      if (ps.length) stmt.bind(ps);
      const rows: Record<string, any>[] = [];
      while (stmt.step()) rows.push({ ...(stmt.getAsObject() as object) });
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(...params: unknown[]): Record<string, any> | undefined {
    const rows = this.queryAll(params);
    return rows.length ? rows[0] : undefined;
  }

  all(...params: unknown[]): Record<string, any>[] {
    return this.queryAll(params);
  }

  run(...params: unknown[]): DbRunResult {
    this.raw.run(this.sql, this.normParams(params));
    const changes = Number(this.raw.getRowsModified()) || 0;
    let lastInsertRowid = 0;
    try {
      const r = this.raw.exec('SELECT last_insert_rowid() AS id');
      lastInsertRowid = Number(r?.[0]?.values?.[0]?.[0]) || 0;
    } catch { /* ignore */ }
    return { changes, lastInsertRowid };
  }
}

class SqlJsDb implements Db {
  private txDepth = 0;

  constructor(private raw: any) {}

  prepare(sql: string): DbStatement {
    return new SqlJsStatement(this.raw, sql);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    const self = this;
    return (...args: any[]) => {
      // Nested transactions -> SAVEPOINTs (better-sqlite3 does the same).
      if (self.txDepth > 0) {
        const sp = `ems_sp_${self.txDepth}_${(Math.random() * 1e9) | 0}`;
        self.txDepth++;
        self.raw.exec(`SAVEPOINT ${sp}`);
        try {
          const r = fn(...args);
          self.raw.exec(`RELEASE ${sp}`);
          return r;
        } catch (e) {
          try { self.raw.exec(`ROLLBACK TO ${sp}`); } catch { /* ignore */ }
          try { self.raw.exec(`RELEASE ${sp}`); } catch { /* ignore */ }
          throw e;
        } finally {
          self.txDepth--;
        }
      }
      self.txDepth++;
      self.raw.exec('BEGIN IMMEDIATE');
      try {
        const r = fn(...args);
        self.raw.exec('COMMIT');
        return r;
      } catch (e) {
        try { self.raw.exec('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally {
        self.txDepth--;
      }
    };
  }

  pragma(s: string): unknown {
    const t = s.trim();
    const m = t.match(/^([A-Za-z_]+)\s*=\s*(.+)$/);
    if (m) {
      this.raw.exec(`PRAGMA ${m[1]}=${m[2]}`);
      return undefined;
    }
    const r = this.raw.exec(`PRAGMA ${t}`);
    return r?.[0]?.values;
  }

  close(): void {
    try { this.raw.close(); } catch { /* ignore */ }
  }

  /** Raw sql.js handle (persistence export). Not part of the Db port. */
  __raw(): any {
    return this.raw;
  }
}

let SQL: any = null;
let db: SqlJsDb | null = null;

async function sqlJs(): Promise<any> {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return SQL;
}

/**
 * Initialize (or re-initialize) the in-memory database. Pass previously
 * exported bytes to restore (IndexedDB persistence across visits).
 */
export async function initBrowserDb(existingBytes?: Uint8Array): Promise<Db> {
  const S = await sqlJs();
  closeDatabase();
  const raw = existingBytes && existingBytes.length ? new S.Database(existingBytes) : new S.Database();
  db = new SqlJsDb(raw);
  setDbExporter(() => raw.export() as Uint8Array);
  runMigrations(db);
  return db;
}

/** Raw bytes of the live database (for IndexedDB persistence). */
export function exportBrowserDb(): Uint8Array | null {
  try {
    return db ? (db.__raw().export() as Uint8Array) : null;
  } catch {
    return null;
  }
}

export function openDatabase(_workingDbPath?: string): Db {
  // Browser flow never opens by path; initBrowserDb() owns creation.
  // Kept for signature compatibility with the Node backend.
  if (!db) throw new Error('database-not-open (call initBrowserDb first)');
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('database-not-open');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}

export function databaseFilePath(): string {
  return VIRTUAL_DB_PATH;
}

/** Session-file vault machinery does not exist in the browser; all noops. */
export function newSessionDbPath(_workingDir: string): string {
  return VIRTUAL_DB_PATH;
}
export function findCrashSession(_workingDir: string, _dbEnc: string): string | null {
  return null;
}
export function sweepStaleSessions(_workingDir: string, _keepPath?: string): void { /* noop */ }

/**
 * Browser "unlock": the live in-memory DB is already open (initBrowserDb ran
 * at boot, optionally restored from IndexedDB). Nothing to decrypt.
 */
export function openVaultDatabase(_dataKey?: unknown, _workingDir?: string, _dbEnc?: string): void {
  if (!db) throw new Error('database-not-open (call initBrowserDb first)');
}

/** Run pending bundled migrations; records in schema_migrations like desktop. */
export function runMigrations(d: Db): { applied: number; fromVersion: number; toVersion: number } {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set<number>(
    (d.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const fromVersion = applied.size === 0 ? 0 : Math.max(...applied);
  let count = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    // sql.js's WASM build has no FTS5 module. The global_search index becomes
    // a plain table with the same columns; the triggers and rebuildSearchIndex
    // keep working unchanged (plain INSERT/DELETE), and the demo's Ctrl+K
    // search runs as LIKE over the same index (see browser-app.ts).
    const sql = m.sql.replace(
      /CREATE VIRTUAL TABLE IF NOT EXISTS global_search USING fts5\(\s*kind, ref_id, title, subtitle, tokens,\s*tokenize\s*=\s*'trigram'\s*\);/,
      'CREATE TABLE IF NOT EXISTS global_search (kind TEXT, ref_id INTEGER, title TEXT, subtitle TEXT, tokens TEXT);',
    );
    const txn = d.transaction(() => {
      d.exec(sql);
      d.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    });
    txn();
    count++;
  }
  const toVersion = Math.max(fromVersion, ...MIGRATIONS.map((m) => m.version), 0);
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
export function integrityCheck(): { ok: boolean; detail: string } {
  try {
    const rows = getDb().prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok';
    return { ok, detail: ok ? 'ok' : rows.map((r) => r.integrity_check).join('; ') };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export type { Db };
export type { DbRunResult, DbStatement } from '../../electron/services/db-types.js';
