# Slice 3 — Interactive-learning step-through ("Learn mode")

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** sovern-mindmap only. LMS embed is explicitly deferred to slice 4.

## Goal

Turn any diagram on the canvas into a **cumulative, self-paced walkthrough**: the
learner presses *Next* and nodes appear one at a time, each accompanied by a line
of narration. Built for the Точка Сборки audience (smart, non-techie; the barrier
is "can't imagine what's possible"), so the experience materialises a picture step
by step instead of dumping the whole schema at once.

## Non-goals (deferred)

- LMS embed / iframe / standalone build → slice 4.
- Hand-authoring of steps in Edit Mode (variant B) → future; the data model leaves
  room for it but no authoring UI ships now.
- Auto-play / timed advance → YAGNI.

## Architecture

A new **read-only `learnMode`** rendered on the *same* React Flow surface, modelled
on the existing `presentationMode`. Step order and narration travel inside the node
as `step` / `note`, carried through JSON Canvas metadata (`mm:step` / `mm:note`)
exactly like `mm:shape`. The AI generator (variant C) fills these in; when a diagram
has no step annotation, the sequence falls back to a deterministic BFS from the
graph roots (variant A). One playback engine serves both.

Learn mode never mutates `nodes`/`edges` data, so it touches neither the zundo undo
history nor autosave.

## Data model

`SOVERNNodeData` (`src/types/index.ts`) gains two optional fields:

```ts
step?: number;   // 1-based step order; absent → ordered by BFS fallback
note?: string;   // narration shown when this step is the current one
```

JSON Canvas mapping (`src/utils/canvasConverter.ts`):
- `toJSONCanvas`: write `metadata['mm:step']` / `metadata['mm:note']` when present.
- `fromJSONCanvas`: read them back onto `data.step` / `data.note` (both `sovern`
  and `shape` node branches).

Backward compatible: diagrams without these keys are unchanged byte-for-byte.

## Sequence engine (pure selectors, in the store module)

`selectLearnOrder(nodes, edges): { order: string[]; total: number }`
- Partition nodes into *stepped* (finite `data.step`) and *unstepped*.
- Stepped nodes sort ascending by `step` (ties broken by BFS index for determinism).
- Unstepped nodes append in BFS order.
- BFS: start from every node with in-degree 0 (sorted by current array index for
  determinism); if none exist (pure cycle), start from the first node in the array.
  Visit children in edge order; never revisit.
- `total = order.length`.

`selectVisibleUpToStep(order, learnStep): Set<string>`
- Returns the set of node ids at positions `0 .. learnStep-1` (cumulative).

These are exported pure functions (no store access) so they unit-test in isolation.

## Store state & actions (`src/store/useWorkflowStore.ts`)

```ts
learnMode: boolean;          // default false
learnStep: number;           // 1-based; meaningful only while learnMode
enterLearnMode: () => void;  // learnStep = 1, learnMode = true
exitLearnMode: () => void;   // learnMode = false
learnNext: () => void;       // min(learnStep+1, total); no-op at end
learnPrev: () => void;       // max(learnStep-1, 1); no-op at start
```

`learnNext`/`learnPrev` clamp against `selectLearnOrder(...).total`. Entering an
empty canvas is prevented at the UI layer (button disabled when no nodes).

These actions only set learn fields — no `nodes`/`edges` writes, so no undo/autosave
interaction.

## Rendering (`src/App.tsx`)

When `learnMode` is true:
- Compute `order/total` via `selectLearnOrder`, `visible` via
  `selectVisibleUpToStep(order, learnStep)`.
- Pass to React Flow only nodes whose id ∈ `visible` (others get `hidden: true`,
  same flag pattern as `selectVisibleNodes`); edges hidden unless both endpoints
  visible.
- The **current** node (`order[learnStep-1]`) is highlighted with an accent ring.
  Implementation: the App builds a **display-only** node array (the same map that sets
  `hidden`) and adds `data.__current = true` to the current node in *that copy* — it is
  never written back into the store, so it cannot reach undo/autosave or the converters.
  `SOVERNNode` and `ShapeNode` add an accent-ring class when `data.__current` is set.
