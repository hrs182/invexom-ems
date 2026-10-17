/**
 * Serverless browser demo runtime.
 *
 * Boots the REAL EMS handler table (buildIpcHandlers — the same 158
 * handlers as the desktop app) inside the page, backed by sql.js
 * (SQLite-WASM) instead of better-sqlite3. No server, no network.
 *
 * Demo semantics mirror web/server.ts:
 * - The vault is "unlocked" at boot; visitors still start at the login page.
 * - auth:logout never locks anything (per-visitor isolation anyway).
 * - Demo data persists in this browser via IndexedDB, but only for the
 *   same IST calendar day — at midnight it reseeds fresh.
 */
// Polyfills FIRST — static import so Vite inlines them into this chunk
// (no separate file that can go missing on the server).
import './browser-polyfills.js';
import { buildIpcHandlers, type AppContext, type IpcOn } from '../electron/ipc.js';
import {
  initBrowserDb, exportBrowserDb, closeDatabase, getDb, newSessionDbPath,
  type Db,
} from './browser-db/database-browser.js';
import { emsPaths } from '../electron/services/paths.js';
import { setExportSink } from '../electron/services/export.js';
import { verifyLogin } from '../electron/services/users.js';
import { __dump as dumpFs, __restore as restoreFs, __readRaw as readRawFs } from './shims/fs.js';
import { seedDemo, istToday, DEMO_USERNAME, DEMO_PASSWORD } from './seed-demo.js';
import { loadPersisted, savePersisted } from './browser-store.js';
import { unlockDataKey } from '../electron/services/secure-store.js';
import { Buffer } from 'buffer';

type Handler = (req: any, ctx: AppContext) => Promise<any> | any;

let table: Map<string, Handler> | null = null;
let bootPromise: Promise<void> | null = null;
let currentDay = '';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Browser AppContext: vault ceremony runs against memfs; nothing locks. */
function makeCtx(): AppContext {
  const paths = emsPaths();
  return {
    paths,
    dataKey: null,
    currentUser: null,
    demoBuild: true,
    version: '1.0.0-browserdemo',
    webMode: true,
    openDatabaseWithKey: (_key: Buffer) => {
      // DB is already open (initBrowserDb ran at boot).
    },
    lockVault: () => {
      // Per-visitor isolation: just persist, never wipe.
      persistSoon();
    },
    relaunch: () => {
      // Browser: the shared restoreBackup() closed the DB and decrypted the
      // backup into the virtual session file. Re-open it in sql.js, persist
      // to IndexedDB, then reload so the app boots from the restored data.
      void (async () => {
        try {
          // Read the decrypted session bytes straight from memfs (bypassing
          // the readFileSync virtual-DB interception — the live DB is closed
          // at this point, so exportDbBytes() would fail).
          const sessionPath = newSessionDbPath(ctx.paths.workingDir);
          const bytes = readRawFs(sessionPath);
          if (!bytes || !bytes.length) throw new Error('restored session file not found in memfs');
          await initBrowserDb(bytes);
          const user = verifyLogin(DEMO_USERNAME, DEMO_PASSWORD);
          ctx.currentUser = user ?? null;
          await persist();
        } catch (e) {
          console.error('browser relaunch after restore failed', e);
        } finally {
          location.reload();
        }
      })();
    },
  };
}

let ctx: AppContext = makeCtx();

async function persist(): Promise<void> {
  if (!currentDay) return;
  const bytes = exportBrowserDb();
  if (!bytes) return;
  await savePersisted({ day: currentDay, db: bytes, files: dumpFs() });
}

function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { persistTimer = null; void persist(); }, 1500);
}

async function bootFresh(): Promise<void> {
  await initBrowserDb();
  await seedDemo(ctx, async (channel: string, req: unknown) => {
    const fn = table?.get(channel);
    if (!fn) throw new Error(`no handler for ${channel}`);
    return fn(req, ctx);
  });
  const user = verifyLogin(DEMO_USERNAME, DEMO_PASSWORD);
  if (!user) throw new Error('demo admin login failed');
  ctx.currentUser = user;
  currentDay = istToday();
  await persist();
}

async function boot(): Promise<void> {
  setExportSink('download');
  table = new Map<string, Handler>();
  const on = ((channel: string, handler: Handler) => {
    table!.set(channel, handler);
  }) as IpcOn;
  buildIpcHandlers(on, ctx);

  // Demo-specific transport behavior (mirrors web/server.ts ADAPTER).
  table.set('app:checkForUpdates', async () => ({ ok: true as const, available: false }) as any);
  // Browser: report the live in-memory DB size (the shared handler stats a
  // virtual path and reports 0).
  const origDiag = table.get('diagnostics:info');
  if (origDiag) {
    table.set('diagnostics:info', async (req: unknown) => {
      const info = await origDiag(req, ctx);
      try {
        const bytes = exportBrowserDb();
        if (bytes) info.dbSizeBytes = bytes.length;
      } catch { /* keep reported value */ }
      return info;
    });
  }
  // sql.js has no FTS5: Ctrl+K global search runs as LIKE over the same
  // trigger-maintained global_search index the desktop fills via FTS5.
  table.set('search:query', ({ q }: { q: string }) => {
    if (!ctx.currentUser) throw new Error('auth-required');
    const query = (q ?? '').trim();
    if (query.length < 2) return [];
    const like = `%${query.replace(/[%_]/g, '')}%`;
    const rows = getDb().prepare(
      `SELECT kind, ref_id, title, subtitle FROM global_search
       WHERE title LIKE ? OR subtitle LIKE ? OR tokens LIKE ?
       ORDER BY kind, title LIMIT 25`,
    ).all(like, like, like) as { kind: string; ref_id: number; title: string; subtitle: string }[];
    return rows.map((r) => ({ kind: r.kind, id: r.ref_id, title: r.title, subtitle: r.subtitle }));
  });

  const today = istToday();
  const saved = await loadPersisted();
  if (saved && saved.day === today && saved.db.length > 0) {
    restoreFs(saved.files);
    await initBrowserDb(saved.db);
    // Genuine vault unlock from the restored keymeta (same as desktop login).
    try {
      ctx.dataKey = unlockDataKey(ctx.paths.keymeta, DEMO_USERNAME, DEMO_PASSWORD);
    } catch {
      ctx.dataKey = Buffer.from('browser-demo-session-key');
    }
    const user = verifyLogin(DEMO_USERNAME, DEMO_PASSWORD);
    ctx.currentUser = user ?? null;
    currentDay = today;
  } else {
    // Fresh day (or first visit): wipe memfs + reseed.
    restoreFs([]);
    await bootFresh();
  }
  // Keep the demo alive across the session.
  window.addEventListener('pagehide', () => { void persist(); });
  setInterval(() => { void persist(); }, 30000);
}

/** Ensure boot completed (and the IST day hasn't rolled over). */
async function ready(): Promise<Map<string, Handler>> {
  if (!bootPromise) bootPromise = boot();
  await bootPromise;
  if (istToday() !== currentDay) {
    // Midnight rollover while the page was open: reseed fresh.
    closeDatabase();
    bootPromise = boot();
    await bootPromise;
  }
  return table!;
}

/**
 * In-page invoke — drop-in replacement for the fetch transport.
 * Persists (debounced) after every call so a refresh keeps today's work.
 */
export async function browserInvoke(channel: string, req: unknown): Promise<unknown> {
  const t = await ready();
  const fn = t.get(channel);
  if (!fn) throw new Error(`no handler for ${channel}`);
  try {
    return await fn(req, ctx);
  } finally {
    persistSoon();
  }
}

export type { Db };
