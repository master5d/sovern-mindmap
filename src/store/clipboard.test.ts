import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';
import { getChildren } from '../utils/tree';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'a', layer: 'human', status: 'active' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'b', layer: 'boss', status: 'active' } },
      { id: 'c', type: 'sovern', position: { x: 0, y: 200 }, data: { label: 'c', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-a-b', source: 'a', target: 'b' }, { id: 'e-b-c', source: 'b', target: 'c' }],
    selectedNodeId: null,
    clipboard: null,
    isEditing: false,
  });
});

describe('copy/paste subtree', () => {
  it('copySubtree fills clipboard with cloned nodes/edges', () => {
    useWorkflowStore.getState().copySubtree('b');
    const clip = useWorkflowStore.getState().clipboard!;
    expect(clip.nodes).toHaveLength(2); // b + c
    expect(clip.edges).toHaveLength(1);
  });

  it('pasteSubtree under a target adds clone and links it to the target', () => {
    const beforeNodes = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().copySubtree('b');
    useWorkflowStore.getState().pasteSubtree('a');
    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes.length).toBe(beforeNodes + 2);
    // 'a' now has an extra child (the cloned 'b' root)
    expect(getChildren('a', edges).length).toBe(2);
  });
});
