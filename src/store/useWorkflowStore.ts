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
import { SOVERNNodeData, ShapeKind, humanizeShape } from '../types';
import { calculateBudgetRollup, calculateTimelineRollup } from '../utils/pmEngine';
import { getClusteredElements, getTreeLayout, getLaneLayout } from '../utils/layout';
import { getChildren, getDescendants, getParent, cloneSubtree } from '../utils/tree';
import {
  saveBoardContent,
  loadBoardContent,
  deleteBoardContent,
  saveBoardsRegistry,
} from '../utils/persistence';
import { artifactTombstonePayloads, postArtifactTombstones } from '../hooks/artifactTombstones';

export type ViewMode = 'mindmap' | 'diagram' | 'matrix' | 'timeline' | 'kanban' | 'outline';
export type DiagramLayout = 'tree' | 'lanes';

/** One canvas tab. `review` = the service «Design Review» board (artifact inbox);
 * `file` = the live read-only mirror of the repo's /board.canvas feed (its content
 * is never persisted to a board key — the file is the source of truth). */
export interface BoardMeta {
  id: string;
  name: string;
  kind: 'user' | 'review' | 'file';
  /** Идентификатор живого борда из /api/boards. Есть только у kind === 'file'.
   *  Хеш пути, а не позиция: вставка борда в середину списка не должна
   *  переставлять вкладки местами. */
  sourceId?: string;
  /** Можно ли писать в этот борд (рядом лежит scripts/fb.mjs). */
  writable?: boolean;
  /** Причина, по которой борд не прочитан. Присутствие поля = «не смог
   *  прочитать»; пустой холст в этом случае соврал бы, что борд пуст. */
  sourceError?: string;
}

export const REVIEW_BOARD_NAME = 'Design Review';
export const FILE_BOARD_NAME = 'board.canvas (live)';

/**
 * Spec: artifact nodes live ONLY on the review board. Strips `artifact` nodes
 * (and any edges touching them) from content headed for a user board — the
 * one-time cleanup for artifacts that leaked into user boards before the
 * inbox was board-gated (Task 3 carry-over). Returns the inputs unchanged
 * when there is nothing to strip.
 */
export function stripArtifactContent(
  nodes: Node<SOVERNNodeData>[],
  edges: Edge[],
): { nodes: Node<SOVERNNodeData>[]; edges: Edge[] } {
  const doomed = new Set(nodes.filter((n) => (n.type as string) === 'artifact').map((n) => n.id));
  if (doomed.size === 0) return { nodes, edges };
  return {
    nodes: nodes.filter((n) => !doomed.has(n.id)),
    edges: edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
  };
}

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
  setNodeShape: (id: string, shape: ShapeKind) => void;
  addShapeNode: (shape: ShapeKind, position: { x: number; y: number }) => string;
  addChildNode: (parentId: string) => string;
  addSiblingNode: (nodeId: string) => string;
  deleteNodeCascade: (nodeId: string) => void;
  editingNodeId: string | null;
  beginInlineEdit: (id: string) => void;
  commitInlineEdit: (id: string, label: string) => void;
  cancelInlineEdit: () => void;
  diagramLayout: DiagramLayout;
  presentationMode: boolean;
  learnMode: boolean;
  learnStep: number;
  enterLearnMode: () => void;
  exitLearnMode: () => void;
  learnNext: () => void;
  learnPrev: () => void;
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
  addGeneratedGraph: (newNodes: Node<SOVERNNodeData>[], newEdges: Edge[]) => void;
  addImportedGraph: (newNodes: Node<SOVERNNodeData>[], newEdges: Edge[]) => void;
  // ── Canvas Project Tabs (multi-board) — non-temporal fields ──
  boards: BoardMeta[];
  activeBoardId: string | null;
  initBoards: (reg: { boards: BoardMeta[]; activeBoardId: string }) => void;
  switchBoard: (id: string) => Promise<void>;
  createBoard: (name?: string) => Promise<string>;
  renameBoard: (id: string, name: string) => void;
  deleteBoard: (id: string) => Promise<void>;
  ensureReviewBoard: () => string;
  ensureFileBoard: () => string;
  syncFileBoards: (sources: { id: string; name: string; writable?: boolean; error?: string }[]) => void;
}

