import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';
import { selectVisibleNodes } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'a', layer: 'human', status: 'active' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'b', layer: 'boss', status: 'active' } },
      { id: 'c', type: 'sovern', position: { x: 0, y: 200 }, data: { label: 'c', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-a-b', source: 'a', target: 'b' }, { id: 'e-b-c', source: 'b', target: 'c' }],
    collapsedIds: [],
  });
});

describe('fold', () => {
  it('toggleCollapse hides all descendants', () => {
    useWorkflowStore.getState().toggleCollapse('a');
    const visible = selectVisibleNodes(useWorkflowStore.getState());
    const hidden = visible.filter((n) => n.hidden).map((n) => n.id).sort();
    expect(hidden).toEqual(['b', 'c']);
  });

  it('toggleCollapse twice restores visibility', () => {
    useWorkflowStore.getState().toggleCollapse('a');
    useWorkflowStore.getState().toggleCollapse('a');
    const visible = selectVisibleNodes(useWorkflowStore.getState());
    expect(visible.every((n) => !n.hidden)).toBe(true);
  });
});
