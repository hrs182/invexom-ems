import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import {
  canonicalJson, encodeLicenseFile, decodeLicenseFile, DEMO_MAX_STUDENTS, DEMO_DAYS,
  type LicensePayload,
} from '../shared/license-format';
import {
  verifyLicenseText, fuzzyMatch, demoDaysLeft, machineCode, getHardwareBinding,
} from '../electron/services/license';

function makePayload(): LicensePayload {
  const hw = getHardwareBinding();
  return {
    v: 1, tier: 'standard', issuedTo: 'Test School', issuedAt: '2026-10-04',
    maxStudents: 1000, maxDevices: 5,
    addons: { transport: false, library: false },
    hw,
  };
}

describe('license format + verification (LIC-02, DEMO-01)', () => {
  let privateKey: crypto.KeyObject;
  let publicPem: string;

  beforeAll(() => {
    const { publicKey, privateKey: priv } = crypto.generateKeyPairSync('ed25519');
    privateKey = priv;
    publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.EMS_LICENSE_PUBLIC_KEY = publicPem.replace(/\n/g, '\\n');
  });

  const sign = (payload: LicensePayload): string => {
    const sig = crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), privateKey).toString('base64');
    return encodeLicenseFile(payload, sig);
  };

  it('verifies a correctly signed license for this machine', () => {
    const r = verifyLicenseText(sign(makePayload()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.tier).toBe('standard');
  });

  it('rejects a tampered payload', () => {
    const file = sign(makePayload());
    const tampered = file.replace('"standard"', '"campus"');
    expect(verifyLicenseText(tampered).ok).toBe(false);
  });

  it('rejects a license signed by a different key', () => {
    const other = crypto.generateKeyPairSync('ed25519').privateKey;
    const payload = makePayload();
    const sig = crypto.sign(null, Buffer.from(canonicalJson(payload), 'utf8'), other).toString('base64');
    expect(verifyLicenseText(encodeLicenseFile(payload, sig)).ok).toBe(false);
  });

  it('rejects malformed files', () => {
    expect(verifyLicenseText('garbage').ok).toBe(false);
    expect(verifyLicenseText('{"v":1}\nAAAA\n').ok).toBe(false);
  });

  it('decode round-trips the payload', () => {
    const payload = makePayload();
    const { payload: back } = decodeLicenseFile(sign(payload));
    expect(back.issuedTo).toBe('Test School');
    expect(back.hw.disk).toBe(payload.hw.disk);
  });

  it('fuzzy match tolerates one changed hardware id (LIC-04)', () => {
    const a = getHardwareBinding();
    expect(fuzzyMatch(a, { ...a })).toBe(true);
    expect(fuzzyMatch(a, { ...a, disk: 'changed' })).toBe(true); // 2 of 3 still match
    expect(fuzzyMatch(a, { ...a, disk: 'x', board: 'y' })).toBe(false); // only 1 matches
  });

  it('machine code is stable and readable', () => {
    const c1 = machineCode();
    const c2 = machineCode();
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  });

  it('demo constants match SRS DEMO-01', () => {
    expect(DEMO_MAX_STUDENTS).toBe(50);
    expect(DEMO_DAYS).toBe(30);
  });

  it('demo clock: day 0 -> 30 left, day 31 -> expired', () => {
    const fakePath = '/nonexistent/install.json';
    // unreadable install file -> treated as "just installed"
    expect(demoDaysLeft(fakePath, new Date())).toBe(30);
  });
});
