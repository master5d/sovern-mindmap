import { create } from 'zustand';
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
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
import { getDescendants, getParent, cloneSubtree } from '../utils/tree';

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
  collapsedIds: string[];
  toggleCollapse: (id: string) => void;
  clipboard: { nodes: Node<SOVERNNodeData>[]; edges: Edge[]; rootId: string } | null;
  copySubtree: (id: string) => void;
  pasteSubtree: (targetParentId?: string) => void;
}

/**
 * Run a derived mutation (layout / rollup re-computation) without it landing as
 * its own undo step. A single logical edit (add/delete/rename) issues one primary
 * `set` plus follow-up re-layout `set`s; we coalesce by pausing temporal tracking
 * around the follow-ups so one Ctrl+Z reverses the whole edit. Restores the prior
 * tracking state (history stays paused outside edit sessions).
 */
function withoutHistory(fn: () => void): void {
  const temporalStore = useWorkflowStore?.temporal;
  if (!temporalStore) {
    fn();
    return;
  }
  const wasTracking = temporalStore.getState().isTracking;
  if (wasTracking) temporalStore.getState().pause();
  try {
    fn();
  } finally {
    if (wasTracking) temporalStore.getState().resume();
  }
}

export const useWorkflowStore = create<WorkflowState>()(
  temporal(
    (set, get) => ({
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
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.temporal.getState().resume();
  },
  exitEditMode: () => {
    set({ isEditing: false });
    useWorkflowStore.temporal.getState().pause();
    useWorkflowStore.temporal.getState().clear();
  },
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
    withoutHistory(() => get().recalculate());

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
    withoutHistory(() => get().autoLayout());
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
    withoutHistory(() => get().recalculate());
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
  },
  collapsedIds: [],
  toggleCollapse: (id) => {
    const set0 = new Set(get().collapsedIds);
    set0.has(id) ? set0.delete(id) : set0.add(id);
    set({ collapsedIds: [...set0] });
  },
  clipboard: null,
  copySubtree: (id) => {
    const { nodes, edges, rootId } = cloneSubtree(id, get().nodes, get().edges);
    set({ clipboard: { nodes: nodes as any, edges, rootId } });
  },
  pasteSubtree: (targetParentId) => {
    const clip = get().clipboard;
    if (!clip) return;
    get().enterEditMode();
    const seed = { nodes: [...clip.nodes], edges: [...clip.edges], rootId: clip.rootId };
    const linkEdge = targetParentId
      ? [{ id: `e-${targetParentId}-${seed.rootId}`, source: targetParentId, target: seed.rootId }]
      : [];
    set({
      nodes: [...get().nodes, ...seed.nodes],
      edges: [...get().edges, ...seed.edges, ...linkEdge],
      selectedNodeId: seed.rootId,
    });
    // refresh clipboard with new ids so a subsequent paste won't collide
    get().copySubtree(seed.rootId);
    get().autoLayout();
  },
    }),
    {
      partialize: (s) => ({ nodes: s.nodes, edges: s.edges }),
      limit: 100,
      // Shallow ref-compare: requires immutable updates upstream — an in-place
      // node/edge mutation defeats tracking and silently produces no undo step.
      equality: (a, b) => shallow(a.nodes, b.nodes) && shallow(a.edges, b.edges),
    },
  ),
);

// History is meaningful only during hand-editing; stay paused until enterEditMode.
useWorkflowStore.temporal.getState().pause();

/** Nodes with `hidden` set for every descendant of a collapsed node. */
export function selectVisibleNodes(s: { nodes: any[]; edges: any[]; collapsedIds: string[] }) {
  if (s.collapsedIds.length === 0) return s.nodes;
  const hidden = new Set<string>();
  s.collapsedIds.forEach((id) => getDescendants(id, s.edges as Edge[]).forEach((d) => hidden.add(d)));
  return s.nodes.map((n) => (hidden.has(n.id) ? { ...n, hidden: true } : n.hidden ? { ...n, hidden: false } : n));
}

/** Edges hidden when either endpoint is hidden. */
export function selectVisibleEdges(s: { nodes: any[]; edges: any[]; collapsedIds: string[] }) {
  if (s.collapsedIds.length === 0) return s.edges;
  const hidden = new Set<string>();
  s.collapsedIds.forEach((id) => getDescendants(id, s.edges as Edge[]).forEach((d) => hidden.add(d)));
  return s.edges.map((e) =>
    hidden.has(e.source) || hidden.has(e.target) ? { ...e, hidden: true } : e.hidden ? { ...e, hidden: false } : e,
  );
}
