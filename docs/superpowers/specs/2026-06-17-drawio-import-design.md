# Slice 4 — Real `.drawio` / mxGraph import

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** sovern-mindmap only. Bring existing draw.io diagrams onto the canvas.

## Goal

Let a user drop an existing `.drawio` file onto the canvas: parse the mxGraph XML,
map its vertices/edges/labels/geometry onto our node-and-edge model, and append the
result as one undoable edit — **preserving the file's real coordinates** (no re-layout).

## Approach & non-goals

**Best-effort import to our own canvas vocabulary** (chosen over high-fidelity).
- Import: vertex geometry (x/y/width/height), labels, edges (source/target + label),
  shape mapped to our 12-shape vocabulary.
- **Drop:** colors, custom styling, containers/groups, swimlanes, images, edge
  waypoints, multi-page (import the **first** `<diagram>` page only).
- Rationale: matches the "one canvas with its own vocabulary, invisible backends"
  thesis and needs no new rendering machinery.

**No new dependencies.** XML via the native `DOMParser` (present in browsers and in
the jsdom test env); compressed diagrams via the native `DecompressionStream('deflate-raw')`.

## Architecture

```
.drawio file
  → text
  → extractMxGraphModel(text)         // inflate.ts  — unwrap <mxfile>/<diagram>, decompress if needed
  → drawioToCanvas(mxGraphModelXml)   // drawioToCanvas.ts — XML → JSONCanvas (mm:shape + real coords)
       └ mapDrawioStyleToShape(style) // mxStyle.ts — drawio style → ShapeKind
  → fromJSONCanvas(canvas)            // EXISTING — JSONCanvas → RF nodes/edges
  → namespace ids + append            // importDrawio.ts orchestrator
  → addImportedGraph(nodes, edges)    // store — append WITHOUT autoLayout (positions preserved)
```

Everything new lives in `src/drawio/`; the only touch points outside are one store
action and one toolbar button.

## Components

