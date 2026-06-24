import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { OutlineView } from './OutlineView';
import { useWorkflowStore } from '../store/useWorkflowStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'Root', layer: 'projects', status: 'idle' } },
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'Child A', layer: 'projects', status: 'idle' } },
    ] as any,
    edges: [{ id: 'e-root-a', source: 'root', target: 'a' }],
  });
});

describe('OutlineView', () => {
  it('renders the root heading and the descendant bullet', () => {
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    expect(container.textContent).toContain('Root');
    expect(container.textContent).toContain('Child A');
    cleanup();
  });

  it('Copy writes the markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    const copyBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'))!;
    await act(async () => { copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(writeText).toHaveBeenCalledWith('# Root\n- Child A');
    cleanup();
  });

  it('shows a placeholder for an empty graph', () => {
    useWorkflowStore.setState({ nodes: [], edges: [] });
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    expect(container.textContent).toContain('Nothing to outline yet');
    cleanup();
  });
});
