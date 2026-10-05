#!/usr/bin/env node
/**
 * Post-dist finalizer (runs after electron-builder):
 *  - If EMS_DEMO=1: renames the installer to Invexom-EMS-Demo-Setup-v<version>.exe
 *  - Writes SHA-256 CHECKSUMS.txt for every .exe in dist-installer/
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = new URL('../dist-installer/', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = pkg.version;
const isDemo = process.env.EMS_DEMO === '1';

const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.exe')) : [];
const renamed = [];
for (const f of files) {
  let target = f;
  if (isDemo && f.startsWith('Invexom-EMS-Setup-')) {
    target = `Invexom-EMS-Demo-Setup-v${version}.exe`;
    fs.renameSync(path.join(outDir.pathname, f), path.join(outDir.pathname, target));
  }
  renamed.push(target);
}

const lines = [];
for (const f of renamed.sort()) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir.pathname, f))).digest('hex');
  lines.push(`${hash}  ${f}`);
}
if (lines.length) {
  fs.writeFileSync(path.join(outDir.pathname, 'CHECKSUMS.txt'), lines.join('\n') + '\n');
  console.log('Checksums written for:\n' + renamed.map((f) => `  ${f}`).join('\n'));
} else {
  console.log('No .exe artifacts found in dist-installer/ (packaging may have been skipped).');
}
