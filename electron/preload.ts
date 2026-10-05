import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload: the ONLY bridge between renderer and main. Exposes a single typed
 * `invoke(channel, req)` plus two native-dialog helpers. No direct Node access
 * from the UI (contextIsolation + sandbox).
 */
contextBridge.exposeInMainWorld('ems', {
  invoke: (channel: string, req: unknown) => ipcRenderer.invoke(channel, req),
  openFile: (opts: { title: string; filters: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:openFile', opts) as Promise<string | null>,
  openExternal: (url: string) => ipcRenderer.invoke('dialog:openExternal', url) as Promise<void>,
});
