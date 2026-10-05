#!/usr/bin/env node
/**
 * Screenshot the M1 UI in light + dark mode (dev-only, uses the mock IPC adapter).
 * Usage: node tools/screenshot.mjs  (expects `vite preview` on :4173)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const URL = 'http://localhost:4173/';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

// Deterministic theme per run
async function setTheme(mode) {
  await page.evaluate((m) => {
    localStorage.setItem('invexom-ems-theme', JSON.stringify({ state: { mode: m }, version: 0 }));
  }, mode);
  await page.reload();
  await page.waitForTimeout(800);
}

async function login() {
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
  await page.fill('input[autocomplete="username"]', 'admin');
  await page.fill('input[autocomplete="current-password"]', 'admin1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 10000 });
  await page.waitForTimeout(600);
}

async function shot(name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot:', name);
}

await page.goto(URL, { waitUntil: 'networkidle' });

// 1. Login screen (light)
await setTheme('light');
await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
await shot('01-login-light');

// 2. Login (dark)
await setTheme('dark');
await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
await shot('02-login-dark');

// 3. Dashboard (light)
await setTheme('light');
await login();
await shot('03-dashboard-light');

// 4. Dashboard (dark)
await setTheme('dark');
await login();
await shot('04-dashboard-dark');

// 5. Settings masters (dark)
await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
await page.waitForTimeout(600);
await shot('05-settings-dark');

// 6. License screen (dark)
await page.getByRole('navigation').getByRole('button', { name: 'License' }).click();
await page.waitForTimeout(600);
await shot('06-license-dark');

// 7. Backup screen (light)
await setTheme('light');
await login();
await page.getByRole('navigation').getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(600);
await shot('07-backup-light');

await browser.close();
console.log('done ->', OUT);
