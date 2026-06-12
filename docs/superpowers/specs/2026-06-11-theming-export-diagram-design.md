# Design: Theming (light/system), W3C Design Token Upload, PNG Export, Diagram View

**Date:** 2026-06-11
**Project:** sovern-mindmap (SOVERN MindMap Control Plane)
**Status:** Approved by user (brainstorming session 2026-06-11)

## Goal

Add four features to the Control Plane:

1. **Light mode + system mode** — three-state theme switcher (dark / light / system) with persistence.
2. **Design token upload** — user uploads a W3C Design Tokens JSON file that re-skins the app.
3. **Export to PNG** — full-graph export in canvas views, view snapshot in DOM views.
4. **Diagram view** — fifth view mode: strict tree layout, dependency lanes, presentation mode.

Decisions locked during brainstorming:

- Light theme is **clean professional** (slate-50 background, muted accents); neon/cyberpunk stays dark-only.
- Token format is **W3C Design Tokens JSON** (Figma / Style Dictionary compatible).
- PNG export captures the **entire graph fit-to-content** in canvas views (not just the viewport).
- Diagram view combines all three requested aspects: tree hierarchy, dependency/swimlane layout, and a read-only presentation mode.
- Theming architecture: **CSS Custom Properties** (approach A) — chosen over Tailwind `dark:` variants (statically compiled classes cannot be re-themed by uploaded tokens) and JS theme objects (loses Tailwind ergonomics).

## Current State

- Stack: Tauri 2, React 19, Vite 7, Tailwind CSS v4, @xyflow/react 12, dagre, Zustand 5.
- 4 view modes in `useWorkflowStore` (`mindmap` canvas + `matrix`/`timeline`/`kanban` DOM views layered on top).
- All colors hardcoded: `#020617` background (`index.css`, `App.tsx:106`), slate-палитра в классах всех компонентов, `layerColors` hex-map в `SOVERNNode.tsx`, `AREA_COLORS`/`STATUS_COLORS` в `utils/feedback.ts`, `colorMode="dark"` на ReactFlow.
- No test infrastructure.

## 1. Theming System

### CSS variable layer — `src/theme/tokens.css`

Semantic variables, two theme blocks:

```css
:root, [data-theme='dark'] {
  --bg-canvas: #020617;      /* page + react-flow background */
  --bg-surface: ...;         /* panels, cards (slate-900 family) */
  --bg-surface-2: ...;       /* nested surfaces (slate-950/50 family) */
  --border: ...;             /* slate-800 family */
  --border-strong: ...;
  --text-primary: ...;       /* slate-100 */
  --text-secondary: ...;     /* slate-400 */
  --text-muted: ...;         /* slate-500 */
  --accent: #2563eb;         /* brand blue */
  --grid-dots: #1e293b;
  /* status */
  --status-idle / --status-pending / --status-active / --status-done / --status-blocked
  /* node layer accents — all 17 layers from SOVERNNode.tsx */
  --layer-human ... --layer-infra
}
[data-theme='light'] {
  /* clean professional: slate-50 bg, white surfaces, slate-200 borders,
     slate-900 text, same hue accents at reduced saturation where needed */
}
```

- Dark values = current hardcoded values (visual no-op for dark users).
- Layer/status hues stay recognizable across themes; light variants adjust lightness for contrast on white.
- Tailwind v4 `@theme inline` maps variables to utility colors (`bg-canvas`, `bg-surface`, `border-edge`, `text-primary`, …) so component markup stays Tailwind-idiomatic.

### Theme store — `src/store/useThemeStore.ts`

Zustand + `persist` middleware (localStorage key `sovern-theme`):

- `mode: 'dark' | 'light' | 'system'` (default `'system'`).
- `resolved: 'dark' | 'light'` — derived; `system` resolves via `matchMedia('(prefers-color-scheme: dark)')` with a live change listener.
- Side effect: sets `data-theme` attribute on `document.documentElement` and `color-scheme` accordingly.

### Component refactor

Replace hardcoded slate classes with semantic utilities in: `App.tsx` (header, toolbar, canvas wrapper — remove inline `#020617`), `SOVERNNode.tsx`, `NodeSidebar.tsx`, `KanbanBoard.tsx`, `MatrixView.tsx`, `TimelineView.tsx`. `index.css` `!important` background moves to `var(--bg-canvas)`.

- `layerColors` (SOVERNNode) and `STATUS_COLORS`/`AREA_COLORS` (feedback.ts) become CSS-var references: inline styles use `var(--layer-human)` etc., so uploaded tokens recolor nodes too. Hex fallbacks remain in the var declarations only.
- `quadrant()` colors in feedback.ts join the status/accent variable set.
- ReactFlow gets `colorMode={resolved}`; `<Background>` color = `var(--grid-dots)`.

### UI

Three-state segmented switcher in the bottom toolbar: Sun (light) / Moon (dark) / Monitor (system), lucide icons, active state highlighted.

## 2. Design Token Upload

### Parser — `src/theme/designTokens.ts`

Accepts W3C Design Tokens Format JSON:

- Walks nested groups; a token = object with `$value` (and optional `$type`).
- Only `$type: "color"` tokens (or untyped string values parseable as CSS colors) are used.
- Resolves alias references `"{path.to.token}"` (single-level chains followed iteratively, cycle-guarded).
- **Mapping table** (token path → CSS variable), case-insensitive, dots/slashes normalized:

