# Slice 9 — Manual Shape Picker

**Date:** 2026-06-23
**Project:** sovern-mindmap
**Status:** Design approved, pending spec review → writing-plans

## Objective

Let a user manually set the shape of a selected node from a visual palette, closing the gap left
after slice 8: today the 26-shape vocabulary is reachable only through AI generation (`mm:shape`)
and `.drawio` import — there is **no manual shape picker** (the store has zero shape actions).
A hand-built node (Tab/Enter) is always a rectangle-card with no way to make it a cylinder,
decision, server, etc. This is the "manual shape-palette" fast-follow, scoped to **changing the
shape of the selected node** (NOT a drag-from-library node-creation flow — that is a separate
future slice).

## Scope decisions (locked)

- **Meaning:** shape-**picker for the selected node** (change its shape), not drag-to-create.
- **Reach:** the picker works on **any** node. Picking a shape **converts the node to a
  shape-node** (`node.type → 'shape'` + `data.shape`), so it works on hand-authored `sovern`
  nodes and PM/ticket cards too — aligned with the app's "unified AI diagramming canvas" pivot.
- **Home:** a "Shape" section inside the existing `NodeSidebar` (the per-selected-node format
  panel), placed after Title and before Layer/Status.
- **Rendering:** swatches reuse `SHAPE_GEOMETRY` directly (single source of truth shared with
  `ShapeNode`) — no static preview assets.

## Why node.type must flip (the crux)

React Flow picks the renderer by `node.type` (`nodeTypes = { sovern: SOVERNNode, shape:
ShapeNode }`, `App.tsx:41-44`). **`SOVERNNode` ignores `data.shape`** — it renders a fixed PM card
(layer/status/budget/timeline/agent). Only **`ShapeNode`** renders shape geometry. `fromJSONCanvas`
already encodes this: nodes with `mm:shape` become type `'shape'`, others `'sovern'`
(`canvasConverter.ts:54-58`). So setting `data.shape` alone does nothing on a `sovern` node — the
picker must set **both** `node.type='shape'` and `data.shape` in one step.

Converting a `sovern` node to `shape` drops the **display** of PM chrome (budget / timeline /
agent / collapse chevron — `ShapeNode` has none), but the underlying `node.data` is preserved
(merged, not replaced) and survives reload/export (`toJSONCanvas` writes `mm:shape` +
`sovern:*`). It is an explicit user action and is reversible with one Ctrl+Z. This behavior is
intentional, not a bug.

## Components & changes (units)

### 1. `src/store/useWorkflowStore.ts` — `setNodeShape` action
Add to `WorkflowState` and the store:
```ts
setNodeShape: (id: string, shape: ShapeKind) => void;
```
```ts
setNodeShape: (id, shape) => {
  get().enterEditMode(); // idempotent: freezes the live poll + resumes undo tracking
  set({
    nodes: get().nodes.map((n) =>
      n.id === id ? { ...n, type: 'shape', data: { ...n.data, shape } } : n,
    ),
  });
  withoutHistory(() => get().recalculate());
},
```
- The primary `set` runs while tracking is on (edit mode) → exactly one undo step that reverses
  BOTH `type` and `data.shape`. Immutable map (new array + new node object) so the temporal
  `shallow` equality records the change (`useWorkflowStore.ts:300-304`).
- `ShapeKind` is imported from `../types`.

### 2. `src/components/nodes/ShapeSwatch.tsx` — tiny shape preview (new file)
A ~28px label-less renderer of one `ShapeKind`, driven by `SHAPE_GEOMETRY[kind]` so it stays
truthful to `ShapeNode`'s three render modes:
- `icon` mode → the lucide `Icon` at ~18px (the home-lab pack + actor/cloud).
- `svg` mode → the geometry's `svg(false)` silhouette in a small fixed box.
- `css` mode → a small filled box carrying the geometry's `className` (border-radius).
Props: `{ kind: ShapeKind; selected?: boolean }`. No store access; pure presentational.

### 3. `src/components/ShapePicker.tsx` — the palette section (new file)
Renders the 26 shapes as a grid of `ShapeSwatch` buttons in two labeled groups, derived from
`SHAPE_KINDS` by index so they cannot drift from the enum (display order = enum order):
- **Basic = `SHAPE_KINDS.slice(0, 12)`:** rectangle, rounded, decision, terminal, note, cylinder,
  ellipse, parallelogram, hexagon, cloud, actor, document (the original 12).
- **Home AI-lab = `SHAPE_KINDS.slice(12)`:** server, gpu, workstation, laptop, storage, router,
  switch, firewall, wifi, model, agent, vector-store, gateway, container (the slice-8 14).
The currently-applied shape (the selected node's `data.shape`, defaulting to `rectangle`) is
highlighted via `selected` on its swatch. Clicking a swatch calls
`useWorkflowStore.getState().setNodeShape(selectedNodeId, kind)`. Each swatch has a `title`
tooltip = the shape key.

### 4. `src/components/NodeSidebar.tsx` — mount the picker
Add a "Shape" section (same label styling as Title/Layer) directly after the Title block,
rendering `<ShapePicker />`. No other sidebar changes.

`App.tsx` / `nodeTypes` / `ShapeNode.tsx` — **no change** (ShapeNode already renders every kind;
the node is simply retyped to `shape`).

## Data flow

```
select node → NodeSidebar shows <ShapePicker> (highlights current data.shape)
  → click swatch → setNodeShape(selectedNodeId, kind)
      → enterEditMode() (freeze poll, track undo)
      → node retyped to 'shape' + data.shape = kind   [1 undo step]
  → React Flow renders it via ShapeNode → SHAPE_GEOMETRY[kind]
persist: toJSONCanvas writes mm:shape (already) → autosave to workspace file (not board.canvas)
```

## Testing

- **Store (`useWorkflowStore` test):**
  - `setNodeShape` on a `sovern` node → that node's `type === 'shape'` and `data.shape ===`
    the picked kind; other node fields preserved.
  - one `temporal.undo()` restores BOTH the original `type` and the absence of `shape` (single
    undo step).
  - `setNodeShape` on an existing `shape` node changes only `data.shape` (type stays `'shape'`).
  - calling it sets `isEditing === true` (poll frozen).
- **`ShapeSwatch` (jsdom):** renders without crash for an `icon`-mode kind (e.g. `server`), an
  `svg`-mode kind (e.g. `decision`), and a `css`-mode kind (e.g. `rounded`) — assert the
  expected element/icon is present, behavior not pixels.
- **`ShapePicker` (jsdom):** renders 26 swatches across the two groups; the swatch for the
  selected node's current shape carries the selected styling; clicking a swatch calls
  `setNodeShape` with `(selectedNodeId, kind)` (spy on the store action).

## Definition of Done

- Selecting a node shows a "Shape" palette in the sidebar with all 26 shapes in two groups, the
  current shape highlighted.
- Clicking a shape converts the node to a shape-node and renders the chosen geometry; works on a
  hand-authored `sovern` node and on an existing `shape` node.
- The change is one undoable step (Ctrl+Z reverts type + shape) and freezes the live board poll.
- `data.shape` persists via `toJSONCanvas`/`mm:shape` and survives reload/export.
- Unit tests (store + swatch + picker) green; `npm run build` passes.

## Out of scope (explicit)

- Drag-from-library shape creation (making NEW free-floating nodes) — separate future slice.
- A reverse "convert shape back to PM card" control (undo covers the immediate case).
- Cloud-provider icon pack (AWS/Azure/GCP) — deferred (home-lab scope).
- Grouping/search beyond the two static Basic / Home AI-lab groups.
