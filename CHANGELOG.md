# Changelog - SOVERN MindMap Control Plane

All notable changes to this project will be documented in this file.

## [v1.0.0-alpha.9] - 2026-06-24

### 🚀 Added — Drag-from-library (slice 10)
- **Drag-from-library:** a persistent, collapsible **shape library** rail is pinned to the left edge of the MindMap canvas (the 26 swatches in *Basic* / *Home AI-lab* groups, driven by the same `SHAPE_GROUPS` registry as the sidebar picker). **Drag a swatch onto the canvas** to create a brand-new standalone shape node at the drop point — the canonical React Flow HTML5 drag-and-drop (`dataTransfer` under a private `application/sovern-shape` MIME → canvas `onDrop` → `screenToFlowPosition` → a new `addShapeNode` store action). The node is labelled with the humanized shape kind (`server` → "Server"), selected, and added in **one undo step**; its drop coordinates are preserved (rollup recalc runs under `withoutHistory`, no auto-layout stomp). This closes the last authoring gap from slice 9 (which could only *retype* an existing node) — you can now author a node from nothing, completing the Lucidchart/draw.io "drag a shape from the left panel" paradigm. Drag-create is **MindMap-only** (Diagram force-re-layouts and disables node dragging; Learn/Presentation are read-only); foreign drags (files, text) are ignored via a `SHAPE_KINDS` membership guard.

### 🧪 Tests
- 9 new tests (`humanizeShape` unit, `addShapeNode` store, `ShapeLibrary` component on the React-19 `act` harness). Full suite **161** green; verified live (Playwright synthetic HTML5 DnD: drag → standalone node at drop spot → single-undo revert → library hidden in Diagram view).

## [v1.0.0-alpha.8] - 2026-06-23

### 🚀 Added — Home AI-lab shape pack (slice 8) + manual shape picker (slice 9)
- **Home AI-lab shape pack (slice 8):** +14 `icon`-mode shapes on top of the original 12 (vocabulary now **26**) — compute (`server` · `gpu` · `workstation` · `laptop` · `storage`), networking (`router` · `switch` · `firewall` · `wifi`) and ML-software (`model` · `agent` · `vector-store` · `gateway` · `container`), rendered via the existing lucide `icon` mode (no `ShapeNode` change). The generation prompt gains a **scope-guarded** "Home AI-lab infrastructure" section + a home-lab few-shot so the AI uses them only for compute/network/ML diagrams, never ordinary flowcharts. `.drawio` round-trip preserves the new shapes via an `mmShape=<kind>` style marker (foreign drawio degrades to a rounded rect). Public-cloud icon sets (AWS/Azure/GCP) deliberately out of scope — the project serves a home lab.
- **Manual shape picker (slice 9):** select a node → a **Shape palette** appears in the sidebar (26 swatches in *Basic* / *Home AI-lab* groups, driven by the same `SHAPE_GEOMETRY` registry). Clicking a swatch converts the node to that diagram shape — a new `setNodeShape` store action flips the React Flow `type` to `shape` and sets `data.shape` in **one undoable step** (enters Edit Mode to freeze the live poll; node data is merged, not replaced; round-trips via `mm:shape`). Closes the gap where hand-authored nodes were stuck as rectangles. Drag-from-library node creation remains a future slice.

### 🧪 Tests
- Component render tests run on React 19's built-in `act` + `react-dom/client` (no `@testing-library` dependency); `vitest` `include` widened to `*.test.{ts,tsx}`. Full suite **154** tests green; `prompt → home-lab diagram` verified live against the real LiteLLM gateway, and the picker verified live (render → convert → single-undo revert).

## [v1.0.0-alpha.7] - 2026-06-17

### 🚀 Added — Export suite (slices 5–7)
- **Export HTML (slice 5):** one self-contained interactive `.html` of the canvas — `html-to-image` `toSvg` snapshot captured in **both themes** + a vanilla pan/zoom + dark/light shell. Shared `computeExportViewport` + `saveFile` extracted from the PNG export (DRY).
- **Export `.drawio` (slice 6):** pure mxGraph serializer (`canvasToDrawio`) maps shapes back via `mapShapeToDrawioStyle` (inverse of the import map; `mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s` for all 12) — opens editable in real draw.io. Completes the import↔export round-trip (proven by an integration test through the real import pipeline, and verified in real draw.io via its CLI).
- **Export Learn HTML (slice 7):** bake the Learn-mode walkthrough into a self-contained `.html` — drives Learn mode through steps 1..N, captures each as a **transparent** SVG frame, embeds them in a pure frame-switcher shell (prev/next + per-step narration + a **neutral hybrid background** that reads on light and dark host pages). The authoring-time bridge for embedding a step-through in an LMS unit via `<iframe>`.

### 🔒 Security
- Every exported HTML references **no external resources**; labels, narration and titles are HTML/XML-escaped; no user/graph data is interpolated into any inline `<script>`.

## [v1.0.0-alpha.6] - 2026-06-17

### 🚀 Added — Learn mode (slice 3) + `.drawio` import (slice 4)
- **Learn mode (slice 3):** a read-only step-through — cumulative node reveal + per-step narration + `→`/`←`/`Space`. Step order + narration ride in JSON Canvas metadata (`mm:step` / `mm:note`), filled by the AI generator or falling back to a deterministic BFS from the graph roots. The current step is accent-ringed; the view re-frames each step.
- **Import `.drawio` (slice 4):** load an existing draw.io file (compressed deflate-raw or uncompressed "Edit Diagram" XML, first page) onto the canvas — vertices/edges/labels with **real coordinates preserved**; styles best-effort-mapped to the 12 shapes (unknown → rectangle). Native `DOMParser` + `DecompressionStream('deflate-raw')`, zero new dependencies.

### 🛠️ Fixed
- **Learn mode is strictly read-only:** the editor's authoring keys, node dragging and selection are gated off (a stray keypress can't mutate the graph or undo history), and lane backgrounds are excluded from the step order.
- **`.drawio` import** drops draw.io group wrappers and edge-label child cells (no phantom rectangles at 0,0) and resolves nested-child coordinates to absolute by walking the `parent` chain.

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
