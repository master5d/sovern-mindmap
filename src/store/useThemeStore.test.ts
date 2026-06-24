import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTheme, useThemeStore, initTheme } from './useThemeStore';

describe('resolveTheme', () => {
  it('explicit modes ignore system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('system follows systemDark flag', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('initTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    // Стор — модульный синглтон; сбросить к дефолтам, иначе состояние течёт между тестами
    useThemeStore.setState({ mode: 'system', resolved: 'dark' });
  });

  it('applies resolved theme to <html> and reacts to setMode', () => {
    // jsdom не имеет matchMedia → systemDark() даёт true → dark
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    useThemeStore.getState().setMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists mode and reading', () => {
    initTheme();
    useThemeStore.getState().setMode('light');
    const saved = JSON.parse(localStorage.getItem('sovern-theme')!);
    expect(saved.state).toEqual({ mode: 'light', reading: false });
  });
});

describe('reading mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-reading');
    useThemeStore.setState({ mode: 'system', resolved: 'dark', reading: false });
  });

  it('defaults to off and toggles via setReading', () => {
    expect(useThemeStore.getState().reading).toBe(false);
    useThemeStore.getState().setReading(true);
    expect(useThemeStore.getState().reading).toBe(true);
    useThemeStore.getState().setReading(false);
    expect(useThemeStore.getState().reading).toBe(false);
  });

  it('initTheme applies data-reading and reacts to setReading', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-reading')).toBe('off');
    useThemeStore.getState().setReading(true);
    expect(document.documentElement.getAttribute('data-reading')).toBe('on');
    useThemeStore.getState().setReading(false);
    expect(document.documentElement.getAttribute('data-reading')).toBe('off');
  });
});
