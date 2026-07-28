// Client-side artifact inbox: polls the dev-server middleware (Task 3) for
// newly-generated artifacts and ingests them as `artifact` canvas nodes.
// `ingestArtifacts` is the pure, store-level half — it is what's unit-tested;
// `useArtifactInbox` is a thin timer/fetch wrapper mounted once in App.
import { useEffect, useState } from 'react';
import { Node } from '@xyflow/react';
import { useWorkflowStore, withoutHistory, stripArtifactContent } from '../store/useWorkflowStore';
import { ArtifactNodeData, SOVERNNodeData } from '../types';
import { isTombstoned } from './artifactTombstones';
import { nextDelay } from './pollBackoff';

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
const ROW_STEP = 480;

/** Lowest occupied artifact y on the board, or null when no artifact nodes exist. */
function maxArtifactY(nodes: Node[]): number | null {
  let max: number | null = null;
  nodes.forEach((n) => {
    if (n.type === 'artifact') max = max === null ? n.position.y : Math.max(max, n.position.y);
  });
  return max;
}

/**
 * Pure ingest: maps new (undeduped-checked) ArtifactEntry rows into `artifact`
 * nodes and appends them to the store — without polluting undo history (this is
 * background sync, not a hand-edit).
 */
export function ingestArtifacts(entries: ArtifactEntry[]): void {
  if (entries.length === 0) return;
  // A tick whose fetch was already in flight when a tombstone POST fired can
  // still carry a just-deleted artifact — reject those BEFORE the seenIds
  // dedupe below (Task 4: closes the 2s-poll resurrection race client-side).
  entries = entries.filter((e) => !isTombstoned(e.id));
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

  // Layout: singles share row y=SINGLE_Y; each variant group OWNS a horizontal row.
  // An existing group extends its own row (its first node's y, x past its right edge —
  // hand-dragged rows are respected); a NEW group opens a fresh row below every artifact
  // already on the board. Rows are allocated, never hashed — the old 4-band hash stacked
  // distinct groups (smoke-e2e × ws-pill) pixel-exact on top of each other.
  let singleCount = nodes.filter((n) => n.type === 'artifact' && !(n.data as any)?.variantGroup).length;
  const groupRows = new Map<string, { y: number; nextX: number }>();
  nodes.forEach((n) => {
    const g = (n.data as any)?.variantGroup;
    if (n.type !== 'artifact' || typeof g !== 'string') return;
    const row = groupRows.get(g);
    if (!row) groupRows.set(g, { y: n.position.y, nextX: n.position.x + GROUP_X_STEP });
    else row.nextX = Math.max(row.nextX, n.position.x + GROUP_X_STEP);
  });
  // First fresh row sits below both the singles row and every existing artifact.
  let nextRowY = Math.max(maxArtifactY(nodes) ?? SINGLE_Y, SINGLE_Y) + ROW_STEP;

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
      let row = groupRows.get(e.variant_group);
      if (!row) {
        row = { y: nextRowY, nextX: SINGLE_X };
        groupRows.set(e.variant_group, row);
        nextRowY += ROW_STEP;
      }
      position = { x: row.nextX, y: row.y };
      row.nextX += GROUP_X_STEP;
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
 * Repair pass for artifact nodes stacked at IDENTICAL positions — the legacy
 * hash-band layout could collide two variant groups onto one row pixel-exact
 * (headers rendered through each other). The group that claimed a contested
 * position first stays put; every OTHER group with an exact-duplicate position
 * is relocated wholesale to a fresh row below the board (intra-group x order
 * preserved). Hand-dragged nodes are untouched: only exact x,y duplicates count.
 * No-op on a clean board; runs without an undo step (background hygiene).
 */
export function repairArtifactOverlaps(): void {
  const { nodes, setNodes } = useWorkflowStore.getState();
  const artifacts = nodes.filter((n) => n.type === 'artifact');
  if (artifacts.length < 2) return;
  const groupOf = (n: Node) => ((n.data as any)?.variantGroup as string | undefined) ?? `~single~${n.id}`;
  const firstAt = new Map<string, string>(); // "x:y" -> group that claimed the spot first
  const displaced = new Set<string>();
  artifacts.forEach((n) => {
    const key = `${n.position.x}:${n.position.y}`;
    const g = groupOf(n);
    const claimed = firstAt.get(key);
    if (claimed === undefined) firstAt.set(key, g);
    else if (claimed !== g) displaced.add(g);
  });
  if (displaced.size === 0) return;
  let nextRowY = Math.max(maxArtifactY(nodes) ?? SINGLE_Y, SINGLE_Y) + ROW_STEP;
  const rowFor = new Map<string, number>();
  displaced.forEach((g) => {
    rowFor.set(g, nextRowY);
    nextRowY += ROW_STEP;
  });
  const groupIdx = new Map<string, number>();
  const repaired = nodes.map((n) => {
    if (n.type !== 'artifact') return n;
    const g = groupOf(n);
    const rowY = rowFor.get(g);
    if (rowY === undefined) return n;
    const idx = groupIdx.get(g) ?? 0;
    groupIdx.set(g, idx + 1);
    return { ...n, position: { x: SINGLE_X + idx * GROUP_X_STEP, y: rowY } };
  });
  withoutHistory(() => setNodes(repaired as Node<SOVERNNodeData>[]));
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
    repairArtifactOverlaps(); // legacy hash-band stacks self-heal on the review board
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
    let timer: ReturnType<typeof setTimeout>;
    // Отступ обязателен именно здесь: в Tauri-сборке middleware нет вовсе,
    // значит эндпоинт недоступен ВСЕГДА — без него поллер молча стучится
    // каждые 2 секунды до конца сессии. С отступом он затухает до потолка.
    let delay = POLL_MS;

    const tick = async () => {
      let ok = true;
      try {
        const res = await fetch('/api/artifacts');
        if (!res.ok) {
          ok = false;
          return;
        }
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.artifacts)) {
          setPendingCount(processArtifactPoll(json.artifacts));
        }
      } catch {
        // no middleware (Tauri prod) or transient network error — skip silently
        ok = false;
      } finally {
        delay = nextDelay(delay, ok);
        if (!cancelled) timer = setTimeout(tick, delay);
      }
    };
    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return pendingCount;
}
