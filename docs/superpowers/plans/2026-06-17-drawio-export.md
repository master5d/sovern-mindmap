# `.drawio` Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current canvas as a `.drawio` file — serialize nodes/edges to mxGraph XML (shapes mapped back to draw.io styles, coordinates preserved) so it opens editable in real draw.io.

**Architecture:** A pure string serializer `canvasToDrawio(nodes, edges)` emits an uncompressed `<mxfile>` document; shapes come from `mapShapeToDrawioStyle` (the inverse of slice 4's `mapDrawioStyleToShape`); a thin `exportDrawio` orchestrator saves it via the shared `saveFile`. Completes the draw.io import↔export round-trip.

**Tech Stack:** TypeScript, @xyflow/react 12, vitest (jsdom env — but these tests are mostly pure). Run tests with `npx vitest run --pool=threads <path>`; fall back to plain `npx vitest run <path>` if it stalls.

**Spec:** `docs/superpowers/specs/2026-06-17-drawio-export-design.md`
**Branch:** `feature/drawio-export` (created; spec committed there).

## Reused from earlier slices
- `src/drawio/mxStyle.ts` — `mapDrawioStyleToShape` (forward map; we add the inverse here).
- `src/drawio/inflate.ts` — `extractMxGraphModel` (slice 4; used by the round-trip test).
- `src/drawio/drawioToCanvas.ts` — `drawioToCanvas` (slice 4; used by the round-trip test).
- `src/export/saveFile.ts` — `saveFile(content, name, mime)` (slice 5).

## File map
- `src/drawio/mxStyle.ts` — add `mapShapeToDrawioStyle`. (Task 1)
- `src/drawio/canvasToDrawio.ts` — pure mxGraph serializer. (Task 2)
- `src/drawio/exportDrawio.ts` + `src/App.tsx` — orchestrator + toolbar button. (Task 3)

---

## Task 1: `mapShapeToDrawioStyle` (inverse shape map)

**Files:**
- Modify: `src/drawio/mxStyle.ts`
- Modify: `src/drawio/mxStyle.test.ts`

- [ ] **Step 1: Add the failing tests**

First, change the top `./mxStyle` import in `src/drawio/mxStyle.test.ts` to also pull in
`mapShapeToDrawioStyle` (the file already imports `mapDrawioStyleToShape`, and `SHAPE_KINDS`
from `../types`):
`import { mapDrawioStyleToShape, mapShapeToDrawioStyle } from './mxStyle';`

Then append:

```ts
describe('mapShapeToDrawioStyle', () => {
  it('maps each shape to a representative drawio style', () => {
    expect(mapShapeToDrawioStyle('rounded')).toContain('rounded=1');
    expect(mapShapeToDrawioStyle('decision')).toContain('rhombus');
    expect(mapShapeToDrawioStyle('cylinder')).toContain('cylinder');
    expect(mapShapeToDrawioStyle('actor')).toContain('Actor');
    expect(mapShapeToDrawioStyle('rectangle')).not.toContain('shape=');
  });

  it('round-trips every SHAPE_KIND back through the forward map', () => {
    for (const s of SHAPE_KINDS) {
      expect(mapDrawioStyleToShape(mapShapeToDrawioStyle(s))).toBe(s);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/mxStyle.test.ts`
Expected: FAIL — `mapShapeToDrawioStyle` is not exported.

- [ ] **Step 3: Implement the inverse map**

In `src/drawio/mxStyle.ts`, append:

```ts
/**
 * Inverse of mapDrawioStyleToShape: each of our 12 shapes → a representative drawio style.
 * The Record type forces all SHAPE_KINDS to be covered (compile-time drift guard), and the
 * chosen styles satisfy mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s.
 */
const SHAPE_STYLE: Record<ShapeKind, string> = {
  rectangle: 'whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  decision: 'rhombus;whiteSpace=wrap;html=1;',
  terminal: 'shape=terminator;whiteSpace=wrap;html=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  parallelogram: 'shape=parallelogram;whiteSpace=wrap;html=1;',
  hexagon: 'shape=hexagon;whiteSpace=wrap;html=1;',
  cloud: 'shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;whiteSpace=wrap;html=1;',
  document: 'shape=document;whiteSpace=wrap;html=1;',
};

export function mapShapeToDrawioStyle(shape: ShapeKind): string {
  return SHAPE_STYLE[shape] ?? SHAPE_STYLE.rectangle;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/mxStyle.test.ts`
Expected: PASS (existing + 2 new tests; the round-trip property holds for all 12 shapes).

- [ ] **Step 5: Commit**

```bash
git add src/drawio/mxStyle.ts src/drawio/mxStyle.test.ts
git commit -m "feat(drawio): mapShapeToDrawioStyle — inverse shape map (round-trips the forward map)"
```

---

## Task 2: `canvasToDrawio` — pure mxGraph serializer

**Files:**
- Create: `src/drawio/canvasToDrawio.ts`, `src/drawio/canvasToDrawio.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/drawio/canvasToDrawio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canvasToDrawio } from './canvasToDrawio';
import { extractMxGraphModel } from './inflate';
import { drawioToCanvas } from './drawioToCanvas';

const shapeNode = (id: string, x: number, y: number, shape: string, label = id) => ({
  id, type: 'shape', position: { x, y }, measured: { width: 120, height: 60 },
  data: { label, layer: 'projects', status: 'idle', shape },
});

describe('canvasToDrawio', () => {
  it('emits the mxfile/mxGraphModel/root frame and structural cells', () => {
    const xml = canvasToDrawio([], []);
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('<root>');
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  it('emits a vertex per node with mapped style and geometry', () => {
    const nodes = [{
      id: 'n1', type: 'sovern', position: { x: 10, y: 20 }, measured: { width: 150, height: 60 },
      data: { label: 'Task', layer: 'coding', status: 'idle' }, // no shape → rectangle
    }];
    const xml = canvasToDrawio(nodes as any, []);
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('value="Task"');
    expect(xml).toContain('x="10" y="20" width="150" height="60"');
    expect(xml).toContain('style="whiteSpace=wrap;html=1;"'); // rectangle fallback
  });

  it('emits an edge cell per edge', () => {
    const nodes = [shapeNode('a', 0, 0, 'rectangle'), shapeNode('b', 200, 0, 'rectangle')];
    const xml = canvasToDrawio(nodes as any, [{ id: 'e1', source: 'a', target: 'b', label: 'flows' }] as any);
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
    expect(xml).toContain('value="flows"');
  });

  it('escapes XML special chars in labels', () => {
    const nodes = [shapeNode('n1', 0, 0, 'rectangle', '<b>A & "B"</b>')];
    const xml = canvasToDrawio(nodes as any, []);
    expect(xml).toContain('&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;');
    expect(xml).not.toContain('value="<b>');
  });

  it('round-trips through the real import pipeline (export ↔ import symmetry)', async () => {
    const nodes = [
      shapeNode('a', 40, 80, 'rounded', 'Start'),
      { id: 'b', type: 'shape', position: { x: 240, y: 80 }, measured: { width: 100, height: 80 },
        data: { label: 'DB', layer: 'projects', status: 'idle', shape: 'cylinder' } },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'save' }];
    const canvas = drawioToCanvas(await extractMxGraphModel(canvasToDrawio(nodes as any, edges as any)));

    const a = canvas.nodes.find((n) => n.id === 'a')!;
    expect(a.text).toBe('Start');
    expect(a.metadata!['mm:shape']).toBe('rounded');
    expect([a.x, a.y, a.width, a.height]).toEqual([40, 80, 120, 60]);
    const b = canvas.nodes.find((n) => n.id === 'b')!;
    expect(b.metadata!['mm:shape']).toBe('cylinder');
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges[0]).toMatchObject({ fromNode: 'a', toNode: 'b', label: 'save' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/canvasToDrawio.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the serializer**

`src/drawio/canvasToDrawio.ts`:

```ts
import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData, ShapeKind } from '../types';
import { mapShapeToDrawioStyle } from './mxStyle';

