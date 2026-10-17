import type { IpcChannels } from '@shared/types';

declare global {
  /** Build timestamp baked in by vite.config.ts `define`. */
  const __EMS_BUILD_TIME__: string;
  interface Window {
    ems?: {
      invoke: <K extends keyof IpcChannels>(channel: K, req: IpcChannels[K]['req']) => Promise<IpcChannels[K]['res']>;
      openFile: (opts: { title: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

/**
 * Typed IPC client. Four transports, in order:
 * 1. Electron packaged app (file://): window.ems always exists.
 * 2. Serverless browser demo (VITE_BROWSER_DEMO=1): the real 158 handlers
 *    run in-page against sql.js (SQLite-WASM) — no server, static files only.
 * 3. Web demo (VITE_WEB_DEMO=1): HTTP POST to the demo server's /api/<channel>.
 * 4. Plain browser dev/preview (http://): mock adapter for UI development.
 */
export async function invoke<K extends keyof IpcChannels>(
  channel: K,
  req: IpcChannels[K]['req'],
): Promise<IpcChannels[K]['res']> {
  if (window.ems?.invoke) return window.ems.invoke(channel, req);
  if (import.meta.env.VITE_BROWSER_DEMO) {
    // browser-app.ts statically imports the polyfills first, so they're inlined.
    const { browserInvoke } = await import('../../web/browser-app.js');
    return browserInvoke(channel, req) as Promise<IpcChannels[K]['res']>;
  }
  if (import.meta.env.VITE_WEB_DEMO) {
    const res = await fetch(`/api/${channel}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req ?? {}),
    });
    if (!res.ok) throw new Error(`Demo server error (${res.status})`);
    return (await res.json()) as IpcChannels[K]['res'];
  }
  if (window.location.protocol.startsWith('http')) {
    const { mockInvoke } = await import('../mockIpc');
    return mockInvoke(channel, req);
  }
  throw new Error(
    `EMS bridge unavailable (bridge: ${typeof window.ems}, protocol: ${window.location.protocol}, build: ${__EMS_BUILD_TIME__})`,
  );
}

export function openFile(opts: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null> {
  if (window.ems?.openFile) return window.ems.openFile(opts);
  if (import.meta.env.VITE_WEB_DEMO) return webPickFile(opts);
  return Promise.resolve(null);
}

/**
 * Web-demo file picker: native <input type=file>. Images come back as a
 * data URL (the setup/logo handlers already accept those); anything else
 * comes back as raw text (license files are pasted as text upstream).
 */
function webPickFile(opts: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null> {
  return new Promise((resolve) => {
    const exts = opts.filters.flatMap((f) => f.extensions).map((e) => `.${e}`).join(',');
    const input = document.createElement('input');
    input.type = 'file';
    if (exts) input.accept = exts;
    input.style.display = 'none';
    const done = (value: string | null) => {
      input.remove();
      resolve(value);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      const reader = new FileReader();
      const isImage = opts.filters.some((f) => f.extensions.some((e) => ['png', 'jpg', 'jpeg'].includes(e)));
      reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => done(null);
      if (isImage) reader.readAsDataURL(file);
      else reader.readAsText(file);
    };
    // If the dialog is dismissed without picking, resolve null.
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) done(null);
        window.removeEventListener('focus', onFocus);
      }, 300);
    };
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Failure shape from the main process. `error` is a stable machine-readable
 * code (screens may branch on well-known codes); `errorMessage` is the
 * display-safe text; `errorDetail` is the raw technical detail for support
 * ("copy details") — never shown by default.
 */
export interface IpcFailure {
  ok: false;
  error: string;
  errorMessage?: string;
  errorDetail?: string;
}

/** Prefer the display-safe message; fall back to the raw code. */
export function errText(res: { error: string; errorMessage?: string }): string {
  return res.errorMessage || res.error;
}

/** Raw technical detail for support, or '' when absent. */
export function errDetail(res: { error: string; errorDetail?: string }): string {
  return res.errorDetail || '';
}

export function openExternal(url: string): Promise<void> {
  if (window.ems?.openExternal) return window.ems.openExternal(url);
  window.open(url, '_blank', 'noopener');
  return Promise.resolve();
}

/**
 * Handle a file-export result. Desktop returns { filePath } (saved via the
 * native save dialog); the web demo returns { fileName, mime, dataBase64 },
 * which we trigger as a browser download. Returns a status message, or ''
 * when the user cancelled.
 */
export function downloadExportResult(
  r: { ok: true; filePath?: string; fileName?: string; mime?: string; dataBase64?: string } | { ok: false; error: string },
): string {
  if (!r.ok) return r.error === 'cancelled' ? '' : r.error;
  if (r.dataBase64 && r.fileName) {
    const bin = atob(r.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: r.mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return `Downloaded ${r.fileName}`;
  }
  return `Exported to ${r.filePath}`;
}
