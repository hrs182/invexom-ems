/**
 * In-memory `node:fs` shim for the serverless browser demo (Vite alias).
 *
 * The vault ceremony, keymeta, install.json and logo assets all live here
 * for the session. The virtual DB path ('/browser/working.db') is served
 * from the LIVE sql.js bytes via browser-registry, so encryptFile() reads
 * real database bytes with zero changes to secure-store.ts.
 */
import { Buffer } from 'buffer';
import { exportDbBytes, VIRTUAL_DB_PATH } from '../browser-db/browser-registry.js';

type Entry = { data: Uint8Array; mtimeMs: number };

const files = new Map<string, Entry>();
const dirs = new Set<string>(['/']);

function norm(p: string): string {
  return p.replace(/\\/g, '/');
}

function isVirtualDb(p: string): boolean {
  return norm(p) === VIRTUAL_DB_PATH;
}

function toBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
}

function enoent(p: string): Error {
  const e = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  return e;
}

export function existsSync(p: string): boolean {
  const n = norm(p);
  if (isVirtualDb(n)) return true; // live DB always "exists"
  return files.has(n) || dirs.has(n);
}

export function mkdirSync(p: string, _opts?: unknown): string {
  const n = norm(p);
  // register this dir and all parents
  const parts = n.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    dirs.add(cur);
  }
  dirs.add(n);
  return n;
}

export function writeFileSync(p: string, data: Uint8Array | string, _opts?: unknown): void {
  const n = norm(p);
  const dir = n.slice(0, n.lastIndexOf('/')) || '/';
  mkdirSync(dir);
  files.set(n, { data: toBytes(data), mtimeMs: Date.now() });
}

export function readFileSync(p: string, encoding?: string): any {
  const n = norm(p);
  if (isVirtualDb(n)) {
    const live = exportDbBytes();
    if (!live) throw enoent(p);
    const buf = Buffer.from(live);
    return encoding ? buf.toString(encoding as BufferEncoding) : buf;
  }
  const e = files.get(n);
  if (!e) throw enoent(p);
  const buf = Buffer.from(e.data);
  return encoding ? buf.toString(encoding as BufferEncoding) : buf;
}

export function copyFileSync(src: string, dest: string): void {
  const data = readFileSync(src);
  writeFileSync(dest, data);
}

export function renameSync(oldPath: string, newPath: string): void {
  const o = norm(oldPath);
  const n = norm(newPath);
  const e = files.get(o);
  if (!e) throw enoent(oldPath);
  files.delete(o);
  writeFileSync(n, e.data);
}

export function unlinkSync(p: string): void {
  const n = norm(p);
  if (!files.delete(n)) throw enoent(p);
}

export function chmodSync(_p: string, _mode: number): void { /* noop */ }

export function statSync(p: string): { mtimeMs: number; size: number; isDirectory(): boolean; isFile(): boolean } {
  const n = norm(p);
  const e = files.get(n);
  if (e) {
    return { mtimeMs: e.mtimeMs, size: e.data.length, isDirectory: () => false, isFile: () => true };
  }
  if (dirs.has(n)) {
    return { mtimeMs: Date.now(), size: 0, isDirectory: () => true, isFile: () => false };
  }
  throw enoent(p);
}

export function readdirSync(p: string): string[] {
  const n = norm(p);
  const prefix = n.endsWith('/') ? n : n + '/';
  const out: string[] = [];
  for (const k of files.keys()) {
    if (k.startsWith(prefix)) {
      const rest = k.slice(prefix.length);
      if (rest && !rest.includes('/')) out.push(rest);
    }
  }
  return out;
}

/** Snapshot for IndexedDB persistence: path -> base64. */
export function __dump(): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, e] of files) {
    if (k === VIRTUAL_DB_PATH) continue;
    out.push([k, Buffer.from(e.data).toString('base64')]);
  }
  return out;
}

/** Restore a snapshot from IndexedDB. */
export function __restore(entries: [string, string][]): void {
  files.clear();
  dirs.clear();
  dirs.add('/');
  for (const [k, b64] of entries) {
    writeFileSync(k, Buffer.from(b64, 'base64'));
  }
}

/** Read raw memfs bytes, bypassing the virtual-DB live-export interception. */
export function __readRaw(p: string): Uint8Array | null {
  const e = files.get(norm(p));
  return e ? new Uint8Array(e.data) : null;
}

const fsShim = {
  existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync,
  renameSync, unlinkSync, chmodSync, statSync, readdirSync,
  __dump, __restore, __readRaw,
};
export default fsShim;
