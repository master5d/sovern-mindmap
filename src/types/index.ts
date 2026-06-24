import { 
  Node as RFNode, 
  Edge as RFEdge
} from '@xyflow/react';

export type SOVERNLayer =
  | 'human'
  | 'boss'
  | 'skills'
  | 'coding'
  | 'gateway'
  | 'memory'
  | 'tools'
  | 'observability'
  | 'hosting'
  | 'projects'
  // mc_hub feedback areas (триаж-доска)
  | 'lms'
  | 'blog'
  | 'hub'
  | 'mentor'
  | 'workers'
  | 'course'
  | 'infra';

export type NodeStatus = 'pending' | 'active' | 'done' | 'blocked' | 'idle';

export const SHAPE_KINDS = [
  'rectangle', 'rounded', 'decision', 'terminal', 'note',
  'cylinder', 'ellipse', 'parallelogram', 'hexagon', 'cloud', 'actor', 'document',
  // home AI-lab pack (slice 8)
  'server', 'gpu', 'workstation', 'laptop', 'storage',
  'router', 'switch', 'firewall', 'wifi',
  'model', 'agent', 'vector-store', 'gateway', 'container',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Shape kind → human label: hyphens→spaces, sentence-case. e.g. 'vector-store' → 'Vector store'. */
export function humanizeShape(kind: ShapeKind): string {
  const s = kind.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface SOVERNNodeData {
  label: string;
  layer: SOVERNLayer;
  status: NodeStatus;
  budget?: number;
  rollupBudget?: number;
  dates?: {
    start?: string;
    end?: string;
  };
  rollupDates?: {
    start?: string;
    end?: string;
  };
  agent?: string;
  impact?: number;   // 1-10, Priority Matrix Y
  urgency?: number;  // 1-10, Priority Matrix X
  created?: string;  // ISO-дата создания тикета (timeline)
  color?: string;    // severity-цвет тикета из canvas (hex)
  shape?: ShapeKind;
  step?: number;   // 1-based walkthrough order (Learn mode); absent → BFS fallback
  note?: string;   // narration shown when this node is the current Learn step
  __current?: boolean; // display-only: marks the current Learn step node; never persisted
  feedback?: Record<string, any>; // полный triage-блок mc_hub тикета
  [key: string]: any; // sovern:* metadata
}

// Correctly extend React Flow Node type
export type SOVERNNode = RFNode<SOVERNNodeData>;
export type SOVERNEdge = RFEdge;

export interface JSONCanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  metadata?: Record<string, any>;
}

export interface JSONCanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  metadata?: Record<string, any>;
}

export interface JSONCanvas {
  nodes: JSONCanvasNode[];
  edges: JSONCanvasEdge[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
