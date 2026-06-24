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

describe('addShapeNode', () => {
  it('appends one standalone shape node at the drop position, selected, with no edge', () => {
    const before = useWorkflowStore.getState().nodes.length;
    const id = useWorkflowStore.getState().addShapeNode('server', { x: 321, y: 654 });
    const s = useWorkflowStore.getState();
    expect(s.nodes.length).toBe(before + 1);
    const n = s.nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('server');
    expect(n.data.label).toBe('Server');         // humanizeShape
    expect(n.position).toEqual({ x: 321, y: 654 }); // drop position preserved (no auto-layout)
    expect(s.edges.length).toBe(0);                 // standalone — no parent edge
    expect(s.selectedNodeId).toBe(id);
    expect(s.isEditing).toBe(true);                 // entered edit mode (poll frozen)
  });

  it('is a single undo step that removes the dropped node', () => {
    const before = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().addShapeNode('decision', { x: 10, y: 20 });
    useWorkflowStore.temporal.getState().undo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before);
  });
});
