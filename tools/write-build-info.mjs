#!/usr/bin/env node
/** Bake build metadata (version + demo flag) into dist-electron/build-info.json. */
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const info = {
  version: pkg.version,
  demoBuild: process.env.EMS_DEMO === '1',
  builtAt: new Date().toISOString(),
};
const outDir = new URL('../dist-electron/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir.pathname, 'build-info.json'), JSON.stringify(info, null, 2));
console.log('build-info:', JSON.stringify(info));
