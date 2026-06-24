import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapeSwatch } from './ShapeSwatch';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

describe('ShapeSwatch', () => {
  it('renders an icon-mode swatch (server) using a lucide svg', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="server" />);
    expect(container.querySelector('svg')).toBeTruthy();
    cleanup();
  });

  it('renders an svg-mode swatch (decision) silhouette as a polygon', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="decision" />);
    expect(container.querySelector('polygon')).toBeTruthy();
    cleanup();
  });

  it('renders a css-mode swatch (rounded) as a plain box with no svg', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="rounded" />);
    expect(container.querySelector('svg')).toBeNull();
    // meaningful: the css-mode box carries the geometry's border-radius className
    expect(container.firstElementChild?.className).toContain('rounded-xl');
    cleanup();
  });

  it('marks a selected swatch with an accent ring', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="rounded" selected />);
    expect(container.innerHTML).toContain('ring-accent');
    cleanup();
  });
});
