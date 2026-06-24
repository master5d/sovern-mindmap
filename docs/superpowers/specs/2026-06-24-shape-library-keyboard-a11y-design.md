# Slice 12 — Shape-Library Keyboard A11y — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Predecessor:** Slice 10 (drag-from-library) — `ShapeLibrary`, `addShapeNode`, `SHAPE_DND_MIME`

## Goal

Make the drag-from-library palette usable without a mouse. Today each swatch is
a non-focusable `<div>` whose only affordance is HTML5 drag — pointer-only. A
keyboard user cannot add a shape at all. This slice gives the swatches real
button semantics and an activation path that adds the shape at the canvas
center, while leaving precise drag-placement untouched.

## Decision

Each swatch becomes a real `<button>` (natively focusable; fires on Enter/Space).
Activating it — by keyboard **or** plain click — adds the shape node at the
**current viewport center** via the existing `addShapeNode`. Dragging still works
for precise placement. Bonus: sighted mouse users get a click-to-add affordance
for free.

Rejected alternatives: two-step keyboard "pick up → arrow-move ghost → drop"
(far more state/UI for a niche path); a `tabindex`/`role="button"` `<div>`
(hand-rolls button semantics a real `<button>` provides natively).

## Architecture

Two small changes; the placement owner stays where the React Flow context already
lives.

### `ShapeLibrary.tsx`

- The per-shape wrapper `<div draggable …>` becomes
  `<button type="button" draggable …>`:
  - keeps `onDragStart` (writes `SHAPE_DND_MIME`, `effectAllowed='move'`) — drag
    path unchanged;
  - gains `onClick={() => onPick(kind)}`;
  - keeps `aria-label={kind}` (accessible name) and `title={kind}` (sighted
    tooltip);
  - keeps the same swatch visuals (`<ShapeSwatch kind={kind} />` inside).
- New required prop: `onPick: (kind: ShapeKind) => void`. The component does not
  gain store or React Flow access — it just calls the callback. (It is no longer
  a *pure* drag source, but it remains presentational: it reports an intent, the
  parent decides placement.)
- A normal click on a `draggable` button still fires `onClick`; a drag gesture
  fires `onDragStart` and not `onClick`, so the two paths don't collide.

### `App.tsx`

`Flow` already holds `screenToFlowPosition` (from `useReactFlow()`) and
`addShapeNode` (from the store). Add a placement helper and pass it down:

```tsx
const addShapeAtCenter = (kind: ShapeKind) => {
  const center = screenToFlowPosition({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  });
  addShapeNode(kind, center);
};
```

Mount becomes `<ShapeLibrary onPick={addShapeAtCenter} />` (same MindMap-only
gate as slice 10). The canvas drop path (`onCanvasDragOver`/`onCanvasDrop`) is
unchanged.

The React Flow pane is full-viewport (`100vw`/`100vh`), so the window center maps
to the canvas center; `screenToFlowPosition` converts it to flow coordinates
honoring the current pan/zoom.

## Data flow

```
Tab to a swatch  →  Enter/Space (or click)
  → button onClick → onPick(kind)
  → App.addShapeAtCenter(kind)
  → screenToFlowPosition(window center) → addShapeNode(kind, center)
  → standalone 'shape' node at canvas center, selected, ONE undo step (slice-10 action verbatim)
```

Drag path (unchanged): `dragstart → dataTransfer → onDrop → screenToFlowPosition(cursor) → addShapeNode`.

## Error / edge handling

- Multiple consecutive center-adds stack at the same point; the user drags them
  apart. No auto-offset (YAGNI).
- `addShapeNode` already enters Edit Mode (freezes the live poll) and is a single
  undo step — inherited unchanged.

## Testing

`ShapeLibrary.test.tsx` (React-19 `act` harness, no `@testing-library`):
- The 26→(29 after slice 11) swatches render as `<button>` elements (focusable);
  assert `tagName === 'BUTTON'` for the per-shape swatches. *(For slice 12 alone
  the count is 26; if slices land in 11-before-12 order the count is 29. The test
  asserts "one button per `SHAPE_KIND`", not a hard number, to stay order-robust.)*
- Clicking a swatch calls a passed `onPick` spy with that kind.
- `onDragStart` still writes the kind under `SHAPE_DND_MIME` (existing test kept).

App center-placement: no unit test (it needs a live React Flow viewport).
Verified by `npx tsc --noEmit` + the live smoke (Tab→Enter→node at canvas
center; drag still places precisely).

## Files

- **Modify:** `src/components/ShapeLibrary.tsx` — `<div>`→`<button>`, add `onPick` prop + `onClick`
- **Modify:** `src/components/ShapeLibrary.test.tsx` — button assertions + `onPick` spy; keep the drag-MIME test
- **Modify:** `src/App.tsx` — `addShapeAtCenter` helper; pass `onPick` to `<ShapeLibrary>`

## Global constraints

- No new dependencies.
- Drag path and the slice-10 `addShapeNode` action are unchanged.
- MindMap-only gating (the mount predicate) unchanged.
- React-19 `act` test harness; no `@testing-library`.
- Comments in english–russian mix per project convention.
