import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createVault, unlockDataKey, addUserWrap, removeUserWrap,
  encryptFile, decryptFile, secureWipe, hashPassword, verifyPassword,
} from '../electron/services/secure-store';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ems-vault-test-'));

describe('secure vault (NFR-S-03)', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  const keymeta = () => path.join(dir, 'keymeta.json');

  it('creates a vault and unlocks with the right password', () => {
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    expect(key.length).toBe(32);
    const back = unlockDataKey(keymeta(), 'ADMIN', 'correct-horse-8'); // case-insensitive user
    expect(back.equals(key)).toBe(true);
  });

  it('rejects wrong passwords and unknown users', () => {
    createVault(keymeta(), 'admin', 'correct-horse-8');
    expect(() => unlockDataKey(keymeta(), 'admin', 'wrong')).toThrow('bad-password');
    expect(() => unlockDataKey(keymeta(), 'nobody', 'x')).toThrow('unknown-user');
  });

  it('supports multiple users via wraps; removing a wrap locks them out', () => {
    const key = createVault(keymeta(), 'admin', 'admin-pass-1');
    addUserWrap(keymeta(), key, 'clerk', 'clerk-pass-2');
    expect(unlockDataKey(keymeta(), 'clerk', 'clerk-pass-2').equals(key)).toBe(true);
    removeUserWrap(keymeta(), 'clerk');
    expect(() => unlockDataKey(keymeta(), 'clerk', 'clerk-pass-2')).toThrow('unknown-user');
    // admin still works
    expect(unlockDataKey(keymeta(), 'admin', 'admin-pass-1').equals(key)).toBe(true);
  });

  it('encrypts/decrypts a file; wrong key fails authentication', () => {
    const key = createVault(keymeta(), 'admin', 'pw-12345678');
    const plain = path.join(dir, 'plain.bin');
    const enc = path.join(dir, 'plain.enc');
    const out = path.join(dir, 'plain.out');
    fs.writeFileSync(plain, Buffer.from('school-data-'.repeat(1000)));
    encryptFile(key, plain, enc);
    expect(fs.readFileSync(enc).includes(Buffer.from('school-data-'))).toBe(false);
    decryptFile(key, enc, out);
    expect(fs.readFileSync(out).equals(fs.readFileSync(plain))).toBe(true);
    const wrong = Buffer.alloc(32, 7);
    expect(() => decryptFile(wrong, enc, out)).toThrow();
  });

  it('secureWipe deletes the file', () => {
    const f = path.join(dir, 'wipe.bin');
    fs.writeFileSync(f, Buffer.alloc(4096, 1));
    secureWipe(f);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('password hashing verifies correctly (timing-safe)', () => {
    const h = hashPassword('my-secret-9');
    expect(verifyPassword('my-secret-9', h)).toBe(true);
    expect(verifyPassword('my-secret-8', h)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });
});
