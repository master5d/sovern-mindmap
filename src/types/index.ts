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
  color?: string;    // severity-цвет тикета из canvas (hex)
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
