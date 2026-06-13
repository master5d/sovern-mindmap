import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const resolveTheme = (mode: ThemeMode, systemDark: boolean): ResolvedTheme =>
  mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

const systemDark = (): boolean =>
  typeof window === 'undefined' || !window.matchMedia
    ? true // matchMedia недоступен → dark (исторический дефолт приложения)
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  syncSystem: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: resolveTheme('system', systemDark()),
      setMode: (mode) => set({ mode, resolved: resolveTheme(mode, systemDark()) }),
      syncSystem: () => set({ resolved: resolveTheme(get().mode, systemDark()) }),
    }),
    { name: 'sovern-theme', partialize: (s) => ({ mode: s.mode }) },
  ),
);

/** Вешает тему на <html> и слушает смену системной. Вызывать один раз из main.tsx. */
export function initTheme() {
  const apply = (resolved: ResolvedTheme) =>
    document.documentElement.setAttribute('data-theme', resolved);

  useThemeStore.subscribe((s) => apply(s.resolved));
  // resolved мог устареть после rehydrate из localStorage — пересчитать
  useThemeStore.getState().syncSystem();
  apply(useThemeStore.getState().resolved);

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => useThemeStore.getState().syncSystem());
}
