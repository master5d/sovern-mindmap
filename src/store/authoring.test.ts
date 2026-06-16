import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';
import { getChildren, getDescendants } from '../utils/tree';

const reset = () =>
  useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null, isEditing: false });

describe('edit mode', () => {
  beforeEach(reset);

  it('enterEditMode sets isEditing true, exit sets it false', () => {
    expect(useWorkflowStore.getState().isEditing).toBe(false);
    useWorkflowStore.getState().enterEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(true);
    useWorkflowStore.getState().exitEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(false);
  });
});

const seed = () => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'root', layer: 'human', status: 'active' } },
      { id: 'child', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'child', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-root-child', source: 'root', target: 'child' }],
    selectedNodeId: 'root',
    isEditing: false,
  });
};

describe('authoring actions', () => {
  beforeEach(seed);

  it('addChildNode adds node + edge from parent and enters edit mode', () => {
    const id = useWorkflowStore.getState().addChildNode('root');
    const { nodes, edges, isEditing } = useWorkflowStore.getState();
    expect(nodes.find((n) => n.id === id)).toBeTruthy();
    expect(getChildren('root', edges)).toContain(id);
    expect(isEditing).toBe(true);
  });

  it('addSiblingNode attaches new node under the same parent', () => {
    const id = useWorkflowStore.getState().addSiblingNode('child');
    const { edges } = useWorkflowStore.getState();
    expect(getChildren('root', edges)).toContain(id);
  });

  it('addSiblingNode on a root falls back to adding a child of it', () => {
    const id = useWorkflowStore.getState().addSiblingNode('root');
    const { edges } = useWorkflowStore.getState();
    expect(getChildren('root', edges)).toContain(id);
  });

  it('deleteNodeCascade removes node and its descendants and touching edges', () => {
    const gc = useWorkflowStore.getState().addChildNode('child'); // root>child>gc
    useWorkflowStore.getState().deleteNodeCascade('child');
    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes.find((n) => n.id === 'child')).toBeUndefined();
    expect(nodes.find((n) => n.id === gc)).toBeUndefined();
    expect(edges.some((e) => e.source === 'child' || e.target === 'child')).toBe(false);
    expect(getDescendants('root', edges)).not.toContain('child');
  });
});

describe('inline editing state', () => {
  beforeEach(seed);

  it('beginInlineEdit sets editingNodeId; commit updates label and clears it', () => {
    useWorkflowStore.getState().beginInlineEdit('child');
    expect(useWorkflowStore.getState().editingNodeId).toBe('child');
    useWorkflowStore.getState().commitInlineEdit('child', 'renamed');
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'child')!.data.label).toBe('renamed');
    expect(useWorkflowStore.getState().editingNodeId).toBeNull();
  });

  it('cancelInlineEdit clears editingNodeId without changing label', () => {
    useWorkflowStore.getState().beginInlineEdit('child');
    useWorkflowStore.getState().cancelInlineEdit();
    expect(useWorkflowStore.getState().editingNodeId).toBeNull();
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'child')!.data.label).toBe('child');
  });
});
