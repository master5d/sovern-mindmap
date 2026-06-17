# Learn Mode (interactive step-through) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn any diagram on the canvas into a cumulative, self-paced walkthrough where pressing *Next* reveals nodes one at a time with a line of narration.

**Architecture:** A new read-only `learnMode` (modelled on the existing `presentationMode`) renders on the same React Flow surface. Step order + narration ride inside the node as `data.step` / `data.note`, carried through JSON Canvas metadata (`mm:step` / `mm:note`) exactly like `mm:shape`. The AI generator fills these in; absent annotation falls back to a deterministic BFS from graph roots. One pure sequence engine serves both. Learn mode never mutates node/edge data, so it touches neither undo history nor autosave.

**Tech Stack:** React 19 + TypeScript, Zustand 5 (+ zundo), @xyflow/react 12, vitest (run with `npx vitest run --pool=threads` — the default forks pool hangs on this Windows box), Tailwind v4 (CSS-var tokens), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-17-interactive-learning-stepthrough-design.md`

**Branch:** `feature/learn-mode` (already created; spec already committed there).

---

## File map

- `src/types/index.ts` — add `step?` / `note?` to `SOVERNNodeData`. (Task 1)
- `src/utils/canvasConverter.ts` — write/read `mm:step` / `mm:note`. (Task 1)
- `src/utils/canvasConverter.test.ts` — round-trip tests. (Task 1)
- `src/ai/extractCanvas.ts` — accept/coerce `mm:step` / `mm:note`. (Task 2)
- `src/ai/extractCanvas.test.ts` — guard tests. (Task 2)
- `src/ai/diagramPrompt.ts` — teach the model to emit step/note. (Task 3)
- `src/ai/diagramPrompt.test.ts` — prompt-mentions test. (Task 3)
- `src/store/useWorkflowStore.ts` — `selectLearnOrder`, `selectVisibleUpToStep`, learn state + actions. (Tasks 4, 5)
- `src/store/learn.test.ts` — selector + action tests. (Tasks 4, 5)
- `src/components/LearnControls.tsx` — bottom-center playback panel (thin; logic lives in a pure helper). (Task 6)
- `src/components/nodes/SOVERNNode.tsx`, `src/components/nodes/ShapeNode.tsx` — current-step ring. (Task 7)
- `src/App.tsx` — entry button, render controls, chrome gating, visible filter, fitView, keyboard. (Task 8)

---

## Task 1: Data model + JSON Canvas round-trip

**Files:**
- Modify: `src/types/index.ts:34-56` (`SOVERNNodeData`)
- Modify: `src/utils/canvasConverter.ts`
- Test: `src/utils/canvasConverter.test.ts`

- [ ] **Step 1: Add the failing round-trip test**

Append inside the existing `describe('canvasConverter mm:shape', ...)` block in `src/utils/canvasConverter.test.ts` (before its closing `});`):

```ts
  it('round-trips step + note through mm:step / mm:note', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Intro', layer: 'projects', status: 'idle', step: 2, note: 'First we set the scene.' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:step']).toBe(2);
    expect(c.nodes[0].metadata?.['mm:note']).toBe('First we set the scene.');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBe(2);
    expect(nodes[0].data.note).toBe('First we set the scene.');
  });

  it('omits mm:step / mm:note when absent (backward compatible)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Plain', layer: 'projects', status: 'idle' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata && 'mm:step' in c.nodes[0].metadata).toBe(false);
    expect(c.nodes[0].metadata && 'mm:note' in c.nodes[0].metadata).toBe(false);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBeUndefined();
    expect(nodes[0].data.note).toBeUndefined();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/utils/canvasConverter.test.ts`
Expected: FAIL — `mm:step` is `undefined` (converter does not write it yet).

- [ ] **Step 3: Add the fields to the type**

In `src/types/index.ts`, inside `SOVERNNodeData`, add after the `shape?: ShapeKind;` line (currently line 53):

```ts
  shape?: ShapeKind;
  step?: number;   // 1-based walkthrough order (Learn mode); absent → BFS fallback
  note?: string;   // narration shown when this node is the current Learn step
