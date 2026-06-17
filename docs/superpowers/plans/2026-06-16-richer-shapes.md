# Richer Shape Vocabulary + Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the canvas shape vocabulary from 5 to 12 shapes and teach the AI generator to use them — reusing the entire slice-1 generation pipeline unchanged.

**Architecture:** Shapes are rendered through a small `shapeGeometry` registry (CSS border-radius for box-family, stretched SVG silhouettes for geometric shapes, a lucide icon for actor/cloud). The shape kind stays an opaque string in JSON Canvas `metadata['mm:shape']`, so the converter is unchanged; only the `extractCanvas` allow-list and the generation prompt learn the new names.

**Tech Stack:** React 19, TS 5.8, @xyflow/react 12, Tailwind v4 (CSS-var tokens), lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-richer-shapes-design.md`

---

## File Structure

**New:**
- `src/components/nodes/shapeGeometry.tsx` — registry mapping each shape kind to a render mode (css / svg / icon) + the SVG silhouettes.

**Modified:**
- `src/types/index.ts` — expand the `shape` union to 12 values.
- `src/components/nodes/ShapeNode.tsx` — render from the registry (replaces the inline `SHAPE_CLASS` + rotate-45 diamond).
- `src/ai/extractCanvas.ts` — expand the `SHAPES` allow-list to 12.
- `src/ai/extractCanvas.test.ts` — fix the existing "unknown" case (was `hexagon`, now a valid shape) + add coverage.
- `src/ai/diagramPrompt.ts` — document the 12 shapes + richer few-shot.
- `src/ai/diagramPrompt.test.ts` — assert the new shape names appear.
- `src/utils/canvasConverter.test.ts` — round-trip a new shape (test-only).

**Unchanged (reused):** `litellmClient`, `config`, `generateDiagram`, `AiPromptBar`, `addGeneratedGraph`, `canvasConverter.ts`, the `/llm` proxy.

---

## Task 1: Shape union + geometry registry + ShapeNode refactor

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/components/nodes/shapeGeometry.tsx`
- Modify: `src/components/nodes/ShapeNode.tsx`

> Rendering is build-verified (React Flow nodes need a provider; per convention no unit test). Visual correctness confirmed in the final live smoke.

- [ ] **Step 1: Expand the `shape` union**

In `src/types/index.ts`, replace the existing `shape?:` line in `interface SOVERNNodeData`:

```ts
  shape?: 'rectangle' | 'rounded' | 'decision' | 'terminal' | 'note';
```

with:

```ts
  shape?:
    | 'rectangle' | 'rounded' | 'decision' | 'terminal' | 'note'
    | 'cylinder' | 'ellipse' | 'parallelogram' | 'hexagon' | 'cloud' | 'actor' | 'document';
```

- [ ] **Step 2: Create `src/components/nodes/shapeGeometry.tsx`**

