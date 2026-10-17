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

/** True when this is a browser demo build (VITE_WEB_DEMO=1 or VITE_BROWSER_DEMO=1). */
export const isWebDemo = typeof import.meta !== 'undefined' && !!(import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_WEB_DEMO || !!(import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_BROWSER_DEMO;

/** Session flag: the visitor passed the demo login page in this tab. */
const DEMO_AUTH_KEY = 'ems-demo-authed';
const demoAuthed = () => { try { return sessionStorage.getItem(DEMO_AUTH_KEY) === '1'; } catch { return false; } };
const setDemoAuthed = (v: boolean) => { try { v ? sessionStorage.setItem(DEMO_AUTH_KEY, '1') : sessionStorage.removeItem(DEMO_AUTH_KEY); } catch { /* ignore */ } };

export const useApp = create<AppState>()((set, get) => ({
  status: null,
  user: null,
  booted: false,
  bootError: null,

  boot: async () => {
    try {
      const status = await invoke('app:status', undefined);
      // Web demo: the server vault is pre-unlocked, but every visitor still
      // starts at the login page until they sign in with the demo credentials.
      const me = status.needsSetup ? null : await invoke('auth:me', undefined);
      set({ status, user: isWebDemo && !demoAuthed() ? null : me, booted: true, bootError: null });
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
      if (isWebDemo) setDemoAuthed(true);
      set({ user: res.user });
      await get().refreshStatus();
      return { ok: true as const };
    }
    return res;
  },

  logout: async () => {
    await invoke('auth:logout', undefined);
    if (isWebDemo) setDemoAuthed(false);
    set({ user: null });
    await get().refreshStatus();
  },
}));
