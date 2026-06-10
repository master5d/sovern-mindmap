import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Adjust these to match or slightly exceed the actual node size + desired padding
const nodeWidth = 260;
const nodeHeight = 110;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  
  // Set global graph layout options
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 30, // Horizontal spacing between nodes in the same rank
    ranksep: 120, // Vertical spacing between ranks
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    // We can try to use measured dimensions if available, otherwise fallback to defaults
    const width = node.measured?.width ?? nodeWidth;
    const height = node.measured?.height ?? nodeHeight;
    
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.measured?.width ?? nodeWidth;
    const height = node.measured?.height ?? nodeHeight;

    return {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

/**
 * Кластерная раскладка feedback-борда: area-ноды — заголовки колонок,
 * тикеты — grid 2×N под своей area. Dagre на 47 плоских тикетах даёт
 * ленту ~13000px шириной; кластеры держат аспект, пригодный для fitView.
 */
export const getClusteredElements = (nodes: Node[], edges: Edge[]) => {
  const areas = nodes.filter((n) => n.id.startsWith('area_'));
  if (areas.length === 0) return getLayoutedElements(nodes, edges); // не feedback-борд

  const CARD_W = 280, CARD_H = 135, COLS = 2, BLOCK_GAP = 120, HEADER_H = 170;
  let xOffset = 0;

  const positioned = new Map<string, { x: number; y: number }>();
  areas.forEach((area) => {
    const layer = (area.data as any).layer;
    const tickets = nodes.filter((n) => !n.id.startsWith('area_') && (n.data as any).layer === layer);
    const blockW = COLS * CARD_W;
    positioned.set(area.id, { x: xOffset + (blockW - 200) / 2, y: 0 });
    tickets.forEach((t, i) => {
      positioned.set(t.id, {
        x: xOffset + (i % COLS) * CARD_W,
        y: HEADER_H + Math.floor(i / COLS) * CARD_H,
      });
    });
    xOffset += blockW + BLOCK_GAP;
  });

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) ?? node.position,
  }));
  return { nodes: layoutedNodes, edges };
};
