# DESIGN.md — sovern-mindmap

Unified AI diagramming canvas. All graphics render on one React Flow surface;
generators (AI via LiteLLM, draw.io, archify, pencil) are invisible backends.

## Tokens
Theme tokens live in `src/theme/tokens.css` (dark/light) + design-token upload.

## Identity contract (machine-readable)
`design/identity.json` — descriptor + dials (variance 3 / motion 4 / density 6) +
palette. Канон значений палитры — `src/theme/tokens.css` (identity.json — их
машиночитаемая копия для DesOps-читателей: ночной аудит, /design-audit,
desops-architect).

## Diagrams
Exported diagrams live in `design/diagrams/` (DesOps Standard).
AI↔canvas interchange is JSON Canvas (Obsidian spec) — never Mermaid.

## Shapes (12)
Single source of truth: `SHAPE_KINDS` in `src/types/index.ts` (the `shape` union,
the `extractCanvas` allow-list, and a drift-guard test all derive from it).
Carried in JSON Canvas node metadata under `mm:shape`:
rectangle · rounded · decision · terminal · note · cylinder · ellipse ·
parallelogram · hexagon · cloud · actor · document. Rendered via the
`shapeGeometry` registry (CSS border-radius / stretched SVG silhouette / lucide icon).

## Hand editing (Edit Mode)
The app boots as a viewer of the live `board.canvas` (polled every 3 s). The first
hand-edit enters **Edit Mode**, which freezes the poll so edits aren't clobbered.
Keyboard authoring (`Tab`/`Enter`/`F2`/`Delete`), undo/redo (zundo, one step per
structural edit), inline node editing, fold/collapse, copy/paste subtree, and
debounced **autosave to a separate workspace file** (never `board.canvas`).

## AI generation (prompt → diagram)
Prompt bar → LiteLLM gateway (dev-proxied at `/llm`; key injected server-side,
never bundled) → `extractCanvas` normalizes/repairs the LLM output → `fromJSONCanvas`
→ shapes appended to the canvas as one undoable Edit-Mode edit with dagre layout.

## Roadmap (slices)
1. ✅ AI-canvas foundation (generic shapes + prompt→diagram).
2. ✅ Richer shape vocabulary (12 shapes) + richer generation.
3. ⬜ Interactive-learning step-through / clickable mode + LMS embed.
4. ⬜ Real `.drawio`/mxGraph import (path B).
5. ⬜ archify / PaperBanana publication-export + pencil vector adapters.

## Run / gateway notes
- Tests: `npx vitest run --pool=threads` (the default forks pool hangs on Windows here).
- The AI feature needs the LiteLLM gateway running. Canonical port is in
  `NAUTILUS/config/services.json` (currently **4000**); the Vite proxy defaults to
  `http://localhost:4001` — override with the `SOVERN_LLM_GATEWAY` env var if the
  gateway moved. Live smoke without the real gateway: run a mock returning a JSON
  Canvas and drive the prompt bar.
