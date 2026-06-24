# Cloud-Provider Shape Pack (Slice 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 public-cloud provider marks (AWS, Azure, GCP) to the shape vocabulary (26 → 29) using real brand logos from `@icons-pack/react-simple-icons`, wired through every existing shape path (render, AI prompt, drawio, picker/library).

**Architecture:** Extend the single source of truth `SHAPE_KINDS` by 3, then add matching entries to each derived structure (`SHAPE_GEOMETRY` icon-mode render, `SHAPE_STYLE` drawio marker, the AI prompt scope-guard, and a third `SHAPE_GROUPS` group). simple-icons components are drop-in for the existing lucide `icon` render mode (same `size`/`className` props, `currentColor` default).

**Tech Stack:** React 19 + TypeScript, `@icons-pack/react-simple-icons` (NEW dep), `@xyflow/react`, Vitest 4 + jsdom.

## Global Constraints

- **One new dependency:** `@icons-pack/react-simple-icons` (`^13`). No others.
- `SHAPE_KINDS` (in `src/types/index.ts`) stays the single flat source of truth; the four derived structures — `SHAPE_GEOMETRY` (`shapeGeometry.tsx`), `SHAPE_STYLE` (`mxStyle.ts`), the AI prompt (`diagramPrompt.ts`), and `SHAPE_GROUPS` (`ShapePicker.tsx`) — must stay exhaustive against it (two are `Record<ShapeKind, …>` compile guards).
- Cloud marks render **monochrome via `currentColor`** (the icon-mode `className="text-accent"` path) — do NOT pass a `color` prop; no `ShapeNode.tsx` / `ShapeSwatch.tsx` change.
- drawio round-trip uses the existing `mmShape=<kind>` style marker (slice 8 pattern); the round-trip invariant test must stay green.
- AI scope-guard mirrors the slice-8 home-lab guard so cloud marks never leak into ordinary/home-lab diagrams.
- **Assumes slice 12 is already merged** (the `ShapeLibrary` swatches are `<button>`s and `ShapeLibrary.test.tsx` asserts `SHAPE_KINDS.length`, so it auto-adapts to 29 — no edit needed here).
- Run tests with `npm test` (`vitest run`); single file `npx vitest run <path>`; Windows worker-pool error → retry `--pool=threads`.
- Comments in english–russian mix. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-24-cloud-provider-shape-pack-design.md`

---

### Task 1: The 3 cloud shapes across all derived structures

This task is one cohesive unit: adding a key to `SHAPE_KINDS` makes the two `Record<ShapeKind,…>` guards (`SHAPE_GEOMETRY`, `SHAPE_STYLE`) fail to compile until their entries exist, and breaks the `SHAPE_GROUPS` length test and swatch-count tests — so they all land together.

**Files:**
- Modify: `package.json` (+ dependency)
- Modify: `src/types/index.ts` (`SHAPE_KINDS` +3, ~line 28-35)
- Modify: `src/components/nodes/shapeGeometry.tsx` (import + 3 entries + widen `Icon` type)
- Modify: `src/drawio/mxStyle.ts` (`SHAPE_STYLE` +3, ~line 40)
- Modify: `src/components/ShapePicker.tsx` (`SHAPE_GROUPS` third group, ~line 6-9)
- Test: `src/components/ShapePicker.test.tsx` (group + count assertions)

**Interfaces:**
- Consumes: `SHAPE_KINDS` / `ShapeKind` (`src/types`), the existing `SHAPE_GEOMETRY` / `SHAPE_STYLE` / `SHAPE_GROUPS` shapes.
- Produces: 3 new `ShapeKind`s `'aws' | 'azure' | 'gcp'`; `SHAPE_GROUPS` now has a third group `Cloud`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @icons-pack/react-simple-icons@^13`
Expected: `package.json` `dependencies` gains `@icons-pack/react-simple-icons`; install succeeds.

- [ ] **Step 2: Update the group + count tests (failing)**

In `src/components/ShapePicker.test.tsx`, replace the `SHAPE_GROUPS` describe block and the "renders one labelled button per shape" test:

