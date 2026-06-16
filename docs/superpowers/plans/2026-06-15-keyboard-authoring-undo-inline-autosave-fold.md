# Keyboard Authoring, Undo/Redo, Inline Edit, Autosave, Fold + Copy/Paste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five hand-editing features to sovern-mindmap (keyboard authoring, undo/redo, inline node editing, autosave, fold + copy/paste subtree) while the app stays a view-first live-board viewer.

**Architecture:** App boots in live mode polling `board.canvas`. The first authoring action flips `isEditing=true`, which freezes the poll so edits aren't clobbered. All structural edits go through new `useWorkflowStore` actions and are tracked by `zundo` temporal middleware for undo/redo. Autosave writes a debounced snapshot to a **separate workspace file** (Tauri app-data / browser localStorage), never to `board.canvas`. Fold uses React Flow `hidden`; copy/paste clones subtrees with fresh ids.

**Tech Stack:** Tauri 2, React 19, TypeScript 5.8, Vite 7, Tailwind v4, @xyflow/react 12, Zustand 5, zundo 2, dagre, vitest/jsdom, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-15-keyboard-authoring-undo-inline-autosave-fold.md`

---

## File Structure

**New files:**
- `src/utils/tree.ts` — pure tree helpers (children/descendants/parent/cloneSubtree).
- `src/utils/tree.test.ts` — unit tests for tree helpers.
- `src/store/authoring.test.ts` — unit tests for new store actions.
- `src/hooks/useGraphKeyboard.ts` — keyboard handler hook.
- `src/hooks/useAutosave.ts` — debounced workspace autosave hook.
- `src/components/EditModeBanner.tsx` — "Editing — live updates paused" pill + Done button + save indicator.

**Modified files:**
- `src/store/useWorkflowStore.ts` — add editing/clipboard/collapse state + authoring/fold/paste actions; wrap with `zundo` temporal.
- `src/hooks/useBoardSync.ts` — skip applying board changes while `isEditing`.
- `src/components/nodes/SOVERNNode.tsx` — inline editor + fold chevron + collapsed-count badge.
- `src/utils/persistence.ts` — add `saveWorkspace` / `loadWorkspace`.
- `src/App.tsx` — mount `useGraphKeyboard`, `useAutosave`, `<EditModeBanner>`; expose collapse-derived hidden nodes/edges to `<ReactFlow>`; "Open workspace" button.

---

## Task 1: Edit Mode state + board-poll freeze + banner

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Modify: `src/hooks/useBoardSync.ts`
- Create: `src/components/EditModeBanner.tsx`
- Modify: `src/App.tsx`
- Test: `src/store/authoring.test.ts`

- [ ] **Step 1: Write failing test for edit-mode state**

Create `src/store/authoring.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

const reset = () =>
  useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null, isEditing: false });

