# `.drawio` Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import an existing `.drawio` file onto the canvas — parse the mxGraph XML, map vertices/edges/labels/geometry to our model, append as one undoable edit with the file's real coordinates preserved.

**Architecture:** A self-contained pipeline in `src/drawio/`: `extractMxGraphModel` (unwrap `<mxfile>`/`<diagram>`, decompress if needed) → `drawioToCanvas` (XML → our native JSON Canvas, shapes via `mapDrawioStyleToShape`) → existing `fromJSONCanvas` → namespaced append via a new no-layout store action `addImportedGraph`. Zero new dependencies (native `DOMParser` + `DecompressionStream('deflate-raw')`).

**Tech Stack:** TypeScript, @xyflow/react 12, Zustand 5 (+ zundo), vitest in the **jsdom** environment (so `DOMParser` is available in tests). Run tests with `npx vitest run --pool=threads <path>`; if it ever stalls, fall back to plain `npx vitest run <path>`.

**Spec:** `docs/superpowers/specs/2026-06-17-drawio-import-design.md`
**Branch:** `feature/drawio-import` (created; spec already committed there).

---

## Verified facts (do not re-litigate)
- `new DecompressionStream('deflate-raw')` round-trips drawio payloads in this Node; the import path is `decodeURIComponent(inflate(atob(base64)))`.
- `DOMParser` is **undefined in plain Node** but **present in the jsdom test env** (vitest `environment: 'jsdom'`). All drawio tests rely on this — no extra setup needed.
- `atob`, `CompressionStream`, `TextEncoder`, `Response` are Node globals (available in jsdom tests too).
- Existing `addGeneratedGraph` (store) and `generateDiagram` (`src/ai/generateDiagram.ts`) are the templates for the no-layout append and the id-namespacing.

## File map
- `src/drawio/errors.ts` — `DrawioParseError`. (Task 1)
- `src/drawio/mxStyle.ts` — `mapDrawioStyleToShape`. (Task 1)
- `src/drawio/inflate.ts` — `extractMxGraphModel`. (Task 2)
- `src/drawio/drawioToCanvas.ts` — XML → `JSONCanvas`. (Task 3)
- `src/store/useWorkflowStore.ts` — `addImportedGraph`. (Task 4)
- `src/drawio/importDrawio.ts` — orchestrator. (Task 5)
- `src/components/DrawioImportButton.tsx` + `src/App.tsx` — entry button. (Task 6)

---

## Task 1: Error type + style→shape mapping

**Files:**
- Create: `src/drawio/errors.ts`, `src/drawio/mxStyle.ts`, `src/drawio/mxStyle.test.ts`

- [ ] **Step 1: Create the error type**

`src/drawio/errors.ts`:

```ts
/** Thrown when a .drawio payload cannot be unwrapped or parsed. */
export class DrawioParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawioParseError';
  }
}
```

- [ ] **Step 2: Write the failing mapping test**

`src/drawio/mxStyle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapDrawioStyleToShape } from './mxStyle';
import { SHAPE_KINDS } from '../types';

describe('mapDrawioStyleToShape', () => {
  const cases: [string, string][] = [
    ['ellipse;whiteSpace=wrap;', 'ellipse'],
    ['rhombus;whiteSpace=wrap;', 'decision'],
    ['shape=cylinder3;whiteSpace=wrap;', 'cylinder'],
    ['shape=cloud;', 'cloud'],
    ['shape=hexagon;', 'hexagon'],
    ['shape=parallelogram;', 'parallelogram'],
    ['shape=document;', 'document'],
    ['shape=umlActor;', 'actor'],
    ['shape=note;', 'note'],
    ['shape=terminator;', 'terminal'],
    ['text;html=1;', 'note'],
    ['rounded=1;whiteSpace=wrap;', 'rounded'],
    ['whiteSpace=wrap;html=1;', 'rectangle'],
    ['', 'rectangle'],
  ];
  it.each(cases)('maps %s → %s', (style, expected) => {
    expect(mapDrawioStyleToShape(style)).toBe(expected);
  });

  it('always returns a known ShapeKind (drift guard)', () => {
    const samples = ['ellipse', 'rhombus', 'foo=bar', '', 'shape=mystery', 'text;'];
    for (const s of samples) {
      expect(SHAPE_KINDS as readonly string[]).toContain(mapDrawioStyleToShape(s));
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/mxStyle.test.ts`
Expected: FAIL — module `./mxStyle` not found.

- [ ] **Step 4: Implement the mapping**

`src/drawio/mxStyle.ts`:

