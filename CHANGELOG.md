# Changelog - SOVERN MindMap Control Plane

All notable changes to this project will be documented in this file.

## [v1.0.0-alpha.5] - 2026-06-17

### 🚀 Added — Richer shape vocabulary (AI-canvas slice 2)
- **12 shapes:** added `cylinder` (datastore), `ellipse`, `parallelogram` (I/O), `hexagon`, `cloud` (external service), `actor` (user/role), `document` to the original 5 — rendered via a `shapeGeometry` registry (CSS border-radius / stretched SVG silhouette / lucide icon).
- **Richer generation:** the prompt now teaches all 12 shapes with usage guidance + a multi-shape few-shot, so `prompt → diagram` produces databases, clouds, actors, decisions, etc.
- **Single source of truth:** `SHAPE_KINDS` in `src/types/index.ts` derives the `shape` union, the `extractCanvas` allow-list, and a drift-guard test — no more silent drift between the three.

## [v1.0.0-alpha.4] - 2026-06-16

### 🚀 Added — AI Canvas foundation (slice 1) + hand editing
- **AI Canvas:** a prompt bar generates an **editable diagram on the same canvas** — LiteLLM gateway (dev-proxied at `/llm`, key injected server-side, never bundled) → `extractCanvas` (normalize/repair untrusted LLM output) → native **JSON Canvas** interchange → shapes appended as one **undoable** Edit-Mode edit with dagre layout.
- **Generic shape node:** new `shape` React Flow node type (`mm:shape` metadata), the foundation for "one canvas, invisible backends."
- **Hand editing:** keyboard authoring (`Tab`=child, `Enter`=sibling, `F2`/double-click=rename, `Delete`=cascade), **undo/redo** (zundo; one step per structural edit), inline node editing, **fold/collapse** subtrees + count badge, **copy/paste** subtree, and debounced **autosave to a separate workspace file** (never `board.canvas`).
- **Edit Mode:** the first hand-edit freezes the 3 s board poll so edits aren't clobbered; a banner shows the paused state; "Done" flushes a final save and resumes the live board.

### 🛠️ Fixed
- Generated diagrams and inline-edit commits are a **single undo step** (derived re-layout/rollup wrapped in `withoutHistory`); React Flow's internal node-change churn no longer pollutes undo history.
- `extractCanvas` hardened against adversarial LLM output (non-object nodes, numeric ids, primitive metadata, array roots).
- **Tauri:** granted `fs` write to `$APPDATA` so desktop workspace autosave actually works (`fs:default` is read-only for app dirs).

## [v1.0.0-alpha.3] - 2026-06-11

### 🚀 Added
- **Theming:** Dark / Light / System modes with persistence, built on a semantic CSS-variable layer.
- **Design Tokens:** Upload **W3C Design Tokens JSON** (Figma / Style Dictionary) to override theme colors; one-click reset to default.
- **Diagram View:** Fifth view mode — strict org-chart **tree** and dependency **swimlanes** (one lane per layer), orthogonal arrowed edges, plus a read-only **presentation mode**.
- **PNG Export:** Full-graph fit-to-content export for canvas views (MindMap / Diagram) and snapshot export for DOM views (Kanban / Matrix / Timeline), in both Tauri and browser.
- **Tests:** Vitest infrastructure with unit coverage for the theme store, palette helpers, token parser, and diagram layouts.

### 🛠️ Fixed
- **Dagre Layout:** Graph instance is now created per call instead of a module singleton — no more stale node/edge accumulation across layouts.

## [v1.0.0-alpha.2] - 2026-05-07

### 🚀 Added
- **Kanban Board View:** New status-oriented layout with perfect column alignment.
- **Tokens-First Economy:** Switched from currency to **AI Tokens** with recursive roll-up logic.
- **Pronounced Grid UI:** High-visibility background grid and enhanced Dark Mode contrast.
- **Environment Awareness:** Added `isTauri()` checks to prevent browser crashes when accessing desktop features.
- **Real Project Data:** Updated all initial nodes with realistic dates and estimated token budgets.

### 🛠️ Fixed
- **Critical Fix:** Resolved the "White Page" crash caused by a missing `autoLayout` reference.
- **Kanban Alignment:** Corrected the centering of 200px cards within 320px columns.
- **Browser Resilience:** Implemented Dynamic Imports for Tauri plugins to allow safe execution in non-desktop environments.
- **UI Polish:** Increased z-index for the diagnostic Top Bar and improved "active" node animations.

## [v1.0.0-alpha.1] - 2026-05-06

### 🚀 Added
- **Initial Core:** Tauri 2.0 / React / TS Scaffold.
- **Multimodal Visualization:** MindMap, 2x2 Matrix, and Timeline Roadmap.
- **PM Engine:** Basic recursive budget and date roll-up logic.
- **Obsidian Connectivity:** JSON Canvas serialization/deserialization.
- **Agent Integration:** Functional MCP Server with 4 core tools.
- **Interaction:** Glassmorphism Node Detail Sidebar for live editing.

---
**Alexander (Solo Vibe Coder) · SOVERN v3.3**
