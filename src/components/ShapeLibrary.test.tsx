import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapeLibrary, SHAPE_DND_MIME } from './ShapeLibrary';
import { SHAPE_KINDS } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

describe('ShapeLibrary', () => {
  it('renders 26 draggable swatches, one per shape kind', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(26);
    SHAPE_KINDS.forEach((k) => expect(container.querySelector(`[aria-label="${k}"]`)).toBeTruthy());
    cleanup();
  });

  it('onDragStart writes the shape kind under the private MIME', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    const el = container.querySelector('[aria-label="server"]') as HTMLElement;
    const setData = vi.fn();
    const evt = new Event('dragstart', { bubbles: true }) as any;
    evt.dataTransfer = { setData, effectAllowed: '' };
    act(() => { el.dispatchEvent(evt); });
    expect(setData).toHaveBeenCalledWith(SHAPE_DND_MIME, 'server');
    cleanup();
  });

  it('collapse toggle hides the swatches', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    const toggle = container.querySelector('button[aria-label="Collapse shape library"]') as HTMLButtonElement;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
    cleanup();
  });
});
