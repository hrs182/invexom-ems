import type { IpcChannels } from '@shared/types';

declare global {
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
  throw new Error('EMS bridge unavailable');
}

export function openFile(opts: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null> {
  if (window.ems?.openFile) return window.ems.openFile(opts);
  return Promise.resolve(null);
}

export function openExternal(url: string): Promise<void> {
  if (window.ems?.openExternal) return window.ems.openExternal(url);
  window.open(url, '_blank', 'noopener');
  return Promise.resolve();
}
