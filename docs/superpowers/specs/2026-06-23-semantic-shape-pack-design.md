# Slice 8 — Semantic Shape Pack: Home AI-Lab

**Date:** 2026-06-23
**Project:** sovern-mindmap
**Status:** Design approved, pending spec review → writing-plans

## Objective

Extend the diagram shape vocabulary with a cohesive **Home AI-Lab** semantic pack so the
"draw diagrams with AI" flow can express a typical home AI lab (compute hardware ↔ networking ↔
AI/ML software stack). This is the first step toward a Lucidchart-grade semantic vocabulary,
scoped deliberately to the home-lab domain — **public-cloud icon sets (AWS/Azure/GCP) are out of
scope** for now.

## Scope decisions (locked)

- **Domain:** one connected Home-Lab pack covering all three sub-domains (compute, networking,
  ML-software) — not split across slices.
- **Surface:** **AI-vocabulary first.** Extend the enum + geometry + AI prompt only. There is
  currently **no manual shape picker** in the app (shapes come solely from AI generation via
  `mm:shape` and from `.drawio` import; the store has zero shape actions). A manual shape
  palette / library panel ("Lucidchart drag-from-library" feel) is a **separate future slice**,
  explicitly NOT in this one.
- **Rendering:** reuse the existing `icon` render mode (lucide-react glyph above the label in a
  bordered box, exactly like the current `actor`/`cloud` shapes). Zero new dependencies;
  monochrome via `currentColor` → automatically theme-aware (light/dark). No changes to
  `ShapeNode.tsx` are required — `icon` mode already renders this.

## Shape inventory (14 new shapes)

All new shapes are `icon` mode, flat additions to the single `mm:shape` enum. The existing
`cylinder` (= database) stays; `storage` is distinct (disk/NAS). `model` and `agent` are
visually distinguished. No `queue` shape — the existing `parallelogram` covers data-in/out
(YAGNI).

| Domain | shape key | lucide icon (candidate) | Meaning for AI |
|---|---|---|---|
| Compute | `server` | `Server` | a headless host / node |
| Compute | `gpu` | `CircuitBoard` | a GPU / accelerator node |
| Compute | `workstation` | `Monitor` | a desktop / dev machine |
| Compute | `laptop` | `Laptop` | a laptop |
| Compute | `storage` | `HardDrive` | NAS / disk storage (NOT a database — that is `cylinder`) |
| Network | `router` | `Router` | a router / gateway device |
| Network | `switch` | `Network` | a network switch |
| Network | `firewall` | `ShieldCheck` | a firewall |
| Network | `wifi` | `Wifi` | a Wi-Fi access point |
| ML-software | `model` | `BrainCircuit` | an LLM / model |
| ML-software | `agent` | `Bot` | an AI agent |
| ML-software | `vector-store` | `Boxes` | a vector DB / embeddings store |
| ML-software | `gateway` | `Webhook` | an API gateway / proxy (e.g. LiteLLM) |
| ML-software | `container` | `Container` | a Docker container / service |

Total vocabulary after this slice: 12 existing + 14 new = **26 shapes**, still one flat
`mm:shape` enum.

**Icon-name caveat:** exact lucide import names are finalized at implementation time — each glyph
is verified to exist in the installed `lucide-react` and to read clearly at 20px. If a candidate
(`CircuitBoard` / `Boxes` / `BrainCircuit`) is poorly legible, it may be swapped for the nearest
readable glyph. The **semantic keys** (`gpu`, `vector-store`, …) do NOT change regardless.

## Components & changes (units)

### 1. `src/types/index.ts` — vocabulary source of truth
Add the 14 keys to `SHAPE_KINDS`. `ShapeKind` is derived from it automatically, so every consumer
sees the new values with no further type edits.

### 2. `src/components/nodes/shapeGeometry.tsx` — geometry
Add 14 entries of the form `{ mode: 'icon', Icon: <Lucide>, className: 'rounded-xl' }`, importing
the icons from `lucide-react`. **Invariant (already tested):** every key in `SHAPE_KINDS` has a
matching entry in `SHAPE_GEOMETRY`.

### 3. `src/ai/diagramPrompt.ts` — AI vocabulary
Add a clearly delimited section to the SYSTEM prompt:
**"Home AI-lab infrastructure (use ONLY when the diagram is about computers, networking, or an
AI/ML stack)"** listing the 14 keys, each with a one-line meaning. The guard clause is essential —
without it the model leaks `server`/`agent` into ordinary business flowcharts. Add **one** new
few-shot example: a home lab ("M4 mini orchestrator → LiteLLM gateway → Ollama model +
vector-store; GPU node"). The existing flowchart vocabulary and example are left untouched.

### 4. `src/drawio/mxStyle.ts` — round-trip (graceful degradation)
drawio has no native equivalent for our icon shapes. Strategy: **degrade visually without losing
semantics.**
- **Export:** new shapes → a `rounded` rectangle mxStyle, while `mm:shape` rides along in the
  cell metadata (the exporter already attaches sovern metadata). In foreign drawio the node shows
  as a labeled rounded rectangle — readable.
- **Import back into our app:** read `mm:shape` from metadata → the shape is restored 1:1. Full
  round-trip fidelity is preserved within our own ecosystem.
- Mapping to drawio's native network stencils (mxgraph/cisco) is **explicitly out of scope**,
  noted as future work.

`ShapeNode.tsx` — **no change** (icon mode already handles rendering).

## Data flow

```
user prompt ──▶ buildDiagramMessages (SYSTEM now lists 26 shapes)
            ──▶ LLM emits JSON Canvas with metadata "mm:shape": "<key>"
            ──▶ extractCanvas / canvasConverter map mm:shape → node.data.shape
            ──▶ ShapeNode reads SHAPE_GEOMETRY[shape] → icon-mode render
```
Manual path (drawio import) feeds the same `node.data.shape`. No new runtime path is introduced —
only the set of valid `shape` values grows.

## Testing

- **Unit (enum↔geometry completeness):** existing `shapeGeometry.test.ts` already asserts every
  `SHAPE_KINDS` entry has geometry → it automatically catches any missing new entry.
- **Prompt:** add a case to `diagramPrompt.test.ts` asserting the new keys appear in the SYSTEM
  string (so the AI vocabulary cannot silently drift from the enum).
- **drawio round-trip:** add a case to `canvasToDrawio.test.ts` / `import.test.ts`: a node with
  `shape: 'gpu'` → export → import → `shape` is restored.
- **Smoke (slice-7 pattern, non-blocking gate):** dev server up, AI prompt "draw my home AI lab",
  assert the response contains `server`/`gateway`/`model` keys and a node renders its icon.

## Definition of Done

- 26-shape vocabulary renders (14 new shapes show their lucide icon, theme-aware on light/dark).
- AI emits the new keys for home-lab prompts AND does not leak them into ordinary flowcharts.
- drawio round-trip preserves `shape` via metadata (degrades to rounded rect in foreign tools).
- Unit + prompt + round-trip tests green.
- `npm run build` passes.

This is **slice 8**, a direct continuation of the existing architecture (enum → geometry → prompt
in lockstep). A manual shape palette is a separate future slice.

## Out of scope (explicit)

- Public-cloud icon sets (AWS/Azure/GCP).
- Manual shape-picker / drag-from-library palette UI.
- Mapping to drawio native network stencils.
- A `queue` shape (covered by existing `parallelogram`).