```

- [ ] **Step 4: Write step/note in `toJSONCanvas`**

In `src/utils/canvasConverter.ts`, in the `nodes.map` of `toJSONCanvas`, just after the existing `if (node.data.shape) canvasNode.metadata!['mm:shape'] = node.data.shape;` line, add:

```ts
    if (node.data.shape) canvasNode.metadata!['mm:shape'] = node.data.shape;
    if (typeof node.data.step === 'number') canvasNode.metadata!['mm:step'] = node.data.step;
    if (typeof node.data.note === 'string' && node.data.note) canvasNode.metadata!['mm:note'] = node.data.note;
```

- [ ] **Step 5: Read step/note in `fromJSONCanvas`**

In `src/utils/canvasConverter.ts`, in `fromJSONCanvas`, both branches build a `data` object. Add `step`/`note` to BOTH the `shape` branch and the `sovern` branch `data`. Replace the shape-branch `data` block:

```ts
        data: {
          label: node.text || '',
          layer: node.metadata?.['sovern:layer'] || 'projects',
          status: node.metadata?.['sovern:status'] || 'idle',
          shape,
          color: node.color,
          step: typeof node.metadata?.['mm:step'] === 'number' ? node.metadata['mm:step'] : undefined,
          note: typeof node.metadata?.['mm:note'] === 'string' ? node.metadata['mm:note'] : undefined,
        },
