# Manual Shape Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set the shape of the selected node from a visual palette in the sidebar; picking a shape converts the node to a shape-node and renders the chosen geometry.

**Architecture:** A new `setNodeShape(id, shape)` store action flips `node.type → 'shape'` and sets `data.shape` in one undoable step (entering edit mode to freeze the live poll). A presentational `ShapeSwatch` renders any `ShapeKind` at ~28px by reusing `SHAPE_GEOMETRY` (the same source of truth as `ShapeNode`). A `ShapePicker` lays out the 26 shapes in two enum-derived groups and is mounted as a "Shape" section in the existing `NodeSidebar`.

**Tech Stack:** TypeScript, React 19, @xyflow/react 12, Zustand 5 (+ zundo temporal), lucide-react, Vitest + jsdom.

## Global Constraints

- **Scope:** picker changes the **selected node's** shape — NOT a drag-from-library node-creation flow (deferred).
- **Reach:** works on **any** node; picking converts it to a shape-node (`type='shape'` + `data.shape`) in **one undo step**. Underlying `node.data` is preserved (merged, not replaced).
- **Home:** a "Shape" section inside `NodeSidebar`, placed **after Title, before Layer/Status**.
- **Swatches reuse `SHAPE_GEOMETRY`** directly — no static preview assets.
- **No new runtime or test dependencies.** Component render tests use React 19's built-in `act` (imported from `react`) + `react-dom/client` — NOT `@testing-library/react` (the project has none). Set `globalThis.IS_REACT_ACT_ENVIRONMENT = true` in render-test files.
- **Two groups derived from `SHAPE_KINDS` by index:** Basic = `SHAPE_KINDS.slice(0, 12)`, Home AI-lab = `SHAPE_KINDS.slice(12)` (display order = enum order).
- **Out of scope:** drag-from-library creation; a reverse shape→card control; cloud-provider icon pack.

---

### Task 1: `setNodeShape` store action

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (import `ShapeKind`; add to `WorkflowState`; add the action)
- Test: `src/store/shape.test.ts` (create)

**Interfaces:**
- Consumes: `useWorkflowStore` (Zustand store + `.temporal`), existing `enterEditMode()`, `recalculate()`, `withoutHistory()` helper.
- Produces: `setNodeShape(id: string, shape: ShapeKind): void` on the store — used by `ShapePicker` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/store/shape.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [{ id: 'n1', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'n1', layer: 'projects', status: 'idle' } }] as any,
    edges: [],
    selectedNodeId: 'n1',
    isEditing: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
});

describe('setNodeShape', () => {
  it('converts a sovern node to a shape node with the chosen shape and enters edit mode', () => {
    useWorkflowStore.getState().setNodeShape('n1', 'cylinder');
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('cylinder');
    expect(useWorkflowStore.getState().isEditing).toBe(true);
  });

  it('is a single undo step that restores both type and shape', () => {
    useWorkflowStore.getState().setNodeShape('n1', 'gpu');
    useWorkflowStore.temporal.getState().undo();
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('sovern');
    expect(n.data.shape).toBeUndefined();
  });

  it('on an existing shape node changes only the shape (type stays shape)', () => {
    useWorkflowStore.setState({
      nodes: [{ id: 's1', type: 'shape', position: { x: 0, y: 0 }, data: { label: 's1', layer: 'projects', status: 'idle', shape: 'rectangle' } }] as any,
      selectedNodeId: 's1',
    });
    useWorkflowStore.getState().setNodeShape('s1', 'decision');
    const n = useWorkflowStore.getState().nodes[0];
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('decision');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/store/shape.test.ts`
Expected: FAIL — `useWorkflowStore.getState().setNodeShape is not a function`.

- [ ] **Step 3: Add `ShapeKind` to the store's type import**

In `src/store/useWorkflowStore.ts`, change the line:
```ts
import { SOVERNNodeData } from '../types';
```
to:
```ts
import { SOVERNNodeData, ShapeKind } from '../types';
```

- [ ] **Step 4: Declare the action in `WorkflowState`**

In `src/store/useWorkflowStore.ts`, in the `WorkflowState` interface, add this line immediately after `updateNodeData: (id: string, data: Partial<SOVERNNodeData>) => void;`:
```ts
  setNodeShape: (id: string, shape: ShapeKind) => void;
```

- [ ] **Step 5: Implement the action**

In `src/store/useWorkflowStore.ts`, in the store object, add this implementation immediately after the `updateNodeData: (id, dataUpdate) => { ... },` block (it ends with its closing `},`):
```ts
  setNodeShape: (id, shape) => {
    get().enterEditMode(); // idempotent: freezes the live poll + resumes undo tracking
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, type: 'shape', data: { ...n.data, shape } } : n,
      ),
    });
    // Re-rollup without a second undo entry — the type+shape flip above is the one step.
    withoutHistory(() => get().recalculate());
  },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/store/shape.test.ts`
Expected: PASS — 3/3.

- [ ] **Step 7: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/shape.test.ts
git commit -m "feat: setNodeShape store action (type flip + shape, one undo step)"
```

---

### Task 2: `ShapeSwatch` presentational component

