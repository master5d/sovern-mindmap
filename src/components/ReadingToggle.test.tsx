import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ReadingToggle } from './ReadingToggle';
import { useThemeStore } from '../store/useThemeStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

beforeEach(() => {
  useThemeStore.setState({ reading: false });
});

describe('ReadingToggle', () => {
  it('renders a button reflecting the off state', () => {
    const { container, cleanup } = mount(<ReadingToggle />);
    const btn = container.querySelector('button')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    cleanup();
  });

  it('clicking toggles reading in the store and reflects aria-pressed', () => {
    const { container, cleanup } = mount(<ReadingToggle />);
    const btn = container.querySelector('button')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useThemeStore.getState().reading).toBe(true);
    expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    act(() => { container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useThemeStore.getState().reading).toBe(false);
    cleanup();
  });
});
