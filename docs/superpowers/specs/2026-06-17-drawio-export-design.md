# Slice 6 — `.drawio` export (canvas → mxGraph)

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** sovern-mindmap only. Completes the draw.io round-trip begun by slice 4
(`.drawio` import). The other "export adapters" (pencil `.pen`, PaperBanana) are dropped
from this track — `.pen` is for app/site design files and PaperBanana is a text→publication
pipeline; neither is a diagram export that fits our model.

## Goal

Export the current canvas as a `.drawio` file: serialize our nodes/edges to mxGraph XML
(shapes mapped back to draw.io styles, real coordinates preserved) so the diagram opens
and is editable in real draw.io — the inverse of slice 4's import.

## Approach & non-goals

- **Direct string serialization** of nodes/edges → mxGraph XML (no DOM, no deps), output
  **uncompressed** (draw.io reads it, and our own slice-4 import already handles both
  forms, giving a clean round-trip).
- **Non-goals:** colors/theming, groups/containers/swimlanes, compressed output, multi-page.
  Best-effort to draw.io's vocabulary, mirroring the best-effort import.

## Architecture

```
Export .drawio button (canvas views only)
  → exportDrawio(nodes, edges, { notify })          // exportDrawio.ts — orchestrator
       ├ canvasToDrawio(nodes, edges)               // canvasToDrawio.ts — PURE string builder
       │    └ mapShapeToDrawioStyle(shape)          // mxStyle.ts — inverse of mapDrawioStyleToShape
       └ saveFile(xml, 'sovern-<date>.drawio', 'application/xml')   // saveFile.ts (from slice 5)
```

Everything new lives in `src/drawio/`; the only touch point outside is one toolbar button.

## Components

### `src/drawio/mxStyle.ts` — add `mapShapeToDrawioStyle(shape: ShapeKind): string`
The inverse of the existing `mapDrawioStyleToShape`. Each of our 12 shapes maps to a
representative draw.io style string:

| ShapeKind | drawio style |
|---|---|
| `rectangle` | `whiteSpace=wrap;html=1;` |
| `rounded` | `rounded=1;whiteSpace=wrap;html=1;` |
| `decision` | `rhombus;whiteSpace=wrap;html=1;` |
| `terminal` | `shape=terminator;whiteSpace=wrap;html=1;` |
| `note` | `shape=note;whiteSpace=wrap;html=1;` |
| `cylinder` | `shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;` |
| `ellipse` | `ellipse;whiteSpace=wrap;html=1;` |
| `parallelogram` | `shape=parallelogram;whiteSpace=wrap;html=1;` |
| `hexagon` | `shape=hexagon;whiteSpace=wrap;html=1;` |
| `cloud` | `shape=cloud;whiteSpace=wrap;html=1;` |
| `actor` | `shape=umlActor;whiteSpace=wrap;html=1;` |
| `document` | `shape=document;whiteSpace=wrap;html=1;` |

**Invariant (round-trip):** `mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s` for every
member of `SHAPE_KINDS`. (Verified against the forward map's first-match ordering.)

### `src/drawio/canvasToDrawio.ts` — `canvasToDrawio(nodes, edges): string` (PURE)
Builds the full `.drawio` document by string concatenation (no DOM):
- Frame: `<mxfile host="sovern-mindmap"><diagram id="…" name="Page-1"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/> … </root></mxGraphModel></diagram></mxfile>`.
- **Each node** → `<mxCell id="<id>" value="<escaped label>" style="<mapShapeToDrawioStyle(data.shape ?? 'rectangle')>" vertex="1" parent="1"><mxGeometry x="<round(position.x)>" y="<round(position.y)>" width="<measured?.width ?? 120>" height="<measured?.height ?? 60>" as="geometry"/></mxCell>`.
- **Each edge** → `<mxCell id="<id>" value="<escaped label or ''>" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" source="<source>" target="<target>"><mxGeometry relative="1" as="geometry"/></mxCell>`.
- A module-private `escapeXml(s)` escapes `& < > " '` in every `value` / attribute.
- The `id` attributes use our own node/edge ids (valid as mxGraph cell ids).

### `src/drawio/exportDrawio.ts` — `exportDrawio(nodes, edges, deps): Promise<void>`
Thin orchestrator: `canvasToDrawio` → `saveFile(xml, \`sovern-\${YYYY-MM-DD}.drawio\`,
'application/xml')` → `deps.notify?.('.drawio exported')`. On throw → `notify('⚠ export: …')`.
`deps = { notify? }`.

### `src/App.tsx`
A new **Export .drawio** toolbar button (lucide `FileDown`), rendered only in canvas views
(`mindmap`/`diagram`), next to the Export HTML button, with its own busy flag. Calls
`exportDrawio(nodes.filter(n => n.type !== 'lane'), edges, { notify })`.

## Security

- Node/edge labels (user/board text) are **XML-escaped** (`& < > " '`) into the `value`
  attributes by `escapeXml`. A `.drawio` file is data, not executed, and escaping prevents
  a label from injecting extra XML elements/attributes. No other untrusted data is emitted.

## Error handling / edge cases

| Case | Behaviour |
|---|---|
| Empty canvas | Produces a valid empty `<mxGraphModel>` (just cells 0/1); still saves |
| Node missing `measured` size | Falls back to 120×60 |
| `sovern` card node (no `data.shape`) | Exported as `rectangle` style |
| Label with `<`, `&`, `"` | Escaped; re-imports as the literal text |
| Edge with a label | Emitted as the edge cell `value` |
| Save dialog cancelled (Tauri) | `saveFile` returns without writing; no error |

## Testing

Unit (vitest, `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls):
- `mapShapeToDrawioStyle`: each shape → expected style substring; **round-trip property** —
  `mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s` for every `SHAPE_KINDS` member.
- `canvasToDrawio`:
  - emits a vertex `<mxCell vertex="1">` per node with the mapped style, geometry from
    `position` + `measured`, and the escaped label.
  - a `sovern` node without `data.shape` gets the `rectangle` style.
  - emits an edge `<mxCell edge="1" source=… target=…>` per edge, with the escaped label.
  - escapes a label containing `<b>A & "B"</b>` to `&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;`.
  - output contains the `<mxfile>`/`<mxGraphModel>`/`<root>` frame and the two structural cells.
- **Integration round-trip (proves export↔import symmetry):** run the export through the
  REAL import pipeline — `drawioToCanvas(await extractMxGraphModel(canvasToDrawio(nodes, edges)))`
  (slice 4's unwrap + parse) — and assert the resulting JSON Canvas has the same node
  ids→shapes, labels, positions (x/y/w/h), and edges (source/target) as the input. Because
  `canvasToDrawio` emits the full `<mxfile>` wrapper, routing through `extractMxGraphModel`
  is the faithful symmetry check.

`exportDrawio` + the App button touch `saveFile`/DOM and are verified by typecheck + build +
the manual smoke (same treatment as the other thin export orchestrators).

Manual smoke (after merge): from the browser dev server, build a small diagram (a few
shapes + edges, e.g. via the AI prompt), click **Export .drawio**, then open the downloaded
file in real draw.io (installed locally) and confirm shapes, labels, positions, and edges
render correctly. Bonus: re-import it via slice 4 and confirm it round-trips.

## Files

- Modify: `src/drawio/mxStyle.ts` (+ `mxStyle.test.ts` additions), `src/App.tsx`.
- Create: `src/drawio/canvasToDrawio.ts` (+ `canvasToDrawio.test.ts`), `src/drawio/exportDrawio.ts`.