```tsx
import { ReactNode } from 'react';
import { User, Cloud } from 'lucide-react';
import { SOVERNNodeData } from '../../types';

export type ShapeKind = NonNullable<SOVERNNodeData['shape']>;

export interface ShapeRender {
  mode: 'css' | 'svg' | 'icon';
  /** css/icon mode: border-radius (and frame) classes */
  className?: string;
  /** svg mode: silhouette stretched behind the label */
  svg?: (selected: boolean) => ReactNode;
  /** icon mode: lucide icon shown above the label */
  Icon?: typeof User;
}

const strokeStyle = (selected: boolean) => ({
  stroke: selected ? 'var(--accent)' : 'var(--border-strong)',
  fill: 'var(--bg-surface)',
  strokeWidth: 2,
  vectorEffect: 'non-scaling-stroke' as const,
});

const Frame = ({ children }: { children: ReactNode }) => (
  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
    {children}
  </svg>
);

export const SHAPE_GEOMETRY: Record<ShapeKind, ShapeRender> = {
  rectangle: { mode: 'css', className: 'rounded-none' },
  rounded: { mode: 'css', className: 'rounded-xl' },
  terminal: { mode: 'css', className: 'rounded-full' },
  note: { mode: 'css', className: 'rounded-md' },
  ellipse: { mode: 'css', className: 'rounded-[50%]' },
  decision: { mode: 'svg', svg: (s) => <Frame><polygon points="50,3 97,50 50,97 3,50" style={strokeStyle(s)} /></Frame> },
  parallelogram: { mode: 'svg', svg: (s) => <Frame><polygon points="22,8 97,8 78,92 3,92" style={strokeStyle(s)} /></Frame> },
  hexagon: { mode: 'svg', svg: (s) => <Frame><polygon points="28,6 72,6 97,50 72,94 28,94 3,50" style={strokeStyle(s)} /></Frame> },
  cylinder: { mode: 'svg', svg: (s) => (
    <Frame>
      <path d="M5,18 v64 a45,14 0 0 0 90,0 v-64" style={strokeStyle(s)} />
      <ellipse cx="50" cy="18" rx="45" ry="14" style={strokeStyle(s)} />
    </Frame>
  ) },
  document: { mode: 'svg', svg: (s) => <Frame><path d="M5,8 H95 V82 q-22.5,14 -45,0 t-45,0 Z" style={strokeStyle(s)} /></Frame> },
  actor: { mode: 'icon', Icon: User, className: 'rounded-xl' },
  cloud: { mode: 'icon', Icon: Cloud, className: 'rounded-2xl' },
};
```

- [ ] **Step 3: Refactor `src/components/nodes/ShapeNode.tsx`**

Replace the entire file with:

```tsx
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { SOVERNNodeData } from '../../types';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { SHAPE_GEOMETRY, ShapeKind } from './shapeGeometry';

export const ShapeNode = ({ id, data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const shape = (data.shape ?? 'rectangle') as ShapeKind;
  const geom = SHAPE_GEOMETRY[shape] ?? SHAPE_GEOMETRY.rectangle;

  const editing = useWorkflowStore((s) => s.editingNodeId === id);
  const commit = useWorkflowStore((s) => s.commitInlineEdit);
  const cancel = useWorkflowStore((s) => s.cancelInlineEdit);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) { setDraft(data.label); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, data.label]);

  const label = editing ? (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(id, draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(id, draft); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        e.stopPropagation();
      }}
      className="nodrag nopan font-semibold text-sm text-primary leading-tight bg-surface-2 border border-accent rounded-md p-1 w-full resize-none outline-none"
      rows={2}
    />
  ) : (
    <div
      className="font-semibold text-sm text-primary leading-tight text-center cursor-text"
      onDoubleClick={() => useWorkflowStore.getState().beginInlineEdit(id)}
    >
      {data.label}
    </div>
  );

  const ring = selected ? 'ring-4 ring-accent/20' : '';
  const Icon = geom.Icon;

  let content: JSX.Element;
  if (geom.mode === 'svg') {
    content = (
      <div className={`relative px-5 py-4 min-w-[150px] max-w-[240px] ${ring}`}>
        {geom.svg!(!!selected)}
        <div className="relative">{label}</div>
      </div>
    );
  } else if (geom.mode === 'icon') {
    content = (
      <div className={`px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 flex flex-col items-center gap-1 ${
        selected ? `border-accent ${ring}` : 'border-edge hover:border-edge-strong'
      } ${geom.className ?? ''}`}>
        {Icon && <Icon size={20} className="text-accent" />}
        {label}
      </div>
    );
  } else {
    content = (
      <div className={`px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 transition-all ${
        selected ? `border-accent ${ring}` : 'border-edge hover:border-edge-strong'
      } ${geom.className ?? ''}`}>
        {label}
      </div>
    );
  }

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
      {content}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
    </div>
  );
};
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/components/nodes/shapeGeometry.tsx src/components/nodes/ShapeNode.tsx
git commit -m "feat(shapes): expand to 12 shapes via shapeGeometry registry (cylinder/cloud/actor/…)"
```

---

## Task 2: Expand `extractCanvas` allow-list

**Files:**
- Modify: `src/ai/extractCanvas.ts`
- Modify: `src/ai/extractCanvas.test.ts`