**Files:**
- Create: `src/components/nodes/ShapeSwatch.tsx`
- Test: `src/components/nodes/ShapeSwatch.test.tsx` (create)

**Interfaces:**
- Consumes: `SHAPE_GEOMETRY`, `ShapeKind` from `./shapeGeometry`.
- Produces: `ShapeSwatch({ kind: ShapeKind; selected?: boolean })` — a ~28px label-less preview; used by `ShapePicker` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/components/nodes/ShapeSwatch.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapeSwatch } from './ShapeSwatch';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

describe('ShapeSwatch', () => {
  it('renders an icon-mode swatch (server) using a lucide svg', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="server" />);
    expect(container.querySelector('svg')).toBeTruthy();
    cleanup();
  });

  it('renders an svg-mode swatch (decision) silhouette as a polygon', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="decision" />);
    expect(container.querySelector('polygon')).toBeTruthy();
    cleanup();
  });

  it('renders a css-mode swatch (rounded) as a plain box with no svg', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="rounded" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('div')).toBeTruthy();
    cleanup();
  });

  it('marks a selected swatch with an accent ring', () => {
    const { container, cleanup } = mount(<ShapeSwatch kind="rounded" selected />);
    expect(container.innerHTML).toContain('ring-accent');
    cleanup();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/nodes/ShapeSwatch.test.tsx`
Expected: FAIL — cannot resolve `./ShapeSwatch` (module does not exist yet).

- [ ] **Step 3: Create the component**

Create `src/components/nodes/ShapeSwatch.tsx`:

```tsx
import { SHAPE_GEOMETRY, ShapeKind } from './shapeGeometry';

/**
 * ~28px label-less preview of one shape, driven by SHAPE_GEOMETRY so it stays
 * truthful to ShapeNode's three render modes (css border-radius / svg silhouette /
 * lucide icon). Pure presentational — no store access.
 */
export function ShapeSwatch({ kind, selected = false }: { kind: ShapeKind; selected?: boolean }) {
  const geom = SHAPE_GEOMETRY[kind];
  const ring = selected ? 'ring-2 ring-accent/50 border-accent' : 'border-edge';

  if (geom.mode === 'icon') {
    const Icon = geom.Icon!;
    return (
      <div className={`flex h-7 w-7 items-center justify-center border bg-surface-2 ${geom.className ?? ''} ${ring}`}>
        <Icon size={16} className="text-secondary" />
      </div>
    );
  }

  if (geom.mode === 'svg') {
    return (
      <div className={`relative h-7 w-7 rounded ${selected ? 'ring-2 ring-accent/50' : ''}`}>
        {geom.svg!(selected)}
      </div>
    );
  }

  // css mode: a small filled box carrying the geometry's border-radius className
  return <div className={`h-7 w-7 border bg-surface-2 ${geom.className ?? ''} ${ring}`} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/nodes/ShapeSwatch.test.tsx`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/ShapeSwatch.tsx src/components/nodes/ShapeSwatch.test.tsx
git commit -m "feat: ShapeSwatch — mini SHAPE_GEOMETRY-driven shape preview"
```

---

### Task 3: `ShapePicker` + mount in `NodeSidebar`

**Files:**
- Create: `src/components/ShapePicker.tsx`
- Modify: `src/components/NodeSidebar.tsx` (import + a "Shape" section after Title)
- Test: `src/components/ShapePicker.test.tsx` (create)

**Interfaces:**
- Consumes: `SHAPE_KINDS`, `ShapeKind` from `../types`; `useWorkflowStore` (`nodes`, `selectedNodeId`, `setNodeShape` from Task 1); `ShapeSwatch` from `./nodes/ShapeSwatch` (Task 2).
- Produces: `ShapePicker()` component and the exported constant `SHAPE_GROUPS: { label: string; kinds: ShapeKind[] }[]`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ShapePicker.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ShapePicker, SHAPE_GROUPS } from './ShapePicker';
import { SHAPE_KINDS } from '../types';
import { useWorkflowStore } from '../store/useWorkflowStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [{ id: 'n1', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'n1', layer: 'projects', status: 'idle' } }] as any,
    edges: [],
    selectedNodeId: 'n1',
    isEditing: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
});

describe('SHAPE_GROUPS', () => {
  it('splits SHAPE_KINDS into Basic (12) + Home AI-lab (14), covering all', () => {
    expect(SHAPE_GROUPS.map((g) => g.label)).toEqual(['Basic', 'Home AI-lab']);
    expect(SHAPE_GROUPS[0].kinds.length).toBe(12);
    expect(SHAPE_GROUPS[1].kinds.length).toBe(14);
    expect([...SHAPE_GROUPS[0].kinds, ...SHAPE_GROUPS[1].kinds]).toEqual([...SHAPE_KINDS]);
  });
});

