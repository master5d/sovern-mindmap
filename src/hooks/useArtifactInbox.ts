// Client-side artifact inbox: polls the dev-server middleware (Task 3) for
// newly-generated artifacts and ingests them as `artifact` canvas nodes.
// `ingestArtifacts` is the pure, store-level half — it is what's unit-tested;
// `useArtifactInbox` is a thin timer/fetch wrapper mounted once in App.
import { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';
import { useWorkflowStore, withoutHistory, stripArtifactContent } from '../store/useWorkflowStore';
import { ArtifactNodeData, SOVERNNodeData } from '../types';

/** Wire shape from GET /api/artifacts (snake_case, matches src/mcp/artifactInbox.ts).
 * `decision`/`exportedTo` are server-merged from the decisions ledger (Fix 1: an
 * already-decided artifact must not re-ingest as 'pending' on a fresh canvas). */
export interface ArtifactEntry {
  id: string;
  ts: string;
  code: string;
  name?: string;
  variant_group?: string;
  project_dir?: string;
  decision?: 'approved' | 'rejected';
  exportedTo?: string;
}

const POLL_MS = 2000;
const SINGLE_X = 120;
const SINGLE_Y = 80;
const GROUP_X_STEP = 640;
const GROUP_Y_BANDS = [80, 560, 1040, 1520]; // finite band strip, cycled by hash

/** Deterministic band index for a variant-group name so all its nodes share one y. */
function groupBand(group: string): number {
  let h = 0;
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0;
  return GROUP_Y_BANDS[h % GROUP_Y_BANDS.length];
}

/**
 * Pure ingest: maps new (undeduped-checked) ArtifactEntry rows into `artifact`
 * nodes and appends them to the store — without polluting undo history (this is
 * background sync, not a hand-edit).
 */
export function ingestArtifacts(entries: ArtifactEntry[]): void {
  if (entries.length === 0) return;
  const { nodes, setNodes } = useWorkflowStore.getState();
  // Seeded with store-resident ids, then grown as entries are accepted — so a
  // duplicate id WITHIN one batch is dropped too (not just cross-poll repeats).
  const seenIds = new Set(
    nodes.map((n) => (n.data as any)?.artifactId).filter((id): id is string => typeof id === 'string'),
  );
  const fresh = entries.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });
  if (fresh.length === 0) return;

  // Count existing nodes per bucket so new nodes append after them rather than overlap.
  let singleCount = nodes.filter((n) => n.type === 'artifact' && !(n.data as any)?.variantGroup).length;
  const groupCounts = new Map<string, number>();
  nodes.forEach((n) => {
    const g = (n.data as any)?.variantGroup;
    if (n.type === 'artifact' && typeof g === 'string') groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1);
  });

  const newNodes: Node<ArtifactNodeData>[] = fresh.map((e) => {
    const data: ArtifactNodeData = {
      artifactId: e.id,
      code: e.code,
      name: e.name,
      variantGroup: e.variant_group,
      status: e.decision ?? 'pending',
      projectDir: e.project_dir,
      exportedTo: e.exportedTo,
    };
    let position: { x: number; y: number };
    if (e.variant_group) {
      const idx = groupCounts.get(e.variant_group) ?? 0;
      groupCounts.set(e.variant_group, idx + 1);
      position = { x: SINGLE_X + idx * GROUP_X_STEP, y: groupBand(e.variant_group) };
    } else {
      position = { x: SINGLE_X + singleCount * GROUP_X_STEP, y: SINGLE_Y };
      singleCount += 1;
    }
    return {
      id: `artifact-${e.id}`,
      type: 'artifact',
      position,
      data,
    };
  });

  withoutHistory(() => {
    setNodes([...nodes, ...newNodes] as Node<SOVERNNodeData>[]);
  });
}

/**
 * Sweep stray `artifact` nodes off the ACTIVE user board (spec: artifacts live
 * ONLY on the review board). One-time cleanup for boards polluted before the
 * inbox was board-gated; a no-op on the review board, on a clean board, and
 * before boards are initialized. Runs without an undo step — this is background
 * hygiene, not a hand-edit; the corrected content persists via normal autosave.
 */
export function sweepUserBoardArtifacts(): void {
  const { boards, activeBoardId, nodes, edges, setNodes, setEdges } = useWorkflowStore.getState();
  const active = boards.find((b) => b.id === activeBoardId);
  if (!active || active.kind === 'review') return;
  const clean = stripArtifactContent(nodes, edges);
  if (clean.nodes === nodes) return; // nothing stripped
  withoutHistory(() => {
    setNodes(clean.nodes);
    setEdges(clean.edges);
  });
}

/**
 * One poll tick against the store (no I/O — unit-tested directly):
 * - artifacts exist → `ensureReviewBoard()` (meta only, NO auto-switch);
 * - active board is the review board → ingest; otherwise the gate holds and
 *   any stray artifact nodes are swept off the active user board;
 * - returns the number of artifacts still awaiting a decision (tab badge).
 */
export function processArtifactPoll(entries: ArtifactEntry[]): number {
  const store = useWorkflowStore.getState();
  // Guard boards.length: never mint review-board meta into an uninitialized
  // registry (poll can tick before initBoardsFlow settles at startup).
  if (entries.length > 0 && store.boards.length > 0) store.ensureReviewBoard();
  const { boards, activeBoardId } = useWorkflowStore.getState();
  if (boards.find((b) => b.id === activeBoardId)?.kind === 'review') {
    ingestArtifacts(entries);
  } else {
    sweepUserBoardArtifacts();
  }
  return entries.filter((e) => !e.decision).length;
}

/**
 * Background poll: fetches `/api/artifacts` every 2s and runs a gated ingest
 * tick (see processArtifactPoll). Silent on failure — the Tauri production
 * build has no dev-server middleware, so a missing endpoint must not surface
 * as an error. Returns the live pending-decision count for the review-tab badge.
 */
export function useArtifactInbox(): number {
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/artifacts');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.artifacts)) {
          setPendingCount(processArtifactPoll(json.artifacts));
        }
      } catch {
        // no middleware (Tauri prod) or transient network error — skip silently
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return pendingCount;
}