```

and add the same two lines to the `sovern`-branch `data` block (after `color: node.color,`):

```ts
        color: node.color,
        step: typeof node.metadata?.['mm:step'] === 'number' ? node.metadata['mm:step'] : undefined,
        note: typeof node.metadata?.['mm:note'] === 'string' ? node.metadata['mm:note'] : undefined,
      },
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run --pool=threads src/utils/canvasConverter.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/utils/canvasConverter.ts src/utils/canvasConverter.test.ts
git commit -m "feat(learn): carry step/note through JSON Canvas (mm:step / mm:note)"
```

---

## Task 2: extractCanvas accepts mm:step / mm:note

**Files:**
- Modify: `src/ai/extractCanvas.ts:40-43`
- Test: `src/ai/extractCanvas.test.ts`

- [ ] **Step 1: Add failing guard tests**

Append inside `describe('extractCanvas', ...)` in `src/ai/extractCanvas.test.ts` (before its closing `});`):

```ts
  it('keeps a positive-integer mm:step and a string mm:note', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:step":2,"mm:note":"hello"}}],"edges":[]}';
    const md = extractCanvas(raw).nodes[0].metadata!;
    expect(md['mm:step']).toBe(2);
    expect(md['mm:note']).toBe('hello');
  });

  it('drops a non-positive or non-integer mm:step', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:step":0}},{"id":"b","type":"text","x":0,"y":0,"width":150,"height":60,"text":"B","metadata":{"mm:step":"2"}}],"edges":[]}';
    const c = extractCanvas(raw);
    expect('mm:step' in c.nodes[0].metadata!).toBe(false);
    expect('mm:step' in c.nodes[1].metadata!).toBe(false);
  });

  it('drops a non-string mm:note', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:note":42}}],"edges":[]}';
    expect('mm:note' in extractCanvas(raw).nodes[0].metadata!).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/ai/extractCanvas.test.ts`
Expected: FAIL — `mm:step` of `0`/`"2"` survives, `mm:note: 42` survives (no coercion yet).

- [ ] **Step 3: Coerce step/note in extractCanvas**

In `src/ai/extractCanvas.ts`, the loop currently does (lines ~40-43):

```ts
    const metadata = n?.metadata && typeof n.metadata === 'object' ? { ...n.metadata } : {};
    if (metadata['mm:shape'] && !SHAPES.includes(metadata['mm:shape'])) {
      metadata['mm:shape'] = 'rectangle';
    }
```

Add, immediately after that `if` block:

```ts
    // mm:step must be a positive integer; drop otherwise. mm:note must be a string.
    if ('mm:step' in metadata) {
      const s = metadata['mm:step'];
      if (typeof s === 'number' && Number.isInteger(s) && s > 0) metadata['mm:step'] = s;
      else delete metadata['mm:step'];
    }
    if ('mm:note' in metadata && typeof metadata['mm:note'] !== 'string') {
      delete metadata['mm:note'];
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/ai/extractCanvas.test.ts`
Expected: PASS (all, including the three new tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/extractCanvas.ts src/ai/extractCanvas.test.ts
git commit -m "harden(learn): extractCanvas accepts mm:step (positive int) / mm:note (string)"
```

---

## Task 3: Teach the generator step + note

**Files:**
- Modify: `src/ai/diagramPrompt.ts`
- Test: `src/ai/diagramPrompt.test.ts`

- [ ] **Step 1: Add failing prompt test**

Open `src/ai/diagramPrompt.test.ts`. Add a test asserting the SYSTEM message documents the new keys. Append inside the existing top-level `describe(...)` (match the file's existing import of `buildDiagramMessages`):

```ts
  it('documents the optional walkthrough keys mm:step and mm:note', () => {
    const sys = buildDiagramMessages('anything')[0].content;
    expect(sys).toContain('mm:step');
    expect(sys).toContain('mm:note');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/ai/diagramPrompt.test.ts`
Expected: FAIL — SYSTEM does not mention `mm:step` yet.

- [ ] **Step 3: Extend the SYSTEM prompt**

In `src/ai/diagramPrompt.ts`, insert this block into the `SYSTEM` template string, immediately before the line `Use short ids ("n1","n2"...).`:

```ts
Optionally, to make the diagram a guided walkthrough, add to a node's "metadata":
- "mm:step": a 1-based integer giving the order in which this node should be revealed
- "mm:note": one short sentence explaining this node, shown when it is the current step
Add these to ALL nodes or NONE. When present, order the steps so the story builds up
logically (start → details). When omitted, the app reveals nodes in graph order.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/ai/diagramPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/diagramPrompt.ts src/ai/diagramPrompt.test.ts
git commit -m "feat(learn): teach the generator the optional mm:step / mm:note walkthrough keys"
```

---

## Task 4: Sequence engine (pure selectors)

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (add exported pure functions + a `getChildren` import)
- Test: `src/store/learn.test.ts` (new)

- [ ] **Step 1: Write failing selector tests**

Create `src/store/learn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectLearnOrder, selectVisibleUpToStep } from './useWorkflowStore';

const n = (id: string, extra: any = {}) => ({
  id, type: 'sovern', position: { x: 0, y: 0 },
  data: { label: id, layer: 'projects', status: 'idle', ...extra },
});

describe('selectLearnOrder', () => {
  it('orders by BFS from the single root when no steps are set', () => {
    const nodes = [n('c'), n('a'), n('b')]; // array order deliberately not BFS order
    const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];
    const { order, total } = selectLearnOrder({ nodes, edges });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(total).toBe(3);
  });

  it('handles multiple roots deterministically (by array order)', () => {
    const nodes = [n('a'), n('x'), n('b')];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    // a and x are both roots (in-degree 0); a precedes x in the array.
    expect(selectLearnOrder({ nodes, edges }).order).toEqual(['a', 'b', 'x']);
  });

  it('respects explicit step order over graph order', () => {
    const nodes = [n('a', { step: 3 }), n('b', { step: 1 }), n('c', { step: 2 })];
    const edges: any[] = [];
    expect(selectLearnOrder({ nodes, edges }).order).toEqual(['b', 'c', 'a']);
  });

  it('puts stepped nodes first, then unstepped in BFS order', () => {
    const nodes = [n('a'), n('b', { step: 1 }), n('c')];
    const edges = [{ id: 'e1', source: 'a', target: 'c' }];
    const { order } = selectLearnOrder({ nodes, edges });
    expect(order[0]).toBe('b');           // the only stepped node leads
    expect(order.slice(1)).toEqual(['a', 'c']); // rest in BFS order
  });

  it('terminates and is deterministic on a pure cycle', () => {
    const nodes = [n('a'), n('b')];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }];
    const { order, total } = selectLearnOrder({ nodes, edges });
    expect(total).toBe(2);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
  });
});

describe('selectVisibleUpToStep', () => {
  it('returns the cumulative prefix of the order', () => {
    expect([...selectVisibleUpToStep(['a', 'b', 'c'], 2)]).toEqual(['a', 'b']);
  });
  it('clamps a non-positive step to empty', () => {
    expect(selectVisibleUpToStep(['a', 'b'], 0).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: FAIL — `selectLearnOrder` / `selectVisibleUpToStep` are not exported.

- [ ] **Step 3: Add `getChildren` to the tree import**

In `src/store/useWorkflowStore.ts`, line 17 currently:

```ts
import { getDescendants, getParent, cloneSubtree } from '../utils/tree';
```

Change to:

```ts
import { getChildren, getDescendants, getParent, cloneSubtree } from '../utils/tree';
```

- [ ] **Step 4: Implement the selectors**

In `src/store/useWorkflowStore.ts`, append at the end of the file (after `selectVisibleEdges`):

```ts
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/learn.test.ts
git commit -m "feat(learn): pure sequence engine — selectLearnOrder + selectVisibleUpToStep"
```

---

## Task 5: Store learn state + actions

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (interface + initial state + actions)
- Test: `src/store/learn.test.ts` (append)

- [ ] **Step 1: Add failing action tests**

Merge `useWorkflowStore` into the existing top import of `src/store/learn.test.ts`
so it reads `import { useWorkflowStore, selectLearnOrder, selectVisibleUpToStep } from './useWorkflowStore';`,
then append:

```ts
describe('learn mode actions', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      nodes: [n('a'), n('b'), n('c')] as any,
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }],
      learnMode: false,
      learnStep: 1,
    });
  });

  it('enterLearnMode turns it on and resets to step 1', () => {
    useWorkflowStore.setState({ learnStep: 5 });
    useWorkflowStore.getState().enterLearnMode();
    expect(useWorkflowStore.getState().learnMode).toBe(true);
    expect(useWorkflowStore.getState().learnStep).toBe(1);
  });

  it('learnNext advances but clamps at total', () => {
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().learnNext(); // 2
    useWorkflowStore.getState().learnNext(); // 3
    useWorkflowStore.getState().learnNext(); // clamp at 3 (total)
    expect(useWorkflowStore.getState().learnStep).toBe(3);
  });

  it('learnPrev retreats but clamps at 1', () => {
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().learnPrev();
    expect(useWorkflowStore.getState().learnStep).toBe(1);
  });

  it('exitLearnMode leaves nodes and edges untouched', () => {
    const before = useWorkflowStore.getState().nodes;
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().exitLearnMode();
    expect(useWorkflowStore.getState().learnMode).toBe(false);
    expect(useWorkflowStore.getState().nodes).toBe(before); // same reference, no data write
  });
});
```

Add `beforeEach` to the existing vitest import at the top of the file:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: FAIL — `enterLearnMode` is not a function.

- [ ] **Step 3: Extend the store interface**

In `src/store/useWorkflowStore.ts`, in the `WorkflowState` interface, add after the `presentationMode: boolean;` line:

```ts
  presentationMode: boolean;
  learnMode: boolean;
  learnStep: number;
  enterLearnMode: () => void;
  exitLearnMode: () => void;
  learnNext: () => void;
  learnPrev: () => void;
