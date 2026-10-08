import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Encrypted-at-rest vault (NFR-S-03: "Database encrypted at rest, key from admin password").
 *
 * Design (all offline, zero-cost, using Node's built-in OpenSSL-backed crypto —
 * a well-reviewed implementation; no hand-rolled primitives):
 *  - A random 256-bit DATA KEY encrypts the SQLite file with AES-256-GCM.
 *  - The data key is wrapped (encrypted) once per user with a key derived from
 *    that user's login password via scrypt. Wraps live in keymeta.json next
 *    to the encrypted DB — no plaintext secrets anywhere.
 *  - On boot the user logs in -> their wrap is unwrapped -> DB decrypted to a
 *    working file -> opened with WAL mode (crash-safe). On quit the working
 *    file is checkpointed, re-encrypted, and securely wiped.
 *  - If the machine loses power mid-session, the working file survives and is
 *    newer than the .enc snapshot: the app recovers from the working file
 *    (WAL replay), so no data is lost (NFR-R-01).
 *
 * Consequence (documented in Help): if ALL user passwords are lost, the data
 * cannot be recovered — keep the admin password safe and keep backups.
 */

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export interface KeyWrap { user: string; salt: string; iv: string; data: string }
/** Non-secret recovery metadata (the question is shown at reset time; the answer never is). */
export interface RecoveryInfo { user: string; questionId: string; question: string }
export interface KeyMeta { version: 1; wraps: KeyWrap[]; recovery?: RecoveryInfo[] }

function deriveKek(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
}

function wrapKey(dataKey: Buffer, password: string): KeyWrap {
  const salt = crypto.randomBytes(16);
  const kek = deriveKek(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const enc = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { user: '', salt: salt.toString('base64'), iv: iv.toString('base64'), data: Buffer.concat([enc, tag]).toString('base64') };
}

function unwrapKey(w: KeyWrap, password: string): Buffer {
  const kek = deriveKek(password, Buffer.from(w.salt, 'base64'));
  const raw = Buffer.from(w.data, 'base64');
  const enc = raw.subarray(0, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(w.iv, 'base64'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function readKeyMeta(keymetaPath: string): KeyMeta | null {
  if (!fs.existsSync(keymetaPath)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(keymetaPath, 'utf8')) as KeyMeta;
    if (m.version !== 1 || !Array.isArray(m.wraps)) return null;
    return m;
  } catch { return null; }
}

export function writeKeyMeta(keymetaPath: string, meta: KeyMeta): void {
  fs.writeFileSync(keymetaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
}

/** Create a fresh vault: new data key wrapped with the admin's password. */
export function createVault(keymetaPath: string, adminUser: string, adminPassword: string): Buffer {
  const dataKey = crypto.randomBytes(32);
  const wrap = wrapKey(dataKey, adminPassword);
  wrap.user = adminUser;
  writeKeyMeta(keymetaPath, { version: 1, wraps: [wrap] });
  try { fs.chmodSync(keymetaPath, 0o600); } catch { /* windows */ }
  return dataKey;
}

/** Add (or replace) a wrap for another user — call while DB is unlocked. */
export function addUserWrap(keymetaPath: string, dataKey: Buffer, username: string, password: string): void {
  const meta = readKeyMeta(keymetaPath) ?? { version: 1 as const, wraps: [] };
  const wrap = wrapKey(dataKey, password);
  wrap.user = username;
  meta.wraps = meta.wraps.filter((w) => w.user.toLowerCase() !== username.toLowerCase());
  meta.wraps.push(wrap);
  writeKeyMeta(keymetaPath, meta);
}

/** Remove a user's wrap (e.g. user deactivated). */
export function removeUserWrap(keymetaPath: string, username: string): void {
  const meta = readKeyMeta(keymetaPath);
  if (!meta) return;
  meta.wraps = meta.wraps.filter((w) => w.user.toLowerCase() !== username.toLowerCase());
  writeKeyMeta(keymetaPath, meta);
}

/** Resolve the data key for a username+password. Throws on wrong credentials. */
export function unlockDataKey(keymetaPath: string, username: string, password: string): Buffer {
  const meta = readKeyMeta(keymetaPath);
  const wrap = meta?.wraps.find((w) => w.user.toLowerCase() === username.toLowerCase());
  if (!wrap) throw new Error('unknown-user');
  try {
    return unwrapKey(wrap, password);
  } catch {
    throw new Error('bad-password');
  }
}

/** AES-256-GCM encrypt a file -> outPath (iv prepended). */
export function encryptFile(dataKey: Buffer, inPath: string, outPath: string): void {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
  const plaintext = fs.readFileSync(inPath);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, Buffer.concat([iv, enc]));
  fs.renameSync(tmp, outPath); // atomic replace
}

/** AES-256-GCM decrypt a file -> outPath. Throws on wrong key / corruption. */
export function decryptFile(dataKey: Buffer, inPath: string, outPath: string): void {
  const raw = fs.readFileSync(inPath);
  if (raw.length < 12 + 16) throw new Error('corrupt vault file');
  const iv = raw.subarray(0, 12);
  const payload = raw.subarray(12);
  const enc = payload.subarray(0, payload.length - 16);
  const tag = payload.subarray(payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, plaintext);
  fs.renameSync(tmp, outPath);
}

/** Overwrite a file with random bytes, then delete it (best-effort wipe). */
export function secureWipe(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, 'r+');
    const chunk = crypto.randomBytes(Math.min(stat.size, 1024 * 1024));
    let written = 0;
    while (written < stat.size) {
      const n = Math.min(chunk.length, stat.size - written);
      fs.writeSync(fd, chunk.subarray(0, n), 0, n, written);
      written += n;
    }
    fs.closeSync(fd);
  } catch { /* fall through to unlink */ }
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }
}