describe('edit mode', () => {
  beforeEach(reset);

  it('enterEditMode sets isEditing true, exit sets it false', () => {
    expect(useWorkflowStore.getState().isEditing).toBe(false);
    useWorkflowStore.getState().enterEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(true);
    useWorkflowStore.getState().exitEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/store/authoring.test.ts`
Expected: FAIL — `isEditing`/`enterEditMode` undefined.

- [ ] **Step 3: Add state + actions to the store interface and implementation**

In `src/store/useWorkflowStore.ts`, add to the `WorkflowState` interface (near `isSyncing`):

```ts
  isEditing: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
```

Add to the store object (near `isSyncing: false,`):

```ts
  isEditing: false,
  enterEditMode: () => {
    if (get().isEditing) return;
    set({ isEditing: true });
  },
  exitEditMode: () => set({ isEditing: false }),
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/store/authoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Freeze the board poll while editing**

In `src/hooks/useBoardSync.ts`, inside `tick`, after `if (!alive) return;` and before `if (text !== lastText.current)`, add:

```ts
        // view-first: пока пользователь редактирует руками, не перетираем граф.
        // lastText НЕ обновляем — изменение переподхватится после exitEditMode.
        if (useWorkflowStore.getState().isEditing) {
          if (first) onFirstLoadRef.current(true);
          return; // finally{} перепланирует следующий tick
        }
```

(`useWorkflowStore` is already imported in this file.)

- [ ] **Step 6: Create the banner component**

Create `src/components/EditModeBanner.tsx`:

```tsx
import { Check, Pencil } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';

export function EditModeBanner({ saveState }: { saveState: 'idle' | 'saving' | 'saved' }) {
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const exitEditMode = useWorkflowStore((s) => s.exitEditMode);
  if (!isEditing) return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface/90 backdrop-blur-md px-4 py-2 border border-accent rounded-2xl shadow-2xl">
      <span className="flex items-center gap-2 text-xs font-bold text-accent">
        <Pencil size={14} /> Editing — live updates paused
      </span>
      <span className="text-[10px] text-muted min-w-[48px]">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : ''}
      </span>
      <button
        onClick={exitEditMode}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90"
      >
        <Check size={14} /> Done
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Mount the banner in App.tsx**

In `src/App.tsx`, add the import:

```tsx
import { EditModeBanner } from './components/EditModeBanner';
```

Inside `Flow()`, add a save-state placeholder (Task 7 will drive it) near the other `useState` calls:

```tsx
  const [saveState] = useState<'idle' | 'saving' | 'saved'>('idle');
```

Render the banner just after the opening `<div ...>` of the return (before `<ReactFlow>`):

```tsx
      <EditModeBanner saveState={saveState} />
```

- [ ] **Step 8: Verify build + tests**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/store/useWorkflowStore.ts src/hooks/useBoardSync.ts src/components/EditModeBanner.tsx src/App.tsx src/store/authoring.test.ts
git commit -m "feat(edit): Edit Mode state, board-poll freeze, paused banner"
```

---

## Task 2: Tree helpers (`tree.ts`)

**Files:**
- Create: `src/utils/tree.ts`
- Test: `src/utils/tree.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/tree.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { getChildren, getDescendants, getParent, cloneSubtree } from './tree';

const n = (id: string): Node => ({ id, type: 'sovern', position: { x: 0, y: 0 }, data: { label: id } });
const e = (s: string, t: string): Edge => ({ id: `e-${s}-${t}`, source: s, target: t });

const nodes = [n('a'), n('b'), n('c'), n('d')];
const edges = [e('a', 'b'), e('a', 'c'), e('b', 'd')];

describe('tree helpers', () => {
  it('getChildren returns direct children only', () => {
    expect(getChildren('a', edges).sort()).toEqual(['b', 'c']);
    expect(getChildren('b', edges)).toEqual(['d']);
    expect(getChildren('d', edges)).toEqual([]);
  });

  it('getDescendants returns all transitive children', () => {
    expect(getDescendants('a', edges).sort()).toEqual(['b', 'c', 'd']);
    expect(getDescendants('b', edges)).toEqual(['d']);
  });

  it('getDescendants is cycle-safe', () => {
    const cyclic = [e('x', 'y'), e('y', 'x')];
    expect(getDescendants('x', cyclic).sort()).toEqual(['x', 'y']);
  });

  it('getParent returns the source of the incoming edge', () => {
    expect(getParent('b', edges)).toBe('a');
    expect(getParent('a', edges)).toBeUndefined();
  });

  it('cloneSubtree produces fresh ids, preserves structure, offsets positions', () => {
    const { nodes: cloned, edges: clonedEdges, rootId } = cloneSubtree('b', nodes, edges);
    expect(cloned).toHaveLength(2); // b + d
    expect(cloned.map((c) => c.id)).not.toContain('b');
    expect(cloned.map((c) => c.id)).not.toContain('d');
    expect(clonedEdges).toHaveLength(1); // b->d remapped
    const clonedRoot = cloned.find((c) => c.id === rootId)!;
    const clonedChild = cloned.find((c) => c.id !== rootId)!;
    expect(clonedEdges[0].source).toBe(rootId);
    expect(clonedEdges[0].target).toBe(clonedChild.id);
    expect(clonedRoot.data.label).toBe('b');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/utils/tree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/utils/tree.ts`**

```ts
import { Node, Edge } from '@xyflow/react';

/** Direct children: targets of edges whose source is `id`. */
export function getChildren(id: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.source === id).map((e) => e.target);
}

/** All transitive descendants (cycle-safe; includes nodes revisited via a cycle once). */
export function getDescendants(id: string, edges: Edge[]): string[] {
  const seen = new Set<string>();
  const stack = getChildren(id, edges);
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...getChildren(cur, edges));
  }
  return [...seen];
}

/** First parent: source of an edge whose target is `id`. */
export function getParent(id: string, edges: Edge[]): string | undefined {
  return edges.find((e) => e.target === id)?.source;
}

/**
 * Deep-copy the subtree rooted at `rootId` with brand-new ids.
 * Returns the cloned nodes/edges (only edges internal to the subtree) and the new root id.
 * Positions are offset by +40,+40 so a paste is visually distinct before re-layout.
 */
export function cloneSubtree(
  rootId: string,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; rootId: string } {
  const ids = [rootId, ...getDescendants(rootId, edges)];
  const idSet = new Set(ids);
  const idMap = new Map<string, string>();
  ids.forEach((old) => idMap.set(old, `n-${crypto.randomUUID()}`));

  const clonedNodes = nodes
    .filter((nd) => idSet.has(nd.id))
    .map((nd) => ({
      ...nd,
      id: idMap.get(nd.id)!,
      selected: false,
      position: { x: nd.position.x + 40, y: nd.position.y + 40 },
      data: { ...nd.data },
    }));

  const clonedEdges = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({
      ...e,
      id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

  return { nodes: clonedNodes, edges: clonedEdges, rootId: idMap.get(rootId)! };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/utils/tree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tree.ts src/utils/tree.test.ts
git commit -m "feat(tree): pure subtree helpers (children, descendants, parent, clone)"
```

---

## Task 3: Authoring actions (add child / add sibling / delete cascade)

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Test: `src/store/authoring.test.ts`

- [ ] **Step 1: Write failing tests** (append to `src/store/authoring.test.ts`)

```ts
import { getChildren, getDescendants } from '../utils/tree';

const seed = () => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'root', layer: 'human', status: 'active' } },
      { id: 'child', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'child', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-root-child', source: 'root', target: 'child' }],
    selectedNodeId: 'root',
    isEditing: false,
  });
};

describe('authoring actions', () => {
  beforeEach(seed);

  it('addChildNode adds node + edge from parent and enters edit mode', () => {
    const id = useWorkflowStore.getState().addChildNode('root');
    const { nodes, edges, isEditing } = useWorkflowStore.getState();
    expect(nodes.find((n) => n.id === id)).toBeTruthy();
    expect(getChildren('root', edges)).toContain(id);
    expect(isEditing).toBe(true);
  });

  it('addSiblingNode attaches new node under the same parent', () => {
    const id = useWorkflowStore.getState().addSiblingNode('child');
    const { edges } = useWorkflowStore.getState();
    expect(getChildren('root', edges)).toContain(id);
  });

  it('addSiblingNode on a root falls back to adding a child of it', () => {
    const id = useWorkflowStore.getState().addSiblingNode('root');
    const { edges } = useWorkflowStore.getState();
    expect(getChildren('root', edges)).toContain(id);
  });

  it('deleteNodeCascade removes node and its descendants and touching edges', () => {
    const gc = useWorkflowStore.getState().addChildNode('child'); // root>child>gc
    useWorkflowStore.getState().deleteNodeCascade('child');
    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes.find((n) => n.id === 'child')).toBeUndefined();
    expect(nodes.find((n) => n.id === gc)).toBeUndefined();
    expect(edges.some((e) => e.source === 'child' || e.target === 'child')).toBe(false);
    expect(getDescendants('root', edges)).not.toContain('child');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/store/authoring.test.ts`
Expected: FAIL — `addChildNode` undefined.

- [ ] **Step 3: Add imports + interface entries**

In `src/store/useWorkflowStore.ts`, extend the import from `../utils/tree` (create the import line):

```ts
import { getDescendants, getParent } from '../utils/tree';
```

Add to `WorkflowState` interface:

```ts
  addChildNode: (parentId: string) => string;
  addSiblingNode: (nodeId: string) => string;
  deleteNodeCascade: (nodeId: string) => void;
```

- [ ] **Step 4: Implement the actions**

Add to the store object (after `updateNodeData`):

```ts
  addChildNode: (parentId) => {
    get().enterEditMode();
    const id = `n-${crypto.randomUUID()}`;
    const parent = get().nodes.find((n) => n.id === parentId);
    const newNode = {
      id,
      type: 'sovern' as const,
      position: { x: (parent?.position.x ?? 0), y: (parent?.position.y ?? 0) + 120 },
      data: { label: 'New node', layer: parent?.data.layer ?? 'projects', status: 'pending' as const },
    };
    set({
      nodes: [...get().nodes, newNode as any],
      edges: [...get().edges, { id: `e-${parentId}-${id}`, source: parentId, target: id }],
      selectedNodeId: id,
    });
    get().autoLayout();
    return id;
  },
  addSiblingNode: (nodeId) => {
    const parentId = getParent(nodeId, get().edges);
    return get().addChildNode(parentId ?? nodeId);
  },
  deleteNodeCascade: (nodeId) => {
    get().enterEditMode();
    const doomed = new Set([nodeId, ...getDescendants(nodeId, get().edges)]);
    set({
      nodes: get().nodes.filter((n) => !doomed.has(n.id)),
      edges: get().edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
      selectedNodeId: get().selectedNodeId && doomed.has(get().selectedNodeId!) ? null : get().selectedNodeId,
    });
    get().recalculate();
  },
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run src/store/authoring.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/authoring.test.ts
git commit -m "feat(authoring): addChildNode / addSiblingNode / deleteNodeCascade store actions"
```

---

## Task 4: Keyboard authoring hook

**Files:**
- Create: `src/hooks/useGraphKeyboard.ts`
- Modify: `src/App.tsx`

> Note: keyboard wiring is integration-level; verify by build + manual. No unit test (jsdom keydown on `window` is covered indirectly by the store-action tests already written).

- [ ] **Step 1: Create the hook**

Create `src/hooks/useGraphKeyboard.ts`:

```ts
import { useEffect } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';

/** True when focus is in a text field / contentEditable — keyboard authoring must defer. */
const isTextTarget = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
};

/** Tab=child, Enter=sibling, F2=rename, Delete=remove, Esc=clear/cancel. Canvas views only. */
export function useGraphKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkflowStore.getState();
      if (isTextTarget(document.activeElement)) return;
      const id = s.selectedNodeId;

      if (e.key === 'Tab' && id) {
        e.preventDefault();
        s.beginInlineEdit(s.addChildNode(id));
      } else if (e.key === 'Enter' && id) {
        e.preventDefault();
        s.beginInlineEdit(s.addSiblingNode(id));
      } else if (e.key === 'F2' && id) {
        e.preventDefault();
        s.beginInlineEdit(id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
        e.preventDefault();
        const hasChildren = s.edges.some((edge) => edge.source === id);
        if (!hasChildren || window.confirm('Delete this node and all its children?')) {
          s.deleteNodeCascade(id);
        }
      } else if (e.key === 'Escape') {
        s.cancelInlineEdit();
        s.setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
```

> `beginInlineEdit` / `cancelInlineEdit` are added in Task 5; this task's build will fail until Task 5 lands. Implement Task 5 immediately after, or temporarily stub them. **Reorder note:** if executing strictly task-by-task, do Task 5's store-state Step (3a) before building Task 4. The combined build/commit happens at the end of Task 5.

- [ ] **Step 2: Wire the hook in App.tsx**

In `src/App.tsx` add import:

```tsx
import { useGraphKeyboard } from './hooks/useGraphKeyboard';
```

Inside `Flow()`, after the `isCanvasView` const:

```tsx
  useGraphKeyboard(isCanvasView);
```

- [ ] **Step 3: Defer build/commit to end of Task 5** (shared dependency).

---

## Task 5: Inline node editing

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Modify: `src/components/nodes/SOVERNNode.tsx`
- Test: `src/store/authoring.test.ts`

- [ ] **Step 1: Write failing tests** (append to `src/store/authoring.test.ts`)

```ts
describe('inline editing state', () => {
  beforeEach(seed);

  it('beginInlineEdit sets editingNodeId; commit updates label and clears it', () => {
    useWorkflowStore.getState().beginInlineEdit('child');
    expect(useWorkflowStore.getState().editingNodeId).toBe('child');
    useWorkflowStore.getState().commitInlineEdit('child', 'renamed');
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'child')!.data.label).toBe('renamed');
    expect(useWorkflowStore.getState().editingNodeId).toBeNull();
  });

  it('cancelInlineEdit clears editingNodeId without changing label', () => {
    useWorkflowStore.getState().beginInlineEdit('child');
    useWorkflowStore.getState().cancelInlineEdit();
    expect(useWorkflowStore.getState().editingNodeId).toBeNull();
    expect(useWorkflowStore.getState().nodes.find((n) => n.id === 'child')!.data.label).toBe('child');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/store/authoring.test.ts`
Expected: FAIL — `editingNodeId` undefined.

- [ ] **Step 3a: Add inline-edit state to the store**

In `WorkflowState` interface:

```ts
  editingNodeId: string | null;
  beginInlineEdit: (id: string) => void;
  commitInlineEdit: (id: string, label: string) => void;
  cancelInlineEdit: () => void;
```

In the store object (after the authoring actions):

```ts
  editingNodeId: null,
  beginInlineEdit: (id) => { get().enterEditMode(); set({ editingNodeId: id, selectedNodeId: id }); },
  commitInlineEdit: (id, label) => {
    const trimmed = label.trim();
    if (trimmed) get().updateNodeData(id, { label: trimmed });
    set({ editingNodeId: null });
  },
  cancelInlineEdit: () => set({ editingNodeId: null }),
```

Also add `editingNodeId: null` to the `reset` defaults isn't required (setState merges), but tests rely on `seed` — leave as is.

- [ ] **Step 3b: Add the inline editor to SOVERNNode**

In `src/components/nodes/SOVERNNode.tsx`, replace the title block:

```tsx
        {/* Title — clamp, иначе тикеты раздувают карту */}
        <div className="font-bold text-sm text-primary leading-tight line-clamp-3">
          {data.label}
        </div>
```

with an editing-aware version. Add imports at top:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
```

Change the component signature to capture `id`:

```tsx
export const SOVERNNode = ({ id, data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
```

Inside the component body (after `accentColor`):

```tsx
  const editing = useWorkflowStore((s) => s.editingNodeId === id);
  const commit = useWorkflowStore((s) => s.commitInlineEdit);
  const cancel = useWorkflowStore((s) => s.cancelInlineEdit);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) { setDraft(data.label); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, data.label]);
```

Replace the title block with:

```tsx
        {editing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(id, draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(id, draft); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              e.stopPropagation();
            }}
            className="nodrag nopan font-bold text-sm text-primary leading-tight bg-surface-2 border border-accent rounded-md p-1 w-full resize-none outline-none"
            rows={2}
          />
        ) : (
          <div
            className="font-bold text-sm text-primary leading-tight line-clamp-3 cursor-text"
            onDoubleClick={() => useWorkflowStore.getState().beginInlineEdit(id)}
          >
            {data.label}
          </div>
        )}
```

- [ ] **Step 4: Build + run all tests (covers Tasks 4 & 5)**

Run: `npm run build && npx vitest run`
Expected: build exit 0 (keyboard hook now resolves `beginInlineEdit`/`cancelInlineEdit`), tests PASS.

- [ ] **Step 5: Commit (Tasks 4 + 5)**

```bash
git add src/hooks/useGraphKeyboard.ts src/components/nodes/SOVERNNode.tsx src/store/useWorkflowStore.ts src/store/authoring.test.ts src/App.tsx
git commit -m "feat(edit): keyboard authoring hook + inline node editing"
```

---

## Task 6: Undo / Redo via zundo

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Modify: `src/hooks/useGraphKeyboard.ts`
- Test: `src/store/undo.test.ts`

- [ ] **Step 1: Install zundo**

Run: `npm i zundo`
Expected: adds `zundo` to dependencies.

- [ ] **Step 2: Write failing test**

Create `src/store/undo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [{ id: 'root', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'root', layer: 'human', status: 'active' } }] as any,
    edges: [],
    selectedNodeId: 'root',
    isEditing: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().resume();
});

