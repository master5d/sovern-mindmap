import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({ nodes: [], edges: [], isEditing: false });
  useWorkflowStore.temporal.getState().clear();
});

const node = (id: string, x: number, y: number) => ({
  id, type: 'shape', position: { x, y },
  data: { label: id, layer: 'projects', status: 'idle', shape: 'rectangle' },
});

describe('addImportedGraph', () => {
  it('appends nodes/edges preserving their positions (no auto-layout)', () => {
    useWorkflowStore.getState().addImportedGraph(
      [node('a', 40, 80) as any, node('b', 240, 80) as any],
      [{ id: 'e1', source: 'a', target: 'b' }],
    );
    const s = useWorkflowStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(s.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 80 });
    expect(s.edges).toHaveLength(1);
    expect(s.isEditing).toBe(true); // import is an edit
  });

  it('is a single undo step', () => {
    useWorkflowStore.getState().addImportedGraph([node('a', 0, 0) as any], []);
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(1);
  });
});
