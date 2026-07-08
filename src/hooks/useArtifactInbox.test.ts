import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';
import { ingestArtifacts, processArtifactPoll } from './useArtifactInbox';

const entry = (id: string, g?: string) => ({ id, ts: '2026-07-07', code: 'const App=()=>null;', name: id, variant_group: g });
const decidedEntry = (id: string, decision: 'approved' | 'rejected', exportedTo?: string) => ({
  ...entry(id),
  decision,
  exportedTo,
});

describe('ingestArtifacts', () => {
  beforeEach(() => useWorkflowStore.getState().setNodes([]));

  it('adds artifact node with pending status', () => {
    ingestArtifacts([entry('a1')]);
    const n = useWorkflowStore.getState().nodes.find(n => (n.data as any).artifactId === 'a1');
    expect(n?.type).toBe('artifact');
    expect((n?.data as any).status).toBe('pending');
  });

  it('dedupes by artifactId', () => {
    ingestArtifacts([entry('a1')]); ingestArtifacts([entry('a1')]);
    expect(useWorkflowStore.getState().nodes.filter(n => (n.data as any).artifactId === 'a1')).toHaveLength(1);
  });

  it('dedupes duplicate ids within a single batch', () => {
    ingestArtifacts([entry('dup'), entry('dup')]);
    expect(useWorkflowStore.getState().nodes.filter(n => (n.data as any).artifactId === 'dup')).toHaveLength(1);
  });

  it('lays out variant group in a row', () => {
    ingestArtifacts([entry('v1', 'g'), entry('v2', 'g'), entry('v3', 'g')]);
    const xs = useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === 'g').map(n => n.position.x);
    expect(new Set(xs).size).toBe(3);
    const ys = useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === 'g').map(n => n.position.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('honors a server-merged decision instead of defaulting to pending', () => {
    ingestArtifacts([decidedEntry('d1', 'rejected')]);
    const n = useWorkflowStore.getState().nodes.find(n => (n.data as any).artifactId === 'd1');
    expect((n?.data as any).status).toBe('rejected');
  });

  it('carries exportedTo through for an approved+exported artifact', () => {
    ingestArtifacts([decidedEntry('d2', 'approved', 'C:/proj/design/drafts/foo.tsx')]);
    const n = useWorkflowStore.getState().nodes.find(n => (n.data as any).artifactId === 'd2');
    expect((n?.data as any).status).toBe('approved');
    expect((n?.data as any).exportedTo).toBe('C:/proj/design/drafts/foo.tsx');
  });

  it('does not pollute undo history', () => {
    const before = (useWorkflowStore as any).temporal.getState().pastStates.length;
    ingestArtifacts([entry('a2')]);
    expect((useWorkflowStore as any).temporal.getState().pastStates.length).toBe(before);
  });
});

// ── Task 3: board-gated poll tick + pending badge + user-board sweep ────────

const userBoard: BoardMeta = { id: 'board-main', name: 'Main', kind: 'user' };
const reviewBoard: BoardMeta = { id: 'board-review', name: 'Design Review', kind: 'review' };

const sovernNode = (id: string) => ({
  id,
  type: 'sovern' as const,
  position: { x: 0, y: 0 },
  data: { label: id, layer: 'projects' as const, status: 'pending' as const },
});

const artifactNode = (id: string) => ({
  id: `artifact-${id}`,
  type: 'artifact' as const,
  position: { x: 0, y: 0 },
  data: { artifactId: id, code: 'const X=()=>null;', status: 'pending' as const },
});

describe('processArtifactPoll', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      isEditing: false,
      boards: [],
      activeBoardId: '',
    });
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.temporal.getState().pause();
  });

  it('on a user board: does NOT ingest, but ensures the review board and reports pending count', () => {
    useWorkflowStore.getState().initBoards({ boards: [userBoard], activeBoardId: userBoard.id });

    const pending = processArtifactPoll([entry('a1'), entry('a2'), decidedEntry('a3', 'approved')]);

    const s = useWorkflowStore.getState();
    expect(s.nodes.filter((n) => n.type === 'artifact')).toHaveLength(0); // gate held
    expect(pending).toBe(2); // decided artifact excluded
    expect(s.boards.some((b) => b.kind === 'review')).toBe(true); // meta ensured…
    expect(s.activeBoardId).toBe(userBoard.id); // …but NO auto-switch
  });

  it('on the review board: ingests artifacts as nodes', () => {
    useWorkflowStore
      .getState()
      .initBoards({ boards: [userBoard, reviewBoard], activeBoardId: reviewBoard.id });

    const pending = processArtifactPoll([entry('a1'), entry('a2', 'g')]);

    const s = useWorkflowStore.getState();
    expect(s.nodes.filter((n) => n.type === 'artifact')).toHaveLength(2);
    expect(pending).toBe(2);
  });

  it('excludes decided artifacts from pendingCount on the review board too', () => {
    useWorkflowStore
      .getState()
      .initBoards({ boards: [userBoard, reviewBoard], activeBoardId: reviewBoard.id });

    const pending = processArtifactPoll([
      entry('p1'),
      decidedEntry('d1', 'approved', 'C:/proj/design/drafts/foo.tsx'),
      decidedEntry('d2', 'rejected'),
    ]);

    expect(pending).toBe(1);
  });

  it('does not create the review board on an empty poll', () => {
    useWorkflowStore.getState().initBoards({ boards: [userBoard], activeBoardId: userBoard.id });
    processArtifactPoll([]);
    expect(useWorkflowStore.getState().boards.some((b) => b.kind === 'review')).toBe(false);
  });

  it('sweeps stray artifact nodes off the active user board without touching undo history', () => {
    useWorkflowStore.getState().initBoards({ boards: [userBoard], activeBoardId: userBoard.id });
    useWorkflowStore.getState().setNodes([sovernNode('n1'), artifactNode('old1')] as any);
    useWorkflowStore.temporal.getState().resume(); // simulate an edit session in progress
    const before = useWorkflowStore.temporal.getState().pastStates.length;

    processArtifactPoll([]);

    const s = useWorkflowStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(['n1']); // artifact swept, user node kept
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(before);
  });

  it('does NOT sweep artifact nodes off the review board', () => {
    useWorkflowStore
      .getState()
      .initBoards({ boards: [userBoard, reviewBoard], activeBoardId: reviewBoard.id });
    useWorkflowStore.getState().setNodes([artifactNode('keep1')] as any);

    processArtifactPoll([]);

    expect(useWorkflowStore.getState().nodes.filter((n) => n.type === 'artifact')).toHaveLength(1);
  });
});