```

- [ ] **Step 4: Add initial state + actions**

In the store creator, after the `presentationMode: false,` initial value, add:

```ts
  presentationMode: false,
  learnMode: false,
  learnStep: 1,
  enterLearnMode: () => set({ learnMode: true, learnStep: 1 }),
  exitLearnMode: () => set({ learnMode: false }),
  learnNext: () => {
    const total = selectLearnOrder(get()).total;
    set({ learnStep: Math.min(get().learnStep + 1, Math.max(1, total)) });
  },
  learnPrev: () => set({ learnStep: Math.max(1, get().learnStep - 1) }),
```

(`selectLearnOrder` is defined later in the same module — that is fine; it is a hoisted function declaration and these actions only call it at runtime.)

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: PASS (all selector + action tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/learn.test.ts
git commit -m "feat(learn): store learnMode state + enter/exit/next/prev actions"
```

---

## Task 6: LearnControls component (thin) + pure narration helper

The repo has **no DOM-render tests** and does not depend on `@testing-library/react`
(verified). Do NOT add it. Instead the testable logic lives in a pure helper
`selectLearnStepText` in the store module (unit-tested in `learn.test.ts`); the
`LearnControls` component is thin glue verified by typecheck/build (Task 8) and the
manual live smoke — the same treatment the `AiPromptBar` component got in slice 1.

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (add `selectLearnStepText`)
- Modify: `src/store/learn.test.ts` (test the helper)
- Create: `src/components/LearnControls.tsx`

