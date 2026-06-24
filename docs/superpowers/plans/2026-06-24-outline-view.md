# Outline / Document View (Slice 13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 6th on-screen **Outline view** that renders the graph as a linear, nested Markdown document (roots as `# headings`, descendants as indented bullets), with Copy + Save-`.md`. Read-only.

**Architecture:** One DFS pre-order traversal (`selectOutlineRows`) produces a flat `OutlineRow[]`; both the on-screen JSX and the `outlineToMarkdown` string render from it (no drift). `OutlineView` is a DOM overlay like Kanban/Matrix/Timeline; `App.tsx` adds the toolbar button + mount.

**Tech Stack:** React 19 + TypeScript, `@xyflow/react` types, Zustand store, lucide-react, Vitest 4 + jsdom (React-19 `act` harness). No new dependencies.

## Global Constraints

- No new dependencies (we own the JSX; no Markdown-renderer lib).
- Read-only — no outline→graph editing (deferred per the epic).
- `SHAPE_KINDS`/canvas untouched; MindMap & Diagram behavior unchanged.
- Lane nodes (`type === 'lane'`) excluded — consistent with the export adapters.
- Reuse `getChildren` (`src/utils/tree.ts`) and `saveFile` (`src/export/saveFile.ts` — signature `saveFile(content: string | Uint8Array, name: string, mime: string): Promise<void>`).
- DOM-view overlay convention: `<div className="absolute inset-0 bg-canvas z-10 ...">` (see `TimelineView.tsx`).
- Component tests use the React-19 `act` + `react-dom/client` harness already in the suite — no `@testing-library`.
- Run tests with `npm test` (`vitest run`); single file `npx vitest run <path>`; Windows worker-pool error → retry `--pool=threads`.
- Comments in english–russian mix. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-24-outline-view-design.md`

---

### Task 1: Outline model — `selectOutlineRows` + `outlineToMarkdown`

**Files:**
- Create: `src/utils/outline.ts`
- Test: `src/utils/outline.test.ts`

**Interfaces:**
- Consumes: `getChildren(id: string, edges: Edge[]): string[]` from `./tree`; `SOVERNNodeData` from `../types`.
- Produces:
  - `interface OutlineRow { id: string; depth: number; label: string; note?: string; isRoot: boolean }`
  - `selectOutlineRows(s: { nodes: Node<SOVERNNodeData>[]; edges: Edge[] }): OutlineRow[]`
  - `outlineToMarkdown(rows: OutlineRow[]): string`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/outline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectOutlineRows, outlineToMarkdown } from './outline';

const N = (id: string, label: string, extra: any = {}) =>
  ({ id, type: 'sovern', position: { x: 0, y: 0 }, data: { label, layer: 'projects', status: 'idle', ...extra } });
const E = (s: string, t: string) => ({ id: `e-${s}-${t}`, source: s, target: t });

describe('selectOutlineRows', () => {
  it('emits DFS pre-order: a parent immediately precedes its subtree (not BFS)', () => {
    const nodes = [N('root', 'Root'), N('a', 'A'), N('a1', 'A1'), N('b', 'B')] as any;
    const edges = [E('root', 'a'), E('a', 'a1'), E('root', 'b')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id)).toEqual(['root', 'a', 'a1', 'b']); // BFS would be root,a,b,a1
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
    expect(rows[0].isRoot).toBe(true);
    expect(rows[1].isRoot).toBe(false);
  });

  it('treats each in-degree-0 node as its own root, in array order', () => {
    const nodes = [N('r1', 'R1'), N('r2', 'R2'), N('c', 'C')] as any;
    const edges = [E('r1', 'c')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id)).toEqual(['r1', 'c', 'r2']);
    expect(rows.filter((r) => r.isRoot).map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('excludes lane nodes', () => {
    const nodes = [{ ...N('lane', 'Lane'), type: 'lane' }, N('root', 'Root')] as any;
    const rows = selectOutlineRows({ nodes, edges: [] });
    expect(rows.map((r) => r.id)).toEqual(['root']);
  });

  it('terminates on an isolated cycle and emits every node once (totality sweep)', () => {
    const nodes = [N('x', 'X'), N('y', 'Y')] as any;
    const edges = [E('x', 'y'), E('y', 'x')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id).sort()).toEqual(['x', 'y']);
    expect(rows.length).toBe(2);
  });

  it('carries a non-empty note and drops blank ones', () => {
    const nodes = [N('root', 'Root', { note: 'the seed' }), N('b', 'B', { note: '  ' })] as any;
    const rows = selectOutlineRows({ nodes, edges: [E('root', 'b')] });
    expect(rows[0].note).toBe('the seed');
    expect(rows[1].note).toBeUndefined();
  });

  it('returns [] for an empty graph', () => {
    expect(selectOutlineRows({ nodes: [], edges: [] })).toEqual([]);
  });
});

describe('outlineToMarkdown', () => {
  it('renders roots as headings and descendants as 2-space-per-level bullets', () => {
    const nodes = [N('root', 'Root'), N('a', 'A'), N('a1', 'A1'), N('b', 'B')] as any;
    const edges = [E('root', 'a'), E('a', 'a1'), E('root', 'b')];
    const md = outlineToMarkdown(selectOutlineRows({ nodes, edges }));
    expect(md).toBe('# Root\n- A\n  - A1\n- B');
  });

  it('blank-lines between root sections and renders a note italic', () => {
    const nodes = [N('r1', 'R1', { note: 'first' }), N('r2', 'R2')] as any;
    const md = outlineToMarkdown(selectOutlineRows({ nodes, edges: [] }));
    expect(md).toBe('# R1\n_first_\n\n# R2');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/utils/outline.test.ts`
