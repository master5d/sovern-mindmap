import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { generateDiagram } from './generateDiagram';

const CANVAS = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Start', metadata: { 'mm:shape': 'terminal' } },
    { id: 'b', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Step', metadata: { 'mm:shape': 'rounded' } },
  ],
  edges: [{ id: 'e1', fromNode: 'a', toNode: 'b', label: 'go' }],
});

beforeEach(() => {
  useWorkflowStore.setState({ nodes: [], edges: [], isEditing: false, selectedNodeId: null });
  useWorkflowStore.temporal.getState().clear();
});

describe('generateDiagram', () => {
  it('adds generated shapes to the canvas and enters edit mode', async () => {
    const request = vi.fn().mockResolvedValue(CANVAS);
    await generateDiagram('a flow', { request });

    const { nodes, edges, isEditing } = useWorkflowStore.getState();
    expect(request).toHaveBeenCalledOnce();
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.type === 'shape')).toBe(true);
    expect(nodes.map((n) => n.id)).not.toContain('a');
    expect(edges).toHaveLength(1);
    expect(isEditing).toBe(true);
  });

  it('calls onError and leaves the canvas unchanged on bad output', async () => {
    const request = vi.fn().mockResolvedValue('sorry, no diagram');
    const onError = vi.fn();
    await generateDiagram('x', { request, onError });

    expect(onError).toHaveBeenCalledOnce();
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
  });
});
