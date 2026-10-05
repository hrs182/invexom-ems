#!/usr/bin/env node
/**
 * Screenshot driver via Chrome DevTools Protocol (no extra deps).
 * Clean rewrite: launch chrome blank, create app target via /json/new (PUT),
 * attach directly to its webSocketDebuggerUrl, drive login/theme/nav, capture PNGs.
 * Run: node tools/cdp-shots.mjs   (expects `vite preview` on :4173)
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const CHROME = '/opt/meta-chromium/chrome';
const APP_URL = 'http://127.0.0.1:4173/';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(port, p, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${p}`, { method }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------- launch chrome (blank initial tab: no LNA issues) ----------
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--remote-debugging-port=0',
  '--user-data-dir=/tmp/ems-chrome-profile',
  '--window-size=1366,768',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const timer = setTimeout(() => reject(new Error('devtools timeout')), 30000);
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
  chrome.on('error', reject);
});
const dbgPort = Number(new URL(wsUrl).port);
console.log('devtools port:', dbgPort);

// ---------- create the app target directly (browser-initiated: no LNA block) ----------
const created = await httpJson(dbgPort, `/json/new?${encodeURIComponent(APP_URL)}`, 'PUT');
console.log('target:', created.url, '|', created.webSocketDebuggerUrl);
const pageU = new URL(created.webSocketDebuggerUrl);

// ---------- minimal websocket client ----------
function wsConnect() {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(dbgPort, '127.0.0.1', () => {
      socket.write(
        `GET ${pageU.pathname} HTTP/1.1\r\nHost: 127.0.0.1:${dbgPort}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let buf = Buffer.alloc(0);
    let handshook = false;
    const pending = new Map();
    let msgId = 0;
    let frameBuf = Buffer.alloc(0);

    function sendFrame(data) {
      const payload = Buffer.from(data);
      const mask = crypto.randomBytes(4);
      let header;
      if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
      else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
      else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    }

    function pumpFrames() {
      while (frameBuf.length >= 2) {
        const fin = (frameBuf[0] & 0x80) !== 0;
        const opcode = frameBuf[0] & 0x0f;
        let len = frameBuf[1] & 0x7f;
        let off = 2;
        if (len === 126) { len = frameBuf.readUInt16BE(2); off = 4; }
        else if (len === 127) { len = Number(frameBuf.readBigUInt64BE(2)); off = 10; }
        const masked = (frameBuf[1] & 0x80) !== 0;
        if (masked) off += 4;
        if (frameBuf.length < off + len) return;
        const payload = frameBuf.subarray(off, off + len);
        frameBuf = frameBuf.subarray(off + len);
        if (opcode === 0x8) { socket.end(); return; }
        if (opcode === 0x1 || opcode === 0x0) {
          try {
            const msg = JSON.parse(payload.toString());
            if (msg.id && pending.has(msg.id)) {
              const { resolve: res, reject: rej } = pending.get(msg.id);
              pending.delete(msg.id);
              if (msg.error) rej(new Error(JSON.stringify(msg.error)));
              else res(msg.result);
            }
          } catch { /* ignore */ }
        }
        void fin;
      }
    }

    socket.on('data', (d) => {
      if (!handshook) {
        buf = Buffer.concat([buf, d]);
        if (buf.includes('\r\n\r\n')) handshook = true;
        return;
      }
      frameBuf = Buffer.concat([frameBuf, d]);
      pumpFrames();
    });
    socket.on('error', reject);
    const check = setInterval(() => { if (handshook) { clearInterval(check); resolve({ send: (method, params = {}) => {
      const id = ++msgId;
      return new Promise((res, rej) => { pending.set(id, { resolve: res, reject: rej }); sendFrame(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('cdp timeout: ' + method)); } }, 30000); });
    }, close: () => socket.end() }); } }, 50);
  });
}

const { send, close } = await wsConnect();
await send('Page.enable');
await send('Runtime.enable');

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  const v = r?.result?.value;
  if (r?.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return v;
}
async function pollFor(js, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(js)) return true;
    await sleep(300);
  }
  return false;
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('shot:', name);
}

const SET_THEME = (mode) => `localStorage.setItem('invexom-ems-theme', JSON.stringify({state:{mode:'${mode}'},version:0})); location.reload();`;
const LOGIN_JS = `(() => {
  const setVal = (sel, v) => {
    const el = document.querySelector(sel);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal('input[autocomplete="username"]', 'admin');
  setVal('input[autocomplete="current-password"]', 'admin1234');
  document.querySelector('button[type="submit"]').click();
  return true;
})()`;
const HAS_NAV = `!!document.querySelector('nav[aria-label="Main navigation"]')`;
const GOTO = (label) => `(() => { const b = [...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find(x => x.textContent.trim() === '${label}'); if (b) { b.click(); return true; } return false; })()`;

try {
  await sleep(3000);
  const href = await evaluate(`location.href`);
  const bodyPreview = await evaluate(`document.body.innerText.slice(0,200)`);
  console.log('BOOT-DEBUG href:', href);
  console.log('BOOT-DEBUG body:', JSON.stringify(bodyPreview));
  if (!await pollFor(`!!document.querySelector('input[autocomplete="username"]')`)) {
    const targets = await httpJson(dbgPort, '/json/list');
    console.log('TARGETS:', JSON.stringify(targets.filter(t => t.type === 'page').map(t => t.url)));
    throw new Error('app did not boot');
  }

  // 1-2. login screens
  await evaluate(SET_THEME('light')); await sleep(1500); await shot('01-login-light');
  await evaluate(SET_THEME('dark')); await sleep(1500); await shot('02-login-dark');

  // 3. dashboard light
  await evaluate(SET_THEME('light')); await sleep(1200);
  await evaluate(LOGIN_JS);
  if (!await pollFor(HAS_NAV)) throw new Error('login failed (light)');
  await sleep(800); await shot('03-dashboard-light');

  // 4. dashboard dark
  await evaluate(SET_THEME('dark')); await sleep(1200);
  await evaluate(LOGIN_JS);
  if (!await pollFor(HAS_NAV)) throw new Error('login failed (dark)');
  await sleep(800); await shot('04-dashboard-dark');

  // 5-6. settings + license (dark)
  await evaluate(GOTO('Settings')); await sleep(800); await shot('05-settings-dark');
  await evaluate(GOTO('License')); await sleep(800); await shot('06-license-dark');

  // 7. backup (light)
  await evaluate(SET_THEME('light')); await sleep(1200);
  await evaluate(LOGIN_JS);
  if (!await pollFor(HAS_NAV)) throw new Error('login failed (backup)');
  await evaluate(GOTO('Backup')); await sleep(800); await shot('07-backup-light');

  console.log('done ->', OUT);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  close();
  chrome.kill();
}