> IMPORTANT: the slice-1 test `coerces an unknown mm:shape to rectangle` uses `"hexagon"` — which is now a **valid** shape. That test must change to a still-unknown value, or it will (correctly) fail.

- [ ] **Step 1: Update + add tests**

In `src/ai/extractCanvas.test.ts`, find the existing test:

```ts
  it('coerces an unknown mm:shape to rectangle', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:shape":"hexagon"}}],"edges":[]}';
    expect(extractCanvas(raw).nodes[0].metadata!['mm:shape']).toBe('rectangle');
  });
```

Replace its `raw` to use a value that is still unknown (`"trapezoid"`):

```ts
  it('coerces an unknown mm:shape to rectangle', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:shape":"trapezoid"}}],"edges":[]}';
    expect(extractCanvas(raw).nodes[0].metadata!['mm:shape']).toBe('rectangle');
  });
```

Then add a new test (inside the same `describe`) asserting an extended shape passes through:

```ts
  it('keeps a recognized extended shape (cylinder)', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"DB","metadata":{"mm:shape":"cylinder"}}],"edges":[]}';
    expect(extractCanvas(raw).nodes[0].metadata!['mm:shape']).toBe('cylinder');
  });
```

- [ ] **Step 2: Run tests, verify the cylinder test fails**

Run: `npx vitest run src/ai/extractCanvas.test.ts --pool=threads`
Expected: the `cylinder` test FAILS (cylinder coerced to rectangle by the old 5-item list); the `trapezoid` test passes.

- [ ] **Step 3: Expand the `SHAPES` list**

In `src/ai/extractCanvas.ts`, replace:

```ts
const SHAPES = ['rectangle', 'rounded', 'decision', 'terminal', 'note'];
```

with:

```ts
const SHAPES = [
  'rectangle', 'rounded', 'decision', 'terminal', 'note',
  'cylinder', 'ellipse', 'parallelogram', 'hexagon', 'cloud', 'actor', 'document',
];
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/ai/extractCanvas.test.ts --pool=threads`
Expected: PASS (all, including `cylinder` pass-through and `trapezoid`→rectangle).

- [ ] **Step 5: Commit**

```bash
git add src/ai/extractCanvas.ts src/ai/extractCanvas.test.ts
git commit -m "feat(ai): extractCanvas accepts the 12-shape vocabulary"
```

---

## Task 3: Richer generation prompt

**Files:**
- Modify: `src/ai/diagramPrompt.ts`
- Modify: `src/ai/diagramPrompt.test.ts`

- [ ] **Step 1: Add a failing assertion**

In `src/ai/diagramPrompt.test.ts`, inside the existing `describe('buildDiagramMessages', ...)`, add:

```ts
  it('documents the extended shapes', () => {
    const sys = buildDiagramMessages('x')[0].content;
    expect(sys).toContain('cylinder');
    expect(sys).toContain('actor');
    expect(sys).toContain('cloud');
  });
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/ai/diagramPrompt.test.ts --pool=threads`
Expected: FAIL (the new shapes aren't in the prompt yet).

- [ ] **Step 3: Update the SYSTEM prompt**

In `src/ai/diagramPrompt.ts`, replace the whole `SYSTEM` constant with:

```ts
const SYSTEM = `You convert a request into a diagram expressed as an Obsidian JSON Canvas document.
Output ONLY the JSON object — no prose, no markdown code fences.

Schema:
{
  "nodes": [{ "id": "n1", "type": "text", "x": 0, "y": 0, "width": 160, "height": 64,
              "text": "label", "metadata": { "mm:shape": "rounded" } }],
  "edges": [{ "id": "e1", "fromNode": "n1", "toNode": "n2", "label": "optional" }]
}

"mm:shape" must be one of these, chosen by meaning:
- terminal = start or end point
- rounded = a step / action
- rectangle = a generic box
- decision = a yes/no branch (use edge "label" for the conditions)
- note = an annotation / comment
- cylinder = a database / datastore
- actor = a user, person, or external role
- cloud = an external service or the internet
- parallelogram = input or output (data in/out)
- hexagon = a process / preparation step
- document = a document, file, or report
- ellipse = an event or state

Use short ids ("n1","n2"...). Connect nodes with edges by id. Positions can be 0 — they will be auto-laid-out.

Example for "user signs up; data saved to a database; a confirmation email is sent via a queue":
{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":160,"height":64,"text":"User","metadata":{"mm:shape":"actor"}},{"id":"n2","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Sign-up form","metadata":{"mm:shape":"rounded"}},{"id":"n3","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Users DB","metadata":{"mm:shape":"cylinder"}},{"id":"n4","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Email queue","metadata":{"mm:shape":"parallelogram"}},{"id":"n5","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Email service","metadata":{"mm:shape":"cloud"}}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2","label":"submits"},{"id":"e2","fromNode":"n2","toNode":"n3","label":"save"},{"id":"e3","fromNode":"n2","toNode":"n4","label":"enqueue"},{"id":"e4","fromNode":"n4","toNode":"n5","label":"send"}]}`;
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/ai/diagramPrompt.test.ts --pool=threads`
Expected: PASS (both the existing test and the new `documents the extended shapes`).

