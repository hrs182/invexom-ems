/**
 * Google Drive backup (FR-BKP-04).
 *
 * Opt-in online feature for the offline-first desktop app:
 * - "Save to Drive": OAuth 2.0 via the user's DEFAULT BROWSER (loopback
 *   redirect), then automatic upload of the ENCRYPTED backup (.db.enc —
 *   Google can never read the data) into a dedicated "Invexom EMS Backups"
 *   folder, with the date in the file name.
 * - List / download / restore Drive backups any time.
 * - Tokens live in app_rules (encrypted at rest by the vault).
 *
 * node:http / node:https are imported dynamically so the serverless browser
 * demo bundle (which never calls these) still builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './database.js';
import { shell } from './electron-shim.js';
import { runBackup } from './backup.js';

const DRIVE_FOLDER = 'Invexom EMS Backups';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

/**
 * OAuth client ID for the "Desktop app" credential. Ships empty — the school
 * (or Invexom, baked into the installer) creates it once in Google Cloud
 * Console; see docs/GOOGLE-DRIVE-SETUP.md. Overridable per-install.
 */
export const DRIVE_CLIENT_ID_DEFAULT = '419633730679-oo3nghdjcl0nvl0rmjs14blm9mlfoo9f.apps.googleusercontent.com';

export function getDriveClientId(): string {
  try {
    const row = getDb().prepare("SELECT value FROM app_rules WHERE key='drive.clientId'").get() as { value: string } | undefined;
    if (row?.value) return row.value;
  } catch { /* ignore */ }
  return DRIVE_CLIENT_ID_DEFAULT;
}

export function setDriveClientId(id: string): void {
  getDb().prepare(
    "INSERT INTO app_rules (key, value) VALUES ('drive.clientId', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
  ).run(id.trim());
}

interface DriveTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  email?: string;
}

function loadTokens(): DriveTokens | null {
  try {
    const row = getDb().prepare("SELECT value FROM app_rules WHERE key='drive.tokens'").get() as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as DriveTokens) : null;
  } catch { return null; }
}

function saveTokens(t: DriveTokens): void {
  getDb().prepare(
    "INSERT INTO app_rules (key, value) VALUES ('drive.tokens', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
  ).run(JSON.stringify(t));
}

export function driveStatus(): { connected: boolean; email?: string; clientIdSet: boolean } {
  const t = loadTokens();
  return { connected: !!t?.refresh_token, email: t?.email, clientIdSet: getDriveClientId().length > 0 };
}

export function driveDisconnect(): void {
  getDb().prepare("DELETE FROM app_rules WHERE key='drive.tokens'").run();
}

async function httpsRequest(opts: {
  method: string; host: string; path: string; headers?: Record<string, string>;
}, body?: Buffer | string): Promise<{ status: number; json: any; raw: Buffer }> {
  const https = await import('node:https');
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: opts.method, host: opts.host, path: opts.path, headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let json: any = null;
          try { json = JSON.parse(raw.toString('utf8')); } catch { /* not JSON */ }
          resolve({ status: res.statusCode ?? 0, json, raw });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const r = await httpsRequest(
    {
      method: 'POST', host: 'oauth2.googleapis.com', path: '/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(body.length) },
    },
    body,
  );
  if (r.status !== 200 || !r.json?.access_token) {
    throw new Error(r.json?.error_description || r.json?.error || `token exchange failed (${r.status})`);
  }
  return r.json;
}

async function driveApi(method: string, path: string, token: string, body?: Buffer, contentType?: string): Promise<any> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body) {
    headers['Content-Type'] = contentType || 'application/octet-stream';
    headers['Content-Length'] = String(body.length);
  }
  const r = await httpsRequest({ method, host: 'www.googleapis.com', path, headers }, body);
  if (r.status === 401) throw new Error('drive-auth-expired');
  if (r.status >= 300) throw new Error(r.json?.error?.message || `Drive API error (${r.status})`);
  return r.json;
}

/** Valid access token, refreshing silently when needed. */
async function accessToken(): Promise<string> {
  const t = loadTokens();
  if (!t?.refresh_token) throw new Error('drive-not-connected');
  if (Date.now() < t.expiry_date - 60000) return t.access_token;
  const nt = await tokenRequest({
    client_id: getDriveClientId(), refresh_token: t.refresh_token, grant_type: 'refresh_token',
  });
  const updated: DriveTokens = { ...t, access_token: nt.access_token, expiry_date: Date.now() + nt.expires_in * 1000 };
  saveTokens(updated);
  return updated.access_token;
}

/**
 * Connect: opens the user's default browser for Google sign-in, waits for the
 * loopback callback, then stores tokens. Uploads do NOT start here — the
 * caller ("Save to Drive") continues automatically after connect.
 */
