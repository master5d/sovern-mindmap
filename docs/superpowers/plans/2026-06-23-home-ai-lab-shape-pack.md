# Home AI-Lab Semantic Shape Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 14 home-AI-lab semantic shapes (compute / networking / ML-software) to the diagram vocabulary so the AI-generation flow can draw a home lab, rendered via the existing lucide `icon` mode.

**Architecture:** Extend the single source-of-truth shape enum (`SHAPE_KINDS`) and, in lockstep, the geometry registry, the AI system prompt, and the drawio style map — all of which the existing test suite already guards for completeness against the enum. New shapes render through the existing `icon` render mode (no `ShapeNode.tsx` change). drawio round-trip fidelity is achieved by embedding a `mmShape=<kind>` marker in the drawio style string (foreign drawio degrades it to a rounded rectangle; our own importer parses the marker back).

**Tech Stack:** TypeScript, React 19, @xyflow/react 12, lucide-react (already installed), Vitest.

## Global Constraints

- **No new dependencies** — icons come only from `lucide-react` (already installed).
- **One flat enum** — all shapes live in the single `mm:shape` vocabulary; no categories/namespaces.
- **Semantic keys are fixed** — `server`, `gpu`, `workstation`, `laptop`, `storage`, `router`, `switch`, `firewall`, `wifi`, `model`, `agent`, `vector-store`, `gateway`, `container`. (lucide *icon* choices may be swapped for legibility; keys may not.)
- **Theme-aware** — icon mode is monochrome via `currentColor`; readable on light + dark.
- **Out of scope** — public-cloud icon sets (AWS/Azure/GCP); manual shape-picker palette UI; mapping to drawio native network stencils; a `queue` shape (use existing `parallelogram`).
- **drawio degradation is acceptable** — in foreign drawio tools the new shapes show as labeled rounded rectangles; full shape fidelity is only guaranteed for our own export→import round-trip.

---

### Task 1: Home-lab vocabulary end-to-end (enum + geometry + prompt + drawio style)

These four files are bound by the TypeScript compiler (`SHAPE_STYLE` is an exhaustive `Record<ShapeKind, string>`) and by two existing completeness tests (`shapeGeometry.test.ts` asserts geometry-keys === enum AND prompt-contains-every-kind; `mxStyle.test.ts` asserts the style round-trip for every kind). They cannot be committed half-done, so they form one task.

**Files:**
- Modify: `src/types/index.ts` (the `SHAPE_KINDS` array)
- Modify: `src/components/nodes/shapeGeometry.tsx` (lucide imports + 14 registry entries)
- Modify: `src/ai/diagramPrompt.ts` (home-lab vocabulary section + one example)
- Modify: `src/drawio/mxStyle.ts` (14 `SHAPE_STYLE` entries + a `mmShape=` parse branch + value import of `SHAPE_KINDS`)
- Test: `src/ai/diagramPrompt.test.ts` (add home-lab assertions)
- Test (existing, will re-pass): `src/components/nodes/shapeGeometry.test.ts`, `src/drawio/mxStyle.test.ts`

**Interfaces:**
- Consumes: existing `SHAPE_KINDS`, `ShapeKind` (`src/types/index.ts`); `SHAPE_GEOMETRY` shape `{ mode: 'icon', Icon, className }` (`shapeGeometry.tsx`); `mapShapeToDrawioStyle` / `mapDrawioStyleToShape` (`mxStyle.ts`); `buildDiagramMessages` (`diagramPrompt.ts`).
- Produces: 14 new valid `ShapeKind` values usable everywhere `shape` flows. No new exported symbols — only the value-sets of existing ones grow. `extractCanvas.ts` already validates `mm:shape` against `SHAPE_KINDS` dynamically, so generated diagrams accept the new keys with no change there.

- [ ] **Step 1: Write the failing prompt test**

In `src/ai/diagramPrompt.test.ts`, add inside the top-level `describe('buildDiagramMessages', ...)`:

```ts
  it('documents the home AI-lab shapes and guards their scope', () => {
    const sys = buildDiagramMessages('x')[0].content;
    for (const kind of [
      'server', 'gpu', 'workstation', 'laptop', 'storage',
      'router', 'switch', 'firewall', 'wifi',
      'model', 'agent', 'vector-store', 'gateway', 'container',
    ]) {
      expect(sys).toContain(kind);
    }
    // Scope guard so these don't leak into ordinary business flowcharts.
    expect(sys).toContain('Home AI-lab infrastructure');
  });
```

