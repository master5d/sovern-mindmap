import { JSONCanvas, JSONCanvasNode, JSONCanvasEdge } from '../types';
import { mapDrawioStyleToShape } from './mxStyle';
import { DrawioParseError } from './errors';

/** drawio labels may contain HTML; reduce to plain text (never rendered as HTML). */
function plainText(value: string): string {
  if (!value) return '';
  const body = new DOMParser().parseFromString(value, 'text/html').body;
  return (body.textContent || '').trim();
}

function num(v: string | null, fallback: number): number {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse an <mxGraphModel> XML string into our native JSON Canvas. */
export function drawioToCanvas(modelXml: string): JSONCanvas {
  const doc = new DOMParser().parseFromString(modelXml, 'application/xml');
  const root = doc.querySelector('mxGraphModel > root') ?? doc.querySelector('root');
  if (!root) throw new DrawioParseError('no <mxGraphModel>/<root> in model');

  const cells = Array.from(root.querySelectorAll('mxCell'));
  const nodes: JSONCanvasNode[] = [];
  const vertexIds = new Set<string>();

  for (const cell of cells) {
    const id = cell.getAttribute('id') ?? '';
    if (id === '0' || id === '1') continue; // structural root + default layer
    if (cell.getAttribute('vertex') !== '1') continue;
    const geo = cell.querySelector('mxGeometry');
    nodes.push({
      id,
      type: 'text',
      x: num(geo?.getAttribute('x') ?? null, 0),
      y: num(geo?.getAttribute('y') ?? null, 0),
      width: num(geo?.getAttribute('width') ?? null, 120),
      height: num(geo?.getAttribute('height') ?? null, 60),
      text: plainText(cell.getAttribute('value') ?? ''),
      metadata: { 'mm:shape': mapDrawioStyleToShape(cell.getAttribute('style') ?? '') },
    });
    vertexIds.add(id);
  }

  const edges: JSONCanvasEdge[] = [];
  for (const cell of cells) {
    if (cell.getAttribute('edge') !== '1') continue;
    const source = cell.getAttribute('source');
    const target = cell.getAttribute('target');
    if (!source || !target || !vertexIds.has(source) || !vertexIds.has(target)) continue;
    const label = plainText(cell.getAttribute('value') ?? '');
    edges.push({
      id: cell.getAttribute('id') || `e-${source}-${target}`,
      fromNode: source,
      toNode: target,
      label: label || undefined,
    });
  }

  return { nodes, edges };
}
