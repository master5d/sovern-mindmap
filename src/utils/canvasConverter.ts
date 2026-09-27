import type { Node, Edge } from '@xyflow/react';
import type { JSONCanvas, JSONCanvasNode, JSONCanvasEdge, SOVERNNodeData, ArtifactNodeData } from '../types/index.js';
import { isKnownMark } from './evidenceMarks.js';

/**
 * Converts React Flow nodes and edges to Obsidian-compatible JSON Canvas format.
 * Accepts both 'sovern'/'shape' nodes (SOVERNNodeData) and 'artifact' nodes
 * (ArtifactNodeData) — the latter are typed loosely here since the store's
 * node array is still declared as Node<SOVERNNodeData>[] at the call sites.
 */
export const toJSONCanvas = (nodes: Node<SOVERNNodeData>[], edges: Edge[]): JSONCanvas => {
  const canvasNodes: JSONCanvasNode[] = nodes.map((node) => {
    if ((node.type as string) === 'artifact') {
      const data = node.data as unknown as ArtifactNodeData;
      const artifactMeta: Record<string, unknown> = {
        artifactId: data.artifactId,
        code: data.code,
      };
      if (data.name !== undefined) artifactMeta.name = data.name;
      if (data.variantGroup !== undefined) artifactMeta.variantGroup = data.variantGroup;
      if (data.status !== undefined) artifactMeta.status = data.status;
      if (data.projectDir !== undefined) artifactMeta.projectDir = data.projectDir;
      return {
        id: node.id,
        type: 'text',
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
        width: node.measured?.width || 150,
        height: node.measured?.height || 60,
        text: data.name ?? 'Artifact',
        metadata: { 'mm:artifact': artifactMeta },
      };
    }
    const data = node.data as SOVERNNodeData;
    const canvasNode: JSONCanvasNode = {
      id: node.id,
      type: 'text', // Default to text for standard nodes
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      width: node.measured?.width || 150,
      height: node.measured?.height || 60,
      text: data.label,
      metadata: {
        'sovern:layer': data.layer,
        'sovern:status': data.status,
        'sovern:budget': data.budget,
        'sovern:agent': data.agent,
        'sovern:dates': data.dates,
        'sovern:impact': data.impact,
        'sovern:urgency': data.urgency,
        'sovern:created': data.created,
        feedback: data.feedback,
      },
    };
    if (data.shape) canvasNode.metadata!['mm:shape'] = data.shape;
    if (typeof data.step === 'number') canvasNode.metadata!['mm:step'] = data.step;
    if (typeof data.note === 'string' && data.note) canvasNode.metadata!['mm:note'] = data.note;
    if (data.color) canvasNode.color = data.color;
    // Грейд достоверности (мост NAUTILUS core/desops/dataviz): не размечено ≠
    // значению — поле пишем только когда марка известна шкале, не дефолтом.
    if (isKnownMark(data.mark)) canvasNode.metadata!['sovern:mark'] = data.mark;
    return canvasNode;
  });

  const canvasEdges: JSONCanvasEdge[] = edges.map((edge) => {
    const mark = (edge.data as Record<string, unknown> | undefined)?.mark;
    const canvasEdge: JSONCanvasEdge = {
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      label: edge.label as string,
    };
    if (isKnownMark(mark)) canvasEdge.metadata = { 'sovern:mark': mark };
    return canvasEdge;
  });

  return {
    nodes: canvasNodes,
    edges: canvasEdges,
  };
};

/**
 * Converts Obsidian JSON Canvas data back to React Flow nodes and edges.
 * Artifact nodes are recognized via metadata['mm:artifact'] and returned with
 * type 'artifact' + ArtifactNodeData — cast through `as unknown as Node<SOVERNNodeData>`
 * since the store's node array type doesn't yet model the AppNode union.
 */
export const fromJSONCanvas = (canvas: JSONCanvas): { nodes: Node<SOVERNNodeData>[]; edges: Edge[] } => {
  const nodes: Node<SOVERNNodeData>[] = canvas.nodes.map((node) => {
    const artifact = node.metadata?.['mm:artifact'];
    if (artifact) {
      const artifactNode = {
        id: node.id,
        type: 'artifact',
        position: { x: node.x, y: node.y },
        data: {
          artifactId: artifact.artifactId,
          code: artifact.code,
          name: artifact.name,
          variantGroup: artifact.variantGroup,
          status: artifact.status ?? 'pending',
          projectDir: artifact.projectDir,
        } as ArtifactNodeData,
      };
      return artifactNode as unknown as Node<SOVERNNodeData>;
    }
    // Грейд достоверности читаем строкой из sovern:mark, а не дефолтом: узел без
    // поля (или с чужой/опечатанной маркой) обязан остаться «не размечено», как
    // на исходном blueprint (NAUTILUS render/svg.js — тот же принцип).
    const rawMark = node.metadata?.['sovern:mark'];
    const mark = isKnownMark(rawMark) ? rawMark : undefined;
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
          mark,
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
        mark,
        step: typeof node.metadata?.['mm:step'] === 'number' ? node.metadata['mm:step'] : undefined,
        note: typeof node.metadata?.['mm:note'] === 'string' ? node.metadata['mm:note'] : undefined,
      },
    };
  });

  const edges: Edge[] = canvas.edges.map((edge) => {
    const rawMark = edge.metadata?.['sovern:mark'];
    const mark = isKnownMark(rawMark) ? rawMark : undefined;
    return {
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      label: edge.label,
      ...(mark ? { data: { mark } } : {}),
    };
  });

  return { nodes, edges };
};
