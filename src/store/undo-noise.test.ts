import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

const seedTwo = () => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'a', layer: 'human', status: 'active' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'b', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-a-b', source: 'a', target: 'b' }],
    selectedNodeId: 'a',
    editingNodeId: null,
    isEditing: true,
  });
  // simulate an active edit session: history clean + tracking on
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
};

const past = () => useWorkflowStore.temporal.getState().pastStates.length;

describe('undo history is not polluted by React Flow node changes', () => {
  beforeEach(seedTwo);
  afterEach(() => useWorkflowStore.temporal.getState().pause());

  it('a selection change creates no undo step', () => {
    useWorkflowStore.getState().onNodesChange([{ id: 'b', type: 'select', selected: true } as any]);
    expect(past()).toBe(0);
  });

  it('a dimension measurement creates no undo step', () => {
    useWorkflowStore.getState().onNodesChange([
      { id: 'a', type: 'dimensions', dimensions: { width: 200, height: 80 } } as any,
    ]);
    expect(past()).toBe(0);
  });

  it('a drag position change creates no undo step', () => {
    useWorkflowStore.getState().onNodesChange([
      { id: 'a', type: 'position', position: { x: 9, y: 9 }, dragging: true } as any,
    ]);
    expect(past()).toBe(0);
  });
});

describe('inline-edit commit is clean', () => {
  beforeEach(seedTwo);
  afterEach(() => useWorkflowStore.temporal.getState().pause());

  it('Enter then blur (double commit) records exactly one undo step', () => {
    useWorkflowStore.getState().beginInlineEdit('b');
    useWorkflowStore.temporal.getState().clear(); // ignore any setup churn; start counting at the edit
    useWorkflowStore.getState().commitInlineEdit('b', 'renamed'); // Enter
    useWorkflowStore.getState().commitInlineEdit('b', 'renamed'); // blur after unmount — must be a no-op
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'b')!.data.label).toBe('renamed');
    expect(past()).toBe(1);
  });

  it('committing an unchanged label records no undo step', () => {
    useWorkflowStore.getState().beginInlineEdit('b');
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.getState().commitInlineEdit('b', 'b'); // same as current label
    expect(past()).toBe(0);
  });
});
