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

/** A drawio "group" wrapper cell — a pure container we flatten away (spec: drop groups). */
function isGroup(cell: Element): boolean {
  return /(^|;)group(;|$)/.test(cell.getAttribute('style') ?? '');
}

/**
 * Absolute top-left of a vertex. In mxGraph a child cell's geometry x/y are RELATIVE
 * to its parent vertex (e.g. a node inside a group), so we walk the `parent` chain via
 * `byId` and accumulate ancestor offsets. Width/height stay the cell's own.
 */
function absoluteXY(cell: Element, byId: Map<string, Element>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: Element | undefined = cell;
  const seen = new Set<string>();
  while (cur) {
    const geo = cur.querySelector('mxGeometry');
    x += num(geo?.getAttribute('x') ?? null, 0);
    y += num(geo?.getAttribute('y') ?? null, 0);
    const parentId = cur.getAttribute('parent');
    if (!parentId || parentId === '0' || parentId === '1' || seen.has(parentId)) break;
    seen.add(parentId);
    cur = byId.get(parentId);
  }
  return { x, y };
}

/** Parse an <mxGraphModel> XML string into our native JSON Canvas. */
export function drawioToCanvas(modelXml: string): JSONCanvas {
  const doc = new DOMParser().parseFromString(modelXml, 'application/xml');
  const root = doc.querySelector('mxGraphModel > root') ?? doc.querySelector('root');
  if (!root) throw new DrawioParseError('no <mxGraphModel>/<root> in model');

  const cells = Array.from(root.querySelectorAll('mxCell'));
  const byId = new Map<string, Element>();
  const edgeIds = new Set<string>();
  for (const cell of cells) {
    const id = cell.getAttribute('id');
    if (id) byId.set(id, cell);
    if (cell.getAttribute('edge') === '1') edgeIds.add(id ?? '');
  }

  const nodes: JSONCanvasNode[] = [];
  const vertexIds = new Set<string>();

  for (const cell of cells) {
    const id = cell.getAttribute('id') ?? '';
    if (id === '0' || id === '1') continue;            // structural root + default layer
    if (cell.getAttribute('vertex') !== '1') continue;
    if (isGroup(cell)) continue;                       // drop pure group containers
    if (edgeIds.has(cell.getAttribute('parent') ?? '')) continue; // edge-label child cell
    const geo = cell.querySelector('mxGeometry');
    const { x, y } = absoluteXY(cell, byId);
    nodes.push({
      id,
      type: 'text',
      x,
      y,
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