describe('undo/redo', () => {
  it('undo reverses an addChildNode; redo re-applies it', () => {
    const before = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().addChildNode('root');
    expect(useWorkflowStore.getState().nodes.length).toBe(before + 1);

    useWorkflowStore.temporal.getState().undo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before);

    useWorkflowStore.temporal.getState().redo();
    expect(useWorkflowStore.getState().nodes.length).toBe(before + 1);
  });

  it('only tracks nodes/edges (changing viewMode does not create history)', () => {
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.getState().setViewMode('matrix');
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run src/store/undo.test.ts`
Expected: FAIL — `useWorkflowStore.temporal` undefined.

- [ ] **Step 4: Wrap the store with `temporal`**

In `src/store/useWorkflowStore.ts`:

Add imports:

```ts
import { temporal } from 'zundo';
import { shallow } from 'zustand/shallow';
```

Change the store creation from:

```ts
export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  ... // body
}));
```

to the curried + middleware form:

```ts
export const useWorkflowStore = create<WorkflowState>()(
  temporal(
    (set, get) => ({
      ... // SAME body, unchanged
    }),
    {
      partialize: (s) => ({ nodes: s.nodes, edges: s.edges }),
      limit: 100,
      equality: (a, b) => shallow(a.nodes, b.nodes) && shallow(a.edges, b.edges),
    },
  ),
);
```

> The `()` after `create<WorkflowState>` is required for middleware typing in zustand v5. The store body is unchanged — only the wrapper.

- [ ] **Step 5: Pause history outside Edit Mode; clear/resume on enter; pause on exit**

Update `enterEditMode` / `exitEditMode` in the store body:

```ts
  enterEditMode: () => {
    if (get().isEditing) return;
    set({ isEditing: true });
    useWorkflowStore.temporal.getState().clear();
    useWorkflowStore.temporal.getState().resume();
  },
  exitEditMode: () => {
    set({ isEditing: false });
    useWorkflowStore.temporal.getState().pause();
    useWorkflowStore.temporal.getState().clear();
  },
