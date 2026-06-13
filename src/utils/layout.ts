import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

// Adjust these to match or slightly exceed the actual node size + desired padding
const nodeWidth = 260;
const nodeHeight = 110;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
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

export const LANE_HEIGHT = 180;
const LANE_LABEL_W = 140;
const NODE_GAP_X = 280;

/** Diagram view · Tree: строгий org-chart — dagre TB, ноды залочены. */
export const getTreeLayout = (nodes: Node[], edges: Edge[]) => {
  const content = nodes.filter((n) => n.type !== 'lane');
  const { nodes: laid } = getLayoutedElements(content, edges, 'TB');
  return { nodes: laid.map((n) => ({ ...n, draggable: false })), edges };
};

/** Diagram view · Lanes: swimlane на layer; x — dagre-ранг (LR) по зависимостям. */
export const getLaneLayout = (nodes: Node[], edges: Edge[]) => {
  const content = nodes.filter((n) => n.type !== 'lane');
  const { nodes: lr } = getLayoutedElements(content, edges, 'LR');
  const xById = new Map(lr.map((n) => [n.id, n.position.x]));

  const laneOrder: string[] = [];
  content.forEach((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    if (!laneOrder.includes(layer)) laneOrder.push(layer);
  });

  const laid = content.map((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    const row = laneOrder.indexOf(layer);
    return {
      ...n,
      draggable: false,
      targetPosition: 'left' as const,
      sourcePosition: 'right' as const,
      position: {
        x: LANE_LABEL_W + (xById.get(n.id) ?? 0),
        y: row * LANE_HEIGHT + (LANE_HEIGHT - 110) / 2,
      },
    };
  });

  // внутри lane разводим ноды одного dagre-ранга (иначе наложатся)
  const byLane = new Map<string, typeof laid>();
  laid.forEach((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    (byLane.get(layer) ?? byLane.set(layer, []).get(layer)!).push(n);
  });
  byLane.forEach((arr) => {
    arr.sort((a, b) => a.position.x - b.position.x);
    let minNext = -Infinity;
    arr.forEach((n) => {
      if (n.position.x < minNext) n.position.x = minNext;
      minNext = n.position.x + NODE_GAP_X;
    });
  });

  const maxX = Math.max(...laid.map((n) => n.position.x + (n.measured?.width ?? 260)), 600);
  const lanes: Node[] = laneOrder.map((layer, row) => ({
    id: `lane_${layer}`,
    type: 'lane',
    position: { x: 0, y: row * LANE_HEIGHT },
    data: { label: layer },
    draggable: false,
    selectable: false,
    zIndex: -1,
    style: { width: maxX + 80, height: LANE_HEIGHT },
  }));

  return { nodes: [...lanes, ...laid], edges };
};