/** Escape the five XML metacharacters for safe inclusion in attribute values. */
function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/** Serialize the canvas to an uncompressed .drawio (mxGraph) document string. */
export function canvasToDrawio(nodes: Node<SOVERNNodeData>[], edges: Edge[]): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  for (const n of nodes) {
    const shape = (n.data?.shape ?? 'rectangle') as ShapeKind;
    const style = mapShapeToDrawioStyle(shape);
    const x = Math.round(n.position?.x ?? 0);
    const y = Math.round(n.position?.y ?? 0);
    const w = Math.round(n.measured?.width ?? (n as any).width ?? 120);
    const h = Math.round(n.measured?.height ?? (n as any).height ?? 60);
    const value = escapeXml(n.data?.label ?? '');
    cells.push(
      `<mxCell id="${escapeXml(n.id)}" value="${value}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
  }

  for (const e of edges) {
    const value = escapeXml((e.label as string) ?? '');
    cells.push(
      `<mxCell id="${escapeXml(e.id)}" value="${value}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }

  return (
    `<mxfile host="sovern-mindmap"><diagram id="sovern" name="Page-1">` +
    `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1">` +
    `<root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/canvasToDrawio.test.ts`
Expected: PASS (5 tests, including the import-pipeline round-trip).

- [ ] **Step 5: Commit**

```bash
git add src/drawio/canvasToDrawio.ts src/drawio/canvasToDrawio.test.ts
git commit -m "feat(drawio): canvasToDrawio — pure mxGraph serializer (round-trips slice-4 import)"
```

---

## Task 3: `exportDrawio` orchestrator + toolbar button

**Files:**
- Create: `src/drawio/exportDrawio.ts`
- Modify: `src/App.tsx`

The orchestrator + button touch `saveFile`/DOM and have no unit tests (mirrors the other thin
export orchestrators); verified by typecheck/build + the manual smoke.

- [ ] **Step 1: Implement the orchestrator**

`src/drawio/exportDrawio.ts`:

```ts
import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { canvasToDrawio } from './canvasToDrawio';
import { saveFile } from '../export/saveFile';

interface Deps {
  notify?: (message: string) => void;
}

/** Serialize the canvas to a .drawio file and save it. */
export async function exportDrawio(nodes: Node<SOVERNNodeData>[], edges: Edge[], deps: Deps = {}): Promise<void> {
  try {
    const xml = canvasToDrawio(nodes, edges);
    const name = `sovern-${new Date().toISOString().slice(0, 10)}.drawio`;
    await saveFile(xml, name, 'application/xml');
    deps.notify?.('.drawio exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  }
}
```

- [ ] **Step 2: Add imports to `App.tsx`**

In `src/App.tsx`, add `FileDown` to the lucide import list, and add below the other export import:

```tsx
import { exportDrawio } from './drawio/exportDrawio';
```

- [ ] **Step 3: Add the busy state + handler**

In `Flow()`, just after the existing `onExportHtml` handler, add:

```tsx
  const [exportingDrawio, setExportingDrawio] = useState(false);
  const onExportDrawio = async () => {
    if (exportingDrawio) return;
    setExportingDrawio(true);
    try {
      await exportDrawio(nodes.filter((n) => n.type !== 'lane'), edges, { notify });
    } finally {
      setExportingDrawio(false);
    }
  };
```

- [ ] **Step 4: Render the button (canvas views only)**

In the toolbar's load/export cluster, immediately after the existing Export HTML button block
(the `{isCanvasView && (<button onClick={onExportHtml} … <Code2 size={18} /></button>)}`), add:

```tsx
            {isCanvasView && (
              <button onClick={onExportDrawio} disabled={exportingDrawio} title="Export .drawio" className="p-2.5 text-secondary hover:text-accent disabled:opacity-40"><FileDown size={18} /></button>
            )}
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 6: Full test run**

Run: `npx vitest run --pool=threads`
Expected: all suites PASS (prior 129 + the new mxStyle + canvasToDrawio tests).

- [ ] **Step 7: Commit**

```bash
git add src/drawio/exportDrawio.ts src/App.tsx
git commit -m "feat(drawio): Export .drawio toolbar button + orchestrator"
```

---

## Manual live smoke (after merge)

Not coded. In the browser dev server, build a small diagram (a few shapes + edges, e.g. via
the AI prompt or by importing a `.drawio`), click **Export .drawio**, and open the downloaded
file in real draw.io (installed locally) — confirm shapes, labels, positions, and edges render
correctly. Bonus: re-import it via the slice-4 Import button and confirm a clean round-trip.

## Notes for the implementer
- Run tests with `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls.
- `mapShapeToDrawioStyle`'s `Record<ShapeKind, string>` is a compile-time guard — if a shape is ever added to `SHAPE_KINDS`, this file won't compile until the new shape gets a style.
- Keep the round-trip property intact: the chosen styles are ordered to hit the correct branch in `mapDrawioStyleToShape` (which is first-match). Don't add a keyword that an earlier branch would catch (e.g. a `rounded=1` on a shape that should map elsewhere).
- Labels are XML-escaped into `value` — never emit a raw label.