export async function driveConnect(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const clientId = getDriveClientId();
  if (!clientId) return { ok: false, error: 'Set your Google Client ID first (see setup guide).' };
  try {
    const http = await import('node:http');
    const server = http.createServer();
    await new Promise<void>((res, rej) => {
      server.on('error', rej);
      server.listen(0, '127.0.0.1', () => res());
    });
    const port = (server.address() as { port: number }).port;
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      '&response_type=code' +
      `&scope=${encodeURIComponent(SCOPES)}` +
      '&access_type=offline&prompt=consent';
    await shell.openExternal(authUrl);

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { server.close(); } catch { /* ignore */ }
        reject(new Error('Timed out waiting for Google sign-in (5 minutes). Please try again.'));
      }, 5 * 60 * 1000);
      server.on('request', (req: any, res: any) => {
        try {
          const u = new URL(req.url || '', 'http://127.0.0.1');
          if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
          const c = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">' +
            '<h2>✓ Connected to Google Drive</h2>' +
            '<p>You can close this tab and return to Invexom EMS.</p></body></html>',
          );
          clearTimeout(timer);
          try { server.close(); } catch { /* ignore */ }
          if (c) resolve(c);
          else reject(new Error(err === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed.'));
        } catch (e) {
          clearTimeout(timer);
          try { server.close(); } catch { /* ignore */ }
          reject(e);
        }
      });
    });

    const tokens = await tokenRequest({
      client_id: clientId, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    const me = await driveApi('GET', '/oauth2/v2/userinfo', tokens.access_token);
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: Date.now() + tokens.expires_in * 1000,
      email: me?.email,
    });
    return { ok: true, email: me?.email ?? '' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function ensureDriveFolder(token: string): Promise<string> {
  const q = encodeURIComponent(`name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveApi('GET', `/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`, token);
  if (found?.files?.[0]?.id) return found.files[0].id as string;
  const created = await driveApi(
    'POST', '/drive/v3/files?fields=id',
    token,
    Buffer.from(JSON.stringify({ name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' })),
    'application/json',
  );
  return created.id as string;
}

function datedFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `Invexom-EMS-Backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db.enc`;
}

/**
 * "Save to Drive": creates a fresh encrypted backup, then uploads it to the
 * Drive folder with the date in the file name. Auto-connects first if needed.
 */
export async function driveUploadBackup(
  paths: { dbEnc: string; backupsDir: string; workingDb: string },
  dataKey: Buffer,
  onStatus?: (stage: string) => void,
): Promise<{ ok: true; fileName: string } | { ok: false; error: string }> {
  try {
    if (!loadTokens()?.refresh_token) {
      onStatus?.('connecting');
      const c = await driveConnect();
      if (!c.ok) return c;
    }
    const token = await accessToken();
    onStatus?.('preparing');
    const folderId = await ensureDriveFolder(token);
    const r = runBackup(paths, dataKey, 'manual');
    if (!r.ok) return r;
    const fileName = datedFileName();
    const bytes = fs.readFileSync(r.path);
    onStatus?.('uploading');
    // Multipart upload: metadata + file bytes.
    const boundary = 'ems_' + Date.now().toString(36);
    const meta = Buffer.from(
      JSON.stringify({ name: fileName, parents: [folderId], description: 'Invexom EMS encrypted backup' }),
      'utf8',
    );
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
      meta,
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    await driveApi(
      'POST', '/upload/drive/v3/files?uploadType=multipart&fields=id',
      token, body, `multipart/related; boundary=${boundary}`,
    );
    getDb().prepare(
      "INSERT INTO backup_log (file_name, size_bytes, triggered_by, status) VALUES (?, ?, 'drive', 'ok')",
    ).run(fileName, bytes.length);
    return { ok: true, fileName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'drive-auth-expired' || msg === 'drive-not-connected') driveDisconnect();
    return { ok: false, error: msg };
  }
}

export interface DriveFile { id: string; name: string; size: string; createdTime: string }

export async function driveListBackups(): Promise<{ ok: true; files: DriveFile[] } | { ok: false; error: string }> {
  try {
    const token = await accessToken();
    const folderId = await ensureDriveFolder(token);
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const r = await driveApi(
      'GET',
      `/drive/v3/files?q=${q}&fields=files(id,name,size,createdTime)&orderBy=createdTime desc&pageSize=50`,
      token,
    );
    return { ok: true, files: (r?.files ?? []) as DriveFile[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download a Drive backup into the local backups dir and register it in
 * backup_log, so the normal "Restore" flow can restore it any time.
 */
export async function driveDownloadBackup(
  fileId: string, fileName: string, backupsDir: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const token = await accessToken();
    const https = await import('node:https');
    const raw: Buffer = await new Promise((resolve, reject) => {
      https.get(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
        (res) => {
          if (res.statusCode !== 200) { reject(new Error(`Download failed (${res.statusCode})`)); return; }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        },
      ).on('error', reject);
    });
    fs.mkdirSync(backupsDir, { recursive: true });
    const dest = path.join(backupsDir, fileName);
    fs.writeFileSync(dest, raw);
    getDb().prepare(
      "INSERT INTO backup_log (file_name, size_bytes, triggered_by, status) VALUES (?, ?, 'drive-download', 'ok')",
    ).run(fileName, raw.length);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
