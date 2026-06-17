import { Node, Edge } from '@xyflow/react';
import { JSONCanvas, JSONCanvasNode, JSONCanvasEdge, SOVERNNodeData } from '../types';

/**
 * Converts React Flow nodes and edges to Obsidian-compatible JSON Canvas format.
 */
export const toJSONCanvas = (nodes: Node<SOVERNNodeData>[], edges: Edge[]): JSONCanvas => {
  const canvasNodes: JSONCanvasNode[] = nodes.map((node) => {
    const canvasNode: JSONCanvasNode = {
      id: node.id,
      type: 'text', // Default to text for standard nodes
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      width: node.measured?.width || 150,
      height: node.measured?.height || 60,
      text: node.data.label,
      metadata: {
        'sovern:layer': node.data.layer,
        'sovern:status': node.data.status,
        'sovern:budget': node.data.budget,
        'sovern:agent': node.data.agent,
        'sovern:dates': node.data.dates,
        'sovern:impact': node.data.impact,
        'sovern:urgency': node.data.urgency,
        'sovern:created': node.data.created,
        feedback: node.data.feedback,
      },
    };
    if (node.data.shape) canvasNode.metadata!['mm:shape'] = node.data.shape;
    if (typeof node.data.step === 'number') canvasNode.metadata!['mm:step'] = node.data.step;
    if (typeof node.data.note === 'string' && node.data.note) canvasNode.metadata!['mm:note'] = node.data.note;
    if (node.data.color) canvasNode.color = node.data.color;
    return canvasNode;
  });

  const canvasEdges: JSONCanvasEdge[] = edges.map((edge) => ({
    id: edge.id,
    fromNode: edge.source,
    toNode: edge.target,
    label: edge.label as string,
  }));

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
  };
};

/**
 * Converts Obsidian JSON Canvas data back to React Flow nodes and edges.
 */
export const fromJSONCanvas = (canvas: JSONCanvas): { nodes: Node<SOVERNNodeData>[]; edges: Edge[] } => {
  const nodes: Node<SOVERNNodeData>[] = canvas.nodes.map((node) => {
    const shape = node.metadata?.['mm:shape'];
    if (shape) {
      return {
        id: node.id,
        type: 'shape',
        position: { x: node.x, y: node.y },
        data: {
          label: node.text || '',
          layer: node.metadata?.['sovern:layer'] || 'projects',
          status: node.metadata?.['sovern:status'] || 'idle',
          shape,
          color: node.color,
          step: typeof node.metadata?.['mm:step'] === 'number' ? node.metadata['mm:step'] : undefined,
          note: typeof node.metadata?.['mm:note'] === 'string' ? node.metadata['mm:note'] : undefined,
        },
      };
    }
    return {
      id: node.id,
      type: 'sovern',
      position: { x: node.x, y: node.y },
      data: {
        label: node.text || '',
        layer: node.metadata?.['sovern:layer'] || 'projects',
        status: node.metadata?.['sovern:status'] || 'idle',
        budget: node.metadata?.['sovern:budget'],
        agent: node.metadata?.['sovern:agent'],
        dates: node.metadata?.['sovern:dates'],
        impact: node.metadata?.['sovern:impact'],
        urgency: node.metadata?.['sovern:urgency'],
        created: node.metadata?.['sovern:created'],
        feedback: node.metadata?.['feedback'],
        color: node.color,
        step: typeof node.metadata?.['mm:step'] === 'number' ? node.metadata['mm:step'] : undefined,
        note: typeof node.metadata?.['mm:note'] === 'string' ? node.metadata['mm:note'] : undefined,
      },
    };
  });

  const edges: Edge[] = canvas.edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    label: edge.label,
  }));

  return { nodes, edges };
};
