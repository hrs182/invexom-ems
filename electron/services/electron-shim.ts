/**
 * Safe access to Electron APIs that also works in plain Node (web demo server).
 *
 * In the Electron main process, require('electron') returns the real API.
 * In plain Node the electron npm package exports just the executable path
 * string — so every export below is undefined there, and call sites must
 * guard usage (e.g. `if (!ctx.webMode)`).
 */
import { createRequire } from 'node:module';
// Type-only: erased at runtime, but gives desktop code full Electron typing.
import type { ipcMain as IpcMainT, dialog as DialogT, shell as ShellT, BrowserWindow as BrowserWindowT, app as AppT } from 'electron';

// Works in ESM source, and also when bundled to CJS (esbuild) where
// import.meta.url is undefined but __filename exists.
declare const __filename: string | undefined;
const baseUrl: string | undefined =
  typeof import.meta !== 'undefined' && import.meta.url
    ? import.meta.url
    : typeof __filename !== 'undefined'
      ? __filename
      : undefined;
const _require = createRequire(baseUrl ?? process.cwd() + '/');

function load(): Record<string, any> {
  try {
    const mod = _require('electron');
    return mod && typeof mod === 'object' ? (mod as Record<string, any>) : {};
  } catch {
    return {};
  }
}

const e = load();

export const ipcMain: typeof IpcMainT = e.ipcMain;
export const dialog: typeof DialogT = e.dialog;
export const shell: typeof ShellT = e.shell;
export const BrowserWindow: typeof BrowserWindowT = e.BrowserWindow;
export const app: typeof AppT = e.app;
