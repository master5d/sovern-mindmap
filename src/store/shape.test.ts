import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

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

describe('setNodeShape', () => {
  it('converts a sovern node to a shape node with the chosen shape and enters edit mode', () => {
    useWorkflowStore.getState().setNodeShape('n1', 'cylinder');
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('cylinder');
    expect(useWorkflowStore.getState().isEditing).toBe(true);
  });

  it('is a single undo step that restores both type and shape', () => {
    useWorkflowStore.getState().setNodeShape('n1', 'gpu');
    useWorkflowStore.temporal.getState().undo();
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('sovern');
    expect(n.data.shape).toBeUndefined();
  });

  it('on an existing shape node changes only the shape (type stays shape)', () => {
    useWorkflowStore.setState({
      nodes: [{ id: 's1', type: 'shape', position: { x: 0, y: 0 }, data: { label: 's1', layer: 'projects', status: 'idle', shape: 'rectangle' } }] as any,
      selectedNodeId: 's1',
    });
    useWorkflowStore.getState().setNodeShape('s1', 'decision');
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('decision');
  });
});