```

At the end of the file (after the `create` call), pause by default so the board poll's churn never records history:

```ts
// History is meaningful only during hand-editing; stay paused until enterEditMode.
useWorkflowStore.temporal.getState().pause();
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run src/store/undo.test.ts`
Expected: PASS. (The test calls `resume()` in `beforeEach` to exercise tracking directly.)

- [ ] **Step 7: Add undo/redo keybindings**

In `src/hooks/useGraphKeyboard.ts`, inside `onKey`, before the `Tab` branch:

```ts
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().redo();
        return;
      }
```

- [ ] **Step 8: Build + full test run**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/store/useWorkflowStore.ts src/hooks/useGraphKeyboard.ts src/store/undo.test.ts
git commit -m "feat(undo): zundo temporal undo/redo scoped to edit sessions + Ctrl+Z/Y keys"
```

---

## Task 7: Autosave + workspace load

**Files:**
- Modify: `src/utils/persistence.ts`
- Create: `src/hooks/useAutosave.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add workspace save/load to persistence**

In `src/utils/persistence.ts`, add a constant and two functions (inside `usePersistence`, alongside `saveToFile`):

```ts
  const WORKSPACE_KEY = 'sovern-workspace';

  const saveWorkspace = async () => {
    const canvasData = toJSONCanvas(nodes.filter((n) => n.type !== 'lane'), edges);
    const json = JSON.stringify(canvasData, null, 2);
    if (!isTauri()) {
      try { localStorage.setItem(WORKSPACE_KEY, json); } catch { /* quota — ignore */ }
      return;
    }
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeTextFile(await join(dir, 'workspace.canvas'), json);
  };

  const loadWorkspace = async () => {
    let json: string | null = null;
    if (!isTauri()) {
      json = localStorage.getItem(WORKSPACE_KEY);
    } else {
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const path = await join(await appDataDir(), 'workspace.canvas');
      if (await exists(path)) json = await readTextFile(path);
    }
    if (!json) return false;
    const { nodes: ln, edges: le } = fromJSONCanvas(JSON.parse(json));
    setNodes(ln);
    setEdges(le);
    return true;
  };
