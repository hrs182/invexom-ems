/**
 * .inelic license file format (offline, Ed25519-signed).
 *
 * File content (UTF-8 text):
 *   <canonical JSON payload>\n<base64 signature>\n
 *
 * Canonical JSON = JSON.stringify(payload) with keys sorted recursively.
 * Signature = Ed25519(privateKey, canonicalJson) — created by Invexom with
 * tools/make-license.mjs. Verified offline in the app against the embedded
 * public key. No license server, zero cost.
 */

export interface LicenseHwIds {
  disk: string; // sha256 hex of disk serial
  board: string; // sha256 hex of motherboard serial
  cpu: string; // sha256 hex of cpu id
}

export interface LicensePayload {
  v: 1;
  tier: 'starter' | 'standard' | 'campus';
  issuedTo: string; // institution name
  issuedAt: string; // ISO date
  maxStudents: number; // 300 | 1000 | 0 (0 = unlimited)
  maxDevices: number; // 2 | 5 | 10
  addons: { transport: boolean; library: boolean };
  hw: LicenseHwIds; // machine binding (LIC-02)
  note?: string;
}

export const TIER_LABELS: Record<LicensePayload['tier'], string> = {
  starter: 'Starter',
  standard: 'Standard',
  campus: 'Campus',
};

export const TIER_LIMITS: Record<LicensePayload['tier'], { students: number; devices: number }> = {
  starter: { students: 300, devices: 2 },
  standard: { students: 1000, devices: 5 },
  campus: { students: 0, devices: 10 }, // 0 = unlimited
};

/** Demo constants (DEMO-01): 50 students, 30 days, watermark, in-place upgrade. */
export const DEMO_MAX_STUDENTS = 50;
export const DEMO_DAYS = 30;

/** Recursively sort object keys for canonical JSON before sign/verify. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(',')}}`;
}

export function encodeLicenseFile(payload: LicensePayload, signatureB64: string): string {
  return `${canonicalJson(payload)}\n${signatureB64}\n`;
}

export function decodeLicenseFile(text: string): { payload: LicensePayload; signatureB64: string } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('Invalid license file: expected payload + signature');
  const payload = JSON.parse(lines[0]) as LicensePayload;
  if (payload.v !== 1 || !payload.tier || !payload.hw) throw new Error('Invalid license file: bad payload');
  return { payload, signatureB64: lines[1].trim() };
}