- [ ] **Step 2: Run the prompt test to verify it fails**

Run: `npm test -- src/ai/diagramPrompt.test.ts`
Expected: FAIL — the new `it(...)` fails on the first missing key (e.g. `expect(sys).toContain('server')`).

- [ ] **Step 3: Extend the enum**

In `src/types/index.ts`, replace the `SHAPE_KINDS` declaration with:

```ts
export const SHAPE_KINDS = [
  'rectangle', 'rounded', 'decision', 'terminal', 'note',
  'cylinder', 'ellipse', 'parallelogram', 'hexagon', 'cloud', 'actor', 'document',
  // home AI-lab pack (slice 8)
  'server', 'gpu', 'workstation', 'laptop', 'storage',
  'router', 'switch', 'firewall', 'wifi',
  'model', 'agent', 'vector-store', 'gateway', 'container',
] as const;
```

- [ ] **Step 4: Run the geometry completeness test to verify the enum break is caught**

Run: `npm test -- src/components/nodes/shapeGeometry.test.ts`
Expected: FAIL — `registry covers exactly the shape kinds` fails because `SHAPE_GEOMETRY` is now missing the 14 new keys. (This confirms the single-source-of-truth guard works.) Note: at this point `npm run build` would also fail to typecheck because `SHAPE_STYLE` is no longer exhaustive — that is fixed in Step 6.

- [ ] **Step 5: Add the 14 geometry entries**

In `src/components/nodes/shapeGeometry.tsx`, update the lucide import on line 2 and add 14 entries to `SHAPE_GEOMETRY`.

Replace the import:

```tsx
import {
  User, Cloud, Server, CircuitBoard, Monitor, Laptop, HardDrive,
  Router, Network, ShieldCheck, Wifi, BrainCircuit, Bot, Boxes, Webhook, Container,
} from 'lucide-react';
```

Then, inside the `SHAPE_GEOMETRY` object, immediately after the `cloud: { ... }` line, add:

```tsx
  server: { mode: 'icon', Icon: Server, className: 'rounded-xl' },
  gpu: { mode: 'icon', Icon: CircuitBoard, className: 'rounded-xl' },
  workstation: { mode: 'icon', Icon: Monitor, className: 'rounded-xl' },
  laptop: { mode: 'icon', Icon: Laptop, className: 'rounded-xl' },
  storage: { mode: 'icon', Icon: HardDrive, className: 'rounded-xl' },
  router: { mode: 'icon', Icon: Router, className: 'rounded-xl' },
  switch: { mode: 'icon', Icon: Network, className: 'rounded-xl' },
  firewall: { mode: 'icon', Icon: ShieldCheck, className: 'rounded-xl' },
  wifi: { mode: 'icon', Icon: Wifi, className: 'rounded-xl' },
  model: { mode: 'icon', Icon: BrainCircuit, className: 'rounded-xl' },
  agent: { mode: 'icon', Icon: Bot, className: 'rounded-xl' },
  'vector-store': { mode: 'icon', Icon: Boxes, className: 'rounded-xl' },
  gateway: { mode: 'icon', Icon: Webhook, className: 'rounded-xl' },
  container: { mode: 'icon', Icon: Container, className: 'rounded-xl' },
```

(If any icon name does not resolve from the installed `lucide-react`, substitute the nearest existing glyph of the same meaning — the key stays the same. Verify names at `node_modules/lucide-react`.)

- [ ] **Step 6: Add the 14 drawio style entries + the marker parse branch**

In `src/drawio/mxStyle.ts`:

(a) Change the import on line 1 to also bring in the value:

```ts
import { ShapeKind, SHAPE_KINDS } from '../types';
```

(b) Inside the `SHAPE_STYLE` record, after the `document:` line, add (each embeds a `mmShape=` marker; `rounded=1` makes foreign drawio render a rounded rect):