```

Add to the returned object: `return { saveToFile, loadFromFile, saveWorkspace, loadWorkspace };`

- [ ] **Step 2: Create the autosave hook**

Create `src/hooks/useAutosave.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { usePersistence } from '../utils/persistence';

export type SaveState = 'idle' | 'saving' | 'saved';

/** Debounced autosave to the workspace file, active only while editing. */
export function useAutosave(): SaveState {
  const { saveWorkspace } = usePersistence();
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isEditing) return;
    setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveWorkspace();
      setState('saved');
    }, 800);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isEditing]);

  return state;
}
```

- [ ] **Step 3: Wire autosave + workspace open in App.tsx**

In `src/App.tsx`:

Add import:

```tsx
import { useAutosave } from './hooks/useAutosave';
```

Replace the `saveState` placeholder line from Task 1:

```tsx
  const [saveState] = useState<'idle' | 'saving' | 'saved'>('idle');
```

with:

```tsx
  const saveState = useAutosave();
```

Destructure `loadWorkspace` from persistence:

```tsx
  const { saveToFile, loadFromFile, loadWorkspace } = usePersistence();
```

Add an "Open workspace" button in the file-button group (next to `loadFromFile`), import `History` icon from lucide-react and add:

```tsx
            <button onClick={loadWorkspace} title="Open my workspace" className="p-2.5 text-secondary hover:text-orange-400"><History size={18} /></button>
