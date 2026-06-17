import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';
import { SOVERNNodeData, JSONCanvas } from '../types';

const shapeNode = (): Node<SOVERNNodeData> => ({
  id: 's1', type: 'shape', position: { x: 10, y: 20 },
  data: { label: 'Decision?', layer: 'projects', status: 'idle', shape: 'decision' },
});

describe('canvasConverter mm:shape', () => {
  it('toJSONCanvas writes shape into metadata["mm:shape"]', () => {
    const c = toJSONCanvas([shapeNode()], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('decision');
  });

  it('fromJSONCanvas restores a shape node as type "shape" with data.shape', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 's1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Q?', metadata: { 'mm:shape': 'decision' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
    expect(nodes[0].data.label).toBe('Q?');
  });

  it('fromJSONCanvas still maps a non-shape node as sovern (backward compatible)', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Task', metadata: { 'sovern:layer': 'coding' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('sovern');
    expect(nodes[0].data.layer).toBe('coding');
  });

  it('round-trips a shape node', () => {
    const c = toJSONCanvas([shapeNode()], []);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
  });
});