- [ ] **Step 1: Write a failing helper test**

Append to `src/store/learn.test.ts` (the `selectLearnStepText` import must be added
to the existing `from './useWorkflowStore'` import line):

```ts
describe('selectLearnStepText', () => {
  const nodes = [n('a', { note: 'Begin here.' }), n('b'), n('c')];
  const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

  it('returns the current note, current id, and total', () => {
    const r = selectLearnStepText({ nodes, edges }, 1);
    expect(r.text).toBe('Begin here.');
    expect(r.currentId).toBe('a');
    expect(r.total).toBe(3);
  });

  it('falls back to the node label when the step has no note', () => {
    expect(selectLearnStepText({ nodes, edges }, 2).text).toBe('b');
  });

  it('clamps an out-of-range step into bounds', () => {
    expect(selectLearnStepText({ nodes, edges }, 99).currentId).toBe('c');
    expect(selectLearnStepText({ nodes, edges }, 0).currentId).toBe('a');
  });

  it('is safe on an empty canvas', () => {
    const r = selectLearnStepText({ nodes: [], edges: [] }, 1);
    expect(r).toEqual({ text: '', currentId: null, total: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: FAIL — `selectLearnStepText` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/store/useWorkflowStore.ts`, append after `selectVisibleUpToStep`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/store/learn.test.ts`
Expected: PASS (selector + action + helper tests).

- [ ] **Step 5: Implement LearnControls (thin glue)**

Create `src/components/LearnControls.tsx`:

```tsx
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useWorkflowStore, selectLearnStepText } from '../store/useWorkflowStore';

