# Slice 10 — Drag-from-Library — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Predecessor:** Slice 9 (manual shape picker) — `ShapePicker`/`ShapeSwatch`/`setNodeShape`

## Goal

Let the user **create a brand-new standalone shape node** by dragging a shape
from a persistent palette onto the MindMap canvas. Slice 9 added the ability to
*retype an existing* node; slice 10 closes the remaining gap — authoring a node
from nothing — completing the Lucidchart/draw.io "drag a shape from the left
panel" paradigm the project is aimed at.

## Scope

**In:**
- A persistent, collapsible **shape library** rail on the left edge of the
  MindMap canvas, with all 26 shapes as draggable swatches.
- HTML5 drag-and-drop create: drop a swatch on the canvas → a standalone
  `shape` node appears at the drop point, selected, in one undo step.

**Out (YAGNI / deferred):**
- Drop in Diagram / Learn / Presentation views (Diagram force-re-layouts every
  change and disables node dragging, so a free orphan node would be yanked to a
  tree slot; the other two are read-only).
- Drop-onto-an-existing-node to auto-attach as a child (always standalone).
- Multi-select drag; drag-to-connect; persisted collapse state; cloud-provider
  shape packs; any new shape kinds.

## Architecture

The feature is three small, independently-testable units plus wiring:

1. **`ShapeLibrary`** (new component) — the draggable palette UI.
2. **`addShapeNode`** (new store action) — pure state transition that appends a
   standalone shape node at a given position as one undoable step.
3. **`humanizeShape`** (new helper) — shape kind → display label.
4. **Canvas drop wiring** in `App.tsx` — translates an HTML5 drop into a call to
   `addShapeNode` at the cursor's flow coordinates.

### Single source of truth

The palette reuses the already-exported `SHAPE_GROUPS` (from
`src/components/ShapePicker.tsx`) and `ShapeSwatch`, so it can never drift from
`SHAPE_KINDS`. No shape inventory is duplicated.

## Component: `ShapeLibrary` (`src/components/ShapeLibrary.tsx`)

- **Placement:** floating panel pinned to the **left edge, vertically centered**
  (`absolute left-6 top-1/2 -translate-y-1/2 z-20`), styled like the existing
  toolbar/header cards (`bg-surface/90 backdrop-blur-md border border-edge
  rounded-2xl shadow-2xl`). Vertically-centered placement keeps it clear of the
  top-left header card.
- **Contents:** maps `SHAPE_GROUPS` → a group label + a grid of swatches. Each
  swatch is a `draggable` element rendering `<ShapeSwatch kind={kind} />` with
  `title`/`aria-label={kind}`.
- **Drag source:** `onDragStart` sets
  `e.dataTransfer.setData('application/sovern-shape', kind)` and
  `e.dataTransfer.effectAllowed = 'move'`. The private MIME type prevents the
  canvas from reacting to foreign drags (files, selected text).
- **Collapse:** a chevron button toggles a local `useState` `collapsed`
  (default `false` → expanded). Collapsed renders only a thin spine with the
  toggle; expanded renders the full groups. State is **ephemeral** (not
  persisted) — YAGNI.
- **Visibility:** the component is mounted by `App.tsx` only when
  `viewMode === 'mindmap' && !presentationMode && !learnMode`.
- **No store writes** on its own; it is a pure drag source. (It may read
  nothing from the store, or only what a swatch needs — it does not depend on a
  selected node.)

## Store action: `addShapeNode(shape, position)`

Added to `WorkflowState` in `src/store/useWorkflowStore.ts`. Mirrors
`addChildNode` but creates a **standalone** node (no parent edge, no
auto-layout):

```ts
addShapeNode: (shape: ShapeKind, position: { x: number; y: number }) => string;
```

Behavior:
1. `get().enterEditMode();` — idempotent; freezes the live board poll and
   resumes undo tracking (same contract as every other add path).
2. Build the node:
   ```ts
   const id = `n-${crypto.randomUUID()}`;
   const newNode = {
     id,
     type: 'shape' as const,
     position,
     data: { label: humanizeShape(shape), layer: 'projects' as const,
             status: 'pending' as const, shape },
   };
   ```
3. `set({ nodes: [...get().nodes, newNode], selectedNodeId: id });` — **no edge
   added.**
4. `withoutHistory(() => get().recalculate());` — recompute rollups **without**
   `autoLayout`, so the drop coordinates are preserved (same discipline as
   `addImportedGraph`). The node append in step 3 is the single tracked undo
   step.
5. `return id;`

The dropped node's top-left corner sits at the cursor's flow position (no
centering offset — accepted minor).