Expected: FAIL — cannot resolve `./outline`.

- [ ] **Step 3: Implement `src/utils/outline.ts`**

```ts
import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { getChildren } from './tree';

export interface OutlineRow {
  id: string;
  depth: number;
  label: string;
  note?: string;
  isRoot: boolean;
}

/**
 * Graph → flat DFS pre-order rows (parent immediately before its subtree).
 * Roots = in-degree 0; then any still-unvisited node (isolated cycles) as roots.
 * Lane nodes excluded; cycle-safe; total — no node is ever dropped.
 */
export function selectOutlineRows(s: { nodes: Node<SOVERNNodeData>[]; edges: Edge[] }): OutlineRow[] {
  const nodes = s.nodes.filter((n) => n.type !== 'lane');
  const { edges } = s;
  if (nodes.length === 0) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => { if (indeg.has(e.target)) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1); });

  const rows: OutlineRow[] = [];
  const visited = new Set<string>();

  const walk = (id: string, depth: number) => {
    if (visited.has(id) || !byId.has(id)) return;
    visited.add(id);
    const n = byId.get(id)!;
    const raw = n.data?.note;
    const note = typeof raw === 'string' && raw.trim() ? raw : undefined;
    rows.push({ id, depth, label: n.data?.label ?? '', note, isRoot: depth === 0 });
    getChildren(id, edges).forEach((c) => { if (byId.has(c)) walk(c, depth + 1); });
  };

  // 1) real roots, in array order
  nodes.forEach((n) => { if ((indeg.get(n.id) ?? 0) === 0) walk(n.id, 0); });
  // 2) totality sweep: anything unreachable (isolated cycle) as a root
  nodes.forEach((n) => { if (!visited.has(n.id)) walk(n.id, 0); });

  return rows;
}

/** Rows → Markdown: roots '# label', descendants '  '×(depth-1)+'- label', note as an italic line. */
export function outlineToMarkdown(rows: OutlineRow[]): string {
  const lines: string[] = [];
  rows.forEach((r) => {
    if (r.isRoot) {
      if (lines.length) lines.push('');
      lines.push(`# ${r.label}`);
      if (r.note) lines.push(`_${r.note}_`);
    } else {
      const indent = '  '.repeat(r.depth - 1);
      lines.push(`${indent}- ${r.label}`);
      if (r.note) lines.push(`${indent}  _${r.note}_`);
    }
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/utils/outline.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/outline.ts src/utils/outline.test.ts
git commit -m "feat: outline model — selectOutlineRows (DFS pre-order) + outlineToMarkdown"
```

---

### Task 2: `OutlineView` component

**Files:**
- Create: `src/components/OutlineView.tsx`
- Test: `src/components/OutlineView.test.tsx`

**Interfaces:**
- Consumes: `selectOutlineRows`, `outlineToMarkdown` (Task 1); `saveFile` from `../export/saveFile`; the store's `nodes`/`edges`.
- Produces: `OutlineView({ notify }: { notify: (msg: string) => void })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/OutlineView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { OutlineView } from './OutlineView';
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
    nodes: [
      { id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'Root', layer: 'projects', status: 'idle' } },
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'Child A', layer: 'projects', status: 'idle' } },
    ] as any,
    edges: [{ id: 'e-root-a', source: 'root', target: 'a' }],
  });
});

