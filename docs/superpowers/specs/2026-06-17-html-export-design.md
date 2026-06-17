# Slice 5 — Standalone interactive HTML export

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** sovern-mindmap only. The first of the "export/publication adapters" — others
(`.drawio` export, pencil/`.pen`, PaperBanana) are deferred to their own future slices.

## Goal

Export the current canvas (mindmap/diagram view) as a single self-contained `.html`
file: a faithful snapshot of the diagram that anyone can open in a browser, with
pan/zoom and a dark/light toggle — a shareable artifact, no server or app required.

## Approach & non-goals

Capture the live React-Flow viewport as a self-contained **SVG** via `html-to-image`'s
`toSvg` (the same library and fit-to-content recipe the existing PNG export uses), then
wrap it in a small interactive HTML shell (vanilla pan/zoom + theme toggle). Capture the
diagram **twice** (light + dark theme) so the toggle re-themes the diagram itself.

- **No new dependencies** (`html-to-image` is already a dependency).
- **Non-goals:** editable re-import of the HTML, embedding the Learn-mode step-through
  (a natural follow-up), exporting the DOM views (kanban/matrix/timeline) — HTML export
  is canvas-views only, mirroring how PNG export already special-cases them.

## Architecture

```
Export HTML button (canvas views only)
  → exportHtml(nodes, { notify })                      // exportHtml.ts — orchestrator
       ├ remember current theme mode
       ├ setMode('light') → await frame → captureCanvasSvg(nodes) → lightSvg
       ├ setMode('dark')  → await frame → captureCanvasSvg(nodes) → darkSvg
       ├ restore original theme mode
       ├ buildInteractiveHtml({ lightSvg, darkSvg, title })   // htmlTemplate.ts (PURE)
       └ saveFile(html, name, 'text/html')             // saveFile.ts
```

`captureCanvasSvg` and `computeExportViewport` share the fit-to-content recipe currently
inline in `exportPng.ts`; that recipe and the Tauri/browser save logic are extracted to
`fitViewport.ts` / `saveFile.ts` and `exportPng.ts` is refactored to reuse them (DRY, no
behaviour change).

## Components

### `src/export/fitViewport.ts` — `computeExportViewport(nodes)`
Extracted from `exportPng.ts`. Returns `{ width, height, pixelRatio, viewport }` from
`getNodesBounds` + `getViewportForBounds` (React Flow). One source of truth for both
exports.

### `src/export/saveFile.ts` — `saveFile(content, name, mime)`
Extracted from `exportPng.ts`'s `savePng`. In Tauri: `@tauri-apps/plugin-dialog` save +
`plugin-fs` write; in the browser: an anchor-download with a `Blob`. Accepts a string or
`Uint8Array`. `exportPng` is refactored to call it (passing the PNG bytes).

### `src/export/captureCanvasSvg.ts` — `captureCanvasSvg(nodes): Promise<string>`
`toSvg('.react-flow__viewport', …)` with the `computeExportViewport` style (translate +
scale, bg color). `toSvg` returns `data:image/svg+xml;charset=utf-8,<urlencoded svg>`;
return `decodeURIComponent(dataUrl.split(',')[1])` — the raw inline SVG markup. Throws
`Error('nothing to export')` when there are no nodes or no viewport element (mirrors
`exportCanvasPng`).

### `src/export/htmlTemplate.ts` — `buildInteractiveHtml({ lightSvg, darkSvg, title }): string` (PURE)
Returns a complete `<!doctype html>` document:
- A `<div id="stage">` containing both SVGs (the light one visible, the dark one
  `hidden`), wrapped in a `<div id="pan">` that carries the CSS `transform`.
- A fixed toolbar: **☀/🌙** theme toggle, **Fit** (reset transform), **+ / −** zoom.
- An inline `<script>`: wheel-zoom (scale about cursor) + drag-pan (translate) updating
  `#pan`'s transform; Fit resets; the toggle swaps which SVG is `hidden` and the page bg.
- `title` is HTML-escaped into `<title>` and the toolbar caption.
- **No external resources** — everything (SVGs, CSS, JS) is inline.

### `src/export/exportHtml.ts` — `exportHtml(nodes, deps): Promise<void>`
Orchestrates the double-capture (drives `useThemeStore.setMode`, awaiting a
`requestAnimationFrame` after each switch so React Flow's `colorMode` re-render and the
`data-theme` CSS vars settle), builds the HTML, and saves it. Always restores the
original theme mode, even on failure (try/finally). `deps = { notify? }`.

### `src/App.tsx`
A new **Export HTML** toolbar button (lucide `Code2`), rendered only in canvas views
(`mindmap`/`diagram`), next to the PNG export button. Disabled while a previous export is
in flight. Calls `exportHtml(nodes.filter(n => n.type !== 'lane'), { notify })` and
toasts success/failure (same `notify` pattern as PNG export).

## Security

- Diagram labels reach the HTML only inside the captured SVG, which `html-to-image`
  produces by serializing the live DOM — text content is already entity-escaped
  (`<` → `&lt;`), so a malicious label cannot break out of the SVG into the `<script>`.
- `title` is HTML-escaped by the template.
- The inline `<script>` is a fixed string; **no user/graph data is interpolated into any
  executable position** — only the two pre-serialized SVG strings and the escaped title
  are injected, and only into markup positions.

## Error handling / edge cases

| Case | Behaviour |
|---|---|
| No nodes / no viewport element | `captureCanvasSvg` throws → caught → `⚠ export` toast, theme restored |
| Theme switch mid-capture | `requestAnimationFrame` await lets React + CSS settle before `toSvg` |
| Export fails partway | `try/finally` restores the original theme mode |
| Non-canvas view active | Button not rendered (canvas-views only) |
| Re-entrancy (double click) | Button disabled while an export is in flight |

## Testing

Unit (vitest, `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls):
- `buildInteractiveHtml` (the pure core):
  - returns a complete document (`<!doctype html>`, `<html`, `</html>`).
  - embeds **both** SVG payloads (pass sentinel strings `__LIGHT_SVG__` / `__DARK_SVG__`
    and assert both appear).
  - contains a theme-toggle control and a `<script>` (pan/zoom).
  - escapes the title: passing `"<img src=x>"` yields `&lt;img` and no raw `<img` in the
    output.
  - self-contained guard: the output contains no `src="http` and no `href="http`.

`captureCanvasSvg` / `exportHtml` / `saveFile` touch the DOM, `html-to-image`, theme
store, and Tauri/browser save — `html-to-image` cannot render in jsdom, so these are
verified by typecheck + build + the manual smoke (the same treatment the existing,
untested `exportPng.ts` gets). The `exportPng` refactor is covered by re-running the
build and the manual PNG smoke.

Manual smoke (after merge): from the browser dev server, Export HTML on a real diagram;
open the downloaded file in a fresh browser tab and verify the diagram renders, pan/zoom
works, the ☀/🌙 toggle re-themes the diagram, and the file references no external URLs
(view-source). Confirm PNG export still works (refactor regression).

## Files

- Create: `src/export/htmlTemplate.ts` (+ `htmlTemplate.test.ts`),
  `src/export/captureCanvasSvg.ts`, `src/export/exportHtml.ts`,
  `src/export/saveFile.ts`, `src/export/fitViewport.ts`.
- Modify: `src/utils/exportPng.ts` (reuse `saveFile` + `computeExportViewport`),
  `src/App.tsx` (Export HTML button + busy state).