/**
 * Run a derived mutation (layout / rollup re-computation) without it landing as
 * its own undo step. A single logical edit (add/delete/rename) issues one primary
 * `set` plus follow-up re-layout `set`s; we coalesce by pausing temporal tracking
 * around the follow-ups so one Ctrl+Z reverses the whole edit. Restores the prior
 * tracking state (history stays paused outside edit sessions).
 */
export function withoutHistory(fn: () => void): void {
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
  learnMode: false,
  learnStep: 1,
  enterLearnMode: () => set({ learnMode: true, learnStep: 1, selectedNodeId: null, editingNodeId: null }),
  exitLearnMode: () => set({ learnMode: false }),
  learnNext: () => {
    const total = selectLearnOrder(get()).total;
    set({ learnStep: Math.min(get().learnStep + 1, Math.max(1, total)) });
  },
  learnPrev: () => set({ learnStep: Math.max(1, get().learnStep - 1) }),
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
    set({ isEditing: false, editingNodeId: null });
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
    // A real user drag is a structural edit — freeze the live poll so it isn't clobbered.
    if (changes.some((c) => c.type === 'position' && (c as any).dragging)) get().enterEditMode();
    // Ledger tombstones: deleting an artifact node on the review board is a
    // user decision — record it server-side so the poll doesn't resurrect it.
    if (changes.some((c) => c.type === 'remove')) {
      const { boards, activeBoardId } = get();
      if (boards.find((b) => b.id === activeBoardId)?.kind === 'review') {
        postArtifactTombstones(artifactTombstonePayloads(get().nodes, changes as any));
      }
    }
    // React Flow's incremental node changes (selection, dimension measurement, per-frame
    // drag positions) must not pollute undo history — only structural authoring actions
    // (add/delete/rename/paste/fold) are undoable.
    withoutHistory(() => set({ nodes: applyNodeChanges(changes, get().nodes) as any[] }));
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
  setNodeShape: (id, shape) => {
    get().enterEditMode(); // idempotent: freezes the live poll + resumes undo tracking
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, type: 'shape', data: { ...n.data, shape } } : n,
      ),
    });
    // Re-rollup without a second undo entry — the type+shape flip above is the one step.
    withoutHistory(() => get().recalculate());
  },
  addShapeNode: (shape, position) => {
    get().enterEditMode(); // idempotent: freezes the live poll + resumes undo tracking
    const id = `n-${crypto.randomUUID()}`;
    const newNode = {
      id,
      type: 'shape' as const,
      position,
      data: { label: humanizeShape(shape), layer: 'projects' as const, status: 'pending' as const, shape },
    };
    // Standalone node — no parent edge. The append below is the single tracked undo step.
    set({ nodes: [...get().nodes, newNode as any], selectedNodeId: id });
    // Recalc rollups WITHOUT auto-layout, so the drop coordinates survive (cf. addImportedGraph).
    withoutHistory(() => get().recalculate());
    return id;
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
    // Ledger tombstones: this cascade bypasses onNodesChange (React Flow's
    // Delete key + selection go straight through here), so an artifact node
    // selected on the review board must be tombstoned the same way.
    const { boards, activeBoardId, nodes } = get();
    if (boards.find((b) => b.id === activeBoardId)?.kind === 'review') {
      postArtifactTombstones(
        artifactTombstonePayloads(nodes, [...doomed].map((id) => ({ type: 'remove', id }))),
      );
    }
    set({
      nodes: get().nodes.filter((n) => !doomed.has(n.id)),
      edges: get().edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
      selectedNodeId: get().selectedNodeId && doomed.has(get().selectedNodeId!) ? null : get().selectedNodeId,
      collapsedIds: get().collapsedIds.filter((cid) => !doomed.has(cid)),
    });
    withoutHistory(() => get().recalculate());
  },
  editingNodeId: null,
  beginInlineEdit: (id) => { get().enterEditMode(); set({ editingNodeId: id, selectedNodeId: id }); },
  commitInlineEdit: (id, label) => {
    if (get().editingNodeId !== id) return; // ignore the redundant blur-commit after Enter
    const trimmed = label.trim();
    const current = get().nodes.find((n) => n.id === id)?.data.label;
    if (trimmed && trimmed !== current) get().updateNodeData(id, { label: trimmed });
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
    // matrix / timeline / kanban / outline — DOM-вью, canvas-позиции не трогаем
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
    withoutHistory(() => get().autoLayout());
  },
  addGeneratedGraph: (newNodes, newEdges) => {
    get().enterEditMode();
    set({ nodes: [...get().nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
    withoutHistory(() => get().autoLayout());
  },
  addImportedGraph: (newNodes, newEdges) => {
    get().enterEditMode();
    set({ nodes: [...get().nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
    // Imported diagrams carry real coordinates — recalc rollups but DON'T re-layout.
    withoutHistory(() => get().recalculate());
  },
  // ── Canvas Project Tabs (multi-board). All board fields stay outside zundo
  //    tracking (temporal partialize = nodes/edges only). ──
  boards: [],
  activeBoardId: '',
  initBoards: (reg) => set({ boards: reg.boards, activeBoardId: reg.activeBoardId }),
  switchBoard: async (id) => {
    const { boards, activeBoardId, nodes, edges } = get();
    if (id === activeBoardId || !boards.some((b) => b.id === id)) return;
    // 1. IMMEDIATE save of the outgoing board (direct, not the debounced autosave).
    //    `file` boards mirror /board.canvas — their content is never persisted.
    const outgoing = boards.find((b) => b.id === activeBoardId);
    if (activeBoardId && outgoing?.kind !== 'file') await saveBoardContent(activeBoardId, nodes, edges);
    // 2. Load the target; missing/corrupt content → empty board, no crash.
    //    User boards are swept of stray artifact nodes BEFORE render (spec:
    //    artifacts live only on the review board); autosave persists the fix.
    const content = await loadBoardContent(id);
    const target = boards.find((b) => b.id === id);
    const clean =
      target?.kind === 'review'
        ? { nodes: content?.nodes ?? [], edges: content?.edges ?? [] }
        : stripArtifactContent(content?.nodes ?? [], content?.edges ?? []);
    withoutHistory(() => {
      get().setNodes(clean.nodes);
      get().setEdges(clean.edges);
    });
    // 3. Leave edit mode: pauses temporal tracking + clears undo history,
    //    so undo/redo never leaks across boards.
    get().exitEditMode();
    // 4. Activate + persist the registry.
    set({ activeBoardId: id, selectedNodeId: null });
    await saveBoardsRegistry({ boards: get().boards, activeBoardId: id });
  },
  createBoard: async (name) => {
    const id = `b-${crypto.randomUUID()}`;
    const trimmed = name?.trim();
    const meta: BoardMeta = { id, name: trimmed || `Board ${get().boards.length + 1}`, kind: 'user' };
    set({ boards: [...get().boards, meta] });
    // switchBoard saves the current board, loads the (empty) new one and persists the registry.
    await get().switchBoard(id);
    return id;
  },
  renameBoard: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed || !get().boards.some((b) => b.id === id)) return;
    const boards = get().boards.map((b) => (b.id === id ? { ...b, name: trimmed } : b));
    set({ boards });
    void saveBoardsRegistry({ boards, activeBoardId: get().activeBoardId });
  },
  deleteBoard: async (id) => {
    const { boards } = get();
    const target = boards.find((b) => b.id === id);
    if (!target || target.kind !== 'user') return; // service boards (review/file) are undeletable
    if (boards.filter((b) => b.kind === 'user').length <= 1) return; // keep the last user board
    const remaining = boards.filter((b) => b.id !== id);
    let nextActive = get().activeBoardId;
    if (nextActive === id) {
      // The deleted board was active — fall back to the first remaining user board.
      const fallback = remaining.find((b) => b.kind === 'user') ?? remaining[0];
      const content = await loadBoardContent(fallback.id);
      const clean =
        fallback.kind === 'review'
          ? { nodes: content?.nodes ?? [], edges: content?.edges ?? [] }
          : stripArtifactContent(content?.nodes ?? [], content?.edges ?? []);
      withoutHistory(() => {
        get().setNodes(clean.nodes);
        get().setEdges(clean.edges);
      });
      get().exitEditMode();
      set({ selectedNodeId: null });
      nextActive = fallback.id;
    }
    set({ boards: remaining, activeBoardId: nextActive });
    await deleteBoardContent(id);
    await saveBoardsRegistry({ boards: remaining, activeBoardId: nextActive });
  },
  ensureReviewBoard: () => {
    const existing = get().boards.find((b) => b.kind === 'review');
    if (existing) return existing.id;
    const id = `b-${crypto.randomUUID()}`;
    const meta: BoardMeta = { id, name: REVIEW_BOARD_NAME, kind: 'review' };
    const boards = [...get().boards, meta];
    set({ boards });
    void saveBoardsRegistry({ boards, activeBoardId: get().activeBoardId });
    return id;
  },
  ensureFileBoard: () => {
    const existing = get().boards.find((b) => b.kind === 'file');
    if (existing) return existing.id;
    const id = `b-${crypto.randomUUID()}`;
    const meta: BoardMeta = { id, name: FILE_BOARD_NAME, kind: 'file' };
    const boards = [...get().boards, meta];
    set({ boards });
    void saveBoardsRegistry({ boards, activeBoardId: get().activeBoardId });
    return id;
  },
  syncFileBoards: (sources) => {
    const prev = get().boards;
    const wanted = new Map(sources.map((s) => [s.id, s]));

    /** Поля живого борда переносятся ЦЕЛИКОМ, включая отсутствие error:
     *  починившийся борд не должен носить прежнюю ошибку вечно. */
    const meta = (b: BoardMeta, s: { name: string; writable?: boolean; error?: string }) => {
      const next: BoardMeta = { ...b, name: s.name, writable: s.writable ?? false };
      delete next.sourceError;
      if (s.error) next.sourceError = s.error;
      return next;
    };

    // Пользовательские и review-вкладки живут своей жизнью: список живых
    // бордов не имеет права их трогать.
    const kept = prev.filter((b) => b.kind !== 'file' || wanted.has(b.sourceId ?? ''));
    const renamed = kept.map((b) =>
      b.kind === 'file' && b.sourceId && wanted.has(b.sourceId)
        ? meta(b, wanted.get(b.sourceId)!)
        : b,
    );
    const present = new Set(renamed.filter((b) => b.kind === 'file').map((b) => b.sourceId));
    const added: BoardMeta[] = sources
      .filter((s) => !present.has(s.id))
      .map((s) =>
        meta(
          { id: `b-${crypto.randomUUID()}`, name: s.name, kind: 'file', sourceId: s.id },
          s,
        ),
      );

    const boards = [...renamed, ...added];
    if (boards.length === prev.length && added.length === 0) {
      const same = boards.every(
        (b, i) =>
          b.name === prev[i].name &&
          b.writable === prev[i].writable &&
          b.sourceError === prev[i].sourceError,
      );
      if (same) return; // ничего не изменилось — не дёргаем подписчиков
    }

    // activeBoardId не имеет права указывать на снесённую вкладку. Присвоить
    // ей id выжившего борда напрямую НЕЛЬЗЯ: контент грузится только внутри
    // switchBoard, а useAutosave сохранит граф исчезнувшего борда под чужим
    // ключом. Поэтому — null вместе со списком (switchBoard тогда пропустит
    // сохранение исчезнувшего файлового борда) и штатный переход отдельным
    // вызовом.
    if (get().activeBoardId && !boards.some((b) => b.id === get().activeBoardId)) {
      const next = boards[0]?.id ?? null;
      set({ boards, activeBoardId: null });
      void saveBoardsRegistry({ boards, activeBoardId: null });
      if (next) void get().switchBoard(next);
      return;
    }

    set({ boards });
    void saveBoardsRegistry({ boards, activeBoardId: get().activeBoardId });
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

/**
 * Canonical walkthrough order. Stepped nodes (finite numeric `data.step`) sort
 * ascending by step; unstepped nodes follow in BFS order from the graph roots.
 * Ties and the BFS fallback are broken deterministically (array index / edge order),
 * and the function always terminates — even on a pure cycle.
 */
export function selectLearnOrder(s: { nodes: any[]; edges: any[] }): { order: string[]; total: number } {
  const nodes = s.nodes as Node<SOVERNNodeData>[];
  const edges = s.edges as Edge[];
  if (nodes.length === 0) return { order: [], total: 0 };

  const indeg = new Map<string, number>(nodes.map((nd) => [nd.id, 0]));
  edges.forEach((e) => { if (indeg.has(e.target)) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1); });
  const roots = nodes.filter((nd) => (indeg.get(nd.id) ?? 0) === 0);
  const starts = roots.length ? roots : nodes.slice(0, 1);

  // Visit each root's whole reachable component before moving to the next root,
  // so a branch builds up fully before a new top-level node appears.
  const bfsRank = new Map<string, number>();
  const seen = new Set<string>();
  let rank = 0;
  for (const start of starts) {
    if (seen.has(start.id)) continue;
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      bfsRank.set(id, rank++);
      getChildren(id, edges).forEach((c) => { if (!seen.has(c)) queue.push(c); });
    }
  }
  // Disconnected nodes (unreachable from any start) rank after the rest, by array index.
  nodes.forEach((nd) => { if (!bfsRank.has(nd.id)) bfsRank.set(nd.id, rank++); });

  const stepOf = new Map<string, number>();
  nodes.forEach((nd) => {
    const v = nd.data?.step;
    if (typeof v === 'number' && Number.isFinite(v)) stepOf.set(nd.id, v);
  });

  const order = nodes.map((nd) => nd.id).sort((a, b) => {
    const sa = stepOf.get(a), sb = stepOf.get(b);
    if (sa !== undefined && sb !== undefined) return sa - sb || bfsRank.get(a)! - bfsRank.get(b)!;
    if (sa !== undefined) return -1; // stepped before unstepped
    if (sb !== undefined) return 1;
    return bfsRank.get(a)! - bfsRank.get(b)!;
  });

  return { order, total: order.length };
}

/** Cumulative reveal: the set of node ids at order positions 0 .. learnStep-1. */
export function selectVisibleUpToStep(order: string[], learnStep: number): Set<string> {
  return new Set(order.slice(0, Math.max(0, learnStep)));
}

/** Current-step narration + identity for the playback UI (pure; clamps the step). */
export function selectLearnStepText(
  s: { nodes: any[]; edges: any[] },
  learnStep: number,
): { text: string; currentId: string | null; total: number } {
  const { order, total } = selectLearnOrder(s);
  if (total === 0) return { text: '', currentId: null, total: 0 };
  const idx = Math.min(Math.max(learnStep, 1), total) - 1;
  const currentId = order[idx];
  const node = (s.nodes as Node<SOVERNNodeData>[]).find((nd) => nd.id === currentId);
  const text = (node?.data?.note && String(node.data.note).trim()) || node?.data?.label || '';
  return { text, currentId, total };
}