describe('OutlineView', () => {
  it('renders the root heading and the descendant bullet', () => {
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    expect(container.textContent).toContain('Root');
    expect(container.textContent).toContain('Child A');
    cleanup();
  });

  it('Copy writes the markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    const copyBtn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy'))!;
    await act(async () => { copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(writeText).toHaveBeenCalledWith('# Root\n- Child A');
    cleanup();
  });

  it('shows a placeholder for an empty graph', () => {
    useWorkflowStore.setState({ nodes: [], edges: [] });
    const { container, cleanup } = mount(<OutlineView notify={() => {}} />);
    expect(container.textContent).toContain('Nothing to outline yet');
    cleanup();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/OutlineView.test.tsx`
Expected: FAIL — cannot resolve `./OutlineView`.

- [ ] **Step 3: Implement `src/components/OutlineView.tsx`**

```tsx
import { useWorkflowStore } from '../store/useWorkflowStore';
import { selectOutlineRows, outlineToMarkdown } from '../utils/outline';
import { saveFile } from '../export/saveFile';
import { Copy, FileDown } from 'lucide-react';

/** Read-only linear Markdown document of the graph (roots = headings, descendants = bullets). */
export function OutlineView({ notify }: { notify: (msg: string) => void }) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const rows = selectOutlineRows({ nodes, edges });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(outlineToMarkdown(rows));
      notify('Outline copied');
    } catch {
      notify('⚠ copy failed');
    }
  };
  const onSave = async () => {
    try {
      await saveFile(outlineToMarkdown(rows), 'outline.md', 'text/markdown');
    } catch (e) {
      notify(`⚠ save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="absolute inset-0 bg-canvas z-10 overflow-y-auto custom-scrollbar pt-32 px-8 pb-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end gap-2 mb-4">
          <button onClick={onCopy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-edge text-secondary hover:text-primary text-xs font-bold">
            <Copy size={14} /> Copy
          </button>
          <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-edge text-secondary hover:text-accent text-xs font-bold">
            <FileDown size={14} /> Save .md
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="text-center text-muted text-sm py-20">Nothing to outline yet</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r) =>
              r.isRoot ? (
                <div key={r.id} className="pt-5">
                  <div className="text-lg font-black text-primary">{r.label}</div>
                  {r.note && <div className="text-xs italic text-muted mt-0.5">{r.note}</div>}
                </div>
              ) : (
                <div key={r.id} style={{ paddingLeft: `${(r.depth - 1) * 1.5 + 0.5}rem` }}>
                  <div className="text-sm text-secondary leading-relaxed">• {r.label}</div>
                  {r.note && <div className="text-xs italic text-muted" style={{ paddingLeft: '1rem' }}>{r.note}</div>}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/OutlineView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/OutlineView.tsx src/components/OutlineView.test.tsx
git commit -m "feat: OutlineView — read-only Markdown document of the graph + Copy/Save .md"
```

---

### Task 3: Wire the Outline view into the app

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (the `ViewMode` union, ~line 19)
- Modify: `src/App.tsx` (lucide import ~line 14; `OutlineView` import ~line 31; `VIEW_BUTTONS` ~line 82-88; overlay mount ~line 266)

**Interfaces:**
- Consumes: `OutlineView` (Task 2).
- Produces: nothing for later tasks (final integration). Verified by typecheck + full suite + live smoke.

- [ ] **Step 1: Add `'outline'` to `ViewMode`**

In `src/store/useWorkflowStore.ts`, change:
```ts
export type ViewMode = 'mindmap' | 'diagram' | 'matrix' | 'timeline' | 'kanban';
```
to:
```ts
export type ViewMode = 'mindmap' | 'diagram' | 'matrix' | 'timeline' | 'kanban' | 'outline';
```

(No `setViewMode` branch needed — `outline` is a DOM view and does not touch canvas positions, like matrix/timeline/kanban.)

- [ ] **Step 2: Import the icon + component in `App.tsx`**

(a) Add `AlignLeft` to the existing `lucide-react` import (the long named import on line 14):
```tsx
import { RefreshCcw, Save, FolderOpen, History, Zap, Grid2X2, Network, CalendarRange, Columns2, Workflow, ListTree, Rows3, Eye, EyeOff, ImageDown, GraduationCap, Code2, FileDown, Presentation, AlignLeft } from 'lucide-react';
```

(b) Add the component import (next to the other DOM-view imports, after `TimelineView`):
```tsx
import { OutlineView } from './components/OutlineView';
```

- [ ] **Step 3: Add the toolbar button entry**

In `src/App.tsx`, append to the `VIEW_BUTTONS` array (after the `kanban` entry):
```tsx
  { mode: 'outline', Icon: AlignLeft, active: 'bg-slate-600 text-white' },
```

- [ ] **Step 4: Mount the overlay**

In `src/App.tsx`, after the timeline overlay line:
```tsx
      {viewMode === 'timeline' && <TimelineView />}
```
add:
```tsx
      {viewMode === 'outline' && <OutlineView notify={notify} />}
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS — full suite (existing + Task 1/2 additions), no failures.

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/App.tsx
git commit -m "feat: wire the Outline view (6th view button + overlay mount)"
```

---

## Manual verification (after Task 3, at finishing)

Live smoke in `npm run dev` (pin `--port 1420 --strictPort` — Vite drifts off 5173 because eStateHub squats it):
1. Click the new **Outline** toolbar button → the canvas is replaced by a centered document: each root as a bold heading, descendants as depth-indented bullets.
2. **Copy** → toast "Outline copied"; pasting elsewhere yields the Markdown (`# …`, `- …`).
3. **Save .md** → a `.md` file downloads (browser) / save dialog (Tauri).
4. Switch back to MindMap → the graph is intact (outline was read-only).

---

## Notes for the implementer

- DFS pre-order (Task 1) is the depth-first counterpart to the existing BFS `selectLearnOrder` — do not reuse `selectLearnOrder` (its order is wrong for an outline).
- `bg-canvas`, `bg-surface`, `text-primary/secondary/muted`, `border-edge`, `custom-scrollbar` are existing project classes (see `TimelineView.tsx`).
- The `Object.defineProperty(navigator, 'clipboard', …)` in the test avoids jsdom's read-only `navigator.clipboard` getter.
- Do not add `@testing-library`; reuse the `mount` helper pattern from `ShapePicker.test.tsx`.
