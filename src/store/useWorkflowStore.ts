import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { SOVERNNodeData, SOVERNLayer, NodeStatus } from '../types';
import { calculateBudgetRollup, calculateTimelineRollup } from '../utils/pmEngine';
import { getLayoutedElements } from '../utils/layout';

export type ViewMode = 'mindmap' | 'matrix' | 'timeline' | 'kanban';

const LAYER_ORDER: SOVERNLayer[] = [
  'human', 'boss', 'skills', 'projects', 'coding', 'tools', 'gateway', 'memory', 'observability', 'hosting'
];

const STATUS_ORDER: NodeStatus[] = ['idle', 'pending', 'active', 'done', 'blocked'];

interface WorkflowState {
  nodes: Node<SOVERNNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  viewMode: ViewMode;
  n8nWebhookUrl: string;
  isSyncing: boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setNodes: (nodes: Node<SOVERNNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<SOVERNNodeData>) => void;
  setViewMode: (mode: ViewMode) => void;
  setN8nWebhookUrl: (url: string) => void;
  recalculate: () => void;
  autoLayout: (direction?: string) => void;
  applyMatrixLayout: () => void;
  applyTimelineLayout: () => void;
  applyKanbanLayout: () => void;
  triggerWebhook: (nodeId: string, eventType: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  viewMode: 'mindmap',
  n8nWebhookUrl: '',
  isSyncing: false,
  onNodesChange: (changes: NodeChange[]) => {
    let nextSelectedId = get().selectedNodeId;
    changes.forEach((change) => {
      if (change.type === 'select' && 'selected' in change) {
        if (change.selected) nextSelectedId = change.id;
        else if (nextSelectedId === change.id) nextSelectedId = null;
      }
    });
    if (nextSelectedId !== get().selectedNodeId) set({ selectedNodeId: nextSelectedId });
    set({ nodes: applyNodeChanges(changes, get().nodes) as any[] });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get().recalculate();
  },
  onConnect: (connection: Connection) => {
    set({ edges: addEdge(connection, get().edges) });
    get().recalculate();
  },
  setNodes: (nodes) => {
    const recalculated = calculateBudgetRollup(nodes, get().edges);
    const withTimeline = calculateTimelineRollup(recalculated, get().edges);
    set({ nodes: withTimeline as any[] });
  },
  setEdges: (edges) => {
    set({ edges });
    get().recalculate();
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  updateNodeData: (id, dataUpdate) => {
    set({
      nodes: get().nodes.map((node) => 
        node.id === id ? { ...node, data: { ...node.data, ...dataUpdate } } : node
      ),
    });
    get().recalculate();
    if (get().viewMode === 'matrix') get().applyMatrixLayout();
    if (get().viewMode === 'timeline') get().applyTimelineLayout();
    if (get().viewMode === 'kanban') get().applyKanbanLayout();
    
    if (dataUpdate.status) {
      get().triggerWebhook(id, 'node.status_changed');
    }
  },
  setViewMode: (mode) => {
    set({ viewMode: mode });
    if (mode === 'mindmap') get().autoLayout();
    else if (mode === 'matrix') get().applyMatrixLayout();
    else if (mode === 'timeline') get().applyTimelineLayout();
    else if (mode === 'kanban') get().applyKanbanLayout();
  },
  setN8nWebhookUrl: (url) => set({ n8nWebhookUrl: url }),
  recalculate: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;
    let updatedNodes = calculateBudgetRollup(nodes, edges);
    updatedNodes = calculateTimelineRollup(updatedNodes, edges);
    set({ nodes: updatedNodes as any[] });
  },
  autoLayout: (direction = 'TB') => {
    const { nodes, edges } = get();
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, direction);
    set({ nodes: layoutedNodes as any[], edges: layoutedEdges });
  },
  applyMatrixLayout: () => {
    const { nodes } = get();
    const width = 1000, height = 800, padding = 100;
    const layoutedNodes = nodes.map((node) => {
      const urgency = node.data.urgency || 5, impact = node.data.impact || 5;
      return {
        ...node,
        position: {
          x: padding + ((urgency - 1) / 9) * (width - 2 * padding),
          y: (height - padding) - ((impact - 1) / 9) * (height - 2 * padding),
        },
      };
    });
    set({ nodes: layoutedNodes as any[] });
  },
  applyTimelineLayout: () => {
    const { nodes } = get();
    const dayWidth = 10, layerHeight = 150, startX = 100;
    const allStarts = nodes.map(n => new Date(n.data.dates?.start || Date.now()).getTime());
    const minDate = new Date(Math.min(...allStarts));
    const layoutedNodes = nodes.map((node) => {
      const nodeStart = new Date(node.data.dates?.start || Date.now());
      const daysFromStart = Math.max(0, (nodeStart.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
      const layerIndex = LAYER_ORDER.indexOf(node.data.layer);
      return {
        ...node,
        position: { x: startX + (daysFromStart * dayWidth), y: 100 + (layerIndex * layerHeight) },
      };
    });
    set({ nodes: layoutedNodes as any[] });
  },
  applyKanbanLayout: () => {
    const { nodes } = get();
    const columnWidth = 320; // Slightly wider
    const nodeWidth = 200;
    const nodeHeightWithGap = 160;
    const startX = 50;
    const startY = 120;

    const columnCounters: Record<string, number> = {};

    const layoutedNodes = nodes.map((node) => {
      const status = node.data.status || 'idle';
      const columnIndex = STATUS_ORDER.indexOf(status);
      const rowInColumn = columnCounters[status] || 0;
      
      columnCounters[status] = rowInColumn + 1;

      return {
        ...node,
        position: {
          // Center the 200px card inside the 320px column
          x: startX + (columnIndex * columnWidth) + (columnWidth - nodeWidth) / 2,
          y: startY + (rowInColumn * nodeHeightWithGap),
        },
      };
    });
    set({ nodes: layoutedNodes as any[] });
  },
  triggerWebhook: (nodeId, _eventType) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    set({ isSyncing: true });
    setTimeout(() => { set({ isSyncing: false }); }, 1500);
  }
}));
