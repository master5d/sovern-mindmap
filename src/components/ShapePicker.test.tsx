import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapePicker, SHAPE_GROUPS } from './ShapePicker';
import { SHAPE_KINDS } from '../types';
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
    nodes: [{ id: 'n1', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'n1', layer: 'projects', status: 'idle' } }] as any,
    edges: [],
    selectedNodeId: 'n1',
    isEditing: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
});

describe('SHAPE_GROUPS', () => {
  it('splits SHAPE_KINDS into Basic (12) + Home AI-lab (14), covering all', () => {
    expect(SHAPE_GROUPS.map((g) => g.label)).toEqual(['Basic', 'Home AI-lab']);
    expect(SHAPE_GROUPS[0].kinds.length).toBe(12);
    expect(SHAPE_GROUPS[1].kinds.length).toBe(14);
    expect([...SHAPE_GROUPS[0].kinds, ...SHAPE_GROUPS[1].kinds]).toEqual([...SHAPE_KINDS]);
  });
});

describe('ShapePicker', () => {
  it('renders one labelled button per shape (26 total)', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelectorAll('button[aria-label]').length).toBe(26);
    cleanup();
  });

  it('clicking a swatch applies that shape to the selected node', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    const btn = container.querySelector('button[aria-label="cylinder"]') as HTMLButtonElement;
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const n = useWorkflowStore.getState().nodes.find((x) => x.id === 'n1')!;
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('cylinder');
    cleanup();
  });

  it('renders nothing when no node is selected', () => {
    useWorkflowStore.setState({ selectedNodeId: null });
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelector('button[aria-label]')).toBeNull();
    cleanup();
  });
});