Replace:
```tsx
describe('SHAPE_GROUPS', () => {
  it('splits SHAPE_KINDS into Basic (12) + Home AI-lab (14), covering all', () => {
    expect(SHAPE_GROUPS.map((g) => g.label)).toEqual(['Basic', 'Home AI-lab']);
    expect(SHAPE_GROUPS[0].kinds.length).toBe(12);
    expect(SHAPE_GROUPS[1].kinds.length).toBe(14);
    expect([...SHAPE_GROUPS[0].kinds, ...SHAPE_GROUPS[1].kinds]).toEqual([...SHAPE_KINDS]);
  });
});
```
with:
```tsx
describe('SHAPE_GROUPS', () => {
  it('splits SHAPE_KINDS into Basic (12) + Home AI-lab (14) + Cloud (3), covering all', () => {
    expect(SHAPE_GROUPS.map((g) => g.label)).toEqual(['Basic', 'Home AI-lab', 'Cloud']);
    expect(SHAPE_GROUPS[0].kinds.length).toBe(12);
    expect(SHAPE_GROUPS[1].kinds.length).toBe(14);
    expect(SHAPE_GROUPS[2].kinds.length).toBe(3);
    expect([...SHAPE_GROUPS[0].kinds, ...SHAPE_GROUPS[1].kinds, ...SHAPE_GROUPS[2].kinds]).toEqual([...SHAPE_KINDS]);
  });
});
```

Replace:
```tsx
  it('renders one labelled button per shape (26 total)', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelectorAll('button[aria-label]').length).toBe(26);
    cleanup();
  });
```
with:
```tsx
  it('renders one labelled button per shape (29 total)', () => {
    const { container, cleanup } = mount(<ShapePicker />);
    expect(container.querySelectorAll('button[aria-label]').length).toBe(29);
    cleanup();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/ShapePicker.test.tsx`
Expected: FAIL — `SHAPE_GROUPS` has 2 groups (expected 3) and the picker renders 26 buttons (expected 29). (Code still compiles — `SHAPE_KINDS` not yet changed.)

- [ ] **Step 4: Add the 3 kinds to `SHAPE_KINDS`**

In `src/types/index.ts`, change the `SHAPE_KINDS` array (the home-lab block ends with `'container',`):

```ts
export const SHAPE_KINDS = [
  'rectangle', 'rounded', 'decision', 'terminal', 'note',
  'cylinder', 'ellipse', 'parallelogram', 'hexagon', 'cloud', 'actor', 'document',
  // home AI-lab pack (slice 8)
  'server', 'gpu', 'workstation', 'laptop', 'storage',
  'router', 'switch', 'firewall', 'wifi',
  'model', 'agent', 'vector-store', 'gateway', 'container',
  // cloud providers (slice 11)
  'aws', 'azure', 'gcp',
] as const;
```

- [ ] **Step 5: Add the render entries + widen the `Icon` type**

In `src/components/nodes/shapeGeometry.tsx`:

(a) Change the React import (line 1) from:
```tsx
import { ReactNode } from 'react';
```
to:
```tsx
import { ComponentType, ReactNode } from 'react';
```

(b) Add the simple-icons import after the lucide import block (after line 5):
```tsx
import { SiAmazonwebservices, SiMicrosoftazure, SiGooglecloud } from '@icons-pack/react-simple-icons';
```

(c) Widen the `Icon` field type (line 17) from:
```tsx
  /** icon mode: lucide icon shown above the label */
  Icon?: typeof User;
```
to:
```tsx
  /** icon mode: lucide or simple-icons component shown above the label */
  Icon?: ComponentType<{ size?: number | string; className?: string }>;
```

(d) Add 3 entries to `SHAPE_GEOMETRY`, after the `container:` line (line 64):
```tsx
  aws: { mode: 'icon', Icon: SiAmazonwebservices, className: 'rounded-xl' },
  azure: { mode: 'icon', Icon: SiMicrosoftazure, className: 'rounded-xl' },
  gcp: { mode: 'icon', Icon: SiGooglecloud, className: 'rounded-xl' },
```

- [ ] **Step 6: Add the drawio style entries**

In `src/drawio/mxStyle.ts`, add 3 entries to `SHAPE_STYLE` after the `container:` line (line 40):
```ts
  aws: 'rounded=1;whiteSpace=wrap;html=1;mmShape=aws;',
  azure: 'rounded=1;whiteSpace=wrap;html=1;mmShape=azure;',
  gcp: 'rounded=1;whiteSpace=wrap;html=1;mmShape=gcp;',
```

- [ ] **Step 7: Add the third picker group**

