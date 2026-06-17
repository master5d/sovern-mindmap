import { JSONCanvas, JSONCanvasNode, JSONCanvasEdge } from '../types';

const SHAPES = ['rectangle', 'rounded', 'decision', 'terminal', 'note'];

export class DiagramParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramParseError';
  }
}

/** Extract the outermost {...} JSON object from possibly-fenced, prose-wrapped text. */
function isolateJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new DiagramParseError('no JSON object found in model output');
  }
  return raw.slice(start, end + 1);
}

/** Turn messy LLM text into a guaranteed-renderable JSONCanvas. */
export function extractCanvas(raw: string): JSONCanvas {
  let parsed: any;
  try {
    parsed = JSON.parse(isolateJson(raw));
  } catch {
    throw new DiagramParseError('model output was not valid JSON');
  }

  const rawNodes: any[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  const rawEdges: any[] = Array.isArray(parsed?.edges) ? parsed.edges : [];

  const nodes: JSONCanvasNode[] = [];
  const ids = new Set<string>();
  for (const n of rawNodes) {
    let id = typeof n?.id === 'string' && n.id ? n.id : `n-${crypto.randomUUID()}`;
    while (ids.has(id)) id = `n-${crypto.randomUUID()}`;
    ids.add(id);
    const metadata = n?.metadata && typeof n.metadata === 'object' ? { ...n.metadata } : {};
    if (metadata['mm:shape'] && !SHAPES.includes(metadata['mm:shape'])) {
      metadata['mm:shape'] = 'rectangle';
    }
    nodes.push({
      id,
      type: 'text',
      x: Number.isFinite(n?.x) ? n.x : 0,
      y: Number.isFinite(n?.y) ? n.y : 0,
      width: Number.isFinite(n?.width) ? n.width : 150,
      height: Number.isFinite(n?.height) ? n.height : 60,
      text: typeof n?.text === 'string' ? n.text : '',
      metadata,
    });
  }

  const edges: JSONCanvasEdge[] = [];
  for (const e of rawEdges) {
    if (!ids.has(e?.fromNode) || !ids.has(e?.toNode)) continue;
    edges.push({
      id: typeof e?.id === 'string' && e.id ? e.id : `e-${crypto.randomUUID()}`,
      fromNode: e.fromNode,
      toNode: e.toNode,
      label: typeof e?.label === 'string' ? e.label : undefined,
    });
  }

  return { nodes, edges };
}
