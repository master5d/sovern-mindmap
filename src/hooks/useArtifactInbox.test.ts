import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';
import { ingestArtifacts, processArtifactPoll, repairArtifactOverlaps } from './useArtifactInbox';
import { artifactTombstonePayloads } from './artifactTombstones';

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

  it('lays out two distinct groups on distinct rows (no hash collision)', () => {
    ingestArtifacts([entry('p1', 'ws-pill'), entry('p2', 'ws-pill'), entry('s1', 'smoke-e2e'), entry('s2', 'smoke-e2e')]);
    const yOf = (g: string) =>
      new Set(useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === g).map(n => n.position.y));
    const pillYs = yOf('ws-pill');
    const smokeYs = yOf('smoke-e2e');
    expect(pillYs.size).toBe(1);
    expect(smokeYs.size).toBe(1);
    expect([...pillYs][0]).not.toBe([...smokeYs][0]);
  });

  it('extends an existing (possibly hand-moved) group row instead of re-hashing', () => {
    ingestArtifacts([entry('g1', 'grp')]);
    // simulate a hand-drag of the group's row
    const moved = useWorkflowStore.getState().nodes.map(n =>
      (n.data as any).variantGroup === 'grp' ? { ...n, position: { x: 900, y: 2000 } } : n);
    useWorkflowStore.getState().setNodes(moved as any);
    ingestArtifacts([entry('g2', 'grp')]);
    const grp = useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === 'grp');
    expect(new Set(grp.map(n => n.position.y))).toEqual(new Set([2000]));
    expect(grp.find(n => (n.data as any).artifactId === 'g2')!.position.x).toBeGreaterThan(900);
  });
});

describe('repairArtifactOverlaps', () => {
  beforeEach(() => useWorkflowStore.getState().setNodes([]));

  const stacked = (id: string, g: string, x: number, y: number) => ({
    id: `artifact-${id}`,
    type: 'artifact' as const,
    position: { x, y },
    data: { artifactId: id, code: 'const X=()=>null;', status: 'pending' as const, variantGroup: g },
  });

  it('relocates the later group off an exact pixel stack, first group stays', () => {
    useWorkflowStore.getState().setNodes([
      stacked('s1', 'smoke-e2e', 120, 1040), stacked('s2', 'smoke-e2e', 760, 1040),
      stacked('w1', 'ws-pill', 120, 1040), stacked('w2', 'ws-pill', 760, 1040),
    ] as any);
    repairArtifactOverlaps();
    const nodes = useWorkflowStore.getState().nodes;
    const smoke = nodes.filter(n => (n.data as any).variantGroup === 'smoke-e2e');
    const pill = nodes.filter(n => (n.data as any).variantGroup === 'ws-pill');
    // first claimant unmoved
    expect(smoke.map(n => n.position.y)).toEqual([1040, 1040]);
    // displaced group on its own fresh row, x-order preserved and distinct
    expect(new Set(pill.map(n => n.position.y)).size).toBe(1);
    expect([...new Set(pill.map(n => n.position.y))][0]).toBeGreaterThan(1040);
    expect(new Set(pill.map(n => n.position.x)).size).toBe(2);
    // no exact duplicates remain
    const keys = nodes.map(n => `${n.position.x}:${n.position.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is a no-op on a clean board and does not touch hand-arranged nodes', () => {
    useWorkflowStore.getState().setNodes([
      stacked('a', 'g1', 120, 80), stacked('b', 'g2', 120, 560),
    ] as any);
    const before = useWorkflowStore.getState().nodes.map(n => ({ ...n.position }));
    repairArtifactOverlaps();
    const after = useWorkflowStore.getState().nodes.map(n => ({ ...n.position }));
    expect(after).toEqual(before);
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

// ── Task 3: deletion tombstones ──────────────────────────────────────────

describe('deletion tombstones', () => {
  const reviewBoardMeta: BoardMeta = { id: 'board-review', name: 'Design Review', kind: 'review' };

  const seedReviewBoard = () => {
    useWorkflowStore.getState().initBoards({ boards: [reviewBoardMeta], activeBoardId: reviewBoardMeta.id });
    useWorkflowStore.getState().setNodes([
      {
        id: 'artifact-a1',
        type: 'artifact',
        position: { x: 0, y: 0 },
        data: { artifactId: 'a1', code: 'const X=()=>null;', status: 'pending', name: 'V1', variantGroup: 'g1' },
      },
      {
        id: 'n2',
        type: 'sovern',
        position: { x: 0, y: 0 },
        data: { label: 'n2', layer: 'projects', status: 'pending' },
      },
    ] as any);
  };

  beforeEach(() => {
    useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null, isEditing: false, boards: [], activeBoardId: '' });
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.temporal.getState().pause();
  });

  it('artifactTombstonePayloads: remove-changes on review board yield payloads for artifact nodes only', () => {
    seedReviewBoard();
    const changes = [
      { type: 'remove', id: 'artifact-a1' },
      { type: 'remove', id: 'n2' },
    ] as any[];
    const payloads = artifactTombstonePayloads(useWorkflowStore.getState().nodes, changes);
    expect(payloads).toEqual([
      { artifactId: 'a1', decision: 'deleted', name: 'V1', variant_group: 'g1' },
    ]);
  });

  it('artifactTombstonePayloads: empty on non-remove changes', () => {
    seedReviewBoard();
    const nodes = useWorkflowStore.getState().nodes;
    expect(artifactTombstonePayloads(nodes, [{ type: 'select', id: 'artifact-a1', selected: true } as any])).toEqual([]);
  });

  it('onNodesChange remove of an artifact node posts a tombstone (review board active) and still deletes the node', async () => {
    seedReviewBoard();
    const fetchMock = vi.fn(async () => ({ ok: true } as any));
    vi.stubGlobal('fetch', fetchMock);

    useWorkflowStore.getState().onNodesChange([{ type: 'remove', id: 'artifact-a1' } as any]);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('/api/artifacts/decision', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ artifactId: 'a1', decision: 'deleted', name: 'V1', variant_group: 'g1' }),
    }));
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'artifact-a1')).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
