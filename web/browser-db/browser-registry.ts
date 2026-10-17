/**
 * Tiny dependency-inversion registry with zero imports (safe to bundle
 * everywhere, including Node). Lets the in-memory `node:fs` shim serve the
 * live sql.js database bytes as a "virtual file" for the vault ceremony
 * (encryptFile reads the working DB path), without import cycles:
 * database-browser registers its exporter; the fs shim consumes it.
 */
/** Virtual path the vault ceremony reads/writes; served from live DB bytes. */
export const VIRTUAL_DB_PATH = '/browser/working.db';

let exporter: (() => Uint8Array) | null = null;

export function setDbExporter(fn: () => Uint8Array): void {
  exporter = fn;
}

export function exportDbBytes(): Uint8Array | null {
  try {
    return exporter ? exporter() : null;
  } catch {
    return null;
  }
}
