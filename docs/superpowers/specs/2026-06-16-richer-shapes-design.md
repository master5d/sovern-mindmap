# Design: Richer Shape Vocabulary + Richer AI Generation (slice 2)

**Date:** 2026-06-16
**Project:** sovern-mindmap (unified AI diagramming canvas)
**Status:** Approved by user (brainstorming session 2026-06-16)
**Slice:** 2 of N. Builds directly on slice 1 (`2026-06-16-ai-canvas-foundation-design.md`).

## Goal

Make AI-generated diagrams **richer than slice 1's 5 shapes** by expanding the canvas's shape vocabulary and teaching the generator to use it — reusing the **entire** slice-1 runtime pipeline (gateway → `generateDiagram` → `extractCanvas` → `fromJSONCanvas` → `addGeneratedGraph` → `AiPromptBar`). No new plumbing.

## Locked decisions (from brainstorming)

- **Path A**, not B: expand our own shapes + keep the native **JSON Canvas** interchange. NO `.drawio`/mxGraph parser — that only pays off for *importing real `.drawio` files* (a future "import" slice), and for *generation* a draw.io-XML path would render with the exact same shape set we implement, so it adds a heavy parser for zero visual gain.
- "draw.io" was the user's mental model for "richer"; the real need is a broader shape set, delivered through the existing generation flow.
- Shapes stay opaque strings in JSON Canvas node `metadata['mm:shape']` — the converter is unchanged.

## Current state (slice 1, in `master`)

- `SOVERNNodeData.shape?: 'rectangle'|'rounded'|'decision'|'terminal'|'note'`.
- `src/components/nodes/ShapeNode.tsx` renders shapes via an inline `SHAPE_CLASS` map (border-radius only) + a special rotate-45 diamond branch; falls back to `rounded-md` for unknown.
- `src/ai/extractCanvas.ts` has `const SHAPES = ['rectangle','rounded','decision','terminal','note']`; coerces unknown `mm:shape` → `rectangle`.
- `src/ai/diagramPrompt.ts` SYSTEM documents the 5 shapes + a login few-shot.
- `canvasConverter` round-trips `data.shape` ⇄ `metadata['mm:shape']` (opaque).
- Pipeline: `AiPromptBar` → `generateDiagram` → gateway → `extractCanvas` → `fromJSONCanvas` → `addGeneratedGraph` (undoable Edit-Mode append + dagre).

## 1. Expanded shape vocabulary

Add 7 shapes to the union (total 12):

| Shape | Meaning | Render strategy |
|-------|---------|-----------------|
| `cylinder` | datastore / database | SVG background (elliptical top/bottom caps) |
| `ellipse` | event / state | `border-radius: 50%` (CSS) |
| `parallelogram` | input / output | `clip-path` polygon (CSS) |
| `hexagon` | process / preparation | `clip-path` polygon (CSS) |
| `cloud` | external service / internet | SVG background (cloud path) |
| `actor` | user / person / role | person icon (lucide `User`) above label |
| `document` | document / report | SVG background (wavy bottom edge) |

### `SOVERNNodeData.shape` union (`src/types/index.ts`)
Extend to the full 12:
```ts
shape?: 'rectangle' | 'rounded' | 'decision' | 'terminal' | 'note'
  | 'cylinder' | 'ellipse' | 'parallelogram' | 'hexagon' | 'cloud' | 'actor' | 'document';
```

### Shape-geometry registry — `src/components/nodes/shapeGeometry.tsx`
To keep `ShapeNode` thin and each shape understandable in isolation, a registry maps a shape kind to its visual treatment. One clear interface:
```ts
export type ShapeKind = NonNullable<SOVERNNodeData['shape']>;
export interface ShapeRender {
  /** wrapper className (border-radius / sizing) */
  className?: string;
  /** CSS clip-path value, if the silhouette is a polygon */
  clipPath?: string;
  /** absolutely-positioned SVG drawn behind the label (cylinder/cloud/document) */
  svg?: (props: { stroke: string; fill: string }) => JSX.Element;
  /** small icon shown above the label (actor) */
  icon?: 'user';
}
export const SHAPE_GEOMETRY: Record<ShapeKind, ShapeRender> = { /* per-shape entries */ };
```
- CSS shapes (`rectangle`/`rounded`/`terminal`/`note`/`ellipse`/`parallelogram`/`hexagon`): `className`/`clipPath` only.
- `decision`: keeps the existing rotate-45 diamond treatment (special-cased in ShapeNode, or expressed as a clip-path diamond).
- SVG shapes (`cylinder`/`cloud`/`document`): `svg` renders the silhouette behind the label using theme-token colors (`var(--bg-surface)` fill, `var(--border)`/accent stroke), via `currentColor` or passed props.
- `actor`: `icon:'user'` renders a lucide `User` above the label; minimal frame.

