# Shape-Library Keyboard A11y (Slice 12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the drag-from-library shape palette usable by keyboard — each swatch becomes a real `<button>` that, when activated (Enter/Space/click), adds the shape at the canvas center; drag still places precisely.

**Architecture:** Turn the per-shape `<div draggable>` into a `<button type="button" draggable>` that keeps its `onDragStart` (precise drag) and gains an `onClick` calling a new `onPick(kind)` prop. `App.tsx` — which already holds `screenToFlowPosition` + `addShapeNode` — supplies `onPick = addShapeAtCenter`, placing the node at the viewport center.

**Tech Stack:** React 19 + TypeScript, `@xyflow/react` 12 (`screenToFlowPosition`), Zustand store (`addShapeNode` from slice 10), Vitest 4 + jsdom (React-19 `act` harness).

## Global Constraints

- No new dependencies.
- The slice-10 drag path and the `addShapeNode` store action are unchanged.
- MindMap-only mount gating (`viewMode === 'mindmap' && !presentationMode && !learnMode`) unchanged.
- Component tests use the React-19 `act` + `react-dom/client` harness already in the suite — no `@testing-library`.
- Run tests with `npm test` (`vitest run`); single file `npx vitest run <path>`; on a Windows worker-pool error retry with `--pool=threads`.
- Comments in english–russian mix per project convention.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-24-shape-library-keyboard-a11y-design.md`

This slice is a single cohesive task: the swatch button change makes `onPick` a required prop, which compile-couples `ShapeLibrary` and its one caller (`App.tsx`), so they land together.

---

### Task 1: Button swatches + center placement

**Files:**
- Modify: `src/components/ShapeLibrary.tsx` (the per-shape wrapper, ~lines 45-55; component signature line 16)
- Modify: `src/components/ShapeLibrary.test.tsx` (whole file — mount now passes `onPick`, plus button + click assertions)
- Modify: `src/App.tsx` (add `addShapeAtCenter`; pass `onPick` to `<ShapeLibrary>`, ~line 371)

**Interfaces:**
- Consumes: `addShapeNode(shape: ShapeKind, position: {x:number;y:number}) => string` and `screenToFlowPosition` (already in `App.tsx`'s `useReactFlow()` destructure).
- Produces: `ShapeLibrary` now takes a required prop `onPick: (kind: ShapeKind) => void`.

- [ ] **Step 1: Rewrite the test file (failing)**

Replace the entire contents of `src/components/ShapeLibrary.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapeLibrary, SHAPE_DND_MIME } from './ShapeLibrary';
import { SHAPE_KINDS } from '../types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