| Token path | Variable |
|---|---|
| `color.background` / `bg.canvas` | `--bg-canvas` |
| `color.surface` | `--bg-surface` |
| `color.surface2` / `color.surface-secondary` | `--bg-surface-2` |
| `color.border` | `--border` |
| `color.text.primary` / `color.text` | `--text-primary` |
| `color.text.secondary` | `--text-secondary` |
| `color.text.muted` | `--text-muted` |
| `color.accent` / `color.primary` | `--accent` |
| `status.<idle\|pending\|active\|done\|blocked>` | `--status-*` |
| `layer.<name>` for the 17 known layers | `--layer-*` |

- Unrecognized tokens are skipped and reported (count + names in the result), not an error.
- Returns `{ overrides: Record<cssVar, color>, warnings: string[] }`.

### Apply & persist

- Overrides injected as `<style id="sovern-custom-tokens">:root { … }</style>` — applies **on top of whichever theme is active** (a token set is one brand palette; it wins over both dark and light values).
- Raw JSON persisted to localStorage (`sovern-custom-tokens`); re-applied on startup.
- **Reset to default** removes the style element and the localStorage entry.

### UI & errors

- Toolbar button (Palette icon): Tauri build → `plugin-dialog` open + `plugin-fs` read; browser → hidden `<input type="file" accept=".json">`.
- Invalid JSON or zero recognized color tokens → error message shown (small toast/banner in toolbar area), **nothing is applied partially**.
- When custom tokens are active, the Palette button shows an active-state dot and a Reset affordance.

## 3. PNG Export

New dependency: `html-to-image`.

### `src/utils/exportPng.ts`

- **Canvas views** (`mindmap`, `diagram`) — React Flow recipe:
  `getNodesBounds(nodes)` → `getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding)` → `toPng('.react-flow__viewport', { width, height, style: { transform }, pixelRatio: 2, backgroundColor: var(--bg-canvas) })`.
  Image dimension capped at **8192 px** per side (scale down proportionally beyond that).
- **DOM views** (`kanban`, `matrix`, `timeline`) — `toPng(viewContainer, { pixelRatio: 2, backgroundColor: var(--bg-canvas) })`. View root elements get stable ids/refs for capture.
- Export excludes overlay chrome (header, toolbar, sidebar) — only the content layer is captured.

### Saving

- Tauri: `plugin-dialog` save dialog → `plugin-fs` `writeFile` (binary).
- Browser: `<a download>` with data URL.
- Filename: `sovern-{view}-{YYYY-MM-DD}.png`.
- Errors surfaced via the same toast mechanism as token upload; export button shows a brief busy state while rendering.

### UI

Export button (ImageDown icon) in the bottom toolbar, enabled in all five views.

## 4. Diagram View

New `ViewMode: 'diagram'` (fifth toolbar button, Workflow icon). Renders on the same React Flow canvas as mindmap (not a DOM overlay), but with its own layout discipline.

### Store additions (`useWorkflowStore`)

- `diagramLayout: 'tree' | 'lanes'` (default `'tree'`).
- `presentationMode: boolean` (default `false`; auto-reset to `false` on leaving diagram view).
- `setViewMode('diagram')` applies the active diagram layout; switching `diagramLayout` re-lays-out + `fitView`.

### Layouts (`src/utils/layout.ts`)

- **Tree** — existing dagre with `rankdir: 'TB'`, strict org-chart: nodes `draggable: false`, ortho edges.
- **Lanes** — horizontal swimlane per `layer` present in the graph:
  - x-coordinates from dagre rank with `rankdir: 'LR'` over the full graph (dependency order preserved),
  - y = lane row (lanes ordered by first appearance / layer enum order),
  - lane backgrounds = non-interactive background nodes (custom `lane` node type: full-width tinted rect + layer label, `zIndex` below content, `selectable: false`).
- Edges in both sub-modes: `type: 'smoothstep'` with arrow markers (set on edges when entering diagram view, restored on exit).

### Presentation mode

Eye toggle (visible only in diagram view): hides header, bottom toolbar, and React Flow `<Controls>`; leaves a single floating exit mini-button (bottom-right). Intended pairing: presentation mode + PNG export for clean deliverables.

### View switcher

`VIEW_BUTTONS` in `App.tsx` gains the fifth entry; diagram view participates in the existing `fitView`-on-mode-change effect.

## Error Handling Summary

| Failure | Behavior |
|---|---|
| Token file: invalid JSON | Error toast, nothing applied |
| Token file: no recognized color tokens | Error toast listing why, nothing applied |
| Token file: partial recognition | Apply recognized, toast with skipped count |
| PNG: render failure | Error toast |
| PNG: graph exceeds 8192 px | Proportional downscale, no error |
| System theme: matchMedia unavailable | Fall back to dark |

## Testing

Add **vitest** (devDependency, `npm test`). Unit tests for pure logic only:

- `designTokens.ts`: W3C parsing, alias resolution, mapping table, rejection cases.
- `layout.ts`: lane layout — lane grouping, dependency ordering, lane node generation.
- Theme resolution: `mode + matchMedia → resolved`.

No component/E2E tests in this scope.

## Implementation Order

1. **Theming system** (CSS vars + store + component refactor + switcher) — foundation.
2. **Token upload** (parser + UI + persistence) — builds on the variable layer.
3. **Diagram view** (layouts + presentation mode).
4. **PNG export** last — captures the themed diagram view.

## Out of Scope

- Exporting SVG/PDF (PNG only).
- Token types other than color (typography, spacing, shadows).
- Per-view theme overrides; theme editing UI beyond upload/reset.
- Persisting theme/tokens into `.canvas` files (theme is an app preference, not document data).
