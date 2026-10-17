#!/usr/bin/env node
/**
 * Builds the web-demo deployment package:
 *   ~/workspace/invexom-ems-webdemo-deploy.zip
 *
 * Contents: server.cjs (bundled Node server) + dist-web/ (client) +
 * migrations/ + keys/ + package.json + README-DEPLOY.md
 *
 * Usage: node tools/make-webdemo-zip.mjs [--skip-client]
 * (Assumes `npm run build:web` and the esbuild bundle already ran, unless --skip-client is NOT passed… actually it runs both.)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = '/home/hatch/workspace/invexom-ems-deploy';
const ZIP = '/home/hatch/workspace/invexom-ems-webdemo-deploy.zip';
const skipClient = process.argv.includes('--skip-client');

const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

if (!skipClient) {
  console.log('== building web client (dist-web) ==');
  sh('npm run build:web');
}
console.log('== bundling demo server (web-dist/server.cjs) ==');
sh('npx esbuild web/server.ts --bundle --platform=node --format=cjs --outfile=web-dist/server.cjs --external:better-sqlite3 --external:electron');

console.log('== assembling deploy folder ==');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'migrations'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'keys'), { recursive: true });
fs.cpSync(path.join(ROOT, 'web-dist', 'server.cjs'), path.join(OUT, 'server.cjs'));
for (const f of fs.readdirSync(path.join(ROOT, 'electron', 'services', 'migrations'))) {
  if (f.endsWith('.sql')) fs.cpSync(path.join(ROOT, 'electron', 'services', 'migrations', f), path.join(OUT, 'migrations', f));
}
fs.cpSync(path.join(ROOT, 'electron', 'services', 'keys', 'license-public.pem'), path.join(OUT, 'keys', 'license-public.pem'));
fs.cpSync(path.join(ROOT, 'dist-web'), path.join(OUT, 'dist-web'), { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
  name: 'invexom-ems-webdemo',
  version: pkg.version,
  private: true,
  type: 'commonjs',
  scripts: { start: 'node server.cjs' },
  dependencies: {
    express: pkg.dependencies.express,
    'better-sqlite3': pkg.dependencies['better-sqlite3'],
  },
  engines: { node: '>=18' },
}, null, 2));

const readme = `# Invexom EMS — Web Demo (quick start)

1. Upload this folder's contents to the server (or extract the zip).
2. Run \`npm install\`
3. Run \`node server.cjs\` (or set the panel's startup file to \`server.cjs\`)

Open the URL — the EMS login page appears (demo/demo1234).
Demo data resets every midnight IST. Full guide: README-DEPLOY.md
`;
fs.writeFileSync(path.join(OUT, 'README.txt'), readme);
// full step-by-step deploy guide lives in the repo
fs.cpSync(path.join(ROOT, 'web', 'README-DEPLOY.md'), path.join(OUT, 'README-DEPLOY.md'));

console.log('== zipping ==');
fs.rmSync(ZIP, { force: true });
execSync(`zip -qr ${ZIP} .`, { cwd: OUT, stdio: 'inherit' });
console.log('DONE:', ZIP, `(${(fs.statSync(ZIP).size / 1048576).toFixed(1)} MB)`);
