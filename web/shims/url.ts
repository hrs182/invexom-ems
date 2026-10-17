/** `node:url` shim — only fileURLToPath is used by the bundled services. */
export function fileURLToPath(url: string | URL): string {
  const s = String(url);
  if (s.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(s).pathname);
    } catch { /* fall through */ }
  }
  throw new Error(`fileURLToPath: not a file URL (${s.slice(0, 60)})`);
}

export function pathToFileURL(_p: string): URL {
  throw new Error('pathToFileURL unavailable in browser demo');
}

const urlShim = { fileURLToPath, pathToFileURL };
export default urlShim;
