import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDb } from './database.js';
import {
  DEMO_DAYS, DEMO_MAX_STUDENTS, TIER_LABELS, canonicalJson,
  decodeLicenseFile, type LicensePayload,
} from '../../shared/license-format.js';
import type { LicenseStatus } from '../../shared/types.js';

/**
 * Offline licensing (SRS Section 12).
 * - License = .inelic file: canonical JSON + Ed25519 signature, verified
 *   offline against the embedded public key (LIC-02). No server, zero cost.
 * - Hardware binding: disk + motherboard + CPU hashes; fuzzy 2-of-3 match
 *   tolerates RAM/disk upgrades (LIC-04). Copied installs refuse to run.
 * - Demo: 50 students / 30 days / watermark; key upgrades in place (DEMO-01/02);
 *   on expiry the app becomes read-only, never holds data hostage (DEMO-03).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_KEY_PATH = path.join(HERE, 'keys', 'license-public.pem');
// Build-time override (CI/tests): bake a different public key without editing source.
export function getPublicKey(): string {
  const envKey = process.env.EMS_LICENSE_PUBLIC_KEY;
  if (envKey) return envKey.replace(/\\n/g, '\n');
  try {
    return fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  } catch {
    throw new Error('License public key not found — run `npm run gen:keys` before building.');
  }
}

export interface HwIds { disk: string; board: string; cpu: string }

function wmic(prop: string, section: 'diskdrive' | 'baseboard' | 'cpu'): string {
  try {
    const field = section === 'diskdrive' ? 'SerialNumber' : section === 'baseboard' ? 'SerialNumber' : 'ProcessorId';
    const where = section === 'diskdrive' ? ` where "MediaType='Fixed hard disk media'"` : '';
    const out = execFileSync('wmic', [section, where.trim() ? 'where' : 'get', ...(where.trim() ? [where.trim()] : []), 'get', field, '/value'], {
      encoding: 'utf8', timeout: 8000, windowsHide: true,
    });
    const m = out.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${field}=`));
    return (m ? m.slice(field.length + 1) : '').trim().toUpperCase().replace(/\s+/g, '');
  } catch { return ''; }
}

/** Raw hardware identifiers (serials/ids, not hashes). Never leaves the machine. */
export function getHardwareIds(): HwIds {
  if (process.platform === 'win32') {
    return { disk: wmic('SerialNumber', 'diskdrive'), board: wmic('SerialNumber', 'baseboard'), cpu: wmic('ProcessorId', 'cpu') };
  }
  // Dev fallback (non-Windows): machine-id + cpu model. Production target is Windows.
  let mid = '';
  try { mid = fs.readFileSync('/etc/machine-id', 'utf8').trim(); } catch { /* ignore */ }
  return { disk: mid || 'dev-disk', board: process.arch, cpu: 'dev-cpu' };
}

function sha256hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Hashed hardware binding stored in the license file (LIC-02). */
export function getHardwareBinding(): HwIds {
  const raw = getHardwareIds();
  return { disk: sha256hex(`invexom-ems|disk|${raw.disk}`), board: sha256hex(`invexom-ems|board|${raw.board}`), cpu: sha256hex(`invexom-ems|cpu|${raw.cpu}`) };
}

/** Fuzzy match: at least 2 of 3 hardware ids must match (LIC-04). */
export function fuzzyMatch(a: HwIds, b: HwIds): boolean {
  const hits = [a.disk === b.disk, a.board === b.board, a.cpu === b.cpu].filter(Boolean).length;
  return hits >= 2;
}

/** Human-friendly machine code shown in Help -> Activate (grouped base32). */
export function machineCode(): string {
  const b = getHardwareBinding();
  const digest = sha256hex(`${b.disk}|${b.board}|${b.cpu}`);
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += alphabet[parseInt(digest.slice(i * 2, i * 2 + 2), 16) % alphabet.length];
  }
  return code.match(/.{1,4}/g)!.join('-');
}

export function verifyLicenseText(text: string): { ok: true; payload: LicensePayload } | { ok: false; error: string } {
  let payload: LicensePayload;
  let signatureB64: string;
  try {
    ({ payload, signatureB64 } = decodeLicenseFile(text));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid license file' };
  }
  try {
    const ok = crypto.verify(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      getPublicKey(),
      Buffer.from(signatureB64, 'base64'),
    );
    if (!ok) return { ok: false, error: 'Signature verification failed — this license file was not issued by Invexom.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Signature verification failed' };
  }
  return { ok: true, payload };
}

export interface StoredLicense {
  tier: LicensePayload['tier'];
  issuedTo: string; issuedAt: string;
  maxStudents: number; maxDevices: number;
  addons: { transport: boolean; library: boolean };
  hw: HwIds; activatedAt: string;
}

