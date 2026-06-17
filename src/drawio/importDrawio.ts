import { MarkerType } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { extractMxGraphModel } from './inflate';
import { drawioToCanvas } from './drawioToCanvas';
import { SOVERNNodeData } from '../types';
import type { Node, Edge } from '@xyflow/react';

interface Deps {
  addGraph?: (nodes: Node<SOVERNNodeData>[], edges: Edge[]) => void;
  onError?: (message: string) => void;
}

/** .drawio file → parsed, namespaced, position-preserving append to the canvas. */
export async function importDrawio(file: { text: () => Promise<string> }, deps: Deps = {}): Promise<void> {
  const addGraph = deps.addGraph ?? useWorkflowStore.getState().addImportedGraph;
  try {
    const model = await extractMxGraphModel(await file.text());
    const canvas = drawioToCanvas(model);
    const { nodes, edges } = fromJSONCanvas(canvas);

    // Namespace ids so an import never collides with existing / AI / prior-import ids.
    const idMap = new Map<string, string>();
    nodes.forEach((n) => idMap.set(n.id, `d-${crypto.randomUUID()}`));
    const newNodes = nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, selected: false }));
    const newEdges = edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: `e-${crypto.randomUUID()}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        type: 'smoothstep' as const,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      }));

    addGraph(newNodes as any, newEdges);
  } catch (err) {
    deps.onError?.(err instanceof Error ? err.message : String(err));
  }
}
