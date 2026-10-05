import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Light / Dark / System (follows OS). Persisted per OS user. */
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

function resolveSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(mode: ThemeMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? resolveSystem() : mode;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      resolved: 'light',
      setMode: (mode) => set({ mode, resolved: apply(mode) }),
    }),
    {
      name: 'invexom-ems-theme',
      onRehydrateStorage: () => (state) => {
        if (state) state.resolved = apply(state.mode);
      },
    },
  ),
);

// Follow OS changes live when in "system" mode.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { mode } = useTheme.getState();
    if (mode === 'system') useTheme.setState({ resolved: apply('system') });
  });
}

// Apply immediately on first load (before React paints, avoids flash).
apply(useTheme.getState().mode);