```ts
import { ShapeKind } from '../types';

/**
 * Best-effort map of a drawio `style` string to one of our 12 shapes.
 * First match wins; anything unrecognized falls back to `rectangle`.
 */
export function mapDrawioStyleToShape(style: string): ShapeKind {
  const s = (style || '').toLowerCase();
  if (s.includes('ellipse')) return 'ellipse';
  if (s.includes('rhombus')) return 'decision';
  if (s.includes('cylinder')) return 'cylinder';
  if (s.includes('cloud')) return 'cloud';
  if (s.includes('hexagon')) return 'hexagon';
  if (s.includes('parallelogram')) return 'parallelogram';
  if (s.includes('document')) return 'document';
  if (s.includes('actor')) return 'actor';          // matches umlActor too
  if (s.includes('note')) return 'note';
  if (s.includes('terminator')) return 'terminal';
  if (s.startsWith('text;') || s === 'text') return 'note';
  if (/(^|;)rounded=1(;|$)/.test(s)) return 'rounded';
  return 'rectangle';
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/mxStyle.test.ts`
Expected: PASS (all cases + drift guard).

- [ ] **Step 6: Commit**

```bash
git add src/drawio/errors.ts src/drawio/mxStyle.ts src/drawio/mxStyle.test.ts
git commit -m "feat(drawio): DrawioParseError + best-effort style→shape mapping"
```

---

## Task 2: Unwrap + decompress the diagram payload

**Files:**
- Create: `src/drawio/inflate.ts`, `src/drawio/inflate.test.ts`

- [ ] **Step 1: Write the failing test**

`src/drawio/inflate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMxGraphModel } from './inflate';
import { DrawioParseError } from './errors';

const MODEL = '<mxGraphModel dx="100"><root><mxCell id="2" value="Hi" vertex="1"/></root></mxGraphModel>';

async function compressToDrawio(modelXml: string): Promise<string> {
  const enc = encodeURIComponent(modelXml);
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(enc));
  w.close();
  const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return `<mxfile><diagram id="a" name="Page-1">${b64}</diagram></mxfile>`;
}

describe('extractMxGraphModel', () => {
  it('passes through an uncompressed Edit-Diagram payload', async () => {
    const file = `<mxfile><diagram>${MODEL}</diagram></mxfile>`;
    const out = await extractMxGraphModel(file);
    expect(out).toContain('<mxGraphModel');
    expect(out).toContain('value="Hi"');
  });

  it('decompresses a deflate-raw + base64 payload', async () => {
    const file = await compressToDrawio(MODEL);
    const out = await extractMxGraphModel(file);
    expect(out).toContain('<mxGraphModel');
    expect(out).toContain('value="Hi"');
  });

  it('throws DrawioParseError when there is no <diagram>', async () => {
    await expect(extractMxGraphModel('<mxfile></mxfile>')).rejects.toBeInstanceOf(DrawioParseError);
  });

  it('throws DrawioParseError on non-XML garbage', async () => {
    await expect(extractMxGraphModel('not xml at all')).rejects.toBeInstanceOf(DrawioParseError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/inflate.test.ts`
Expected: FAIL — module `./inflate` not found.

- [ ] **Step 3: Implement**

`src/drawio/inflate.ts`:

```ts
import { DrawioParseError } from './errors';

/** Inflate raw-deflate bytes to a string using the native DecompressionStream. */
async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Response(ds.readable).text();
}

/**
 * Unwrap a .drawio file to its <mxGraphModel> XML string.
 * Handles both uncompressed ("Edit Diagram") payloads and the default
 * base64(deflateRaw(encodeURIComponent(model))) form. Uses the FIRST <diagram> page.
 */
export async function extractMxGraphModel(fileText: string): Promise<string> {
  const doc = new DOMParser().parseFromString(fileText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new DrawioParseError('file is not valid XML');
  }
  const diagram = doc.querySelector('diagram');
  if (!diagram) throw new DrawioParseError('no <diagram> element found');

  // Uncompressed: the model is a child element.
  const inlineModel = diagram.querySelector('mxGraphModel');
  if (inlineModel) {
    return new XMLSerializer().serializeToString(inlineModel);
  }

  // Compressed: text content is base64(deflateRaw(encodeURIComponent(model))).
  const b64 = (diagram.textContent || '').trim();
  if (!b64) throw new DrawioParseError('empty <diagram> payload');
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const inflated = await inflateRaw(bytes);
    let xml: string;
    try {
      xml = decodeURIComponent(inflated);
    } catch {
      xml = inflated; // a few exporters don't URL-encode
    }
    if (!xml.includes('<mxGraphModel')) {
      throw new DrawioParseError('decompressed payload has no <mxGraphModel>');
    }
    return xml;
  } catch (err) {
    if (err instanceof DrawioParseError) throw err;
    throw new DrawioParseError('failed to decompress diagram payload');
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/inflate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/drawio/inflate.ts src/drawio/inflate.test.ts
git commit -m "feat(drawio): unwrap + native deflate-raw decompress of .drawio payloads"
```