## Helper: `humanizeShape(shape)`

A tiny exported pure function beside `SHAPE_KINDS` in `src/types/index.ts`:

```ts
export function humanizeShape(kind: ShapeKind): string {
  const s = kind.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Sentence-case: `'server' → 'Server'`, `'decision' → 'Decision'`,
`'vector-store' → 'Vector store'`. Acronym kinds render imperfectly
(`'gpu' → 'Gpu'`, `'wifi' → 'Wifi'`) — an accepted minor; a per-kind display map
is out of scope.

## Canvas drop wiring (`src/App.tsx`, `Flow`)

Standard React Flow drag-and-drop, no new dependencies:

- Pull `screenToFlowPosition` from the existing `useReactFlow()` destructure
  (already used for `fitView`); add `addShapeNode` to the store destructure.
- On the `<ReactFlow>` element:
  ```tsx
  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
  onDrop={onDrop}
  ```
- `onDrop`:
  ```tsx
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (viewMode !== 'mindmap' || learnMode || presentationMode) return;
    const kind = e.dataTransfer.getData('application/sovern-shape');
    if (!SHAPE_KINDS.includes(kind as ShapeKind)) return; // ignore foreign drags
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addShapeNode(kind as ShapeKind, position);
  };
  ```
- Mount `<ShapeLibrary />` alongside the other canvas-only chrome, gated on
  `viewMode === 'mindmap' && !presentationMode && !learnMode`.

## Data flow

```
drag swatch
  → dataTransfer['application/sovern-shape'] = kind
  → canvas onDragOver (preventDefault enables drop)
  → canvas onDrop: read kind, validate ∈ SHAPE_KINDS, screenToFlowPosition(cursor)
  → addShapeNode(kind, pos)
      → enterEditMode (freeze poll)
      → append {type:'shape', data.shape, humanized label}, select it   [undo step]
      → withoutHistory(recalculate)   (no auto-layout; pos preserved)
  → ShapeNode renders the new node at pos
  → NodeSidebar opens for the selected node
Ctrl+Z → one temporal entry removes the node
```

## Error / edge handling

- Empty or non-shape `dataTransfer` payload → `onDrop` no-ops (the
  `SHAPE_KINDS` membership guard).
- Drop while not in MindMap → no-op (handler self-guards; rail isn't shown
  anyway).
- `recalculate` already tolerates an edge-less node — a standalone shape has no
  budget/timeline rollup parent, so totals are unaffected.

## Testing

**Store — `addShapeNode`** (`src/store/*.test.ts`):
- Appends exactly one node with `type === 'shape'`, `data.shape === kind`,
  `data.label === humanizeShape(kind)`, and adds **no** edge.
- Sets `selectedNodeId` to the new id; returns that id.
- **Position preserved:** the new node's `position` equals the passed position
  (proves no `autoLayout` ran).
- `temporal.undo()` restores the prior node array in **one** step (node count
  back to original).

**Helper — `humanizeShape`** (unit):
- `'vector-store' → 'Vector store'`, `'server' → 'Server'`.

**Component — `ShapeLibrary`** (`src/components/ShapeLibrary.test.tsx`,
React-19 `act` + `react-dom/client` harness, no `@testing-library`):
- Renders 26 draggable swatches, one per `SHAPE_KIND` (assert by `aria-label`).
- The collapse toggle hides the shape groups when collapsed.
- `onDragStart` writes the kind under `application/sovern-shape` (mock
  `dataTransfer` with a `setData` spy).

## Files

- **Create:** `src/components/ShapeLibrary.tsx`
- **Create:** `src/components/ShapeLibrary.test.tsx`
- **Modify:** `src/store/useWorkflowStore.ts` — add `addShapeNode` + interface entry
- **Modify:** `src/types/index.ts` — add `humanizeShape`
- **Modify:** `src/App.tsx` — mount `<ShapeLibrary />`, wire `onDragOver`/`onDrop`,
  pull `screenToFlowPosition` + `addShapeNode`
- **Create/Modify:** a store test file covering `addShapeNode` (+ `humanizeShape`)

## Global constraints

- Respond/comment in english–russian mix per project convention.
- No new runtime dependencies (HTML5 DnD + existing `@xyflow/react`).
- The 26-shape vocabulary stays driven by `SHAPE_KINDS` (no inventory dup).
- Undo discipline: one tracked step per logical edit; derived recalc wrapped in
  `withoutHistory`.
- Component render tests use the React-19 `act` harness already established in
  the suite (no `@testing-library`); `vitest` include already matches
  `*.test.{ts,tsx}`.
