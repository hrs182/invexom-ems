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

describe('password recovery via security question', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  const keymeta = () => path.join(dir, 'keymeta.json');

  it('round-trips: answer re-unwraps the same data key', async () => {
    const { setRecoveryInfo, unlockWithRecovery, getRecoveryInfo } =
      await import('../electron/services/secure-store');
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    setRecoveryInfo(keymeta(), key, 'admin', 'secQ2', 'What was the name of your first school?', 'Sunrise Public School');
    const info = getRecoveryInfo(keymeta(), 'ADMIN');
    expect(info?.question).toBe('What was the name of your first school?');
    // Answer normalization: case + surrounding spaces don't matter.
    const back = unlockWithRecovery(keymeta(), 'admin', 'secQ2', '  sunrise public school ');
    expect(back.equals(key)).toBe(true);
  });

  it('rejects wrong answers and unknown recovery', async () => {
    const { setRecoveryInfo, unlockWithRecovery } = await import('../electron/services/secure-store');
    const key = createVault(keymeta(), 'admin', 'correct-horse-8');
    setRecoveryInfo(keymeta(), key, 'admin', 'secQ1', 'Q?', 'Smith');
    expect(() => unlockWithRecovery(keymeta(), 'admin', 'secQ1', 'Jones')).toThrow('bad-answer');
    expect(() => unlockWithRecovery(keymeta(), 'nobody', 'secQ1', 'Smith')).toThrow('no-recovery');
  });

  it('recovery wrap survives a password change (addUserWrap)', async () => {
    const { setRecoveryInfo, unlockWithRecovery } = await import('../electron/services/secure-store');
    const key = createVault(keymeta(), 'admin', 'old-password-1');
    setRecoveryInfo(keymeta(), key, 'admin', 'secQ3', 'Q?', 'Jaipur');
    addUserWrap(keymeta(), key, 'admin', 'new-password-2'); // password change
    // New password works for login...
    expect(unlockDataKey(keymeta(), 'admin', 'new-password-2').equals(key)).toBe(true);
    // ...and recovery still works afterwards.
    expect(unlockWithRecovery(keymeta(), 'admin', 'secQ3', 'jaipur').equals(key)).toBe(true);
  });

  it('recoverySecret is deterministic and normalized', async () => {
    const { recoverySecret } = await import('../electron/services/secure-store');
    expect(recoverySecret('secQ1', '  Smith ')).toBe(recoverySecret('secQ1', 'SMITH'));
    expect(recoverySecret('secQ1', 'Smith')).not.toBe(recoverySecret('secQ2', 'Smith'));
  });
});

describe('withFileRetry (transient Windows locks)', () => {
  it('retries EACCES/EPERM/EBUSY then succeeds', async () => {
    const { withFileRetry } = await import('../electron/services/secure-store');
    let calls = 0;
    const r = withFileRetry(() => {
      calls++;
      if (calls < 3) { const e = new Error('locked') as NodeJS.ErrnoException; e.code = 'EACCES'; throw e; }
      return 'ok';
    }, 4, 5);
    expect(r).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws immediately on non-retryable errors', async () => {
    const { withFileRetry } = await import('../electron/services/secure-store');
    let calls = 0;
    expect(() => withFileRetry(() => {
      calls++;
      const e = new Error('no such file') as NodeJS.ErrnoException; e.code = 'ENOENT'; throw e;
    }, 4, 5)).toThrow('no such file');
    expect(calls).toBe(1);
  });

  it('gives up after all attempts on persistent locks', async () => {
    const { withFileRetry } = await import('../electron/services/secure-store');
    let calls = 0;
    expect(() => withFileRetry(() => {
      calls++;
      const e = new Error('denied') as NodeJS.ErrnoException; e.code = 'EACCES'; throw e;
    }, 3, 5)).toThrow('denied');
    expect(calls).toBe(3);
  });
});
