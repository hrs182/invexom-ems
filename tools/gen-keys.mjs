#!/usr/bin/env node
/**
 * Generate the Ed25519 license keypair for Invexom EMS.
 *
 *   npm run gen:keys
 *
 * - The PUBLIC key is embedded into the app (electron/services/keys/license-public.pem)
 *   so the app can verify licenses offline.
 * - The PRIVATE key is written OUTSIDE the repo to ~/workspace/invexom-ops/ems-private/
 *   and must be backed up securely (password manager / offline USB). Anyone with
 *   the private key can mint licenses — never commit it, never email it.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const pubDir = new URL('../electron/services/keys/', import.meta.url);
fs.mkdirSync(pubDir, { recursive: true });
fs.writeFileSync(new URL('../electron/services/keys/license-public.pem', import.meta.url), pubPem);

const privDir = path.join(os.homedir(), 'workspace', 'invexom-ops', 'ems-private');
fs.mkdirSync(privDir, { recursive: true, mode: 0o700 });
const privPath = path.join(privDir, 'license-private.pem');
if (fs.existsSync(privPath)) {
  console.error(`REFUSING: ${privPath} already exists — will not overwrite an existing private key.`);
  process.exit(1);
}
fs.writeFileSync(privPath, privPem, { mode: 0o600 });

console.log('Public key embedded at: electron/services/keys/license-public.pem');
console.log(`Private key written to:  ${privPath}`);
console.log('');
console.log('BACK UP THE PRIVATE KEY NOW (offline USB + password manager).');
console.log('Then issue licenses with: npm run make:license');
