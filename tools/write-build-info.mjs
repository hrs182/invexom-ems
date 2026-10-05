#!/usr/bin/env node
/** Bake build metadata (version + demo flag) into dist-electron/build-info.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Project root as a real OS path (fileURLToPath handles Windows drive letters). */
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const info = {
  version: pkg.version,
  demoBuild: process.env.EMS_DEMO === '1',
  builtAt: new Date().toISOString(),
};
const outDir = path.join(root, 'dist-electron');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify(info, null, 2));
console.log('build-info:', JSON.stringify(info));
