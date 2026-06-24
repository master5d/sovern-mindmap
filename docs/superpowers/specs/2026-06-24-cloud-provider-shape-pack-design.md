# Slice 11 — Cloud-Provider Shape Pack — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Predecessor:** Slice 8 (home AI-lab pack) — same icon-mode + `mmShape` drawio pattern

## Goal

Add recognizable **public-cloud provider** marks (AWS, Azure, GCP) to the shape
vocabulary so cloud-architecture diagrams read at a glance. This is the cloud
pack deferred since slice 8, now in scope.

## Decisions (locked in brainstorming)

- **Icon source:** `@icons-pack/react-simple-icons` (a new dependency — the
  project's first non-lucide icon dep). `lucide-react` has no brand logos;
  vendoring official AWS/Azure/GCP architecture SVGs carries licensing +
  curation overhead; generic tinted lucide gives no brand recognition. The
  three provider marks were verified present in simple-icons today (slugs
  `amazonwebservices`, `microsoftazure`, `googlecloud`).
- **Inventory:** the **3 provider marks only** (not per-service icons). Balanced
  across providers, guaranteed coverage, keeps the AI prompt scope-guard small.
  Per-service icons can be a later pack.
- **Color:** monochrome, inheriting `currentColor` (accent tint), consistent with
  every other icon-mode shape. Brand color (`color="default"`) is deliberately
  NOT used.

## New shapes (vocabulary 26 → 29)

| kind  | simple-icons component | label |
|-------|------------------------|-------|
| `aws`   | `SiAmazonwebservices` | AWS   |
| `azure` | `SiMicrosoftazure`    | Azure |
| `gcp`   | `SiGooglecloud`       | GCP   |

Rendered via the **existing `icon` mode** — no change to `ShapeNode.tsx` or
`ShapeSwatch.tsx`. simple-icons components accept `size` + `className` and inherit
`currentColor` when no `color` prop is passed, exactly like lucide components, so
the shared render path (`<Icon size={…} className="text-accent" />`) works
unchanged.

## Touch points

Each must stay exhaustive against `SHAPE_KINDS`; existing completeness tests and
the `Record<ShapeKind, …>` compile guards enforce this.

### `src/types/index.ts`
- Append `'aws', 'azure', 'gcp'` to `SHAPE_KINDS` (after the home AI-lab block).
- Extend `humanizeShape` with a small **acronym set** so brand labels render
  correctly: `aws → 'AWS'`, `gcp → 'GCP'` (and `gpu → 'GPU'` for free; `azure`
  already sentence-cases to `'Azure'`). Implementation: if the kind is in a
  small `UPPER` set, return it uppercased; otherwise the existing sentence-case.

### `src/components/nodes/shapeGeometry.tsx`
- Import `SiAmazonwebservices, SiMicrosoftazure, SiGooglecloud`.
- Add 3 entries: `{ mode: 'icon', Icon: Si…, className: 'rounded-xl' }`.
- Widen the icon-mode `Icon` field type from the lucide-specific type to a shared
  `React.ComponentType<{ size?: number | string; className?: string }>` so both
  lucide and simple-icons components are assignable. (Both already satisfy it;
  this only loosens the annotation.)

### `src/ai/diagramPrompt.ts`
- Add a scope-guarded section **"Cloud providers (use ONLY when the diagram is
  about public-cloud architecture):"** listing `aws`/`azure`/`gcp`, plus a short
  cloud few-shot — mirroring the slice-8 home-lab scope-guard so the marks don't
  leak into ordinary flowcharts or home-lab diagrams.

### `src/drawio/mxStyle.ts`
- Add 3 `SHAPE_STYLE` entries: `'rounded=1;whiteSpace=wrap;html=1;mmShape=aws;'`
  (and `azure`, `gcp`). `mapDrawioStyleToShape` already parses the `mmShape=`
  marker first and validates against `SHAPE_KINDS`, so the round-trip invariant
  `mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s` holds for the new kinds
  automatically; foreign drawio degrades to a rounded rect.