```ts
  server: 'rounded=1;whiteSpace=wrap;html=1;mmShape=server;',
  gpu: 'rounded=1;whiteSpace=wrap;html=1;mmShape=gpu;',
  workstation: 'rounded=1;whiteSpace=wrap;html=1;mmShape=workstation;',
  laptop: 'rounded=1;whiteSpace=wrap;html=1;mmShape=laptop;',
  storage: 'rounded=1;whiteSpace=wrap;html=1;mmShape=storage;',
  router: 'rounded=1;whiteSpace=wrap;html=1;mmShape=router;',
  switch: 'rounded=1;whiteSpace=wrap;html=1;mmShape=switch;',
  firewall: 'rounded=1;whiteSpace=wrap;html=1;mmShape=firewall;',
  wifi: 'rounded=1;whiteSpace=wrap;html=1;mmShape=wifi;',
  model: 'rounded=1;whiteSpace=wrap;html=1;mmShape=model;',
  agent: 'rounded=1;whiteSpace=wrap;html=1;mmShape=agent;',
  'vector-store': 'rounded=1;whiteSpace=wrap;html=1;mmShape=vector-store;',
  gateway: 'rounded=1;whiteSpace=wrap;html=1;mmShape=gateway;',
  container: 'rounded=1;whiteSpace=wrap;html=1;mmShape=container;',
```

(c) In `mapDrawioStyleToShape`, add the marker check as the **first** branch (it must win over the `rounded=1` heuristic), immediately after `const s = (style || '').toLowerCase();`:

```ts
  // Our own export embeds the exact semantic shape as a style marker (icon-pack
  // shapes have no native drawio equivalent). Parse it back first; foreign drawio
  // lacks the marker and falls through to the visual heuristics below.
  const mm = s.match(/mmshape=([a-z-]+)/);
  if (mm && (SHAPE_KINDS as readonly string[]).includes(mm[1])) return mm[1] as ShapeKind;
```

(Optional but recommended: update the doc-comment above `SHAPE_STYLE` to note that icon-pack shapes degrade to `rounded` visually and rely on the `mmShape=` marker for round-trip identity.)

- [ ] **Step 7: Add the home-lab vocabulary + example to the AI prompt**

In `src/ai/diagramPrompt.ts`, inside the `SYSTEM` template string, immediately after the line `- ellipse = an event or state` (the last flowchart shape), insert:

```

Home AI-lab infrastructure (use ONLY when the diagram is about computers, networking, or an AI/ML stack — never in ordinary business flowcharts):
- server = a headless host or node
- gpu = a GPU / accelerator node
- workstation = a desktop or dev machine
- laptop = a laptop
- storage = NAS or disk storage (use cylinder for a database)
- router = a router or gateway device
- switch = a network switch
- firewall = a firewall
- wifi = a Wi-Fi access point
- model = an LLM or model
- agent = an AI agent
- vector-store = a vector database / embeddings store
- gateway = an API gateway or proxy (e.g. LiteLLM)
- container = a Docker container or service
```

Then, immediately before the closing backtick of the `SYSTEM` string (after the existing sign-up example), append a second example:

```
Example for "my home AI lab: a Mac mini orchestrator calls a LiteLLM gateway, which routes to an Ollama model and a vector store; a GPU node serves the model":
{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Mac mini orchestrator","metadata":{"mm:shape":"server"}},{"id":"n2","type":"text","x":0,"y":0,"width":160,"height":64,"text":"LiteLLM gateway","metadata":{"mm:shape":"gateway"}},{"id":"n3","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Ollama model","metadata":{"mm:shape":"model"}},{"id":"n4","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Vector store","metadata":{"mm:shape":"vector-store"}},{"id":"n5","type":"text","x":0,"y":0,"width":160,"height":64,"text":"GPU node","metadata":{"mm:shape":"gpu"}}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2","label":"calls"},{"id":"e2","fromNode":"n2","toNode":"n3","label":"routes"},{"id":"e3","fromNode":"n2","toNode":"n4","label":"queries"},{"id":"e4","fromNode":"n5","toNode":"n3","label":"serves"}]}
```

- [ ] **Step 8: Run the three guarded test files to verify they all pass**

Run: `npm test -- src/ai/diagramPrompt.test.ts src/components/nodes/shapeGeometry.test.ts src/drawio/mxStyle.test.ts`
Expected: PASS — geometry registry === enum; prompt contains every kind incl. the 14 new + `Home AI-lab infrastructure`; `mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s` for every kind (the 14 new resolve via the `mmShape=` marker).

- [ ] **Step 9: Typecheck/build to confirm the exhaustive Record compiles**