### `src/drawio/inflate.ts` — `extractMxGraphModel(fileText: string): Promise<string>`
A `.drawio` is `<mxfile><diagram …>…</diagram></mxfile>`. Inside `<diagram>` is either
a literal `<mxGraphModel>` ("Edit Diagram" / uncompressed) or base64 of
`deflateRaw(encodeURIComponent(modelXml))` (saved files).
- Parse the file XML with `DOMParser`; take the **first** `<diagram>` element.
- If it contains an `<mxGraphModel>` child → return that element's outerHTML.
- Else treat its text content as compressed: `decodeURIComponent(inflateRaw(atob(b64)))`
  where `inflateRaw` pipes the bytes through `new DecompressionStream('deflate-raw')`.
  If `decodeURIComponent` throws (a few exporters don't URL-encode), fall back to the
  raw inflated text.
- Throw `DrawioParseError` if there is no `<diagram>` or decompression/parse fails.

### `src/drawio/mxStyle.ts` — `mapDrawioStyleToShape(style: string): ShapeKind`
The drawio `style` is a `;`-separated `key[=value]` string (often with a leading shape
token). Best-effort mapping (first match wins), default `rectangle`:

| drawio style contains | → ShapeKind |
|---|---|
| `ellipse` | `ellipse` |
| `rhombus` | `decision` |
| `cylinder` (incl. `cylinder3`) | `cylinder` |
| `cloud` | `cloud` |
| `hexagon` | `hexagon` |
| `parallelogram` | `parallelogram` |
| `document` | `document` |
| `actor` / `umlActor` | `actor` |
| `terminator` | `terminal` |
| leading `text;` (text-only cell) | `note` |
| `rounded=1` | `rounded` |
| anything else | `rectangle` |

Return value is always a member of `SHAPE_KINDS` (drift-guard test).

### `src/drawio/drawioToCanvas.ts` — `drawioToCanvas(modelXml: string): JSONCanvas`
- `DOMParser` → `<mxGraphModel><root>`; iterate `<mxCell>`.
- Skip the two structural cells (`id="0"` root, `id="1"` default layer) and any cell
  that is neither a vertex nor an edge.
- **vertex** (`vertex="1"`): JSONCanvas node — `id`, `text` = plain-text label (run
  `value` through `DOMParser('text/html').body.textContent` to strip drawio's HTML and
  decode entities; the label is later rendered as a React text child, never HTML),
  geometry from the child `<mxGeometry x y width height as="geometry">` (defaults 0/0/120/60),
  `metadata['mm:shape'] = mapDrawioStyleToShape(style)`.
- **edge** (`edge="1"`): JSONCanvas edge — `fromNode = source`, `toNode = target`,
  `label` = plain-text `value` if present. Drop edges missing `source` or `target`, or
  whose endpoints aren't among the imported vertices.
- Throw `DrawioParseError` if there is no `<mxGraphModel>`/`<root>`.

### `src/store/useWorkflowStore.ts` — `addImportedGraph(nodes, edges)`
Mirror `addGeneratedGraph` **without** `autoLayout` (drawio carries real coordinates):
`enterEditMode()` → `set({ nodes: [...], edges: [...] })` → `withoutHistory(recalculate)`.
One undo step; positions preserved.

### `src/drawio/importDrawio.ts` — orchestrator
`importDrawio(file: File, deps?): Promise<void>`
1. `text = await file.text()`
2. `model = await extractMxGraphModel(text)`
3. `canvas = drawioToCanvas(model)`
4. `{ nodes, edges } = fromJSONCanvas(canvas)`
5. namespace ids to `d-${uuid}` (so imports never collide with existing/AI ids), edges
   get `smoothstep` + `ArrowClosed` (mirror `generateDiagram`), then
   `deps.addGraph(nodes, edges)` (default: `useWorkflowStore.getState().addImportedGraph`).
6. On any throw → `deps.onError?.(message)`; canvas untouched.

`deps = { addGraph?, onError? }` injectable for tests.

### `src/components/DrawioImportButton.tsx`
A toolbar button (lucide `Import` icon) that triggers a hidden
`<input type="file" accept=".drawio,.xml,application/xml">`. On change: call
`importDrawio(file, { onError: (m) => notify('⚠ import: ' + m) })`, reset the input
value (so re-importing the same file re-fires), and `notify('Imported <n> nodes')` on
success. Works in both browser and Tauri (uses the DOM file input, not the Tauri dialog).

## Error handling / edge cases

| Case | Behaviour |
|---|---|
| Not XML / no `<mxfile>` or `<diagram>` | `DrawioParseError` → toast, canvas unchanged |
| Compressed payload, bad base64/deflate | `DrawioParseError` → toast |
| Uncompressed (Edit-Diagram) XML | Handled directly (no decompress) |
| Multiple `<diagram>` pages | First page only (documented) |
| Unknown shape style | `rectangle` fallback |
| HTML/script in a label | Stripped to text via `textContent`; rendered as text → no injection |
| Edge with missing/dangling endpoint | Dropped |
| Empty diagram (no vertices) | Appends nothing; toast "Imported 0 nodes" |

## Testing

Unit (vitest, `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls):
- `mapDrawioStyleToShape`: each documented style → expected `ShapeKind`; unknown →
  `rectangle`; drift-guard — every return value ∈ `SHAPE_KINDS`.
- `drawioToCanvas`: a small uncompressed `<mxGraphModel>` → correct nodes (id, label,
  shape, x/y/w/h) and edges (source/target/label); `value` HTML stripped; structural
  cells (`0`,`1`) skipped; an edge with a dangling endpoint dropped.
- `inflate`: round-trip — compress a known model XML with `CompressionStream('deflate-raw')`
  + base64 + wrap in `<mxfile><diagram>`, then `extractMxGraphModel` returns the model;
  an uncompressed `<mxfile><diagram><mxGraphModel>` passes straight through.
- `importDrawio`: with injected deps — success calls `addGraph` with `d-` namespaced
  nodes and preserved coordinates; a parse failure calls `onError` and never `addGraph`.
- `addImportedGraph`: appends without re-layout (a node's position is unchanged) and is
  a single undo step.

Manual smoke (after merge): import a real `.drawio` file in the browser; verify shapes,
labels, positions, and edges land correctly and the import is one Ctrl+Z.

## Files

- Create: `src/drawio/inflate.ts`, `src/drawio/mxStyle.ts`, `src/drawio/drawioToCanvas.ts`,
  `src/drawio/importDrawio.ts` (+ a `.test.ts` beside each), `src/components/DrawioImportButton.tsx`.
- Modify: `src/store/useWorkflowStore.ts` (`addImportedGraph` + interface entry),
  `src/App.tsx` (render `DrawioImportButton` in the load-button cluster).
