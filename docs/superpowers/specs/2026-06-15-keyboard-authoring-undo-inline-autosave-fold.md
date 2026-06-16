# Design: Keyboard Authoring, Undo/Redo, Inline Editing, Autosave, Fold + Copy/Paste

**Date:** 2026-06-15
**Project:** sovern-mindmap (SOVERN MindMap Control Plane)
**Status:** Approved by user (brainstorming session 2026-06-15)
**Source:** UX patterns borrowed from [drichard/mindmaps](https://github.com/drichard/mindmaps) (AGPL-3.0, no code reused — concepts only)

## Goal

Add five editing-UX features so the user can author/edit maps by hand, while the app
remains **view-first** (its primary job is showing the auto-refreshing live board):

1. **Keyboard node authoring** — `Tab` = child, `Enter` = sibling, `F2`/double-click = rename, `Delete` = remove.
2. **Undo/Redo** — `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`) for all structural edits.
3. **Inline node editing** — edit a node's label on the node itself, not in the side panel.
4. **Autosave** — debounced silent save of hand-edits to a **separate workspace file**, never to `board.canvas`.
5. **Fold/collapse subtrees + copy/paste subtree** — collapse a branch to one node; copy a whole subtree.

## Locked decisions (from brainstorming)

- **View-first, edit-on-demand.** App boots in live mode (polling `/board.canvas` every 3 s) exactly as today.
- **First edit action enters Edit Mode**, which **pauses polling** so in-flight edits are never clobbered by the 3 s wholesale `setNodes/setEdges` replacement in `useBoardSync.ts`. A banner shows the paused state. Exiting Edit Mode resumes the live board.
- **Autosave targets a separate workspace file**, not `board.canvas`. Hand-edits can never corrupt what mc_hub generates. (Tauri: app-data dir; browser: `localStorage`.)
- On **exit Edit Mode**, the live board resumes and re-replaces the view; the user's edits remain saved in the workspace file (and recoverable via a manual "Open workspace" action). This is acceptable because the user is a viewer, not a primary author.

## Current State (constraints discovered)

- Stack: Tauri 2, React 19, Vite 7, Tailwind v4, @xyflow/react 12, dagre, Zustand 5, vitest/jsdom.
- `useWorkflowStore` has **no user-facing create/delete** node actions. CRUD logic lives only in `GraphManager` (used by the MCP server, not wired to the UI).
- `useBoardSync.ts` polls every `POLL_MS=3000`; on raw-text change it does `store.setNodes(nodes); store.setEdges(edges); store.setViewMode(...)` — a full replacement that would erase local edits and any undo history.
- `persistence.ts` has `saveToFile`/`loadFromFile` (Tauri dialogs, browser shows an alert). Reusable converter: `toJSONCanvas(nodes.filter(n => n.type !== 'lane'), edges)`.
- Tests: vitest + jsdom present (added in prior feature). Follow same pattern.

---

## 1. Edit Mode + poll coexistence

New store state in `useWorkflowStore`:

```ts
isEditing: boolean;            // false on boot
enterEditMode(): void;         // set true; called implicitly by first authoring action
exitEditMode(): void;          // set false; clears undo history; resumes polling
```

`useBoardSync.ts` change — at the top of each `tick`, before applying a detected change:

```ts
if (useWorkflowStore.getState().isEditing) {
  // do NOT apply; do NOT advance lastText, so the change is re-detected on exit
  schedule next tick;
  return;
}
```

This keeps the live board frozen while editing and re-syncs once the user is done. First-load
detection (`onFirstLoad`) is unaffected (it runs before any edit can happen).

UI: a small banner / pill (top bar) — **"🔵 Editing — live updates paused"** with a **Done** button calling `exitEditMode()`. Rendered in `App.tsx` controls area, theme-token styled (`--accent`, `--bg-surface`).

## 2. Keyboard node authoring

New pure store actions (reuse `GraphManager` semantics so MCP + UI stay consistent):

```ts
addChildNode(parentId: string): string      // create node + edge e-${parent}-${id}; select+edit new; returns id
addSiblingNode(nodeId: string): string       // find parent via incoming edge; addChild(parent); root → child fallback
deleteNodeCascade(nodeId: string): void       // remove node + its descendants + touching edges
beginInlineEdit(nodeId: string): void         // sets editingNodeId
```

- New nodes get id `n-${crypto.randomUUID()}`, default `data.label` = `"New node"`, placed via existing `autoLayout()` (dagre) so they don't overlap; positions recomputed after structural change.
- Each of these calls `enterEditMode()` first (idempotent).

Keyboard handler: a `useGraphKeyboard()` hook attached to the React Flow pane wrapper in `App.tsx`. Active only in `mindmap`/`diagram` canvas views; **disabled while an inline editor or text input is focused** (guard on `document.activeElement`).

| Key | Action | Requires selection |
|-----|--------|--------------------|
| `Tab` | `addChildNode(selected)` then inline-edit | yes |
| `Enter` | `addSiblingNode(selected)` then inline-edit | yes |
| `F2` | `beginInlineEdit(selected)` | yes |
| `Delete` / `Backspace` | `deleteNodeCascade(selected)` (with confirm if it has children) | yes |
| `Escape` | clear selection / cancel inline edit | — |

`Tab`/`Enter` call `preventDefault()` to stop focus traversal / browser defaults.

## 3. Undo / Redo

**Approach: `zundo` temporal middleware** on `useWorkflowStore` (chosen over a hand-rolled Command stack — less code, battle-tested, integrates with Zustand).

