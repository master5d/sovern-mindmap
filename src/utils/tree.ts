import { Node, Edge } from '@xyflow/react';

/** Direct children: targets of edges whose source is `id`. */
export function getChildren(id: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === id).map((e) => e.target);
}

/** All transitive descendants (cycle-safe; includes nodes revisited via a cycle once). */
export function getDescendants(id: string, edges: Edge[]): string[] {
  const seen = new Set<string>();
  const stack = getChildren(id, edges);
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...getChildren(cur, edges));
  }
  return [...seen];
}

/** First parent: source of an edge whose target is `id`. */
export function getParent(id: string, edges: Edge[]): string | undefined {
  return edges.find((e) => e.target === id)?.source;
}

/**
 * Deep-copy the subtree rooted at `rootId` with brand-new ids.
 * Returns the cloned nodes/edges (only edges internal to the subtree) and the new root id.
 * Positions are offset by +40,+40 so a paste is visually distinct before re-layout.
 */
export function cloneSubtree(
  rootId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; rootId: string } {
  const ids = [rootId, ...getDescendants(rootId, edges)];
  const idSet = new Set(ids);
  const idMap = new Map<string, string>();
  ids.forEach((old) => idMap.set(old, `n-${crypto.randomUUID()}`));

  const clonedNodes = nodes
    .filter((nd) => idSet.has(nd.id))
    .map((nd) => ({
      ...nd,
      id: idMap.get(nd.id)!,
      selected: false,
      position: { x: nd.position.x + 40, y: nd.position.y + 40 },
      data: { ...nd.data },
    }));

  const clonedEdges = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({
      ...e,
      id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

  return { nodes: clonedNodes, edges: clonedEdges, rootId: idMap.get(rootId)! };
}