describe('ShapeLibrary', () => {
  it('renders one focusable <button> swatch per shape kind', () => {
    const { container, cleanup } = mount(<ShapeLibrary onPick={() => {}} />);
    const swatches = [...container.querySelectorAll('[draggable="true"]')];
    expect(swatches.length).toBe(SHAPE_KINDS.length);
    swatches.forEach((el) => expect(el.tagName).toBe('BUTTON'));
    SHAPE_KINDS.forEach((k) => expect(container.querySelector(`button[aria-label="${k}"]`)).toBeTruthy());
    cleanup();
  });

  it('clicking a swatch calls onPick with that kind', () => {
    const onPick = vi.fn();
    const { container, cleanup } = mount(<ShapeLibrary onPick={onPick} />);
    const btn = container.querySelector('button[aria-label="server"]') as HTMLButtonElement;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onPick).toHaveBeenCalledWith('server');
    cleanup();
  });

  it('onDragStart still writes the shape kind under the private MIME', () => {
    const { container, cleanup } = mount(<ShapeLibrary onPick={() => {}} />);
    const el = container.querySelector('button[aria-label="server"]') as HTMLElement;
    const setData = vi.fn();
    const evt = new Event('dragstart', { bubbles: true }) as any;
    evt.dataTransfer = { setData, effectAllowed: '' };
    act(() => { el.dispatchEvent(evt); });
    expect(setData).toHaveBeenCalledWith(SHAPE_DND_MIME, 'server');
    cleanup();
  });

  it('collapse toggle hides the swatches', () => {
    const { container, cleanup } = mount(<ShapeLibrary onPick={() => {}} />);
    const toggle = container.querySelector('button[aria-label="Collapse shape library"]') as HTMLButtonElement;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
    cleanup();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ShapeLibrary.test.tsx`
Expected: FAIL — `<ShapeLibrary onPick=…>` is a type/prop error (or the `tagName === 'BUTTON'` / `onPick` assertions fail) because the swatch is still a `<div>` with no `onPick` prop.

- [ ] **Step 3: Make the swatch a button with `onPick`**

In `src/components/ShapeLibrary.tsx`:

(a) Change the component signature (line 16) from:

```tsx
export function ShapeLibrary() {
```

to:

```tsx
export function ShapeLibrary({ onPick }: { onPick: (kind: ShapeKind) => void }) {
```

(b) Replace the per-shape wrapper element (the `<div … draggable …> … </div>`, ~lines 46-55) with a `<button>`:

```tsx
                {group.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, kind)}
                    onClick={() => onPick(kind)}
                    title={kind}
                    aria-label={kind}
                    className="flex cursor-grab items-center justify-center rounded-lg p-1 transition-colors hover:bg-hover active:cursor-grabbing"
                  >
                    <ShapeSwatch kind={kind} />
                  </button>
                ))}
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npx vitest run src/components/ShapeLibrary.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire center placement in `App.tsx`**

In `src/App.tsx`:

(a) Confirm the store destructure already includes `addShapeNode` and the `useReactFlow()` destructure already includes `screenToFlowPosition` (both added in slice 10). They do.

(b) Add the placement helper next to the existing `onCanvasDrop`/`onCanvasDragOver` handlers (just before the component's `return (`):

```tsx
  // Keyboard/click add (slice 12): no cursor position → place at the viewport center.
  const addShapeAtCenter = (kind: ShapeKind) => {
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    addShapeNode(kind, center);
  };
```

(c) Change the `<ShapeLibrary />` mount (the line gated on `viewMode === 'mindmap' && !presentationMode && !learnMode`, ~line 371) to pass the prop:

```tsx
      {viewMode === 'mindmap' && !presentationMode && !learnMode && <ShapeLibrary onPick={addShapeAtCenter} />}
```

(`ShapeKind` is already imported in `App.tsx` from slice 10; no new import.)

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors (the required `onPick` prop is satisfied by the `App.tsx` mount).

Run: `npm test`
Expected: PASS — full suite, no failures (161 tests + the rewritten ShapeLibrary tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/ShapeLibrary.tsx src/components/ShapeLibrary.test.tsx src/App.tsx
git commit -m "feat: keyboard-accessible shape library (button swatches + click/Enter adds at canvas center)"
```

---

## Manual verification (after Task 1, at finishing)

Live smoke in `npm run dev` (MindMap view):
1. **Tab** into the shape library; a swatch shows a focus ring.
2. **Enter** (or Space) on a focused swatch → a node labeled with that shape appears at the canvas center, selected.
3. A plain **click** on a swatch does the same.
4. **Drag** a swatch onto the canvas → still lands at the drop point (unchanged).
5. `Ctrl+Z` removes the added node in one step.

---

## Notes for the implementer

- A `draggable` `<button>` still fires `onClick` on a normal click and `onDragStart` (not `onClick`) on a drag — the two paths don't collide.
- Do not add `@testing-library`; reuse the `mount` helper already in the test file.
- `window.innerWidth/2, innerHeight/2` is the viewport center; the React Flow pane is full-viewport, so this maps to the canvas center. `screenToFlowPosition` converts it honoring pan/zoom.
