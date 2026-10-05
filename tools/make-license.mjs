#!/usr/bin/env node
/**
 * Mint a signed .inelic license file for a buyer (run by Invexom/Harsh only).
 *
 *   npm run make:license -- --tier standard --issuedTo "Sunrise Public School" \
 *     --disk <sha256> --board <sha256> --cpu <sha256> --out sunrise.inelic
 *
 * The buyer sends their machine code via WhatsApp/email; Harsh pastes the three
 * hardware hashes (stored alongside the machine code when generating — in
 * practice, ask the buyer to send the machine code shown in Help -> Activate;
 * the ISSUER records hw hashes when first minting).
 *
 * SIMPLER FLOW (recommended): the buyer sends the machine code; Harsh keeps a
 * local registry (tools/license-registry.json, gitignored) mapping machine
 * codes to hw hashes captured at first issuance. This tool reads/writes it.
 *
 * Private key: ~/workspace/invexom-ops/ems-private/license-private.pem
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const tier = arg('tier');
const issuedTo = arg('issuedTo');
const out = arg('out');
if (!tier || !issuedTo || !out || !['starter', 'standard', 'campus'].includes(tier)) {
  console.error('Usage: npm run make:license -- --tier <starter|standard|campus> --issuedTo "<School Name>" --out <file.inelic> [--request "<pasted request>" | --disk <h> --board <h> --cpu <h>] [--transport 1] [--library 1]');
  process.exit(1);
}
// The buyer copies "License Request" from the app's License screen and sends it
// on WhatsApp. Paste it via --request (or pass --disk/--board/--cpu individually).
let hw = { disk: arg('disk', ''), board: arg('board', ''), cpu: arg('cpu', '') };
const request = arg('request', '');
if (request) {
  const disk = request.match(/disk=([a-f0-9]+)/i);
  const board = request.match(/board=([a-f0-9]+)/i);
  const cpu = request.match(/cpu=([a-f0-9]+)/i);
  if (disk) hw.disk = disk[1];
  if (board) hw.board = board[1];
  if (cpu) hw.cpu = cpu[1];
}
if (!hw.disk || !hw.board || !hw.cpu) {
  console.error('Missing hardware hashes. Paste the buyer\'s license request with --request "<text>" or pass --disk/--board/--cpu.');
  process.exit(1);
}

const privPath = path.join(os.homedir(), 'workspace', 'invexom-ops', 'ems-private', 'license-private.pem');
if (!fs.existsSync(privPath)) {
  console.error(`Private key not found at ${privPath}. Run: npm run gen:keys`);
  process.exit(1);
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath, 'utf8'));

const TIER_LIMITS = { starter: { students: 300, devices: 2 }, standard: { students: 1000, devices: 5 }, campus: { students: 0, devices: 10 } };

const payload = {
  v: 1,
  tier,
  issuedTo,
  issuedAt: new Date().toISOString().slice(0, 10),
  maxStudents: TIER_LIMITS[tier].students,
  maxDevices: TIER_LIMITS[tier].devices,
  addons: { transport: arg('transport') === '1', library: arg('library') === '1' },
  hw,
};

// Canonical JSON: sorted keys, recursive.
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
const canonicalJson = canonical(payload);
const signature = crypto.sign(null, Buffer.from(canonicalJson, 'utf8'), privateKey).toString('base64');

fs.writeFileSync(out, `${canonicalJson}\n${signature}\n`);
console.log(`License written: ${out}`);
console.log(`  Tier: ${tier} | Students: ${TIER_LIMITS[tier].students || 'unlimited'} | Transport addon: ${payload.addons.transport} | Library addon: ${payload.addons.library}`);
console.log('Send this .inelic file to the buyer. They load it via Help -> Activate.');
