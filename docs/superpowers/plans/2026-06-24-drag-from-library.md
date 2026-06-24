# Drag-from-Library (Slice 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a brand-new standalone shape node by dragging a shape from a persistent left-edge palette onto the MindMap canvas.

**Architecture:** A pure drag-source component (`ShapeLibrary`) writes a shape kind to `dataTransfer`; the `<ReactFlow>` canvas's `onDrop` converts the cursor to flow coordinates via `screenToFlowPosition` and calls a new `addShapeNode` store action that appends one standalone `shape` node at the drop point as a single undo step (no auto-layout, so the drop position is preserved). A `humanizeShape` helper supplies the default label.

**Tech Stack:** React 19 + TypeScript, Zustand 5 (+ zundo temporal), `@xyflow/react` 12 (built-in HTML5 drag-and-drop pattern), Vitest 4 + jsdom. No new dependencies.

## Global Constraints

- No new runtime dependencies — use HTML5 drag-and-drop + existing `@xyflow/react` `screenToFlowPosition`.
- The 26-shape vocabulary stays driven by `SHAPE_KINDS` (`src/types/index.ts`); never duplicate the inventory — reuse `SHAPE_GROUPS` (exported from `src/components/ShapePicker.tsx`) and `ShapeSwatch`.
- Undo discipline: one tracked temporal step per logical edit; derived recalc wrapped in `withoutHistory(...)`. Immutable updates only (zundo equality is shallow).
- Drag-create is **MindMap-only**: no drops in Diagram / Learn / Presentation. The new node is always **standalone** (no parent edge), positioned exactly at the drop point (no `autoLayout`).
- Component render tests use the React-19 `act` + `react-dom/client` harness already in the suite (no `@testing-library`). See `src/components/ShapePicker.test.tsx` for the exact `mount` helper to copy.
- Run tests with `npm test` (`vitest run`); a single file with `npx vitest run <path>`. On Windows, if a worker-pool error appears, retry with `--pool=threads`.
- Comments in english–russian mix per project convention.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-24-drag-from-library-design.md`

---

### Task 1: `humanizeShape` helper

**Files:**
- Modify: `src/types/index.ts` (append after the `ShapeKind` type, ~line 36)
- Test: `src/types/humanizeShape.test.ts` (create)

**Interfaces:**
- Consumes: `ShapeKind` (already defined in `src/types/index.ts`).
- Produces: `export function humanizeShape(kind: ShapeKind): string` — sentence-cases the kind (`'-'`→space, first char upper).

- [ ] **Step 1: Write the failing test**

Create `src/types/humanizeShape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { humanizeShape } from './index';

