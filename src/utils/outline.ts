import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { getChildren } from './tree';

export interface OutlineRow {
  id: string;
  depth: number;
  label: string;
  note?: string;
  isRoot: boolean;
}

/**
 * Graph → flat DFS pre-order rows (parent immediately before its subtree).
 * Roots = in-degree 0; then any still-unvisited node (isolated cycles) as roots.
 * Lane nodes excluded; cycle-safe; total — no node is ever dropped.
 */
export function selectOutlineRows(s: { nodes: Node<SOVERNNodeData>[]; edges: Edge[] }): OutlineRow[] {
  const nodes = s.nodes.filter((n) => n.type !== 'lane');
  const { edges } = s;
  if (nodes.length === 0) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => { if (indeg.has(e.target)) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1); });

  const rows: OutlineRow[] = [];
  const visited = new Set<string>();

  const walk = (id: string, depth: number) => {
    if (visited.has(id) || !byId.has(id)) return;
    visited.add(id);
    const n = byId.get(id)!;
    const raw = n.data?.note;
    const note = typeof raw === 'string' && raw.trim() ? raw : undefined;
    rows.push({ id, depth, label: n.data?.label ?? '', note, isRoot: depth === 0 });
    getChildren(id, edges).forEach((c) => { if (byId.has(c)) walk(c, depth + 1); });
  };

  // 1) real roots, in array order
  nodes.forEach((n) => { if ((indeg.get(n.id) ?? 0) === 0) walk(n.id, 0); });
  // 2) totality sweep: anything unreachable (isolated cycle) as a root
  nodes.forEach((n) => { if (!visited.has(n.id)) walk(n.id, 0); });

  return rows;
}

/** Rows → Markdown: roots '# label', descendants '  '×(depth-1)+'- label', note as an italic line. */
export function outlineToMarkdown(rows: OutlineRow[]): string {
  const lines: string[] = [];
  rows.forEach((r) => {
    if (r.isRoot) {
      if (lines.length) lines.push('');
      lines.push(`# ${r.label}`);
      if (r.note) lines.push(`_${r.note}_`);
    } else {
      const indent = '  '.repeat(r.depth - 1);
      lines.push(`${indent}- ${r.label}`);
      if (r.note) lines.push(`${indent}  _${r.note}_`);
    }
  });
  return lines.join('\n');
}