---

## Task 3: mxGraph XML → JSON Canvas

**Files:**
- Create: `src/drawio/drawioToCanvas.ts`, `src/drawio/drawioToCanvas.test.ts`

- [ ] **Step 1: Write the failing test**

`src/drawio/drawioToCanvas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { drawioToCanvas } from './drawioToCanvas';
import { DrawioParseError } from './errors';

const MODEL = `
<mxGraphModel><root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="2" value="&lt;b&gt;Start&lt;/b&gt;" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="40" y="80" width="120" height="60" as="geometry"/>
  </mxCell>
  <mxCell id="3" value="DB" style="shape=cylinder3;" vertex="1" parent="1">
    <mxGeometry x="240" y="80" width="100" height="80" as="geometry"/>
  </mxCell>
  <mxCell id="4" value="saves" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3"/>
  <mxCell id="5" value="dangling" edge="1" parent="1" source="2" target="999"/>
</root></mxGraphModel>`;

describe('drawioToCanvas', () => {
  it('maps vertices to nodes with shape, label, and geometry', () => {
    const c = drawioToCanvas(MODEL);
    const start = c.nodes.find((n) => n.id === '2')!;
    expect(start.text).toBe('Start');                 // HTML stripped
    expect(start.metadata!['mm:shape']).toBe('rounded');
    expect([start.x, start.y, start.width, start.height]).toEqual([40, 80, 120, 60]);
    const db = c.nodes.find((n) => n.id === '3')!;
    expect(db.metadata!['mm:shape']).toBe('cylinder');
  });

  it('skips structural cells 0 and 1', () => {
    const c = drawioToCanvas(MODEL);
    expect(c.nodes.map((n) => n.id).sort()).toEqual(['2', '3']);
  });

  it('keeps a valid edge and drops one with a dangling endpoint', () => {
    const c = drawioToCanvas(MODEL);
    expect(c.edges).toHaveLength(1);
    expect(c.edges[0]).toMatchObject({ fromNode: '2', toNode: '3', label: 'saves' });
  });

  it('throws DrawioParseError when there is no <mxGraphModel>', () => {
    expect(() => drawioToCanvas('<foo/>')).toThrow(DrawioParseError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/drawioToCanvas.test.ts`
Expected: FAIL — module `./drawioToCanvas` not found.

- [ ] **Step 3: Implement**

`src/drawio/drawioToCanvas.ts`:

```ts
import { JSONCanvas, JSONCanvasNode, JSONCanvasEdge } from '../types';
import { mapDrawioStyleToShape } from './mxStyle';
import { DrawioParseError } from './errors';

/** drawio labels may contain HTML; reduce to plain text (never rendered as HTML). */
function plainText(value: string): string {
  if (!value) return '';
  const body = new DOMParser().parseFromString(value, 'text/html').body;
  return (body.textContent || '').trim();
}

function num(v: string | null, fallback: number): number {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Parse an <mxGraphModel> XML string into our native JSON Canvas. */
export function drawioToCanvas(modelXml: string): JSONCanvas {
  const doc = new DOMParser().parseFromString(modelXml, 'application/xml');
  const root = doc.querySelector('mxGraphModel > root') ?? doc.querySelector('root');
  if (!root) throw new DrawioParseError('no <mxGraphModel>/<root> in model');

  const cells = Array.from(root.querySelectorAll('mxCell'));
  const nodes: JSONCanvasNode[] = [];
  const vertexIds = new Set<string>();

  for (const cell of cells) {
    const id = cell.getAttribute('id') ?? '';
    if (id === '0' || id === '1') continue; // structural root + default layer
    if (cell.getAttribute('vertex') !== '1') continue;
    const geo = cell.querySelector('mxGeometry');
    nodes.push({
      id,
      type: 'text',
      x: num(geo?.getAttribute('x') ?? null, 0),
      y: num(geo?.getAttribute('y') ?? null, 0),
      width: num(geo?.getAttribute('width') ?? null, 120),
      height: num(geo?.getAttribute('height') ?? null, 60),
      text: plainText(cell.getAttribute('value') ?? ''),
      metadata: { 'mm:shape': mapDrawioStyleToShape(cell.getAttribute('style') ?? '') },
    });
    vertexIds.add(id);
  }

  const edges: JSONCanvasEdge[] = [];
  for (const cell of cells) {
    if (cell.getAttribute('edge') !== '1') continue;
    const source = cell.getAttribute('source');
    const target = cell.getAttribute('target');
    if (!source || !target || !vertexIds.has(source) || !vertexIds.has(target)) continue;
    const label = plainText(cell.getAttribute('value') ?? '');
    edges.push({
      id: cell.getAttribute('id') || `e-${source}-${target}`,
      fromNode: source,
      toNode: target,
      label: label || undefined,
    });
  }

  return { nodes, edges };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/drawioToCanvas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/drawio/drawioToCanvas.ts src/drawio/drawioToCanvas.test.ts
git commit -m "feat(drawio): parse mxGraph XML into native JSON Canvas (vertices/edges/geometry)"
```