- `fitView({ padding: 0.2, duration: 350 })` fires on every `learnStep` change so the
  growing picture stays framed.
- Chrome hidden exactly like presentation mode: header, toolbar, AI bar, sidebar,
  Controls. `nodesDraggable={false}`.

Entry button: a `GraduationCap` icon button in the toolbar's view cluster, enabled
only in canvas views (`mindmap`/`diagram`) and when `nodes.length > 0`. Clicking it
calls `enterLearnMode()`.

## LearnControls component (`src/components/LearnControls.tsx`)

Bottom-center panel (same styling language as the diagram-layout control strip):
- `◀` Prev (disabled at step 1), `Next ▶` (disabled at last step).
- "Шаг X из N" counter.
- Narration: `note` of the current node, rendered as **plain text** (React text
  child — no `dangerouslySetInnerHTML`), so untrusted AI/file text cannot inject.
  Falls back to the node's label when `note` is absent.
- An exit (✕) button → `exitLearnMode()`.
- Keyboard: `→` / `Space` = next, `←` = prev, `Esc` = exit (registered while
  learnMode is on; does not collide with edit-mode authoring keys, which are gated
  off in read-only learn mode).

## AI path (variant C)

`src/ai/diagramPrompt.ts`: extend SYSTEM so the model MAY add, per node,
`"step": <1-based int>` and `"note": "<one sentence of narration>"` inside the
node's `metadata` (`mm:step` / `mm:note`), with a short few-shot showing a 3-step
walkthrough. Steps are optional — omitting them is valid (engine falls back to BFS).

`src/ai/extractCanvas.ts`: when copying `metadata`, coerce `mm:step` to a positive
integer (drop if not finite/≤0) and keep `mm:note` only if it is a string. Hardened
against the usual adversarial shapes already covered by existing guards.

## Error handling / edge cases

| Case | Behaviour |
|------|-----------|
| No step annotation anywhere | Pure BFS order from roots |
| Partial annotation | Stepped first (by `step`), unstepped appended in BFS order |
| Cycle / no root | BFS from first array node; deterministic, terminates |
| `learnStep` past bounds | Clamped to [1, total]; Next/Prev no-op at edges |
| Empty canvas | Learn button disabled |
| Malicious `note` text | Rendered as text node, never HTML — no injection |
| `mm:step` not a positive int | Dropped during extract; node treated as unstepped |

## Testing

Unit (vitest, `--pool=threads`):
- `selectLearnOrder`: single root, multiple roots, explicit `step` override, partial
  steps, cycle safety + termination.
- `selectVisibleUpToStep`: cumulative set correctness; verifies edge gating via the
  App-level filter helper.
- store learn actions: enter resets to step 1; `learnNext`/`learnPrev` clamp;
  exit leaves nodes/edges untouched (undo history length unchanged).
- `extractCanvas`: accepts `mm:step`/`mm:note`; coerces bad `step`; ignores
  non-string `note`.
- `canvasConverter`: `step`/`note` survive `toJSONCanvas` → `fromJSONCanvas`
  round-trip; absence stays absent (backward-compat).
- `diagramPrompt`: SYSTEM text mentions `mm:step` and `mm:note`.

Manual live smoke (after merge, mirrors prior slices): mock gateway returns a canvas
with steps + notes; drive Learn mode and verify cumulative reveal + narration.

## Files

- Modify: `src/types/index.ts`, `src/store/useWorkflowStore.ts`, `src/App.tsx`,
  `src/utils/canvasConverter.ts`, `src/ai/extractCanvas.ts`, `src/ai/diagramPrompt.ts`,
  `src/components/nodes/SOVERNNode.tsx`, `src/components/nodes/ShapeNode.tsx`.
- Create: `src/components/LearnControls.tsx`, `src/store/learn.test.ts`,
  and test additions to the existing converter/extract/prompt test files.
