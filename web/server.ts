/**
 * Invexom EMS — web demo server.
 *
 * Runs the SAME 158 IPC handlers as the desktop app (via buildIpcHandlers)
 * behind HTTP POST /api/<channel>, serving the React build statically.
 * Fully offline-capable logic, zero recurring cost beyond the host itself.
 *
 * Demo semantics:
 *  - The vault is unlocked at boot with the demo credentials; every visitor
 *    still starts at the login page (client-side demo gate).
 *  - auth:logout never locks the vault (one visitor logging out must not
 *    break the demo for everyone else).
 *  - Demo data is wiped and re-seeded every midnight IST (same-day data only).
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureDirs } from '../electron/services/paths.js';
import {
  buildIpcHandlers,
  ipcErrorPayload,
  type AppContext,
  type IpcOn,
} from '../electron/ipc.js';
import { closeDatabase, openVaultDatabase } from '../electron/services/database.js';
import { unlockDataKey } from '../electron/services/secure-store.js';
import { setExportSink } from '../electron/services/export.js';
import { verifyLogin } from '../electron/services/users.js';
import { seedDemo, istToday, DEMO_USERNAME, DEMO_PASSWORD } from './seed-demo.js';

const HERE = (() => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch { /* bundled CJS */ }
  return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
})();
const PORT = parseInt(process.env.PORT || '3100', 10);
const DATA_DIR = process.env.EMS_WEB_DATA_DIR || path.join(process.cwd(), 'demo-data');
process.env.EMS_WEB_DATA_DIR = DATA_DIR;

const DAY_FILE = path.join(DATA_DIR, '.demo-day');

let demoKey: Buffer | null = null;
let paths: ReturnType<typeof ensureDirs>;
const ctx: AppContext = {
  paths: undefined as never,
  dataKey: null,
  currentUser: null,
  demoBuild: true,
  version: process.env.EMS_VERSION || '1.0.0-webdemo',
  webMode: true,
  openDatabaseWithKey: (key: Buffer) => {
    openVaultDatabase(key, paths.workingDir, paths.dbEnc);
    ctx.dataKey = key;
  },
  lockVault: () => {
    // Demo never locks the vault on logout (see /api/auth:logout below).
  },
  relaunch: () => {
    if (demoKey) {
      closeDatabase();
      openVaultDatabaseNow(demoKey);
    }
  },
};

function openVaultDatabaseNow(key: Buffer): void {
  openVaultDatabase(key, paths.workingDir, paths.dbEnc);
  ctx.dataKey = key;
}

/** Wipe + reseed when the calendar day (IST) has rolled over. Returns true if reseeded. */
function ensureFreshDay(): boolean {
  const today = istToday();
  let last = '';
  try {
    last = fs.readFileSync(DAY_FILE, 'utf8').trim();
  } catch { /* first boot */ }
  if (last === today && fs.existsSync(paths.dbEnc)) return false;
  console.log(`[demo] new demo day (${today}) — reseeding...`);
  try { closeDatabase(); } catch { /* ignore */ }
  // Wipe the data dir (vault, sessions, backups, assets, install stamp).
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f === '.demo-day') continue;
    fs.rmSync(path.join(DATA_DIR, f), { recursive: true, force: true });
  }
  paths = ensureDirs();
  ctx.paths = paths;
  fs.writeFileSync(DAY_FILE, today);
  return true;
}

async function bootDemo(): Promise<void> {
  const reseeded = ensureFreshDay();
  setExportSink('download');
  if (reseeded) {
    // Seed through the real handlers (doubles as live testing).
    await seedDemo(ctx, async (channel, req) => {
      const fn = handlerMap.get(channel as string);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn(req, ctx);
    });
  }
  demoKey = unlockDataKey(paths.keymeta, DEMO_USERNAME, DEMO_PASSWORD);
  openVaultDatabaseNow(demoKey);
  const user = verifyLogin(DEMO_USERNAME, DEMO_PASSWORD);
  if (!user) throw new Error('demo admin login failed');
  ctx.currentUser = user;
  console.log('[demo] vault unlocked, demo user active');
}

// ---- handler table (shared with the desktop app) ----
const handlerMap = new Map<string, (req: unknown, ctx: AppContext) => Promise<unknown> | unknown>();
const on: IpcOn = ((channel: string, handler: (req: unknown, ctx: AppContext) => Promise<unknown> | unknown) => {
  handlerMap.set(channel, handler);
}) as IpcOn;

// Channels that need demo-specific transport behavior.
const ADAPTER: Record<string, (req: unknown) => Promise<unknown> | unknown> = {
  // One visitor logging out must not lock the vault for everyone else.
  'auth:logout': async () => ({ ok: true as const }),
  // No auto-update in the browser demo.
  'app:checkForUpdates': async () => ({ ok: true as const, available: false }),
};

async function main(): Promise<void> {
  paths = ensureDirs();
  ctx.paths = paths;
  buildIpcHandlers(on, ctx);
  await bootDemo();

  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.post('/api/:channel', async (req, res) => {
    try {
      ensureFreshDay();
      // Day rollover wiped the vault mid-day: re-unlock transparently.
      if (!ctx.dataKey || !fs.existsSync(paths.dbEnc)) await bootDemo();
      const channel = req.params.channel;
      const adapted = ADAPTER[channel];
      if (adapted) return res.json(await adapted(req.body));
      const fn = handlerMap.get(channel);
      if (!fn) return res.status(404).json({ ok: false, error: 'unknown-channel' });
      const out = await fn(req.body ?? {}, ctx);
      res.json(out ?? { ok: true });
    } catch (e) {
      res.json(ipcErrorPayload(e));
    }
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, demo: true, day: istToday() }));

  // Static React build (Vite web build with VITE_WEB_DEMO=1). SPA fallback last.
  // WEB_DIST resolution: explicit env first, then dev-repo layout, then
  // deploy-package layout (dist-web next to server.cjs or under cwd).
  const distCandidates = [
    process.env.WEB_DIST,
    path.join(HERE, '..', 'dist-web'),
    path.join(HERE, 'dist-web'),
    path.join(process.cwd(), 'dist-web'),
  ].filter((p): p is string => !!p);
  const dist = distCandidates.find((p) => fs.existsSync(p)) ?? distCandidates[0]!;
  if (!fs.existsSync(dist)) {
    console.error(`[demo] web client not found — looked in: ${distCandidates.join(', ')}`);
    console.error('[demo] build it with: npm run build:web');
    process.exit(1);
  }
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

  app.listen(PORT, () => {
    console.log(`[demo] Invexom EMS web demo on http://localhost:${PORT} (day ${istToday()})`);
  });
}

main().catch((e) => {
  console.error('[demo] fatal:', e);
  process.exit(1);
});