describe('ShapePicker', () => {
  it('renders one labelled button per shape (26 total)', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelectorAll('button[aria-label]').length).toBe(26);
    cleanup();
  });

  it('clicking a swatch applies that shape to the selected node', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    const btn = container.querySelector('button[aria-label="cylinder"]') as HTMLButtonElement;
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const n = useWorkflowStore.getState().nodes.find((x) => x.id === 'n1')!;
    expect(n.type).toBe('shape');
    expect(n.data.shape).toBe('cylinder');
    cleanup();
  });

  it('renders nothing when no node is selected', () => {
    useWorkflowStore.setState({ selectedNodeId: null });
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelector('button[aria-label]')).toBeNull();
    cleanup();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/ShapePicker.test.tsx`
Expected: FAIL — cannot resolve `./ShapePicker` (module does not exist yet).

- [ ] **Step 3: Create the `ShapePicker` component**

Create `src/components/ShapePicker.tsx`:

```tsx
import { SHAPE_KINDS, ShapeKind } from '../types';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { ShapeSwatch } from './nodes/ShapeSwatch';

/** Two enum-derived groups so the palette can never drift from SHAPE_KINDS. */
export const SHAPE_GROUPS: { label: string; kinds: ShapeKind[] }[] = [
  { label: 'Basic', kinds: SHAPE_KINDS.slice(0, 12) as ShapeKind[] },
  { label: 'Home AI-lab', kinds: SHAPE_KINDS.slice(12) as ShapeKind[] },
];

/** Shape palette for the selected node; clicking a swatch converts it to that shape. */
export function ShapePicker() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setNodeShape = useWorkflowStore((s) => s.setNodeShape);

  const selected = nodes.find((n) => n.id === selectedNodeId);
  if (!selected) return null;
  const current = (selected.data.shape ?? 'rectangle') as ShapeKind;

  return (
    <div className="space-y-3">
      {SHAPE_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{group.label}</div>
          <div className="grid grid-cols-6 gap-1.5">
            {group.kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                title={kind}
                aria-label={kind}
                onClick={() => setNodeShape(selectedNodeId!, kind)}
                className="flex items-center justify-center rounded-lg p-1 transition-colors hover:bg-hover"
              >
                <ShapeSwatch kind={kind} selected={kind === current} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Mount the picker in `NodeSidebar`**

In `src/components/NodeSidebar.tsx`, add the import after the existing lucide import line (line 2):
```tsx
import { ShapePicker } from './ShapePicker';
```
Then, inside the Content `div`, immediately after the Title block (the `<div className="space-y-2">…Title…</div>` that closes just before the `{/* Grid: Layer & Status */}` comment), insert:
```tsx
        {/* Shape */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted tracking-widest">Shape</label>
          <ShapePicker />
        </div>
```

- [ ] **Step 5: Run the picker test to verify it passes**

Run: `npm test -- src/components/ShapePicker.test.tsx`
Expected: PASS — 4/4 (1 group test + 3 render tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ShapePicker.tsx src/components/ShapePicker.test.tsx src/components/NodeSidebar.tsx
git commit -m "feat: ShapePicker palette mounted in NodeSidebar"
```

---

### Task 4: Full-suite + build verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — entire suite green, including the new store + swatch + picker tests, no regressions.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS — `tsc` clean (no type errors) and `vite build` succeeds.

- [ ] **Step 3: Optional manual smoke (non-blocking)**

`npm run dev` (port 1420), enter Edit Mode, select a hand-authored node, open the sidebar, click a few shapes (e.g. `cylinder`, then `server`) and confirm: the node re-renders as that shape, the current shape is highlighted, and one Ctrl+Z reverts the change. Confidence check, not a gate.

---

## Self-Review

**1. Spec coverage:**
- `setNodeShape` (type flip + shape, one undo, enters edit mode) → Task 1. ✓
- Works on any node incl. hand-authored `sovern` → Task 1 test 1; existing shape node → Task 1 test 3. ✓
- `ShapeSwatch` reuses `SHAPE_GEOMETRY`, 3 modes, selected highlight → Task 2. ✓
- `ShapePicker` 26 shapes in two enum-derived groups, current highlighted, click→`setNodeShape`, null when no selection → Task 3. ✓
- Mounted as "Shape" section after Title in `NodeSidebar` → Task 3 Step 4. ✓
- Persist via `mm:shape` — already handled by `toJSONCanvas` (no code change needed; out of plan scope by design). ✓
- No `App.tsx`/`ShapeNode.tsx` change — none in plan. ✓
- DoD (render palette, convert + render, one undo, tests + build green) → Tasks 1–4. ✓
- Out-of-scope items (drag-create, reverse convert, cloud) → none implemented. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code and exact insertion points. ✓

**3. Type consistency:** `setNodeShape(id: string, shape: ShapeKind)` is declared (Task 1 Step 4), implemented (Step 5), consumed identically in `ShapePicker` (Task 3) and the tests. `ShapeKind` imported from `../types` in the store and picker, from `./shapeGeometry` in the swatch (both are the same type — `shapeGeometry.tsx` defines `ShapeKind = NonNullable<SOVERNNodeData['shape']>` and `types` exports the enum-derived `ShapeKind`; values are identical). `SHAPE_GROUPS` shape `{ label, kinds }` matches between definition and test. `ShapeSwatch` prop names (`kind`, `selected`) match across component, picker, and tests. ✓
