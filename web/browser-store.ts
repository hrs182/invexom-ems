/**
 * IndexedDB persistence for the serverless browser demo.
 *
 * Same-day rule: the DB bytes + memfs snapshot are stored with the IST
 * calendar day. On boot, a snapshot from a previous day is discarded and
 * the demo reseeds fresh — demo entries never survive past midnight IST.
 */
const DB_NAME = 'invexom-ems-demo';
const STORE = 'kv';
const KEY = 'snapshot-v1';

export interface PersistedDemo {
  day: string; // YYYY-MM-DD (Asia/Kolkata)
  db: Uint8Array;
  files: [string, string][]; // memfs dump: path -> base64
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPersisted(): Promise<PersistedDemo | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PersistedDemo) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function savePersisted(p: PersistedDemo): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(p, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch { /* persistence is best-effort */ }
}

export async function clearPersisted(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch { /* ignore */ }
}
