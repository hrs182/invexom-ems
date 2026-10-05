import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  createVault, unlockDataKey, encryptFile, decryptFile, secureWipe,
} from '../electron/services/secure-store';
import { openDatabase, closeDatabase, getDb, schemaVersion } from '../electron/services/database';
import { nextNumber } from '../electron/services/numbering';

/**
 * End-to-end: encrypted vault -> WAL database -> backup -> restore.
 * Mirrors what main.ts + backup.ts do at runtime (NFR-R-01, FR-BKP-01..03).
 */
describe('vault + database + backup cycle', () => {
  let dir: string;
  let keymeta: string; let dbEnc: string; let workingDb: string; let backupsDir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-cycle-'));
    keymeta = path.join(dir, 'keymeta.json');
    dbEnc = path.join(dir, 'invexom-ems.db.enc');
    workingDb = path.join(dir, 'invexom-ems.db');
    backupsDir = path.join(dir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    closeDatabase();
  });

  function freshDb(dataKey: Buffer) {
    // fresh install: create DB, migrate, seed numbering, snapshot encrypted
    const db = new Database(workingDb);
    db.pragma('journal_mode = WAL');
    closeDatabase();
    openDatabase(workingDb);
    // Schema version tracks the migration count (never hardcode — migrations grow).
    const expected = fs.readdirSync(path.join(process.cwd(), 'electron/services/migrations'))
      .filter((f: string) => f.endsWith('.sql')).length;
    expect(schemaVersion()).toBe(expected);
    getDb().prepare("INSERT INTO numbering (key, label, pattern) VALUES ('receipt','Fee receipt','R-{YYYY}-{SEQ:5}')").run();
    getDb().prepare("INSERT INTO masters (kind, name) VALUES ('class','V')").run();
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    closeDatabase();
    encryptFile(dataKey, workingDb, dbEnc);
    secureWipe(workingDb);
  }

  it('full cycle: setup -> lock -> unlock -> transact -> backup -> corrupt -> restore', () => {
    const dataKey = createVault(keymeta, 'admin', 'admin-pass-9');
    freshDb(dataKey);

    // unlock (login)
    const key = unlockDataKey(keymeta, 'admin', 'admin-pass-9');
    decryptFile(key, dbEnc, workingDb);
    openDatabase(workingDb);

    // transactions allocate gap-free numbers (BR-01)
    const n1 = nextNumber('receipt', new Date(2026, 5, 1));
    const n2 = nextNumber('receipt', new Date(2026, 5, 1));
    expect(n1).toBe('R-2026-00001');
    expect(n2).toBe('R-2026-00002');

    // backup = encrypted snapshot of current state
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    encryptFile(key, workingDb, dbEnc);
    const backupPath = path.join(backupsDir, 'snap.db.enc');
    fs.copyFileSync(dbEnc, backupPath);

    // more writes after backup
    const n3 = nextNumber('receipt', new Date(2026, 5, 1));
    expect(n3).toBe('R-2026-00003');
    getDb().pragma('wal_checkpoint(TRUNCATE)');
    encryptFile(key, workingDb, dbEnc);
    closeDatabase();

    // "disaster": working copy lost; restore from backup
    secureWipe(workingDb);
    fs.copyFileSync(backupPath, dbEnc);
    decryptFile(key, dbEnc, workingDb);
    openDatabase(workingDb);

    // state is exactly the backup point: receipt seq is 2, next is 3
    const row = getDb().prepare("SELECT last_seq FROM numbering WHERE key='receipt'").get() as { last_seq: number };
    expect(row.last_seq).toBe(2);
    expect(nextNumber('receipt', new Date(2026, 5, 1))).toBe('R-2026-00003');
    closeDatabase();
  });

  it('journal mode is WAL (crash safety, NFR-R-01)', () => {
    const dataKey = createVault(keymeta, 'admin', 'admin-pass-9');
    freshDb(dataKey);
    const key = unlockDataKey(keymeta, 'admin', 'admin-pass-9');
    decryptFile(key, dbEnc, workingDb);
    const db = openDatabase(workingDb);
    const mode = db.pragma('journal_mode', { simple: true });
    expect(String(mode).toUpperCase()).toBe('WAL');
    closeDatabase();
  });
});
