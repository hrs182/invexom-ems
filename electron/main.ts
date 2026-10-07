import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureDirs, type EmsPaths } from './services/paths.js';
import { openDatabase, closeDatabase, getDb, vaultOpenStrategy } from './services/database.js';
import { decryptFile, encryptFile, secureWipe } from './services/secure-store.js';
import { schedulerTick } from './services/backup.js';
import { registerIpc, type AppContext } from './ipc.js';
import type { SafeUser } from '../shared/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface BuildInfo { version: string; demoBuild: boolean }
function readBuildInfo(): BuildInfo {
  try {
    const raw = fs.readFileSync(path.join(HERE, 'build-info.json'), 'utf8');
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return { version: app.getVersion(), demoBuild: process.env.EMS_DEMO === '1' };
  }
}

const buildInfo = readBuildInfo();

let mainWindow: BrowserWindow | null = null;
let paths: EmsPaths;
const ctx: AppContext = {
  paths: undefined as unknown as EmsPaths,
  dataKey: null,
  currentUser: null,
  demoBuild: buildInfo.demoBuild,
  version: buildInfo.version,
  openDatabaseWithKey: (key: Buffer) => {
    const { workingDb, dbEnc } = ctx.paths;
    const strategy = vaultOpenStrategy(workingDb, dbEnc);
    // 'fresh' = first-time setup, no vault snapshot exists yet: there is
    // nothing to decrypt (decrypting here used to crash with ENOENT on the
    // missing .db.enc file). better-sqlite3 creates the file on open.
    // An orphan working file (vault deleted externally) is opened as-is —
    // never wiped, so no data is destroyed.
    if (strategy === 'decrypt') decryptFile(key, dbEnc, workingDb);
    openDatabase(workingDb);
  },
  lockVault: () => {
    try {
      // Flush + re-encrypt + wipe the working copy (NFR-S-03).
      try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch { /* DB not open */ }
      if (ctx.dataKey && fs.existsSync(ctx.paths.workingDb)) {
        encryptFile(ctx.dataKey, ctx.paths.workingDb, ctx.paths.dbEnc);
        secureWipe(ctx.paths.workingDb);
        try { fs.unlinkSync(ctx.paths.workingDb + '-wal'); } catch { /* ignore */ }
        try { fs.unlinkSync(ctx.paths.workingDb + '-shm'); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    closeDatabase();
    ctx.dataKey = null;
    ctx.currentUser = null;
  },
  relaunch: () => {
    app.relaunch();
    app.exit(0);
  },
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: 'Invexom EMS',
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  if (process.env.EMS_DEV === '1') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(HERE, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // If the preload script itself fails to load, the bridge never exists and
  // the UI can only report "bridge unavailable". Surface the real cause in a
  // native dialog so it is diagnosable on the user's machine.
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    dialog.showErrorBox(
      'EMS preload failed',
      `${preloadPath}\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  });
}

app.whenReady().then(() => {
  paths = ensureDirs();
  ctx.paths = paths;
  registerIpc(ctx);

  // Renderer -> main errors surface here; never leak stack to UI in prod.
  createWindow();

  // Backup scheduler tick (every minute).
  setInterval(() => {
    try {
      if (ctx.dataKey) schedulerTick(ctx.paths, ctx.dataKey);
    } catch { /* scheduler must never crash the app */ }
  }, 60_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Encrypt + wipe the working DB on quit (NFR-S-03).
app.on('before-quit', () => {
  try { ctx.lockVault(); } catch { /* ignore */ }
});

// Single instance: second launch focuses the running app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

export function getCtx(): AppContext { return ctx; }
export function getCurrentUser(): SafeUser | null { return ctx.currentUser; }