export function LearnControls() {
  const { nodes, edges, learnStep, learnNext, learnPrev, exitLearnMode } = useWorkflowStore();
  const { text, total } = selectLearnStepText({ nodes, edges }, learnStep);

  // Keyboard: →/Space = next, ← = prev, Esc = exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); learnNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); learnPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); exitLearnMode(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [learnNext, learnPrev, exitLearnMode]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[640px] w-[min(640px,90vw)] bg-surface/95 backdrop-blur-md p-4 border border-edge rounded-2xl shadow-2xl">
      <div className="flex items-center gap-4">
        <button
          onClick={learnPrev}
          disabled={learnStep <= 1}
          title="Prev"
          className="p-2.5 rounded-xl text-secondary hover:bg-hover disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          {/* note rendered as a text child — never HTML — so untrusted text cannot inject */}
          <p className="text-sm text-primary leading-snug">{text}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted">
            Шаг {Math.min(learnStep, total)} / {total}
          </p>
        </div>

        <button
          onClick={learnNext}
          disabled={learnStep >= total}
          title="Next"
          className="p-2.5 rounded-xl text-secondary hover:bg-hover disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
        <button onClick={exitLearnMode} title="Exit learn mode" className="p-2.5 rounded-xl text-secondary hover:text-primary">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck the component**

Run: `npx tsc --noEmit`
Expected: no errors. (No new test runs here — the component's logic is already
covered by the `selectLearnStepText` tests in Step 4; the JSX is verified by
typecheck now and by the manual live smoke after merge.)

- [ ] **Step 7: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/learn.test.ts src/components/LearnControls.tsx
git commit -m "feat(learn): selectLearnStepText helper + thin LearnControls panel"
```

---

## Task 7: Current-step ring on the node components

**Files:**
- Modify: `src/components/nodes/SOVERNNode.tsx:30-37`
- Modify: `src/components/nodes/ShapeNode.tsx:44`

- [ ] **Step 1: Highlight the current step in `SOVERNNode`**

In `src/components/nodes/SOVERNNode.tsx`, the wrapper `div` className currently keys off `selected`. Change it to also highlight when `data.__current` is set (the App injects this view-only flag on the current-step node). Replace the opening wrapper `div`:

```tsx
    <div
      className={`px-4 py-3 shadow-2xl rounded-xl bg-surface border-2 transition-all ${
        selected || data.__current ? 'ring-4 ring-accent/40 border-accent scale-105' : 'border-edge hover:border-edge-strong'
      }`}
```

- [ ] **Step 2: Highlight the current step in `ShapeNode`**

In `src/components/nodes/ShapeNode.tsx`, line 44 is:

```tsx
  const ring = selected ? 'ring-4 ring-accent/20' : '';
```

Replace with:

```tsx
  const highlighted = selected || data.__current;
  const ring = highlighted ? 'ring-4 ring-accent/40' : '';
```

Then, in the three `content` branches, every place that reads `selected` for the border (`selected ? \`border-accent ${ring}\`` and `geom.svg!(!!selected)`) should read `highlighted` instead so the current-step node gets the accent border too. Concretely:
- `{geom.svg!(!!selected)}` → `{geom.svg!(!!highlighted)}`
- both `selected ? \`border-accent ${ring}\` : 'border-edge hover:border-edge-strong'` → `highlighted ? \`border-accent ${ring}\` : 'border-edge hover:border-edge-strong'`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (`data.__current` is allowed by the `[key: string]: any` index signature on `SOVERNNodeData`.)

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/SOVERNNode.tsx src/components/nodes/ShapeNode.tsx
git commit -m "feat(learn): accent ring on the current-step node (data.__current)"
```

---

## Task 8: App wiring (entry, render, gating, reveal, fitView)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the new pieces**

In `src/App.tsx`, add to the lucide import (line 14) the `GraduationCap` icon, and add the new imports below the existing component imports:

```tsx
// add GraduationCap to the existing lucide-react import list
import { LearnControls } from './components/LearnControls';
import { selectLearnOrder, selectVisibleUpToStep } from './store/useWorkflowStore';
```

- [ ] **Step 2: Pull learn state from the store**

In `Flow()`, extend the `useWorkflowStore()` destructure to include learn fields:

```tsx
    diagramLayout, setDiagramLayout, presentationMode, setPresentationMode,
    learnMode, enterLearnMode, learnStep,
```

- [ ] **Step 3: Compute the revealed nodes when in learn mode**

In `src/App.tsx`, just after the existing `visibleNodes` / `visibleDisplayEdges` computation (around lines 164-166), add:

```tsx
  const learn = learnMode ? selectLearnOrder({ nodes, edges }) : null;
  const learnVisible = learn ? selectVisibleUpToStep(learn.order, learnStep) : null;
  const currentLearnId = learn ? learn.order[Math.min(learnStep, learn.total) - 1] : null;

  const renderNodes = learnVisible
    ? visibleNodes.map((nd) =>
        learnVisible.has(nd.id)
          ? (nd.id === currentLearnId ? { ...nd, data: { ...nd.data, __current: true } } : { ...nd, data: { ...nd.data, __current: false } })
          : { ...nd, hidden: true },
      )
    : visibleNodes;
  const renderEdges = learnVisible
    ? visibleDisplayEdges.map((e) =>
        learnVisible.has(e.source) && learnVisible.has(e.target) ? e : { ...e, hidden: true },
      )
    : visibleDisplayEdges;
