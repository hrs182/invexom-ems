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
 * Typed IPC client. In the packaged app (file://) window.ems always exists.
 * In a plain browser (http://, dev/preview) we fall back to a mock adapter so
 * UI can be developed and screenshotted without Electron.
 */
export async function invoke<K extends keyof IpcChannels>(
  channel: K,
  req: IpcChannels[K]['req'],
): Promise<IpcChannels[K]['res']> {
  if (window.ems?.invoke) return window.ems.invoke(channel, req);
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
  return Promise.resolve(null);
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
