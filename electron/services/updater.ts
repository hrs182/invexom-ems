import https from 'node:https';

/**
 * Manual update check (prompt §3: "the app checks a tiny static version JSON
 * hosted on invexom.com"). Strictly user-initiated — no phoning home, no
 * auto-update service, zero infrastructure cost beyond a static file that
 * Harsh uploads to invexom.com/ems/version.json:
 *   { "version": "1.0.1", "url": "https://invexom.com/ems/download.html", "notes": "..." }
 */

export interface VersionJson { version: string; url: string; notes?: string }

function fetchJson(url: string, timeoutMs = 10000): Promise<VersionJson> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Invexom-EMS' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return; }
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(body) as VersionJson); } catch { reject(new Error('bad-version-json')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

function isNewer(latest: string, current: string): boolean {
  const pa = latest.split('.').map(Number);
  const pb = current.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] ?? 0, b = pb[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export async function checkForUpdates(currentVersion: string): Promise<
  { available: boolean; version?: string; url?: string; notes?: string; error?: string }
> {
  try {
    const remote = await fetchJson('https://invexom.com/ems/version.json');
    if (remote.version && isNewer(remote.version, currentVersion)) {
      return { available: true, version: remote.version, url: remote.url, notes: remote.notes };
    }
    return { available: false };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message : 'update-check-failed' };
  }
}
