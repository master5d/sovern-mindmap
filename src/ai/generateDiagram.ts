import { MarkerType } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { buildDiagramMessages } from './diagramPrompt';
import { requestCompletion } from './litellmClient';
import { extractCanvas } from './extractCanvas';
import { ChatMessage } from '../types';

interface Deps {
  request?: (messages: ChatMessage[]) => Promise<string>;
  onError?: (message: string) => void;
}

/** prompt → gateway → JSON Canvas → namespaced shapes appended to the canvas (undoable). */
export async function generateDiagram(prompt: string, deps: Deps = {}): Promise<void> {
  const request = deps.request ?? requestCompletion;
  try {
    const raw = await request(buildDiagramMessages(prompt));
    const canvas = extractCanvas(raw);
    const { nodes, edges } = fromJSONCanvas(canvas);

    // Namespace ids so a generated diagram never collides with what's already on the canvas.
    const idMap = new Map<string, string>();
    nodes.forEach((n) => idMap.set(n.id, `g-${crypto.randomUUID()}`));
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

    useWorkflowStore.getState().addGeneratedGraph(newNodes as any, newEdges);
  } catch (err) {
    deps.onError?.(err instanceof Error ? err.message : String(err));
  }
}