---

## Task 4: `addImportedGraph` store action (no re-layout)

**Files:**
- Modify: `src/store/useWorkflowStore.ts` (interface + action)
- Test: `src/store/import.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`src/store/import.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

beforeEach(() => {
  useWorkflowStore.setState({ nodes: [], edges: [], isEditing: false });
  useWorkflowStore.temporal.getState().clear();
});

const node = (id: string, x: number, y: number) => ({
  id, type: 'shape', position: { x, y },
  data: { label: id, layer: 'projects', status: 'idle', shape: 'rectangle' },
});

describe('addImportedGraph', () => {
  it('appends nodes/edges preserving their positions (no auto-layout)', () => {
    useWorkflowStore.getState().addImportedGraph(
      [node('a', 40, 80) as any, node('b', 240, 80) as any],
      [{ id: 'e1', source: 'a', target: 'b' }],
    );
    const s = useWorkflowStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(s.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 80 });
    expect(s.edges).toHaveLength(1);
    expect(s.isEditing).toBe(true); // import is an edit
  });

  it('is a single undo step', () => {
    useWorkflowStore.getState().addImportedGraph([node('a', 0, 0) as any], []);
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/store/import.test.ts`
Expected: FAIL — `addImportedGraph` is not a function.

- [ ] **Step 3: Add to the interface**

In `src/store/useWorkflowStore.ts`, in `WorkflowState`, just after the existing
`addGeneratedGraph` line, add:

```ts
  addGeneratedGraph: (newNodes: Node<SOVERNNodeData>[], newEdges: Edge[]) => void;
  addImportedGraph: (newNodes: Node<SOVERNNodeData>[], newEdges: Edge[]) => void;
```

- [ ] **Step 4: Implement the action**

In `src/store/useWorkflowStore.ts`, immediately after the `addGeneratedGraph`
implementation, add:

```ts
  addImportedGraph: (newNodes, newEdges) => {
    get().enterEditMode();
    set({ nodes: [...get().nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
    // Imported diagrams carry real coordinates — recalc rollups but DON'T re-layout.
    withoutHistory(() => get().recalculate());
  },
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run --pool=threads src/store/import.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/store/import.test.ts
git commit -m "feat(drawio): addImportedGraph store action — append preserving positions, one undo step"
```

---

## Task 5: `importDrawio` orchestrator

**Files:**
- Create: `src/drawio/importDrawio.ts`, `src/drawio/importDrawio.test.ts`

- [ ] **Step 1: Write the failing test**

`src/drawio/importDrawio.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { importDrawio } from './importDrawio';

const MODEL = `<mxfile><diagram><mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="2" value="A" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>
  </mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const fileOf = (text: string) => ({ text: async () => text });

describe('importDrawio', () => {
  it('parses a file and appends namespaced nodes with preserved positions', async () => {
    const addGraph = vi.fn();
    await importDrawio(fileOf(MODEL) as any, { addGraph });
    expect(addGraph).toHaveBeenCalledTimes(1);
    const [nodes, edges] = addGraph.mock.calls[0];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id.startsWith('d-')).toBe(true);     // namespaced
    expect(nodes[0].position).toEqual({ x: 10, y: 20 }); // preserved
    expect(edges).toHaveLength(0);
  });

  it('calls onError and never addGraph on a parse failure', async () => {
    const addGraph = vi.fn();
    const onError = vi.fn();
    await importDrawio(fileOf('garbage') as any, { addGraph, onError });
    expect(addGraph).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/drawio/importDrawio.test.ts`
Expected: FAIL — module `./importDrawio` not found.

- [ ] **Step 3: Implement**

`src/drawio/importDrawio.ts`:

```ts
import { MarkerType } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { extractMxGraphModel } from './inflate';
import { drawioToCanvas } from './drawioToCanvas';
import { SOVERNNodeData } from '../types';
import type { Node, Edge } from '@xyflow/react';

interface Deps {
  addGraph?: (nodes: Node<SOVERNNodeData>[], edges: Edge[]) => void;
  onError?: (message: string) => void;
}

/** .drawio file → parsed, namespaced, position-preserving append to the canvas. */
export async function importDrawio(file: { text: () => Promise<string> }, deps: Deps = {}): Promise<void> {
  const addGraph = deps.addGraph ?? useWorkflowStore.getState().addImportedGraph;
  try {
    const model = await extractMxGraphModel(await file.text());
    const canvas = drawioToCanvas(model);
    const { nodes, edges } = fromJSONCanvas(canvas);

    // Namespace ids so an import never collides with existing / AI / prior-import ids.
    const idMap = new Map<string, string>();
    nodes.forEach((n) => idMap.set(n.id, `d-${crypto.randomUUID()}`));
    const newNodes = nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, selected: false }));
    const newEdges = edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: `e-${crypto.randomUUID()}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        type: 'smoothstep' as const,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      }));

    addGraph(newNodes as any, newEdges);
  } catch (err) {
    deps.onError?.(err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/drawio/importDrawio.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/drawio/importDrawio.ts src/drawio/importDrawio.test.ts
git commit -m "feat(drawio): importDrawio orchestrator — file → namespaced position-preserving append"
```

---

## Task 6: Toolbar entry button + App wiring

**Files:**
- Create: `src/components/DrawioImportButton.tsx`
- Modify: `src/App.tsx`

The repo has no DOM-render tests; this thin component is verified by typecheck/build
and the manual smoke (same treatment as `AiPromptBar` / `LearnControls`).

- [ ] **Step 1: Create the button**

`src/components/DrawioImportButton.tsx`:

```tsx
import { useRef } from 'react';
import type React from 'react';
import { Import } from 'lucide-react';
import { importDrawio } from '../drawio/importDrawio';
import { useWorkflowStore } from '../store/useWorkflowStore';

export function DrawioImportButton({ notify }: { notify: (msg: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const before = useWorkflowStore.getState().nodes.length;
    await importDrawio(file, { onError: (m) => notify('⚠ import: ' + m) });
    const after = useWorkflowStore.getState().nodes.length;
    if (after > before) notify(`Imported ${after - before} nodes`);
    e.target.value = ''; // allow re-importing the same file
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".drawio,.xml,application/xml"
        className="hidden"
        onChange={onPick}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title="Import .drawio"
        className="p-2.5 text-secondary hover:text-orange-400"
      >
        <Import size={18} />
      </button>
    </>
  );
}
```

- [ ] **Step 2: Wire it into the App toolbar**

In `src/App.tsx`, add the import near the other component imports:

```tsx
import { DrawioImportButton } from './components/DrawioImportButton';
```

Then, in the load-button cluster (the `<div className="flex space-x-1.5 px-2 border-r border-edge">` that holds `loadFromFile` / `loadWorkspace` / `saveToFile` / `onExport`), add the button right after the `loadWorkspace` ("Open my workspace") button:

```tsx
            <button onClick={loadWorkspace} title="Open my workspace" className="p-2.5 text-secondary hover:text-orange-400"><History size={18} /></button>
            <DrawioImportButton notify={notify} />
            <button onClick={saveToFile} title="Save canvas" className="p-2.5 text-secondary hover:text-accent"><Save size={18} /></button>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 4: Full test run**

Run: `npx vitest run --pool=threads`
Expected: all suites PASS (prior 94 + the new mxStyle/inflate/drawioToCanvas/import/importDrawio tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/DrawioImportButton.tsx src/App.tsx
git commit -m "feat(drawio): toolbar Import .drawio button wired into the canvas"
```

---

## Manual live smoke (after merge)

Not coded. In the browser dev server: click **Import .drawio**, pick a real `.drawio`
file (both a compressed save and an "Edit Diagram" export), and verify: shapes mapped
sensibly, labels are plain text, positions match the original layout, edges connect the
right nodes, and the whole import is a single Ctrl+Z. Then pick a non-drawio file and
confirm the `⚠ import:` toast shows and the canvas is unchanged.

## Notes for the implementer
- Run tests with `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls.
- `DOMParser` works in tests only because vitest runs in the **jsdom** environment — don't add jsdom imports.
- Keep labels as plain text (`textContent`) — never render `value` as HTML; it is untrusted file input.
- `importDrawio` takes a structural `{ text(): Promise<string> }`, so tests pass a stub and the button passes a real `File`.
- Imported diagrams keep their coordinates: append via `addImportedGraph` (no dagre), never `addGeneratedGraph`.