### `src/components/ShapePicker.tsx`
- Extend `SHAPE_GROUPS` to **three** groups:
  `Basic = SHAPE_KINDS.slice(0, 12)`,
  `Home AI-lab = SHAPE_KINDS.slice(12, 26)`,
  `Cloud = SHAPE_KINDS.slice(26)`.
- The sidebar `ShapePicker` and the `ShapeLibrary` rail both iterate
  `SHAPE_GROUPS`, so they render the new Cloud group with no further change.

## Data flow

No new flow — the three kinds ride every existing path: AI generation (prompt →
`extractCanvas` → `mm:shape`), manual picker / drag-from-library (`SHAPE_GROUPS`
→ `ShapeSwatch` / `addShapeNode`), and drawio import/export (`mmShape` marker).

## Error / edge handling

- AI scope-guard keeps cloud marks out of non-cloud diagrams (verified by smoke,
  same as slice 8).
- A dropped/picked cloud node gets a brand label via the `humanizeShape` acronym
  set.
- If simple-icons ever renames a slug, the build breaks at the import — caught by
  `tsc`/tests, not silently.

## Testing

- **Completeness (existing, no change needed):** `SHAPE_GEOMETRY`, `SHAPE_STYLE`,
  and the prompt are already asserted exhaustive over `SHAPE_KINDS`; adding the 3
  kinds makes those tests require the 3 entries.
- **`SHAPE_GROUPS` test** (`ShapePicker.test.tsx`): now 3 groups, lengths
  `12 / 14 / 3`, concatenation equals `SHAPE_KINDS` (length 29).
- **Swatch-count tests:** `ShapePicker.test.tsx` and `ShapeLibrary.test.tsx`
  expect **29** swatches, one per `SHAPE_KIND`.
- **`humanizeShape`** (`humanizeShape.test.ts`): add `aws → 'AWS'`,
  `gcp → 'GCP'`, `gpu → 'GPU'` (acronym set); keep the existing sentence-case
  cases.
- **`mxStyle.test.ts`** (existing round-trip invariant over every `SHAPE_KIND`):
  automatically covers `aws/azure/gcp` once they're in `SHAPE_KINDS` + have a
  `SHAPE_STYLE` entry.
- **Live AI smoke** (same harness as slice 8, real gateway via `npx tsx`): a
  cloud-architecture prompt uses `aws`/`azure`/`gcp`; a non-cloud prompt produces
  zero cloud-kind leakage (scope-guard holds).

## Files

- **Modify:** `package.json` — add `@icons-pack/react-simple-icons` dependency
- **Modify:** `src/types/index.ts` — `SHAPE_KINDS` +3; `humanizeShape` acronym set
- **Modify:** `src/components/nodes/shapeGeometry.tsx` — 3 icon entries + widen `Icon` type
- **Modify:** `src/ai/diagramPrompt.ts` — cloud scope-guard section + few-shot
- **Modify:** `src/drawio/mxStyle.ts` — 3 `mmShape` style entries
- **Modify:** `src/components/ShapePicker.tsx` — third `SHAPE_GROUPS` group
- **Modify:** test files — `ShapePicker.test.tsx`, `ShapeLibrary.test.tsx`,
  `humanizeShape.test.ts` (counts/groups/acronyms)

## Global constraints

- One new dependency: `@icons-pack/react-simple-icons` (^13). No others.
- `SHAPE_KINDS` stays the single source of truth (one flat array); all four
  derived structures (geometry, style, prompt, groups) stay exhaustive against it.
- Monochrome `currentColor` rendering; no brand color, no `ShapeNode`/`ShapeSwatch`
  change.
- drawio round-trip via the existing `mmShape=<kind>` style marker.
- AI scope-guard pattern identical to slice 8 (home AI-lab).
- Comments in english–russian mix per project convention.
