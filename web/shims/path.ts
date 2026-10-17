/** Minimal `node:path` shim for the browser demo (POSIX-style). */
export function join(...parts: string[]): string {
  const joined = parts.filter((p) => p !== '').join('/');
  const isAbs = joined.startsWith('/');
  const segs = joined.split('/').filter((s) => s !== '' && s !== '.');
  const out: string[] = [];
  for (const s of segs) {
    if (s === '..') out.pop();
    else out.push(s);
  }
  return (isAbs ? '/' : '') + out.join('/');
}

export function dirname(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  if (i <= 0) return i === 0 ? '/' : '.';
  return n.slice(0, i);
}

export function basename(p: string, ext?: string): string {
  const n = p.replace(/\\/g, '/');
  let b = n.slice(n.lastIndexOf('/') + 1);
  if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
  return b;
}

export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
}

export function resolve(...parts: string[]): string {
  let out = '';
  for (const p of parts) {
    if (p.startsWith('/')) out = p;
    else out = out ? out + '/' + p : p;
  }
  return join(out.startsWith('/') ? out : '/' + out);
}

export const sep = '/';
export const delimiter = ':';

const pathShim = { join, dirname, basename, extname, resolve, sep, delimiter };
export default pathShim;
