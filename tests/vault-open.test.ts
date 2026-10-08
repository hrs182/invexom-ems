import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vaultOpenStrategy, openVaultDatabase, openDatabase, closeDatabase, getDb } from '../electron/services/database';
import { createVault, encryptFile } from '../electron/services/secure-store';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ems-open-strategy-'));

describe('vaultOpenStrategy', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  const workingDb = () => path.join(dir, 'invexom-ems.db');
  const dbEnc = () => path.join(dir, 'invexom-ems.db.enc');

  it('returns fresh when no vault exists (first-time setup) — never decrypt', () => {
    // This is the setup-wizard Step 5 case that used to crash with ENOENT.
    expect(vaultOpenStrategy(workingDb(), dbEnc())).toBe('fresh');
  });

  it('returns decrypt when only the vault snapshot exists', () => {
    fs.writeFileSync(dbEnc(), 'enc');
    expect(vaultOpenStrategy(workingDb(), dbEnc())).toBe('decrypt');
  });

  it('returns use-working when the working file is newer (crash recovery)', () => {
    fs.writeFileSync(dbEnc(), 'enc');
    fs.writeFileSync(workingDb(), 'db');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(dbEnc(), past, past);
    expect(vaultOpenStrategy(workingDb(), dbEnc())).toBe('use-working');
  });

  it('returns decrypt when the snapshot is newer than the working file', () => {
    fs.writeFileSync(workingDb(), 'db');
    fs.writeFileSync(dbEnc(), 'enc');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(workingDb(), past, past);
    expect(vaultOpenStrategy(workingDb(), dbEnc())).toBe('decrypt');
  });

  it('returns fresh (not decrypt) when only a stale working file exists', () => {
    fs.writeFileSync(workingDb(), 'db');
    expect(vaultOpenStrategy(workingDb(), dbEnc())).toBe('fresh');
  });
});

describe('openVaultDatabase self-heal (login database-error regression)', () => {
  let dir: string;
  beforeEach(() => {
    closeDatabase();
    dir = tmp();
  });
  const workingDb = () => path.join(dir, 'invexom-ems.db');
  const dbEnc = () => path.join(dir, 'invexom-ems.db.enc');
  const keymeta = () => path.join(dir, 'keymeta.json');

  /** Build a healthy vault: real DB -> encrypted snapshot. Returns the data key. */
  function makeHealthyVault() {
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    openDatabase(workingDb());
    getDb().prepare("INSERT INTO masters (kind, name) VALUES ('fee-head', 'Tuition Fee')").run();
    closeDatabase();
    encryptFile(key, workingDb(), dbEnc());
    return key;
  }

  it('falls back to the vault snapshot when the working copy is corrupt', () => {
    const key = makeHealthyVault();
    // Simulate a torn working file that is NEWER than the snapshot (crash residue).
    fs.writeFileSync(workingDb(), Buffer.from('this is not a sqlite database'));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(workingDb(), future, future);
    expect(() => openVaultDatabase(key, workingDb(), dbEnc())).not.toThrow();
    // Data from the last good snapshot is intact.
    const rows = getDb().prepare("SELECT name FROM masters WHERE kind = 'fee-head'").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Tuition Fee']);
    closeDatabase();
  });

  it('drops a stale WAL before decrypting (decrypt strategy)', () => {
    const key = makeHealthyVault();
    // Fresh decrypt path: working file removed, but a garbage -wal left behind
    // by a crashed session (this used to throw SQLITE_CORRUPT on login).
    fs.unlinkSync(workingDb());
    fs.writeFileSync(workingDb() + '-wal', Buffer.from('stale wal garbage'));
    expect(() => openVaultDatabase(key, workingDb(), dbEnc())).not.toThrow();
    // The stale garbage WAL must be gone (SQLite recreates a fresh -wal in
    // WAL mode — what matters is the garbage content is not there).
    const walPath = workingDb() + '-wal';
    if (fs.existsSync(walPath)) {
      expect(fs.readFileSync(walPath, 'utf8')).not.toContain('stale wal garbage');
    }
    const n = (getDb().prepare('SELECT COUNT(*) AS n FROM masters').get() as { n: number }).n;
    expect(n).toBeGreaterThan(0);
    closeDatabase();
  });

  it('still throws when the vault snapshot itself is unusable', () => {
    const key = makeHealthyVault();
    fs.writeFileSync(workingDb(), Buffer.from('garbage'));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(workingDb(), future, future);
    // Corrupt the snapshot too (wrong key => GCM auth failure here).
    const wrongKey = Buffer.alloc(32, 7);
    expect(() => openVaultDatabase(wrongKey, workingDb(), dbEnc())).toThrow();
    closeDatabase();
  });
});
