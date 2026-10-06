#!/usr/bin/env node
/**
 * Build the preload script as CommonJS (preload.cjs).
 *
 * Why: the app runs the renderer sandboxed (sandbox: true), and a sandboxed
 * preload is evaluated as a classic script — an ES-module preload fails with
 * "Cannot use import statement outside a module", so window.ems is never
 * exposed and the app shows "EMS bridge unavailable". With package.json
 * "type": "module", the .cjs extension forces CommonJS regardless.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Run TypeScript through node directly (node_modules/typescript/lib/tsc.js).
// Never spawn node_modules/.bin/tsc.cmd on Windows: Node's execFileSync cannot
// execute .cmd/.bat files without shell:true (fails with EINVAL/ENOENT).
const tscJs = path.join(root, 'node_modules', 'typescript', 'lib', 'tsc.js');

execFileSync(process.execPath, [tscJs, '-p', 'tsconfig.preload.json'], { cwd: root, stdio: 'inherit' });

const js = path.join(root, 'dist-electron', 'electron', 'preload.js');
const cjs = path.join(root, 'dist-electron', 'electron', 'preload.cjs');
if (!fs.existsSync(js)) {
  throw new Error('build-preload: expected output missing: ' + js);
}
if (fs.existsSync(cjs)) fs.rmSync(cjs);
fs.renameSync(js, cjs);
console.log('preload: dist-electron/electron/preload.cjs');
