import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findCrashSession,
  newSessionDbPath,
  openVaultDatabase,
  openDatabase,
  closeDatabase,
  getDb,
  databaseFilePath,
  sweepStaleSessions,
} from '../electron/services/database';
import { createVault, decryptFile, encryptFile, secureWipe } from '../electron/services/secure-store';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ems-session-'));

describe('session working files', () => {
  let dir: string;
  let workingDir: string;
  beforeEach(() => {
    closeDatabase();
    dir = tmp();
    workingDir = path.join(dir, 'working');
    fs.mkdirSync(workingDir, { recursive: true });
  });
  const dbEnc = () => path.join(dir, 'invexom-ems.db.enc');
  const keymeta = () => path.join(dir, 'keymeta.json');

  /** Build a healthy vault: real DB -> encrypted snapshot. Returns the data key. */
  function makeHealthyVault() {
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    const seedDb = path.join(workingDir, 'seed.db');
    openDatabase(seedDb);
    getDb().prepare("INSERT INTO masters (kind, name) VALUES ('fee-head', 'Tuition Fee')").run();
    closeDatabase();
    encryptFile(key, seedDb, dbEnc());
    fs.unlinkSync(seedDb);
    return key;
  }

  it('newSessionDbPath is unique per call (no fixed path to fight over)', () => {
    const a = newSessionDbPath(workingDir);
    const b = newSessionDbPath(workingDir);
    expect(a).not.toBe(b);
    expect(path.dirname(a)).toBe(workingDir);
    expect(path.basename(a)).toMatch(/^session-\d+-\d+-\d+-[a-z0-9]+\.db$/);
  });

  it('findCrashSession returns null when there is nothing to recover', () => {
    expect(findCrashSession(workingDir, dbEnc())).toBeNull();
  });

  it('findCrashSession ignores sessions older than the snapshot', () => {
    const key = makeHealthyVault();
    const s = newSessionDbPath(workingDir);
    decryptTo(key, dbEnc(), s);
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(s, past, past); // older than the snapshot
    expect(findCrashSession(workingDir, dbEnc())).toBeNull();
  });

  it('findCrashSession picks the newest session newer than the snapshot', () => {
    const key = makeHealthyVault();
    const oldS = newSessionDbPath(workingDir);
    decryptTo(key, dbEnc(), oldS);
    // Backdate the snapshot and the older session so ordering is deterministic
    // (filesystem mtime granularity can tie two files created in the same ms).
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(dbEnc(), past, past);
    fs.utimesSync(oldS, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    const newS = newSessionDbPath(workingDir);
    decryptTo(key, dbEnc(), newS);
    expect(findCrashSession(workingDir, dbEnc())).toBe(newS);
  });

  it('findCrashSession considers the legacy fixed working file (migration)', () => {
    const key = makeHealthyVault();
    const legacy = path.join(workingDir, 'invexom-ems.db');
    decryptTo(key, dbEnc(), legacy);
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(dbEnc(), past, past);
    expect(findCrashSession(workingDir, dbEnc())).toBe(legacy);
  });

  it('fresh install: creates and opens a brand-new session file (never decrypts)', () => {
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    expect(() => openVaultDatabase(key, workingDir, dbEnc())).not.toThrow();
    const p = databaseFilePath();
    expect(p).toMatch(/session-.*\.db$/);
    expect(fs.existsSync(p)).toBe(true);
    closeDatabase();
  });

  it('normal unlock: decrypts to a unique session file every time', () => {
    const key = makeHealthyVault();
    openVaultDatabase(key, workingDir, dbEnc());
    const first = databaseFilePath();
    // Simulate a real lock cycle: re-encrypt (dbEnc becomes newest), wipe session.
    encryptFile(key, first, dbEnc());
    closeDatabase();
    secureWipe(first);
    openVaultDatabase(key, workingDir, dbEnc());
    const second = databaseFilePath();
    // Two launches, two files — nothing is ever renamed over an existing file.
    expect(first).not.toBe(second);
    const rows = getDb().prepare("SELECT name FROM masters WHERE kind = 'fee-head'").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Tuition Fee']);
    closeDatabase();
  });

  it('crash recovery: reuses the surviving session without needing decrypt', () => {
    const key = makeHealthyVault();
    // Simulate a killed session: session file newer than the snapshot.
    const s = newSessionDbPath(workingDir);
    decryptTo(key, dbEnc(), s);
    openDatabase(s);
    getDb().prepare("INSERT INTO masters (kind, name) VALUES ('fee-head', 'Crash Data')").run();
    closeDatabase();
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(s, future, future);
    // Even with a WRONG key the crash copy opens (it is plaintext) — proves
    // no decrypt/replace happened on this path.
    const wrongKey = Buffer.alloc(32, 7);
    expect(() => openVaultDatabase(wrongKey, workingDir, dbEnc())).not.toThrow();
    expect(databaseFilePath()).toBe(s);
    const rows = getDb().prepare("SELECT name FROM masters WHERE kind = 'fee-head'").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toContain('Crash Data');
    closeDatabase();
  });

  it('falls back to the snapshot when the crash copy is corrupt', () => {
    const key = makeHealthyVault();
    const s = newSessionDbPath(workingDir);
    fs.writeFileSync(s, Buffer.from('this is not a sqlite database'));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(s, future, future);
    expect(() => openVaultDatabase(key, workingDir, dbEnc())).not.toThrow();
    // Opened a FRESH session decrypted from the snapshot, not the garbage file.
    expect(databaseFilePath()).not.toBe(s);
    const rows = getDb().prepare("SELECT name FROM masters WHERE kind = 'fee-head'").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Tuition Fee']);
    closeDatabase();
  });

  it('still throws when the vault snapshot itself is unusable', () => {
    makeHealthyVault();
    const wrongKey = Buffer.alloc(32, 7);
    expect(() => openVaultDatabase(wrongKey, workingDir, dbEnc())).toThrow();
    closeDatabase();
  });

  it('sweepStaleSessions removes old sessions, keeps the live one, spares recent ones', () => {
    const keep = newSessionDbPath(workingDir);
    fs.writeFileSync(keep, 'live');
    const old1 = newSessionDbPath(workingDir);
    fs.writeFileSync(old1, 'stale');
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(old1, past, past);
    const recent = newSessionDbPath(workingDir);
    fs.writeFileSync(recent, 'recent'); // touched just now — spared
    sweepStaleSessions(workingDir, keep);
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(old1)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
  });

  it('sweepStaleSessions also removes the legacy fixed working file', () => {
    const legacy = path.join(workingDir, 'invexom-ems.db');
    fs.writeFileSync(legacy, 'legacy');
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(legacy, past, past);
    sweepStaleSessions(workingDir);
    expect(fs.existsSync(legacy)).toBe(false);
  });

  // Helper: decrypt the snapshot to a chosen path.
  function decryptTo(key: Buffer, enc: string, out: string) {
    decryptFile(key, enc, out);
  }
});
