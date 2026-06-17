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

  it('round-trips an extended shape (cylinder)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'db', type: 'shape', position: { x: 0, y: 0 },
      data: { label: 'Users', layer: 'projects', status: 'idle', shape: 'cylinder' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('cylinder');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('cylinder');
  });

  it('round-trips step + note through mm:step / mm:note', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Intro', layer: 'projects', status: 'idle', step: 2, note: 'First we set the scene.' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:step']).toBe(2);
    expect(c.nodes[0].metadata?.['mm:note']).toBe('First we set the scene.');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBe(2);
    expect(nodes[0].data.note).toBe('First we set the scene.');
  });

  it('omits mm:step / mm:note when absent (backward compatible)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Plain', layer: 'projects', status: 'idle' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata && 'mm:step' in c.nodes[0].metadata).toBe(false);
    expect(c.nodes[0].metadata && 'mm:note' in c.nodes[0].metadata).toBe(false);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBeUndefined();
    expect(nodes[0].data.note).toBeUndefined();
  });
});
