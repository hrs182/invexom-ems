/**
 * Screenshot the M1 UI in light + dark mode using the REAL Electron runtime
 * under Xvfb (more faithful than a plain browser: real Chromium + app shell).
 * The renderer uses the mock IPC adapter over http:// (dev-only path).
 *
 * Run:  xvfb-run -a npx electron tools/screenshot-electron.cjs
 * Expects `vite preview` on :4173.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');

const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  console.log('shot:', name);
}

const JS_SET_THEME = (mode) => `
  localStorage.setItem('invexom-ems-theme', JSON.stringify({ state: { mode: '${mode}' }, version: 0 }));
  location.reload();
  true;
`;

const JS_LOGIN = `
  (() => {
    const setVal = (sel, v) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal('input[autocomplete="username"]', 'admin');
    setVal('input[autocomplete="current-password"]', 'admin1234');
    document.querySelector('button[type="submit"]').click();
    return true;
  })();
`;

const JS_WAIT_NAV = `
  new Promise((resolve) => {
    const t = setInterval(() => {
      if (document.querySelector('nav[aria-label="Main navigation"]')) { clearInterval(t); resolve(true); }
    }, 200);
    setTimeout(() => { clearInterval(t); resolve(false); }, 15000);
  });
`;

const JS_GOTO = (label) => `
  (() => {
    const btn = [...document.querySelectorAll('nav[aria-label="Main navigation"] button')]
      .find((b) => b.textContent.trim() === '${label}');
    if (btn) { btn.click(); return true; }
    return false;
  })();
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1366, height: 768, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  try {
    await win.loadURL('http://localhost:4173/');
    const wc = win.webContents;

    // 1. Login (light)
    await wc.executeJavaScript(JS_SET_THEME('light'));
    await sleep(1200);
    await shot(win, '01-login-light');

    // 2. Login (dark)
    await wc.executeJavaScript(JS_SET_THEME('dark'));
    await sleep(1200);
    await shot(win, '02-login-dark');

    // 3. Dashboard (light)
    await wc.executeJavaScript(JS_SET_THEME('light'));
    await sleep(1000);
    await wc.executeJavaScript(JS_LOGIN);
    const navOk = await wc.executeJavaScript(JS_WAIT_NAV);
    if (!navOk) throw new Error('login did not reach dashboard');
    await sleep(800);
    await shot(win, '03-dashboard-light');

    // 4. Dashboard (dark)
    await wc.executeJavaScript(JS_SET_THEME('dark'));
    await sleep(1000);
    await wc.executeJavaScript(JS_LOGIN);
    await wc.executeJavaScript(JS_WAIT_NAV);
    await sleep(800);
    await shot(win, '04-dashboard-dark');

    // 5. Settings (dark)
    await wc.executeJavaScript(JS_GOTO('Settings'));
    await sleep(800);
    await shot(win, '05-settings-dark');

    // 6. License (dark)
    await wc.executeJavaScript(JS_GOTO('License'));
    await sleep(800);
    await shot(win, '06-license-dark');

    // 7. Backup (light)
    await wc.executeJavaScript(JS_SET_THEME('light'));
    await sleep(1000);
    await wc.executeJavaScript(JS_LOGIN);
    await wc.executeJavaScript(JS_WAIT_NAV);
    await wc.executeJavaScript(JS_GOTO('Backup'));
    await sleep(800);
    await shot(win, '07-backup-light');

    console.log('done ->', OUT);
  } catch (e) {
    console.error('screenshot failed:', e);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
