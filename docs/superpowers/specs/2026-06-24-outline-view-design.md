# Slice 13 — Outline / Document View — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Epic:** [Ayoa-Inspired Sovereign Canvas](../epics/2026-06-24-ayoa-inspired-sovereign-canvas-epic.md) — Phase 1, first slice.

## Goal

Turn the graph into a **linear, readable Markdown document** — a 6th on-screen
**Outline view** plus Copy / Save-`.md`. Supports the writing/LMS workflow and a
visual↔linear switch (neurodivergent-friendly). Read-only: the graph is still
edited on the canvas.

## Decisions (locked in brainstorming)

- **Form:** an on-screen Outline view (6th view) with Copy + Save-`.md`. Not
  export-only (we want the live switch); not two-way editing (the epic defers
  outline→graph editing as a stretch).
- **Markdown shape:** **hybrid** — each top-level root is a `# heading` (document
  section); its whole subtree renders as depth-indented `- bullets`. Robust on
  deep graphs (Markdown has only h1–h6) and reads like a document.
- **Order:** **DFS pre-order** (parent immediately before its subtree), the
  depth-first counterpart to the BFS `selectLearnOrder`.

## Architecture — one traversal, two renderers

A single DFS walk produces an intermediate row list; both the on-screen view and
the Markdown string render from it, so they can never drift.

### `selectOutlineRows({ nodes, edges }): OutlineRow[]`

Pure selector. `OutlineRow = { id: string; depth: number; label: string; note?: string; isRoot: boolean }` (depth 0 = root).

- **Roots:** nodes with in-degree 0 (same root detection as `selectLearnOrder`).
  If there are none (pure cycle), the root pass is empty and the totality sweep
  (below) emits every node — so the result is never empty for a non-empty graph.
- **Order:** iterate roots in node-array order; for each, DFS pre-order via
  `getChildren(id, edges)` (children in edge order). Emit a row on first visit.
- **Cycle-safe:** a `visited: Set<string>` guards re-entry; the walk always
  terminates.
- **Totality:** after the root pass, any still-unvisited node (e.g. a member of
  an isolated cycle with no in-degree-0 entry) is swept in node-array order, each
  as an additional `depth 0` root, then DFS'd — so no node is ever silently
  dropped (mirrors `selectLearnOrder`'s disconnected-node handling).
- **Lane exclusion:** nodes with `type === 'lane'` are skipped (they are
  decorative backgrounds, consistent with the export adapters).
- `label` = `node.data.label`; `note` = `node.data.note` if a non-empty string;
  `isRoot` = depth === 0.

### `outlineToMarkdown(rows: OutlineRow[]): string`

Pure. For each row:
- root → `# {label}`
- non-root → `{'  '.repeat(depth - 1)}- {label}` (two spaces per indent level)
- if `note` present → an italic continuation line at the row's indent:
  `{indent}  _{note}_`

Rows joined by `\n`. Blank line before each new root heading (except the first)
for document spacing. Labels/notes are emitted **as-is** (plain user text; no
Markdown-escaping gymnastics — a non-goal).

### `OutlineView` (`src/components/OutlineView.tsx`)

Reads `nodes` + `edges` from the store, computes `rows = selectOutlineRows(...)`,
and renders:
- a scrollable panel styled like the other DOM views (`KanbanBoard` etc.):
  surface background, padding, `custom-scrollbar`;
- each row: root → heading (`text-lg font-bold`, top margin); non-root → a bullet
  indented by `depth` (padding-left step); `note` → a muted italic line beneath;
- a header bar with **Copy** and **Save .md** buttons;
- empty graph (`rows.length === 0`) → a centered "Nothing to outline yet" placeholder.

**Copy:** `navigator.clipboard.writeText(outlineToMarkdown(rows))` → toast
"Outline copied". **Save .md:** `saveFile(outlineToMarkdown(rows), 'outline.md',
'text/markdown')` — the same adapter PNG/HTML/drawio exports use (Tauri save
dialog or browser download). The view receives a `notify` callback for toasts
(same pattern as the export buttons).

## View wiring (`App.tsx` + store)

- `ViewMode` (in `useWorkflowStore.ts`) gains `'outline'`.
- `App.tsx` `VIEW_BUTTONS` gets a 6th entry with a lucide `AlignLeft` icon and an
  active color class.
- Mounted as a DOM overlay beside the others:
  `{viewMode === 'outline' && <OutlineView notify={notify} />}`.
- No `setViewMode` branch needed — outline doesn't touch canvas positions (like
  matrix/timeline/kanban). `isCanvasView` already excludes it, so
  `useGraphKeyboard` stays off and canvas-only effects don't fire. The header +
  toolbar remain visible.

## Data flow

```
store {nodes, edges}
  → selectOutlineRows (DFS pre-order, lane-filtered, cycle-safe) → OutlineRow[]
      → on screen: rows → styled JSX (heading | indented bullet | italic note)
      → Copy / Save: outlineToMarkdown(rows) → clipboard / saveFile('outline.md')
```

Pure and re-derived each render — the outline updates live as the graph changes.

## Error / edge handling

- Empty graph → placeholder, Copy/Save emit an empty string harmlessly.
- Pure / isolated cycle → no in-degree-0 member, so the totality sweep emits its
  nodes as roots; visited-set guarantees termination.
- Disconnected components → each in-degree-0 node is its own `#` section; any node
  unreachable from a root is still emitted (it has in-degree 0 ⇒ it's a root).
- `navigator.clipboard` unavailable → Copy is best-effort; failure surfaces a
  toast, never throws.

## Testing

- **`selectOutlineRows`** (unit): DFS pre-order (assert a parent's row index is
  immediately followed by its first child, not a sibling — distinguishes DFS from
  BFS); correct `depth` / `isRoot`; multi-root ordering by array index; lane
  nodes excluded; cycle graph terminates; `note` carried through.
- **`outlineToMarkdown`** (unit): a fixture graph → exact expected string (roots
  `#`, 2-space-per-level `-`, italic note line, blank line between roots).
- **`OutlineView`** (React-19 `act` harness, no `@testing-library`): renders one
  heading per root + one bullet per non-root; clicking **Copy** calls a mocked
  `navigator.clipboard.writeText` with the markdown; empty graph shows the
  placeholder.

## Files

- **Create:** `src/utils/outline.ts` — `OutlineRow`, `selectOutlineRows`, `outlineToMarkdown`
- **Create:** `src/utils/outline.test.ts`
- **Create:** `src/components/OutlineView.tsx`
- **Create:** `src/components/OutlineView.test.tsx`
- **Modify:** `src/store/useWorkflowStore.ts` — add `'outline'` to `ViewMode`
- **Modify:** `src/App.tsx` — `VIEW_BUTTONS` entry + `<OutlineView />` overlay mount

## Global constraints

- No new dependencies (we own the JSX; no Markdown renderer lib).
- Read-only — no outline→graph editing (deferred per the epic).
- Reuses `getChildren` (tree.ts) and `saveFile` (export/saveFile.ts); lane
  exclusion consistent with the export adapters.
- Component tests use the React-19 `act` + `react-dom/client` harness; no
  `@testing-library`.
- MindMap/Diagram canvas behavior unchanged.
- Comments in english–russian mix per project convention.