- [ ] **Step 5: Commit**

```bash
git add src/ai/diagramPrompt.ts src/ai/diagramPrompt.test.ts
git commit -m "feat(ai): teach the generator the 12-shape vocabulary + richer few-shot"
```

---

## Task 4: Converter round-trip test for a new shape

**Files:**
- Modify: `src/utils/canvasConverter.test.ts`

> No production code changes — the converter already round-trips `data.shape` as an opaque `mm:shape` string. This test pins that a *new* shape survives save/reload.

- [ ] **Step 1: Add the test**

In `src/utils/canvasConverter.test.ts`, inside the existing `describe('canvasConverter mm:shape', ...)`, add:

```ts
  it('round-trips an extended shape (cylinder)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'db', type: 'shape', position: { x: 0, y: 0 },
      data: { label: 'Users', layer: 'projects', status: 'idle', shape: 'cylinder' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('cylinder');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('cylinder');
  });
```

(`Node`, `toJSONCanvas`, `fromJSONCanvas`, `SOVERNNodeData` are already imported at the top of that test file.)

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/utils/canvasConverter.test.ts --pool=threads`
Expected: PASS (the new test plus the existing 4).

- [ ] **Step 3: Build + full suite**

Run: `npm run build && npx vitest run --pool=threads`
Expected: build exit 0, all tests PASS (67 + 3 new = 70).

- [ ] **Step 4: Commit**

```bash
git add src/utils/canvasConverter.test.ts
git commit -m "test(canvas): round-trip an extended shape (cylinder) through JSON Canvas"
```

---

## Final verification

- [ ] `npm run build && npx vitest run --pool=threads` — build exit 0, all green (70 tests).
- [ ] Live smoke (mock gateway like slice 1): run a mock returning a JSON Canvas using `actor`/`cylinder`/`cloud`/`parallelogram`, type a prompt → confirm the new shapes render as **distinct silhouettes** (cylinder with a lip, cloud/actor with icons, parallelogram skewed) on the canvas, editable, single-undo. (Real-model check when LiteLLM is up — gateway port 4000 per services.json.)

## Self-Review Notes (author)

- **Spec coverage:** 12-shape union (T1) ✓; shapeGeometry registry + ShapeNode render (T1) ✓; extractCanvas allow-list (T2) ✓; richer prompt + few-shot (T3) ✓; converter round-trip unchanged + pinned by test (T4) ✓. Pipeline reuse: no changes to generateDiagram/AiPromptBar/addGeneratedGraph/client/proxy ✓.
- **Breaking-test gotcha handled:** slice-1's `hexagon`-as-unknown test is updated to `trapezoid` in T2 (hexagon is now valid).
- **Type consistency:** `ShapeKind` derived from `SOVERNNodeData['shape']`; `SHAPE_GEOMETRY` keyed by all 12; `extractCanvas` `SHAPES` list and the prompt's documented values both match the union exactly (12 names).
- **No placeholders.** SVG paths are concrete; visual polish (not correctness) is confirmed in live smoke.