Run: `npm run build`
Expected: PASS — no TypeScript errors (`SHAPE_STYLE` and `SHAPE_GEOMETRY` are now exhaustive over the grown enum).

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/components/nodes/shapeGeometry.tsx src/ai/diagramPrompt.ts src/drawio/mxStyle.ts src/ai/diagramPrompt.test.ts
git commit -m "feat: home AI-lab semantic shape pack (14 icon shapes)"
```

---

### Task 2: drawio round-trip fidelity test for an icon shape

Proves an icon-pack shape survives our own export→import unchanged (not silently degraded to `rounded`). Separable from Task 1: a reviewer could accept the vocabulary yet demand explicit round-trip proof.

**Files:**
- Test: `src/drawio/canvasToDrawio.test.ts` (add one case)

**Interfaces:**
- Consumes: `canvasToDrawio(nodes, edges): string`, `extractMxGraphModel(xml): Promise<string>` (`./inflate`), `drawioToCanvas(modelXml): JSONCanvas` — all already imported at the top of this test file. Imported `JSONCanvas` node metadata exposes `metadata['mm:shape']`.

- [ ] **Step 1: Write the failing round-trip test**

In `src/drawio/canvasToDrawio.test.ts`, add inside the `describe('canvasToDrawio', ...)` block:

```ts
  it('preserves an icon-pack shape (gpu) through export ↔ import', async () => {
    const nodes = [{
      id: 'g', type: 'shape', position: { x: 0, y: 0 }, measured: { width: 120, height: 60 },
      data: { label: 'GPU node', layer: 'hosting', status: 'idle', shape: 'gpu' },
    }];
    const canvas = drawioToCanvas(await extractMxGraphModel(canvasToDrawio(nodes as any, [])));
    expect(canvas.nodes.find((n) => n.id === 'g')!.metadata!['mm:shape']).toBe('gpu');
  });
```

- [ ] **Step 2: Run the test to verify current behavior**

Run: `npm test -- src/drawio/canvasToDrawio.test.ts`
Expected: PASS if Task 1 is already merged (the `mmShape=gpu` marker round-trips). If this is run on a branch WITHOUT Task 1, it FAILS returning `'rounded'` — confirming the marker is what carries fidelity. (When executing sequentially after Task 1, expect PASS; the test still has value as a regression guard.)

- [ ] **Step 3: Commit**

```bash
git add src/drawio/canvasToDrawio.test.ts
git commit -m "test: drawio round-trip preserves icon-pack shape (gpu)"
```

---

### Task 3: Full-suite + build verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — entire suite green (no regressions in import/export, learn, undo, etc.).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS — no type errors, bundle builds.

- [ ] **Step 3: Optional manual smoke (non-blocking, slice-7 pattern)**

Start the dev server (`SOVERN_LLM_GATEWAY=http://localhost:4000 VITE_LLM_MODEL=fast-pool npm run dev`, port 1420), enter the AI prompt "draw my home AI lab: M4 mini orchestrator, LiteLLM gateway, Ollama model, vector store, GPU node", and confirm the response uses `server`/`gateway`/`model`/`gpu`/`vector-store` and the nodes render their lucide icons on both light and dark themes. This is a confidence check, not a blocking gate.

---

## Self-Review

**1. Spec coverage:**
- Rendering via existing `icon` mode → Task 1 Step 5. ✓
- 14-shape inventory (enum source of truth) → Task 1 Step 3. ✓
- AI prompt section + scope guard + example → Task 1 Step 7; asserted Task 1 Step 1. ✓
- drawio round-trip preserving shape → mxStyle marker Task 1 Step 6; proven Task 2. ✓ (Refinement vs spec: the spec assumed the exporter already wrote sovern metadata — it does not; fidelity is instead carried by a `mmShape=` style marker, which needs no change to `canvasToDrawio.ts`/`drawioToCanvas.ts` and keeps the existing invariant test green. Same DoD, smaller blast radius.)
- Testing: enum↔geometry completeness (existing), prompt completeness (existing + new home-lab assertion), round-trip (Task 2), smoke (Task 3 Step 3). ✓
- DoD: 26-shape render, AI emits + scope guard, round-trip via marker, tests green, build passes → Tasks 1–3. ✓
- Out-of-scope items (cloud, manual palette, native drawio stencils, queue) → none implemented. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows full code. The only deliberate latitude — swapping a lucide glyph that fails to resolve — is bounded (key fixed, nearest-meaning glyph, verify in `node_modules/lucide-react`). ✓

**3. Type consistency:** `SHAPE_KINDS` (value+type) used consistently; `ShapeKind` cast in the marker branch matches the function return type; `SHAPE_GEOMETRY` entry shape `{ mode, Icon, className }` matches `ShapeRender`; `SHAPE_STYLE` is `Record<ShapeKind, string>` and now exhaustive; `mm:shape` metadata key used identically in prompt, `extractCanvas`, and round-trip. Key `'vector-store'` is quoted everywhere it appears as an object key. ✓
