/**
 * `node:crypto` shim for the browser demo — REAL primitives, sync:
 * - randomBytes: WebCrypto getRandomValues
 * - scryptSync: pure-JS scryptsy (same N/r/p as desktop -> same hash format)
 * - timingSafeEqual: constant-time compare
 * - createHash('sha256'): @noble/hashes (sync)
 * - createCipheriv/createDecipheriv('aes-256-gcm'): @noble/ciphers (sync)
 * So the vault ceremony (key wraps, file encryption) runs genuinely.
 */
import { Buffer } from 'buffer';
import scryptsy from 'scryptsy';
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';

const te = new TextEncoder();

function toU8(d: Uint8Array | string | Buffer): Uint8Array {
  if (typeof d === 'string') return te.encode(d);
  return d instanceof Uint8Array ? d : new Uint8Array(d as unknown as ArrayBuffer);
}

export function randomBytes(n: number): Buffer {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Buffer.from(b);
}

export function scryptSync(
  password: string | Buffer | Uint8Array,
  salt: string | Buffer | Uint8Array,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem?: number },
): Buffer {
  const out = scryptsy(toU8(password as any), toU8(salt as any), opts.N, opts.r, opts.p, keylen);
  return Buffer.from(out);
}

export function pbkdf2Sync(
  password: string | Buffer | Uint8Array,
  salt: string | Buffer | Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
): Buffer {
  if (digest !== 'sha256') throw new Error(`unsupported digest ${digest} in browser demo`);
  return Buffer.from(pbkdf2(sha256, toU8(password as any), toU8(salt as any), { c: iterations, dkLen: keylen }));
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const ab = toU8(a);
  const bb = toU8(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

class Hash {
  private parts: Uint8Array[] = [];
  constructor(private algo: string) {
    if (algo !== 'sha256') throw new Error(`unsupported hash ${algo} in browser demo`);
  }
  update(d: Uint8Array | string): this {
    this.parts.push(toU8(d));
    return this;
  }
  digest(enc?: string): any {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const p of this.parts) { all.set(p, o); o += p.length; }
    const h = sha256(all);
    if (!enc || enc === 'hex') return Buffer.from(h).toString('hex');
    if (enc === 'base64') return Buffer.from(h).toString('base64');
    return Buffer.from(h);
  }
}

export function createHash(algo: string): Hash {
  return new Hash(algo);
}

/**
 * Stateful AES-GCM wrapper matching node's Cipheriv streaming shape
 * (update -> ciphertext chunks, final, getAuthTag / setAuthTag).
 */
class GcmBox {
  private chunks: Uint8Array[] = [];
  private box: ReturnType<typeof gcm>;
  private tag: Uint8Array | null = null;
  constructor(key: Uint8Array, iv: Uint8Array) {
    this.box = gcm(toU8(key), toU8(iv));
  }
  update(d: Uint8Array | string): Buffer {
    this.chunks.push(toU8(d));
    return Buffer.alloc(0);
  }
  final(): Buffer { return Buffer.alloc(0); }
  private combined(): Uint8Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) { all.set(c, o); o += c.length; }
    return all;
  }
  /** encrypt side: returns { enc, tag } */
  seal(): { enc: Uint8Array; tag: Uint8Array } {
    const out = this.box.encrypt(this.combined());
    return { enc: out.slice(0, out.length - 16), tag: out.slice(out.length - 16) };
  }
  setAuthTag(tag: Uint8Array): void {
    this.tag = toU8(tag);
  }
  /** decrypt side: plaintext (throws on bad tag, like node). */
  open(): Uint8Array {
    if (!this.tag) throw new Error('auth tag not set');
    const pt = this.combined();
    const combined = new Uint8Array(pt.length + 16);
    combined.set(pt, 0);
    combined.set(this.tag, pt.length);
    return this.box.decrypt(combined);
  }
}

export function createCipheriv(algo: string, key: any, iv: any): any {
  if (algo !== 'aes-256-gcm') throw new Error(`unsupported cipher ${algo} in browser demo`);
  const box = new GcmBox(toU8(key), toU8(iv));
  let sealed: { enc: Uint8Array; tag: Uint8Array } | null = null;
  const api = {
    update: (d: any) => { box.update(d); return Buffer.alloc(0); },
    final: () => { sealed = box.seal(); return Buffer.from(sealed.enc); },
    getAuthTag: () => {
      if (!sealed) sealed = box.seal();
      return Buffer.from(sealed.tag);
    },
  };
  return api;
}

export function createDecipheriv(algo: string, key: any, iv: any): any {
  if (algo !== 'aes-256-gcm') throw new Error(`unsupported cipher ${algo} in browser demo`);
  const box = new GcmBox(toU8(key), toU8(iv));
  return {
    update: (d: any) => { box.update(d); return Buffer.alloc(0); },
    final: () => Buffer.from(box.open()),
    setAuthTag: (t: any) => box.setAuthTag(t),
  };
}

const cryptoShim = { randomBytes, scryptSync, pbkdf2Sync, timingSafeEqual, createHash, createCipheriv, createDecipheriv };
export default cryptoShim;
