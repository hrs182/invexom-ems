#!/usr/bin/env node
/** Copy non-TS assets (migrations SQL, license public key) into dist-electron. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Project root as a real OS path (fileURLToPath handles Windows drive letters). */
const root = fileURLToPath(new URL('../', import.meta.url));

// Fail LOUDLY if the preload was not built. A missing preload.cjs would package
// into a broken installer ("EMS bridge unavailable") with no build error —
// that silent failure cost us days. This usually means package.json's
// build:main is not running tools/build-preload.mjs.
const preloadCjs = path.join(root, 'dist-electron', 'electron', 'preload.cjs');
if (!fs.existsSync(preloadCjs)) {
  throw new Error(
    'FATAL: dist-electron/electron/preload.cjs is missing — the preload was not built. ' +
      'Ensure package.json build:main runs tools/build-preload.mjs.',
  );
}
const jobs = [
  ['electron/services/migrations', 'dist-electron/electron/services/migrations', '.sql'],
  ['electron/services/keys', 'dist-electron/electron/services/keys', '.pem'],
];

for (const [src, dest, ext] of jobs) {
  const srcDir = path.join(root, src);
  const destDir = path.join(root, dest);
  if (!fs.existsSync(srcDir)) {
    console.warn(`copy-assets: missing ${srcDir} — skipping`);
    continue;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith(ext))) {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    console.log(`copy-assets: ${src}/${f}`);
  }
}