```

- [ ] **Step 4: Build + tests**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/persistence.ts src/hooks/useAutosave.ts src/App.tsx
git commit -m "feat(autosave): debounced workspace autosave + open-workspace; never touches board.canvas"
```

---

## Task 8: Fold / collapse subtrees

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Modify: `src/components/nodes/SOVERNNode.tsx`
- Modify: `src/App.tsx`
- Test: `src/store/fold.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/store/fold.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';
import { selectVisibleNodes } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'a', layer: 'human', status: 'active' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'b', layer: 'boss', status: 'active' } },
      { id: 'c', type: 'sovern', position: { x: 0, y: 200 }, data: { label: 'c', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-a-b', source: 'a', target: 'b' }, { id: 'e-b-c', source: 'b', target: 'c' }],
    collapsedIds: [],
  });
});

describe('fold', () => {
  it('toggleCollapse hides all descendants', () => {
    useWorkflowStore.getState().toggleCollapse('a');
    const visible = selectVisibleNodes(useWorkflowStore.getState());
    const hidden = visible.filter((n) => n.hidden).map((n) => n.id).sort();
    expect(hidden).toEqual(['b', 'c']);
  });

  it('toggleCollapse twice restores visibility', () => {
    useWorkflowStore.getState().toggleCollapse('a');
    useWorkflowStore.getState().toggleCollapse('a');
    const visible = selectVisibleNodes(useWorkflowStore.getState());
    expect(visible.every((n) => !n.hidden)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/store/fold.test.ts`
Expected: FAIL — `collapsedIds`/`toggleCollapse`/`selectVisibleNodes` undefined.

- [ ] **Step 3: Add fold state + selectors**

In `src/store/useWorkflowStore.ts` add to interface:

```ts
  collapsedIds: string[];
  toggleCollapse: (id: string) => void;
```

In the store body:

