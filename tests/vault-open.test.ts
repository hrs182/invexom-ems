import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vaultOpenStrategy } from '../electron/services/database';

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