export function getStoredLicense(): StoredLicense | null {
  try {
    const row = getDb().prepare('SELECT * FROM license_store WHERE id = 1').get() as Record<string, unknown> | undefined;
    if (!row || !row.tier) return null;
    return {
      tier: row.tier as StoredLicense['tier'],
      issuedTo: String(row.issued_to ?? ''),
      issuedAt: String(row.issued_at ?? ''),
      maxStudents: Number(row.max_students ?? 0),
      maxDevices: Number(row.max_devices ?? 0),
      addons: JSON.parse(String(row.addons_json ?? '{}')) as StoredLicense['addons'],
      hw: JSON.parse(String(row.hw_json ?? '{}')) as HwIds,
      activatedAt: String(row.activated_at ?? ''),
    };
  } catch { return null; }
}

/** Activate: verify signature + hardware binding, then persist. DEMO-02 keeps all data. */
export function activateLicense(text: string): { ok: true } | { ok: false; error: string } {
  const v = verifyLicenseText(text);
  if (!v.ok) return v;
  const binding = getHardwareBinding();
  if (!fuzzyMatch(binding, v.payload.hw)) {
    return {
      ok: false,
      error: 'This license was issued for a different machine. Send your current machine code to Invexom for a re-issued license.',
    };
  }
  const db = getDb();
  db.prepare(
    `INSERT INTO license_store (id, tier, issued_to, issued_at, max_students, max_devices, addons_json, hw_json, activated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET tier=excluded.tier, issued_to=excluded.issued_to, issued_at=excluded.issued_at,
       max_students=excluded.max_students, max_devices=excluded.max_devices, addons_json=excluded.addons_json,
       hw_json=excluded.hw_json, activated_at=excluded.activated_at, updated_at=datetime('now')`,
  ).run(
    v.payload.tier, v.payload.issuedTo, v.payload.issuedAt, v.payload.maxStudents,
    v.payload.maxDevices, JSON.stringify(v.payload.addons), JSON.stringify(v.payload.hw),
  );
  return { ok: true };
}

export function clearLicense(): void {
  getDb().prepare('DELETE FROM license_store WHERE id = 1').run();
}

export function readInstallDate(installJsonPath: string): Date {
  try {
    const j = JSON.parse(fs.readFileSync(installJsonPath, 'utf8')) as { installedAt: string };
    return new Date(j.installedAt);
  } catch { return new Date(); }
}

export function demoDaysLeft(installJsonPath: string, now = new Date()): number {
  const installed = readInstallDate(installJsonPath);
  const elapsed = Math.max(0, Math.floor((now.getTime() - installed.getTime()) / (24 * 3600 * 1000)));
  return DEMO_DAYS - elapsed;
}

function countStudents(): number {
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS c FROM students WHERE is_deleted = 0").get() as { c: number };
    return row.c;
  } catch { return 0; } // students table arrives in Milestone 2
}

/** Full license status for the UI + enforcement gates. */
export function licenseStatus(opts: { demoBuild: boolean; installJsonPath: string }): LicenseStatus {
  const stored = getStoredLicense();
  const mc = machineCode();
  if (stored) {
    const hwOk = fuzzyMatch(getHardwareBinding(), stored.hw);
    if (!hwOk) {
      return {
        mode: 'mismatch', demoBuild: opts.demoBuild, tier: stored.tier, tierLabel: TIER_LABELS[stored.tier],
        maxStudents: stored.maxStudents || null, maxDevices: stored.maxDevices, addons: stored.addons,
        machineCode: mc, demoDaysLeft: null, demoStudentCap: null, demoStudentCount: null,
        issuedTo: stored.issuedTo, watermark: true, readOnly: true,
      };
    }
    return {
      mode: 'licensed', demoBuild: opts.demoBuild, tier: stored.tier, tierLabel: TIER_LABELS[stored.tier],
      maxStudents: stored.maxStudents || null, maxDevices: stored.maxDevices, addons: stored.addons,
      machineCode: mc, demoDaysLeft: null, demoStudentCap: null, demoStudentCount: null,
      issuedTo: stored.issuedTo, watermark: false, readOnly: false,
    };
  }
  const daysLeft = demoDaysLeft(opts.installJsonPath);
  const studentCount = countStudents();
  const expired = daysLeft < 0;
  return {
    mode: expired ? 'demo-expired' : 'demo',
    demoBuild: opts.demoBuild,
    tier: null, tierLabel: null,
    maxStudents: DEMO_MAX_STUDENTS, maxDevices: 1,
    addons: { transport: false, library: false },
    machineCode: mc,
    demoDaysLeft: Math.max(daysLeft, 0),
    demoStudentCap: DEMO_MAX_STUDENTS,
    demoStudentCount: studentCount,
    issuedTo: null,
    watermark: true,
    readOnly: expired,
  };
}

/** Enforcement helpers used by IPC handlers in later milestones. */
export function assertWritable(status: LicenseStatus): void {
  if (status.readOnly) throw new Error('demo-expired-readonly');
  if (status.mode === 'mismatch') throw new Error('license-mismatch');
}

export function assertStudentCap(status: LicenseStatus): void {
  const cap = status.maxStudents;
  if (cap != null && (status.demoStudentCount ?? 0) >= cap) throw new Error('student-cap-reached');
}