```ts
  collapsedIds: [],
  toggleCollapse: (id) => {
    const set0 = new Set(get().collapsedIds);
    set0.has(id) ? set0.delete(id) : set0.add(id);
    set({ collapsedIds: [...set0] });
  },
```

At the end of the file (after the temporal pause line), export pure selectors using the tree helper. Add `getDescendants` is already imported:

```ts
import type { Node, Edge } from '@xyflow/react'; // ensure Node/Edge types available (already imported above)

/** Nodes with `hidden` set for every descendant of a collapsed node. */
export function selectVisibleNodes(s: { nodes: any[]; edges: any[]; collapsedIds: string[] }) {
  if (s.collapsedIds.length === 0) return s.nodes;
  const hidden = new Set<string>();
  s.collapsedIds.forEach((id) => getDescendants(id, s.edges as Edge[]).forEach((d) => hidden.add(d)));
  return s.nodes.map((n) => (hidden.has(n.id) ? { ...n, hidden: true } : n.hidden ? { ...n, hidden: false } : n));
}

/** Edges hidden when either endpoint is hidden. */
export function selectVisibleEdges(s: { nodes: any[]; edges: any[]; collapsedIds: string[] }) {
  if (s.collapsedIds.length === 0) return s.edges;
  const hidden = new Set<string>();
  s.collapsedIds.forEach((id) => getDescendants(id, s.edges as Edge[]).forEach((d) => hidden.add(d)));
  return s.edges.map((e) =>
    hidden.has(e.source) || hidden.has(e.target) ? { ...e, hidden: true } : e.hidden ? { ...e, hidden: false } : e,
  );
}
```

> Remove the redundant `import type { Node, Edge }` line if `Node`/`Edge` are already imported at the top (they are, from `@xyflow/react`). Use the existing import.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/store/fold.test.ts`
Expected: PASS.

- [ ] **Step 5: Add fold chevron + count badge to SOVERNNode**

In `src/components/nodes/SOVERNNode.tsx`, add imports for the icon + helpers:

```tsx
import { ChevronRight, ChevronDown } from 'lucide-react';
import { getChildren, getDescendants } from '../../utils/tree';
```

Inside the component body:

```tsx
  const collapsed = useWorkflowStore((s) => s.collapsedIds.includes(id));
  const edges = useWorkflowStore((s) => s.edges);
  const toggleCollapse = useWorkflowStore((s) => s.toggleCollapse);
  const hasChildren = getChildren(id, edges).length > 0;
  const descCount = collapsed ? getDescendants(id, edges).length : 0;
