import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [{ id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'root', layer: 'human', status: 'active' } }] as any,
    edges: [],
    selectedNodeId: 'root',
    isEditing: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
});

describe('undo/redo', () => {
  it('undo reverses an addChildNode; redo re-applies it', () => {
    const before = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().addChildNode('root');
    expect(useWorkflowStore.getState().nodes.length).toBe(before + 1);

    useWorkflowStore.temporal.getState().undo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before);

    useWorkflowStore.temporal.getState().redo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before + 1);
  });

  it('only tracks nodes/edges (changing viewMode does not create history)', () => {
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.getState().setViewMode('matrix');
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
  });
});