### `ShapeNode.tsx`
Refactored to read `SHAPE_GEOMETRY[shape]` and compose: optional SVG background (absolute, behind), optional icon, the label, optional `clip-path`/`className`. Inline editing, handles, selection ring, and theme tokens are unchanged from slice 1. Unknown shape → `rectangle` entry (defensive).

### `extractCanvas` allowed list (`src/ai/extractCanvas.ts`)
Expand `SHAPES` to all 12. Behavior unchanged: a recognized shape passes through; a truly-unknown value still coerces to `rectangle`.

## 2. Richer generation prompt (`src/ai/diagramPrompt.ts`)

Update the SYSTEM string:
- List all 12 `mm:shape` values **with one-line usage guidance** each (e.g. `cylinder` = a database/datastore, `actor` = a user or external role, `cloud` = an external service/the internet, `parallelogram` = input/output, `hexagon` = a process step, `document` = a document/report, `ellipse` = an event or state, plus the slice-1 five).
- Replace/augment the few-shot with a **richer example** (the signup→database→email-queue flow) that exercises `actor`, `rounded`, `cylinder`, `parallelogram`, `cloud`, and an edge label — so the model sees the new shapes used in context.
- Keep the "output ONLY the JSON object, no fences" instruction.

No change to `litellmClient`, `config`, `generateDiagram`, `AiPromptBar`, `addGeneratedGraph`, the `/llm` proxy.

## Components & boundaries

| Unit | Responsibility | Changes |
|------|----------------|---------|
| `src/types/index.ts` | `shape` union | +7 values |
| `shapeGeometry.tsx` | shape → visual treatment (new) | new file, one entry per shape |
| `ShapeNode.tsx` | render a shape from the registry | refactor to use registry |
| `extractCanvas.ts` | normalize/repair LLM output | expand `SHAPES` list |
| `diagramPrompt.ts` | LLM instructions | document 12 shapes + richer few-shot |
| `canvasConverter.ts` | JSON Canvas ⇄ RF | **unchanged** (shape opaque) |

## Testing plan

- **Unit (vitest):**
  - `extractCanvas`: a `cylinder` `mm:shape` passes through unchanged (regression that the list expanded); a bogus value (`"trapezoid"`) still coerces to `rectangle`.
  - `diagramPrompt`: SYSTEM contains the new shape names (`cylinder`, `actor`, `cloud`) and the "output ONLY the JSON" instruction; the user prompt is echoed.
  - `canvasConverter`: round-trip a `cylinder` shape node (`data.shape:'cylinder'` → `mm:shape` → back to `type:'shape'`, `data.shape:'cylinder'`).
- **Build + UI:** `npm run build` exit 0; `ShapeNode` renders each new shape (build-verified; visual confirmation in live smoke).
- **Live smoke (mock gateway, like slice 1):** prompt the signup example via a mock returning JSON Canvas with the new shapes → confirm a cylinder/actor/cloud render distinctly on the canvas, editable, single-undo.

## Out of scope (future slices)

Real `.drawio`/mxGraph import & parsing (path B); a manual shape palette for keyboard/click authoring (today shape nodes only come from generation); draw.io/AWS/GCP stencil icon libraries; typed/dashed/orthogonal connector styles; per-shape resize handles.

## Implementation order (for the plan)

1. Expand the `shape` union (types).
2. `shapeGeometry.tsx` registry (CSS + SVG silhouettes for the 12 shapes).
3. Refactor `ShapeNode.tsx` to render from the registry.
4. Expand `extractCanvas` `SHAPES` list (+ tests).
5. Update `diagramPrompt` SYSTEM with the 12 shapes + richer few-shot (+ test).
6. `canvasConverter` round-trip test for a new shape (no code change, just a test).
7. Build + live smoke.