In `src/components/ShapePicker.tsx`, change `SHAPE_GROUPS` (lines 6-9) from:
```tsx
export const SHAPE_GROUPS: { label: string; kinds: ShapeKind[] }[] = [
  { label: 'Basic', kinds: SHAPE_KINDS.slice(0, 12) as ShapeKind[] },
  { label: 'Home AI-lab', kinds: SHAPE_KINDS.slice(12) as ShapeKind[] },
];
```
to:
```tsx
export const SHAPE_GROUPS: { label: string; kinds: ShapeKind[] }[] = [
  { label: 'Basic', kinds: SHAPE_KINDS.slice(0, 12) as ShapeKind[] },
  { label: 'Home AI-lab', kinds: SHAPE_KINDS.slice(12, 26) as ShapeKind[] },
  { label: 'Cloud', kinds: SHAPE_KINDS.slice(26) as ShapeKind[] },
];
```

- [ ] **Step 8: Typecheck + targeted tests**

Run: `npx tsc --noEmit`
Expected: no errors (both `Record<ShapeKind,…>` guards now satisfied; simple-icons components satisfy the widened `Icon` type).

Run: `npx vitest run src/components/ShapePicker.test.tsx src/drawio/mxStyle.test.ts src/components/nodes/shapeGeometry.test.ts`
Expected: PASS — groups now 3 (12/14/3, total 29), picker renders 29; the `mxStyle` round-trip invariant covers `aws/azure/gcp` (their `mmShape` marker round-trips); geometry completeness satisfied.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/types/index.ts src/components/nodes/shapeGeometry.tsx src/drawio/mxStyle.ts src/components/ShapePicker.tsx src/components/ShapePicker.test.tsx
git commit -m "feat: cloud-provider shape pack (aws/azure/gcp via simple-icons) across vocabulary, render, drawio, picker"
```

---

### Task 2: Brand-correct labels via `humanizeShape` acronym set

**Files:**
- Modify: `src/types/index.ts` (the `humanizeShape` function from slice 10)
- Test: `src/types/humanizeShape.test.ts` (add acronym cases)

**Interfaces:**
- Consumes: `SHAPE_KINDS`/`ShapeKind` (now includes `aws`/`gcp` from Task 1).
- Produces: `humanizeShape` now returns all-caps for acronym kinds (`aws→'AWS'`, `gcp→'GCP'`, `gpu→'GPU'`); unchanged for the rest.

- [ ] **Step 1: Add the failing acronym test**

In `src/types/humanizeShape.test.ts`, add inside the `describe('humanizeShape', …)` block:
```ts
  it('upper-cases acronym kinds (brand names / hardware acronyms)', () => {
    expect(humanizeShape('aws')).toBe('AWS');
    expect(humanizeShape('gcp')).toBe('GCP');
    expect(humanizeShape('gpu')).toBe('GPU');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/types/humanizeShape.test.ts`
Expected: FAIL — current `humanizeShape('aws')` returns `'Aws'` (sentence-case), not `'AWS'`.

- [ ] **Step 3: Add the acronym set**

In `src/types/index.ts`, replace the `humanizeShape` function with:
```ts
/** Shape kinds rendered as all-caps acronyms rather than sentence-case. */
const SHAPE_ACRONYMS = new Set<ShapeKind>(['gpu', 'aws', 'gcp']);

/** Shape kind → human label: acronyms upper-cased; otherwise hyphens→spaces + sentence-case. e.g. 'aws'→'AWS', 'vector-store'→'Vector store'. */
export function humanizeShape(kind: ShapeKind): string {
  if (SHAPE_ACRONYMS.has(kind)) return kind.toUpperCase();
  const s = kind.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/types/humanizeShape.test.ts`
Expected: PASS (existing sentence-case cases + the new acronym case).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/humanizeShape.test.ts
git commit -m "feat: humanizeShape upper-cases acronym kinds (aws/gcp/gpu)"
```

---

### Task 3: AI prompt — cloud scope-guard + few-shot

**Files:**
- Modify: `src/ai/diagramPrompt.ts` (the `SYSTEM` template literal)
- Test: `src/ai/diagramPrompt.test.ts` (add a cloud-scope assertion)

**Interfaces:**
- Consumes: nothing new (string content only).
- Produces: the SYSTEM prompt documents `aws`/`azure`/`gcp` under a "Cloud providers" scope-guard, with a cloud few-shot.

- [ ] **Step 1: Add the failing prompt test**

In `src/ai/diagramPrompt.test.ts`, add inside the top-level `describe('buildDiagramMessages', …)`:
```ts
  it('documents the cloud-provider shapes and guards their scope', () => {
    const sys = buildDiagramMessages('x')[0].content;
    for (const kind of ['aws', 'azure', 'gcp']) expect(sys).toContain(kind);
    expect(sys).toContain('Cloud providers');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ai/diagramPrompt.test.ts`
Expected: FAIL — the prompt has no "Cloud providers" section yet.

- [ ] **Step 3: Add the scope-guard section to the prompt**

In `src/ai/diagramPrompt.ts`, insert the cloud section **between** the end of the home AI-lab block (the line `- container = a Docker container or service`) and the blank line before `Optionally, to make the diagram a guided walkthrough`:

```
- container = a Docker container or service

Cloud providers (use ONLY when the diagram is about public-cloud architecture — never in ordinary business flowcharts or home-lab diagrams):
- aws = an Amazon Web Services resource
- azure = a Microsoft Azure resource
- gcp = a Google Cloud Platform resource
```

- [ ] **Step 4: Add a cloud few-shot example**

In `src/ai/diagramPrompt.ts`, immediately after the home-lab example object (the JSON that ends `...{"id":"e4","fromNode":"n5","toNode":"n3","label":"serves"}]}`) and before the closing backtick of the template literal, append:

```
Example for "a multi-cloud pipeline: an AWS service feeds an Azure service; both ship metrics to Google Cloud":
{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":160,"height":64,"text":"AWS service","metadata":{"mm:shape":"aws"}},{"id":"n2","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Azure service","metadata":{"mm:shape":"azure"}},{"id":"n3","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Google Cloud metrics","metadata":{"mm:shape":"gcp"}}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2","label":"feeds"},{"id":"e2","fromNode":"n1","toNode":"n3","label":"metrics"},{"id":"e3","fromNode":"n2","toNode":"n3","label":"metrics"}]}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/ai/diagramPrompt.test.ts`
Expected: PASS — the cloud kinds and "Cloud providers" guard are present; existing prompt assertions unchanged.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS — full suite green (the 3 new kinds covered everywhere; no regressions).

- [ ] **Step 7: Commit**

```bash
git add src/ai/diagramPrompt.ts src/ai/diagramPrompt.test.ts
git commit -m "feat: AI prompt documents cloud-provider shapes with a scope-guard + few-shot"
```

---

## Manual verification (after Task 3, at finishing)

Live AI smoke against the real LiteLLM gateway (same harness as slice 8 — a one-off `npx tsx` script driving `buildDiagramMessages` → `/v1/chat/completions` → `extractCanvas`, model `fast-pool`, gateway on 4000):
1. A cloud-architecture prompt ("a web app on AWS with an Azure backup and GCP logging") → the result uses `aws`/`azure`/`gcp` shapes.
2. A non-cloud prompt ("a user login flow") → produces **zero** `aws`/`azure`/`gcp` kinds (scope-guard holds).

Optional live UI smoke (`npm run dev`, pin `--port 1420 --strictPort` — Vite drifts off 5173 because eStateHub squats it): the shape library left-rail shows a **Cloud** group with the 3 brand marks; dragging `aws` onto the canvas creates a node labeled "AWS".

---

## Notes for the implementer

- simple-icons component names follow the slug: `SiAmazonwebservices`, `SiMicrosoftazure`, `SiGooglecloud` (verified present in simple-icons today). They accept `size` + `className` and inherit `currentColor` when no `color` prop is passed — so the existing `<Icon size={…} className="text-accent" />` render path tints them like any lucide icon. Do NOT pass a `color` prop.
- `SHAPE_KINDS.slice(12, 26)` is the 14 home-lab kinds; `slice(26)` is the 3 cloud kinds. Keep the bounds exact or the groups will overlap/drop kinds.
- The `mxStyle` round-trip invariant test iterates every `SHAPE_KIND`, so it covers the 3 new kinds automatically once `SHAPE_STYLE` has their entries — no new mxStyle test needed.
- Keep `User` (lucide) imported in `shapeGeometry.tsx` — it's still used by the `actor` entry; only its use as the *type* annotation is replaced.