```

In the header row (inside the `flex items-center justify-between mb-2` div), before the status dot, add the chevron:

```tsx
          {hasChildren && (
            <button
              className="nodrag nopan mr-1 text-muted hover:text-primary"
              onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
```

After the title block, add a collapsed-count badge:

```tsx
        {collapsed && descCount > 0 && (
          <span className="mt-1 inline-block w-fit text-[10px] font-bold text-muted bg-surface-2 px-2 py-0.5 rounded-full border border-edge">
            +{descCount} hidden
          </span>
        )}
```

- [ ] **Step 6: Feed visible nodes/edges to ReactFlow in App.tsx**

In `src/App.tsx`, add imports:

```tsx
import { selectVisibleNodes, selectVisibleEdges } from './store/useWorkflowStore';
```

Add `collapsedIds` to the destructured store values, then derive visible sets. After the `displayEdges` computation, change the `<ReactFlow>` props to use folded sets:

```tsx
  const collapsedIds = useWorkflowStore((s) => s.collapsedIds);
  const visibleNodes = selectVisibleNodes({ nodes, edges, collapsedIds });
  const visibleDisplayEdges = selectVisibleEdges({ nodes, edges: displayEdges, collapsedIds });
```

Update the `<ReactFlow nodes={...} edges={...}>` to:

```tsx
        nodes={visibleNodes}
        edges={visibleDisplayEdges}
```

- [ ] **Step 7: Build + tests**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/store/useWorkflowStore.ts src/components/nodes/SOVERNNode.tsx src/App.tsx src/store/fold.test.ts
git commit -m "feat(fold): collapse/expand subtrees with hidden-descendant derivation + count badge"
```

---

## Task 9: Copy / paste subtree

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Modify: `src/hooks/useGraphKeyboard.ts`
- Test: `src/store/clipboard.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/store/clipboard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';
import { getChildren } from '../utils/tree';

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'a', layer: 'human', status: 'active' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 100 }, data: { label: 'b', layer: 'boss', status: 'active' } },
      { id: 'c', type: 'sovern', position: { x: 0, y: 200 }, data: { label: 'c', layer: 'boss', status: 'active' } },
    ] as any,
    edges: [{ id: 'e-a-b', source: 'a', target: 'b' }, { id: 'e-b-c', source: 'b', target: 'c' }],
    selectedNodeId: null,
    clipboard: null,
    isEditing: false,
  });
});

describe('copy/paste subtree', () => {
  it('copySubtree fills clipboard with cloned nodes/edges', () => {
    useWorkflowStore.getState().copySubtree('b');
    const clip = useWorkflowStore.getState().clipboard!;
    expect(clip.nodes).toHaveLength(2); // b + c
    expect(clip.edges).toHaveLength(1);
  });

  it('pasteSubtree under a target adds clone and links it to the target', () => {
    const beforeNodes = useWorkflowStore.getState().nodes.length;
    useWorkflowStore.getState().copySubtree('b');
    useWorkflowStore.getState().pasteSubtree('a');
    const { nodes, edges } = useWorkflowStore.getState();
    expect(nodes.length).toBe(beforeNodes + 2);
    // 'a' now has an extra child (the cloned 'b' root)
    expect(getChildren('a', edges).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/store/clipboard.test.ts`
Expected: FAIL — `clipboard`/`copySubtree` undefined.

- [ ] **Step 3: Add clipboard state + actions**

In `src/store/useWorkflowStore.ts`, ensure `cloneSubtree` is imported:

```ts
import { getDescendants, getParent, cloneSubtree } from '../utils/tree';
```

Add to interface:

```ts
  clipboard: { nodes: Node<SOVERNNodeData>[]; edges: Edge[]; rootId: string } | null;
  copySubtree: (id: string) => void;
  pasteSubtree: (targetParentId?: string) => void;
```

In the store body:

```ts
  clipboard: null,
  copySubtree: (id) => {
    const { nodes, edges, rootId } = cloneSubtree(id, get().nodes, get().edges);
    set({ clipboard: { nodes: nodes as any, edges, rootId } });
  },
  pasteSubtree: (targetParentId) => {
    const clip = get().clipboard;
    if (!clip) return;
    get().enterEditMode();
    // re-clone so repeated pastes get fresh ids each time
    const seed = { nodes: [...clip.nodes], edges: [...clip.edges], rootId: clip.rootId };
    const linkEdge = targetParentId
      ? [{ id: `e-${targetParentId}-${seed.rootId}`, source: targetParentId, target: seed.rootId }]
      : [];
    set({
      nodes: [...get().nodes, ...seed.nodes],
      edges: [...get().edges, ...seed.edges, ...linkEdge],
      selectedNodeId: seed.rootId,
    });
    // refresh clipboard with new ids so a subsequent paste won't collide
    get().copySubtree(seed.rootId);
    get().autoLayout();
  },
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/store/clipboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Add copy/paste keybindings**

In `src/hooks/useGraphKeyboard.ts`, inside `onKey` after the undo/redo block:

```ts
      if (mod && e.key.toLowerCase() === 'c' && id && !isTextTarget(document.activeElement)) {
        s.copySubtree(id);
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        s.pasteSubtree(id ?? undefined);
        return;
      }
```

- [ ] **Step 6: Build + full test run**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/useWorkflowStore.ts src/hooks/useGraphKeyboard.ts src/store/clipboard.test.ts
git commit -m "feat(clipboard): copy/paste subtree with fresh ids + Ctrl+C/V"
```

---

## Final verification

- [ ] Run full suite: `npm run build && npx vitest run` — build exit 0, all tests green.
- [ ] Manual smoke (Tauri dev or browser): select a node → `Tab` adds a child in edit mode (banner appears, poll frozen) → type label, `Enter` commits → `Ctrl+Z` undoes → collapse a branch (chevron) → `Ctrl+C`/`Ctrl+V` duplicates → `Done` resumes the live board → reopen via "Open my workspace".
- [ ] Confirm `board.canvas` is never written (only `workspace.canvas` / localStorage).

## Self-Review Notes (author)

- **Spec coverage:** Edit Mode + freeze (Task 1) ✓; keyboard authoring (Tasks 3–4) ✓; undo/redo (Task 6) ✓; inline editing (Task 5) ✓; autosave + workspace file (Task 7) ✓; fold (Task 8) ✓; copy/paste (Task 9) ✓; tree helpers (Task 2) ✓.
- **Cross-task type consistency:** `addChildNode`/`addSiblingNode` return `string`; `beginInlineEdit(id)` consumed by keyboard hook; `selectVisibleNodes/Edges` signature matches App.tsx usage; `cloneSubtree` returns `{nodes,edges,rootId}` consumed by `copySubtree`/`pasteSubtree`.
- **Dependency ordering:** Task 4 (keyboard) references `beginInlineEdit`/`cancelInlineEdit` defined in Task 5 — build/commit deliberately deferred to end of Task 5.