```

- [ ] **Step 4: Feed those into ReactFlow**

Change the `<ReactFlow>` props `nodes={visibleNodes}` / `edges={visibleDisplayEdges}` to:

```tsx
        nodes={renderNodes}
        edges={renderEdges}
```

and make nodes non-draggable in learn mode by changing `nodesDraggable={viewMode !== 'diagram'}` to:

```tsx
        nodesDraggable={viewMode !== 'diagram' && !learnMode}
```

- [ ] **Step 5: fitView on each step + on entering learn mode**

Add this effect alongside the other `useEffect`s in `Flow()` (after the viewMode/diagramLayout effect, ~line 149):

```tsx
  useEffect(() => {
    if (!learnMode) return;
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 60);
    return () => clearTimeout(t);
  }, [learnMode, learnStep, fitView]);
```

- [ ] **Step 6: Gate chrome and render LearnControls**

Wrap the existing chrome so it hides in learn mode. The header, toolbar, diagram-layout strip, AI bar, and sidebar are already gated by `!presentationMode`; broaden each of those guards to `!presentationMode && !learnMode`. Specifically change:
- `{!presentationMode && <AiPromptBar notify={notify} />}` → `{!presentationMode && !learnMode && <AiPromptBar notify={notify} />}`
- the header `{!presentationMode && (` → `{!presentationMode && !learnMode && (`
- the toolbar `{!presentationMode && (` → `{!presentationMode && !learnMode && (`
- the diagram-control strip `{viewMode === 'diagram' && !presentationMode && (` → `{viewMode === 'diagram' && !presentationMode && !learnMode && (`
- `{selectedNodeId && <NodeSidebar />}` → `{selectedNodeId && !learnMode && <NodeSidebar />}`

Then render the controls — add just before the closing `</div>` of the root container (next to `{notice && ...}`):

```tsx
      {learnMode && <LearnControls />}
```

- [ ] **Step 7: Add the Learn entry button**

Inside the toolbar's view-button cluster `<div className="flex space-x-1.5 px-2 border-r border-edge">` that maps `VIEW_BUTTONS`, add one more button right after the `.map(...)` closes (still inside that div):

```tsx
            <button
              onClick={enterLearnMode}
              disabled={!isCanvasView || nodes.length === 0}
              title="Learn mode (step-through)"
              className="p-2.5 rounded-xl text-secondary hover:bg-hover disabled:opacity-30"
            >
              <GraduationCap size={18} />
            </button>
```

- [ ] **Step 8: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 9: Full test run**

Run: `npx vitest run --pool=threads`
Expected: all suites PASS (prior 72 + the new learn/converter/extract/prompt tests).

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat(learn): wire Learn mode into the canvas (entry, reveal, fitView, chrome gating)"
```

---

## Manual live smoke (after merge — mirrors prior slices)

Not a coded test. With the dev server running and a **mock gateway** on the proxy target returning an OpenAI-style completion whose content is a JSON Canvas with `mm:step` / `mm:note` on every node:
1. Type a prompt → diagram appears.
2. Click the **GraduationCap** button → chrome hides, only the root (step 1) is visible, narration shows.
3. `Next` / `→` reveals nodes cumulatively; the current node has the accent ring; `fitView` keeps it framed.
4. `Prev` / `←` walks back; `Esc` / ✕ exits → full board + chrome return, nodes/edges unchanged.
5. Generate a diagram WITHOUT steps (or load `board.canvas`) → Learn mode still works via BFS fallback, narration falls back to labels.

---

## Notes for the implementer

- Run tests with `npx vitest run --pool=threads` — the default forks pool hangs on this Windows box.
- Learn mode is **read-only**: never call store mutators that write `nodes`/`edges` from this feature. The `__current` flag lives only in the App's `renderNodes` copy, never in the store.
- `note` is always rendered as a React text child (never `dangerouslySetInnerHTML`) — keep it that way; it carries untrusted AI/file text.
- The selectors are pure and exported from the store module (same pattern as `selectVisibleNodes`); keep them free of store access so they stay unit-testable.
