import { create } from 'zustand';
import { invoke } from '../lib/ipc';
import type { AppStatus, SafeUser } from '@shared/types';

interface AppState {
  status: AppStatus | null;
  user: SafeUser | null;
  booted: boolean;
  bootError: string | null;
  boot: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

export const useApp = create<AppState>()((set, get) => ({
  status: null,
  user: null,
  booted: false,
  bootError: null,

  boot: async () => {
    try {
      const status = await invoke('app:status', undefined);
      const me = status.needsSetup ? null : await invoke('auth:me', undefined);
      set({ status, user: me, booted: true, bootError: null });
    } catch (e) {
      set({ booted: true, bootError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshStatus: async () => {
    try {
      const status = await invoke('app:status', undefined);
      set({ status });
    } catch { /* keep last known */ }
  },

  login: async (username, password) => {
    const res = await invoke('auth:login', { username, password });
    if (res.ok) {
      set({ user: res.user });
      await get().refreshStatus();
      return { ok: true as const };
    }
    return res;
  },

  logout: async () => {
    await invoke('auth:logout', undefined);
    set({ user: null });
    await get().refreshStatus();
  },
}));