/** scrypt password hash for the users table (login auth, separate from DB key). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
  return `scrypt$16384$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [, , saltB64, hashB64] = stored.split('$');
    const hash = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), 32, SCRYPT_OPTS);
    return crypto.timingSafeEqual(hash, Buffer.from(hashB64, 'base64'));
  } catch { return false; }
}


/* ------------------------------------------------------------------ */
/* Password recovery via security question                             */
/*                                                                     */
/* The data key is ALSO wrapped with a secret derived from the user's  */
/* security question + answer (set during setup). Forgetting the       */
/* password therefore does NOT lose the data: the answer re-unwraps   */
/* the same data key, and the user picks a new password (which simply */
/* replaces the password wrap). The answer itself is never stored —    */
/* only the question text (shown at reset time) lives in keymeta.      */
/* ------------------------------------------------------------------ */

const RECOVERY_WRAP_PREFIX = 'recovery:';

const recoveryWrapUser = (username: string): string =>
  RECOVERY_WRAP_PREFIX + username.toLowerCase();

/** Canonical secret derived from question + answer (normalized, never stored). */
export function recoverySecret(questionId: string, answer: string): string {
  return `ems-recovery-v1:${questionId}:${answer.trim().toLowerCase()}`;
}

/**
 * Store/refresh the recovery wrap + question for a user. Call while the
 * vault is unlocked (setup, or any password change for that user).
 */
export function setRecoveryInfo(
  keymetaPath: string,
  dataKey: Buffer,
  username: string,
  questionId: string,
  question: string,
  answer: string,
): void {
  const meta = readKeyMeta(keymetaPath) ?? { version: 1 as const, wraps: [] as KeyWrap[] };
  const wrapUser = recoveryWrapUser(username);
  const wrap = wrapKey(dataKey, recoverySecret(questionId, answer));
  wrap.user = wrapUser;
  meta.wraps = meta.wraps.filter((w) => w.user !== wrapUser);
  meta.wraps.push(wrap);
  const info: RecoveryInfo = { user: username, questionId, question };
  meta.recovery = (meta.recovery ?? []).filter((r) => r.user.toLowerCase() !== username.toLowerCase());
  meta.recovery.push(info);
  writeKeyMeta(keymetaPath, meta);
}

/** The stored (non-secret) recovery question for a user, if any. Works while locked. */
export function getRecoveryInfo(keymetaPath: string, username: string): RecoveryInfo | null {
  const meta = readKeyMeta(keymetaPath);
  return meta?.recovery?.find((r) => r.user.toLowerCase() === username.toLowerCase()) ?? null;
}

/**
 * Re-derive the data key from a security answer.
 * Throws 'no-recovery' when none was set, 'bad-answer' on a wrong answer.
 */
export function unlockWithRecovery(
  keymetaPath: string,
  username: string,
  questionId: string,
  answer: string,
): Buffer {
  const meta = readKeyMeta(keymetaPath);
  const wrap = meta?.wraps.find((w) => w.user === recoveryWrapUser(username));
  if (!wrap) throw new Error('no-recovery');
  try {
    return unwrapKey(wrap, recoverySecret(questionId, answer));
  } catch {
    throw new Error('bad-answer');
  }
}