describe('humanizeShape', () => {
  it('sentence-cases a single-word kind', () => {
    expect(humanizeShape('server')).toBe('Server');
    expect(humanizeShape('decision')).toBe('Decision');
  });

  it('replaces hyphens with spaces and capitalises only the first word', () => {
    expect(humanizeShape('vector-store')).toBe('Vector store');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/types/humanizeShape.test.ts`
Expected: FAIL — `humanizeShape is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

In `src/types/index.ts`, immediately after the `export type ShapeKind = ...` line (~line 36), add:

```ts
/** Shape kind → human label: hyphens→spaces, sentence-case. e.g. 'vector-store' → 'Vector store'. */
export function humanizeShape(kind: ShapeKind): string {
  const s = kind.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/types/humanizeShape.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/humanizeShape.test.ts
git commit -m "feat: humanizeShape helper (shape kind → sentence-case label)"
```

---

### Task 2: `addShapeNode` store action

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (import line ~14; interface ~line 40; action body near `setNodeShape` ~line 172)
- Test: `src/store/shape.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `humanizeShape(kind: ShapeKind): string` (Task 1); existing `enterEditMode()`, `recalculate()`, module-private `withoutHistory(fn)`.
- Produces: `addShapeNode(shape: ShapeKind, position: { x: number; y: number }) => string` — appends a standalone `shape` node, selects it, returns its id.

- [ ] **Step 1: Write the failing test**

Append to `src/store/shape.test.ts` (after the existing `setNodeShape` describe block, before EOF):

```ts
describe('addShapeNode', () => {
  it('appends one standalone shape node at the drop position, selected, with no edge', () => {
    const before = useWorkflowStore.getState().nodes.length;
    const id = useWorkflowStore.getState().addShapeNode('server', { x: 321, y: 654 });
    const s = useWorkflowStore.getState();
    expect(s.nodes.length).toBe(before + 1);
    const n = s.nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('server');
    expect(n.data.label).toBe('Server');         // humanizeShape
    expect(n.position).toEqual({ x: 321, y: 654 }); // drop position preserved (no auto-layout)
    expect(s.edges.length).toBe(0);                 // standalone — no parent edge
    expect(s.selectedNodeId).toBe(id);
    expect(s.isEditing).toBe(true);                 // entered edit mode (poll frozen)
  });

  it('is a single undo step that removes the dropped node', () => {
    const before = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().addShapeNode('decision', { x: 10, y: 20 });
    useWorkflowStore.temporal.getState().undo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/shape.test.ts`
Expected: FAIL — `addShapeNode is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/store/useWorkflowStore.ts`:

(a) Extend the types import (~line 14) to include `humanizeShape`:

```ts
import { SOVERNNodeData, ShapeKind, humanizeShape } from '../types';
```

(b) Add to the `WorkflowState` interface, right after the `setNodeShape` line (~line 39):

```ts
  addShapeNode: (shape: ShapeKind, position: { x: number; y: number }) => string;
```

(c) Add the action body immediately after the `setNodeShape: (...) => { ... },` block (~line 181):

```ts
  addShapeNode: (shape, position) => {
    get().enterEditMode(); // idempotent: freezes the live poll + resumes undo tracking
    const id = `n-${crypto.randomUUID()}`;
    const newNode = {
      id,
      type: 'shape' as const,
      position,
      data: { label: humanizeShape(shape), layer: 'projects' as const, status: 'pending' as const, shape },
    };
    // Standalone node — no parent edge. The append below is the single tracked undo step.
    set({ nodes: [...get().nodes, newNode as any], selectedNodeId: id });
    // Recalc rollups WITHOUT auto-layout, so the drop coordinates survive (cf. addImportedGraph).
    withoutHistory(() => get().recalculate());
    return id;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/shape.test.ts`
Expected: PASS (existing `setNodeShape` tests + 2 new `addShapeNode` tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/shape.test.ts
git commit -m "feat: addShapeNode store action (standalone shape node at drop position, one undo step)"
```

---

### Task 3: `ShapeLibrary` component (draggable palette)

**Files:**
- Create: `src/components/ShapeLibrary.tsx`
- Test: `src/components/ShapeLibrary.test.tsx` (create)

**Interfaces:**
- Consumes: `SHAPE_GROUPS` (exported from `src/components/ShapePicker.tsx`), `ShapeSwatch` (from `src/components/nodes/ShapeSwatch.tsx`), `ShapeKind` (from `src/types`).
- Produces: `export function ShapeLibrary(): JSX.Element` and `export const SHAPE_DND_MIME = 'application/sovern-shape'` — the private drag MIME used by both the swatch `onDragStart` and the canvas `onDrop` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/components/ShapeLibrary.test.tsx`:

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
  it('renders 26 draggable swatches, one per shape kind', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(26);
    SHAPE_KINDS.forEach((k) => expect(container.querySelector(`[aria-label="${k}"]`)).toBeTruthy());
    cleanup();
  });

  it('onDragStart writes the shape kind under the private MIME', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    const el = container.querySelector('[aria-label="server"]') as HTMLElement;
    const setData = vi.fn();
    const evt = new Event('dragstart', { bubbles: true }) as any;
    evt.dataTransfer = { setData, effectAllowed: '' };
    act(() => { el.dispatchEvent(evt); });
    expect(setData).toHaveBeenCalledWith(SHAPE_DND_MIME, 'server');
    cleanup();
  });

  it('collapse toggle hides the swatches', () => {
    const { container, cleanup } = mount(<ShapeLibrary />);
    const toggle = container.querySelector('button[aria-label="Collapse shape library"]') as HTMLButtonElement;
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('[draggable="true"]').length).toBe(0);
    cleanup();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ShapeLibrary.test.tsx`
Expected: FAIL — cannot resolve `./ShapeLibrary`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ShapeLibrary.tsx`:

```tsx
import type React from 'react';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Shapes } from 'lucide-react';
import { SHAPE_GROUPS } from './ShapePicker';
import { ShapeSwatch } from './nodes/ShapeSwatch';
import type { ShapeKind } from '../types';

/** Private MIME for the drag payload so the canvas ignores foreign drags (files / text). */
export const SHAPE_DND_MIME = 'application/sovern-shape';

/**
 * Persistent draggable shape palette pinned to the left edge (MindMap only).
 * Pure drag source — writes the shape kind to dataTransfer on drag start; never
 * touches the store. Reuses SHAPE_GROUPS + ShapeSwatch so it can't drift from SHAPE_KINDS.
 */
export function ShapeLibrary() {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (e: React.DragEvent, kind: ShapeKind) => {
    e.dataTransfer.setData(SHAPE_DND_MIME, kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-surface/90 backdrop-blur-md border border-edge rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between gap-2 p-2 border-b border-edge">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted pl-1">
          <Shapes size={12} /> {!collapsed && 'Shapes'}
        </span>
        <button
          type="button"
          aria-label={collapsed ? 'Expand shape library' : 'Collapse shape library'}
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-lg text-secondary hover:bg-hover"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[60vh] w-[136px] overflow-y-auto p-2 space-y-3 custom-scrollbar">
          {SHAPE_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{group.label}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {group.kinds.map((kind) => (
                  <div
                    key={kind}
                    draggable
                    onDragStart={(e) => onDragStart(e, kind)}
                    title={kind}
                    aria-label={kind}
                    className="flex cursor-grab items-center justify-center rounded-lg p-1 transition-colors hover:bg-hover active:cursor-grabbing"
                  >
                    <ShapeSwatch kind={kind} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ShapeLibrary.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ShapeLibrary.tsx src/components/ShapeLibrary.test.tsx
git commit -m "feat: ShapeLibrary — persistent draggable shape palette"
```

---

### Task 4: Wire the canvas drop + mount the library (`App.tsx`)

**Files:**
- Modify: `src/App.tsx` (imports ~line 14–39; `Flow` store + `useReactFlow` destructures ~line 91–101; `<ReactFlow>` element ~line 246; canvas-chrome mount ~line 370)

**Interfaces:**
- Consumes: `addShapeNode` (Task 2), `ShapeLibrary` + `SHAPE_DND_MIME` (Task 3), `SHAPE_KINDS` & `ShapeKind` (from `src/types`), `screenToFlowPosition` from `useReactFlow()`.
- Produces: nothing for later tasks (final integration). No unit test — verified by typecheck + full suite + the live UI smoke at finishing.

- [ ] **Step 1: Add imports**

In `src/App.tsx`:

(a) Add to the existing `import { useReactFlow ... }` — it is already imported from `@xyflow/react` (line 9); no change needed there.

(b) After the existing component imports (after line 28, near `DrawioImportButton`), add:

```tsx
import { ShapeLibrary, SHAPE_DND_MIME } from './components/ShapeLibrary';
```

(c) Change the types import on line 39 from:

```tsx
import { SOVERNNodeData } from './types';
```

to:

```tsx
import { SOVERNNodeData, SHAPE_KINDS, ShapeKind } from './types';
```

- [ ] **Step 2: Pull the new store action + `screenToFlowPosition`**

(a) In the `useWorkflowStore()` destructure (~line 91–97), add `addShapeNode`:

```tsx
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    setNodes, setEdges, recalculate, selectedNodeId,
    viewMode, setViewMode, isSyncing,
    diagramLayout, setDiagramLayout, presentationMode, setPresentationMode,
    learnMode, enterLearnMode, learnStep, addShapeNode,
  } = useWorkflowStore();
```

(b) Change the `useReactFlow()` destructure (line 101) from:

```tsx
  const { fitView } = useReactFlow();
```

to:

```tsx
  const { fitView, screenToFlowPosition } = useReactFlow();
```

- [ ] **Step 3: Add the drop handlers**

In `Flow`, just before the `return (` of the component (after the `renderEdges` block, ~line 240), add:

```tsx
  // Drag-from-library: drop a shape swatch onto the MindMap canvas → standalone node at the cursor.
  const onCanvasDragOver = (e: React.DragEvent) => {
    if (viewMode !== 'mindmap' || learnMode || presentationMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onCanvasDrop = (e: React.DragEvent) => {
    if (viewMode !== 'mindmap' || learnMode || presentationMode) return;
    e.preventDefault();
    const kind = e.dataTransfer.getData(SHAPE_DND_MIME);
    if (!SHAPE_KINDS.includes(kind as ShapeKind)) return; // ignore foreign drags
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addShapeNode(kind as ShapeKind, position);
  };
```

Note: `React` is needed for the `React.DragEvent` type — add `import type React from 'react';` at the top of the imports if the file does not already import a default `React`. (Check line 1; `src/App.tsx` currently imports only named hooks from `'react'`, so add the `import type React from 'react';` line.)

- [ ] **Step 4: Attach handlers to `<ReactFlow>` and mount the library**

(a) On the `<ReactFlow ...>` element (~line 246), add two props (alongside `onNodesChange` etc.):

```tsx
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
```

(b) Mount the library in the canvas chrome. Find the line (~line 370):

```tsx
      {selectedNodeId && !learnMode && <NodeSidebar />}
```

and immediately **before** it add:

```tsx
      {viewMode === 'mindmap' && !presentationMode && !learnMode && <ShapeLibrary />}
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS — the full suite (existing tests + Task 1/2/3 additions), no failures.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire shape-library drag-and-drop onto the MindMap canvas"
```

---

## Manual verification (after Task 4, at finishing)

Live UI smoke (Playwright or by hand) in `npm run dev`:
1. In MindMap view, the **Shapes** library is visible on the left edge.
2. Drag a `server` swatch onto empty canvas → a node labeled **Server** appears at the drop point (icon shape), and the sidebar opens for it (selected).
3. The dropped node stays where dropped (not yanked by layout).
4. `Ctrl+Z` removes it in one step (blur any focused element first — `useGraphKeyboard` skips keys while a button has focus).
5. Switch to Diagram view → the library is gone and dropping does nothing.

---

## Notes for the implementer

- Copy the `mount` test helper verbatim from `src/components/ShapePicker.test.tsx` — it sets `IS_REACT_ACT_ENVIRONMENT` and uses React-19's `act` + `createRoot`. Do **not** add `@testing-library`.
- `draggable` as a bare JSX prop renders to the attribute `draggable="true"` — the test selectors rely on that.
- Keep all node/edge updates immutable (spread, not mutate) — zundo's shallow equality silently drops in-place mutations from undo history.
- The dropped node's **top-left** sits at the cursor (no centering offset) — this is intentional and accepted.