- `temporal(..., { partialize: (s) => ({ nodes: s.nodes, edges: s.edges }), limit: 100, equality: shallow })` — track **only** `nodes`/`edges`, never `viewMode`/`selectedNodeId`/`isEditing`.
- The temporal store is **paused while not in Edit Mode** (`store.temporal.getState().pause()` on boot) and **resumed + cleared on `enterEditMode()`**, so the board poll's churn never enters history and undo always starts clean per edit session. `exitEditMode()` pauses + clears again.
- Keyboard: `Ctrl/Cmd+Z` → `undo()`; `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` → `redo()`. Wired in `useGraphKeyboard`.
- Optional toolbar undo/redo buttons (disabled when stacks empty) — nice-to-have, can land with the feature.

Dependency: `npm i zundo` (peer: zustand — already present).

## 4. Inline node editing

Edit the label directly on `SOVERNNode` (and any other editable node types).

- Store: `editingNodeId: string | null`, `beginInlineEdit(id)`, `commitInlineEdit(id, label)`, `cancelInlineEdit()`.
- `SOVERNNode` renders an `<input>`/`<textarea>` (auto-focused, text selected) instead of the static label when `editingNodeId === node.id`.
- Commit on `Enter` or blur → `updateNodeData(id, { label })`; cancel on `Escape` (restores previous). Commit/cancel both clear `editingNodeId`.
- Double-click a node → `beginInlineEdit`. `nodrag nopan` class on the editor so typing/selection doesn't pan the canvas.
- Reuses existing `updateNodeData` (already records into nodes → captured by zundo).

## 5. Autosave + workspace persistence

- New `useAutosave()` hook: subscribes to `nodes`/`edges`; when `isEditing`, debounces (~800 ms) and writes a snapshot.
  - **Tauri:** `@tauri-apps/api/path` appDataDir → `workspace.canvas`; `writeTextFile(JSON.stringify(toJSONCanvas(nodes.filter(n=>n.type!=='lane'), edges), null, 2))`.
  - **Browser:** `localStorage['sovern-workspace']` with the same JSON (fallback so the feature works in the web build too).
- Never writes `board.canvas`.
- A small **"Saved ✓ / Saving…"** indicator next to the Edit banner.
- Manual recovery: extend `usePersistence` with `loadWorkspace()` (reads the workspace file/localStorage) and surface an **"Open my workspace"** menu item. Existing `saveToFile` (explicit "Save As") stays for exporting elsewhere.

## 6. Fold / collapse + copy/paste subtree

**Tree helpers** — new `src/utils/tree.ts` (pure, unit-tested):

```ts
getChildren(id, edges): string[]
getDescendants(id, edges): string[]          // BFS/DFS over outgoing edges, cycle-guarded
getParent(id, edges): string | undefined
cloneSubtree(rootId, nodes, edges): { nodes, edges }  // deep copy with fresh ids, offset positions
```

**Fold:**
- Store: `collapsedIds: Set<string>` (serialize as array), `toggleCollapse(id)`.
- A node with children shows a fold toggle (chevron). Collapsing sets React Flow `hidden: true` on all descendants' nodes **and** their edges (computed in the store's node/edge derivation or a selector before passing to `<ReactFlow>`). Collapsed node gets a badge with descendant count.
- Fold state is per-session local UI state; **not** persisted into `board.canvas`. May be included in the workspace snapshot.

**Copy / paste subtree:**
- Store: `clipboard: { nodes, edges } | null`, `copySubtree(id)`, `pasteSubtree(targetParentId?)`.
- `Ctrl/Cmd+C` → `copySubtree(selected)` via `cloneSubtree` (stored with fresh ids ready to paste).
- `Ctrl/Cmd+V` → `pasteSubtree(selected ?? undefined)`: inserts the cloned nodes, links the clone root under the selected node (or as a new root), re-runs `autoLayout()`. Records into history (undoable).

---

## Out of scope (v1)

- Two-way write-back to `board.canvas` (user is a viewer; explicitly declined in brainstorming).
- Conflict resolution / merge when the board changes during a long edit session (we freeze + resume; edits live in the workspace file).
- Drag-to-reparent, multi-node marquee operations, collaborative editing.

## Testing plan

- **Unit (vitest):** `tree.ts` (descendants, clone with fresh ids, cycle guard); store actions (`addChildNode` creates node+edge, `deleteNodeCascade` removes subtree+edges, sibling parent resolution, paste re-ids); zundo undo/redo of a create→delete sequence; collapse hides exactly the descendant set.
- **Integration (jsdom):** `useBoardSync` does not apply a changed `board.canvas` while `isEditing`, and re-applies after `exitEditMode`. Inline edit commit/cancel updates/restores label.
- Build (`npm run build`) exit 0 + full `npm test` green before each task merge.

## Implementation order (for the plan)

1. Edit Mode state + `useBoardSync` freeze + banner.
2. `tree.ts` helpers (+ tests).
3. Store authoring actions (`addChild`/`addSibling`/`deleteCascade`/`updateNodeData` reuse) (+ tests).
4. `useGraphKeyboard` hook wiring (Tab/Enter/F2/Delete/Escape).
5. Inline node editing in `SOVERNNode` + store editing state.
6. zundo undo/redo + keyboard + history pause/clear lifecycle.
7. Autosave hook + workspace load + indicator.
8. Fold/collapse (toggle, hidden derivation, badge).
9. Copy/paste subtree (clipboard, clone, paste, keyboard).
