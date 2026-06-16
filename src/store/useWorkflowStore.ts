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
import { SOVERNNodeData } from '../types';
import { calculateBudgetRollup, calculateTimelineRollup } from '../utils/pmEngine';
import { getClusteredElements, getTreeLayout, getLaneLayout } from '../utils/layout';
import { getDescendants, getParent } from '../utils/tree';

export type ViewMode = 'mindmap' | 'diagram' | 'matrix' | 'timeline' | 'kanban';
export type DiagramLayout = 'tree' | 'lanes';

interface WorkflowState {
  nodes: Node<SOVERNNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  viewMode: ViewMode;
  n8nWebhookUrl: string;
  isSyncing: boolean;
  isEditing: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setNodes: (nodes: Node<SOVERNNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<SOVERNNodeData>) => void;
  addChildNode: (parentId: string) => string;
  addSiblingNode: (nodeId: string) => string;
  deleteNodeCascade: (nodeId: string) => void;
  editingNodeId: string | null;
  beginInlineEdit: (id: string) => void;
  commitInlineEdit: (id: string, label: string) => void;
  cancelInlineEdit: () => void;
  diagramLayout: DiagramLayout;
  presentationMode: boolean;
  setViewMode: (mode: ViewMode) => void;
  setDiagramLayout: (layout: DiagramLayout) => void;
  setPresentationMode: (on: boolean) => void;
  applyDiagramLayout: () => void;
  setN8nWebhookUrl: (url: string) => void;
  recalculate: () => void;
  autoLayout: () => void;
  triggerWebhook: (nodeId: string, eventType: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  viewMode: 'mindmap',
  diagramLayout: 'tree',
  presentationMode: false,
  n8nWebhookUrl: '',
  isSyncing: false,
  isEditing: false,
  enterEditMode: () => {
    if (get().isEditing) return;
    set({ isEditing: true });
  },
  exitEditMode: () => set({ isEditing: false }),
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

    if (dataUpdate.status) {
      get().triggerWebhook(id, 'node.status_changed');
    }
  },
  addChildNode: (parentId) => {
    get().enterEditMode();
    const id = `n-${crypto.randomUUID()}`;
    const parent = get().nodes.find((n) => n.id === parentId);
    const newNode = {
      id,
      type: 'sovern' as const,
      position: { x: (parent?.position.x ?? 0), y: (parent?.position.y ?? 0) + 120 },
      data: { label: 'New node', layer: parent?.data.layer ?? 'projects', status: 'pending' as const },
    };
    set({
      nodes: [...get().nodes, newNode as any],
      edges: [...get().edges, { id: `e-${parentId}-${id}`, source: parentId, target: id }],
      selectedNodeId: id,
    });
    get().autoLayout();
    return id;
  },
  addSiblingNode: (nodeId) => {
    const parentId = getParent(nodeId, get().edges);
    return get().addChildNode(parentId ?? nodeId);
  },
  deleteNodeCascade: (nodeId) => {
    get().enterEditMode();
    const doomed = new Set([nodeId, ...getDescendants(nodeId, get().edges)]);
    set({
      nodes: get().nodes.filter((n) => !doomed.has(n.id)),
      edges: get().edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
      selectedNodeId: get().selectedNodeId && doomed.has(get().selectedNodeId!) ? null : get().selectedNodeId,
    });
    get().recalculate();
  },
  editingNodeId: null,
  beginInlineEdit: (id) => { get().enterEditMode(); set({ editingNodeId: id, selectedNodeId: id }); },
  commitInlineEdit: (id, label) => {
    const trimmed = label.trim();
    if (trimmed) get().updateNodeData(id, { label: trimmed });
    set({ editingNodeId: null });
  },
  cancelInlineEdit: () => set({ editingNodeId: null }),
  setDiagramLayout: (layout) => {
    set({ diagramLayout: layout });
    get().applyDiagramLayout();
  },
  setPresentationMode: (on) => set({ presentationMode: on }),
  applyDiagramLayout: () => {
    const { nodes, edges, diagramLayout } = get();
    const layoutFn = diagramLayout === 'tree' ? getTreeLayout : getLaneLayout;
    const { nodes: laid } = layoutFn(nodes, edges);
    set({ nodes: laid as any[] });
  },
  setViewMode: (mode) => {
    const prev = get().viewMode;
    // уход из diagram: снять lane-ноды и вернуть draggable
    if (prev === 'diagram' && mode !== 'diagram') {
      set({
        nodes: get().nodes.filter((n) => n.type !== 'lane').map((n) => ({ ...n, draggable: true })),
        presentationMode: false,
      });
    }
    set({ viewMode: mode });
    if (mode === 'mindmap') get().autoLayout();
    if (mode === 'diagram') get().applyDiagramLayout();
    // matrix / timeline / kanban — DOM-вью, canvas-позиции не трогаем
  },
  setN8nWebhookUrl: (url) => set({ n8nWebhookUrl: url }),
  recalculate: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;
    let updatedNodes = calculateBudgetRollup(nodes, edges);
    updatedNodes = calculateTimelineRollup(updatedNodes, edges);
    set({ nodes: updatedNodes as any[] });
  },
  autoLayout: () => {
    const { nodes, edges } = get();
    const content = nodes.filter((n) => n.type !== 'lane');
    const { nodes: layoutedNodes, edges: layoutedEdges } = getClusteredElements(content, edges);
    set({ nodes: layoutedNodes as any[], edges: layoutedEdges });
  },
  triggerWebhook: (nodeId, _eventType) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;
    set({ isSyncing: true });
    setTimeout(() => { set({ isSyncing: false }); }, 1500);
  }
}));
