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
  reading: boolean;
  setMode: (mode: ThemeMode) => void;
  setReading: (on: boolean) => void;
  syncSystem: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: resolveTheme('system', systemDark()),
      reading: false,
      setMode: (mode) => set({ mode, resolved: resolveTheme(mode, systemDark()) }),
      setReading: (on) => set({ reading: on }),
      syncSystem: () => set({ resolved: resolveTheme(get().mode, systemDark()) }),
    }),
    { name: 'sovern-theme', partialize: (s) => ({ mode: s.mode, reading: s.reading }) },
  ),
);

/** Вешает тему на <html> и слушает смену системной. Вызывать один раз из main.tsx. */
export function initTheme() {
  const apply = (s: ThemeState) => {
    document.documentElement.setAttribute('data-theme', s.resolved);
    document.documentElement.setAttribute('data-reading', s.reading ? 'on' : 'off');
  };

  useThemeStore.subscribe(apply);
  // resolved мог устареть после rehydrate из localStorage — пересчитать
  useThemeStore.getState().syncSystem();
  apply(useThemeStore.getState());

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => useThemeStore.getState().syncSystem());
}
