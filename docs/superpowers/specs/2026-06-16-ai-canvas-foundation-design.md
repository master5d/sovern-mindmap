# Design: AI-Canvas Foundation — generic shapes + "prompt → diagram on the one canvas"

**Date:** 2026-06-16
**Project:** sovern-mindmap (SOVERN MindMap Control Plane → unified AI diagramming canvas)
**Status:** Approved by user (brainstorming session 2026-06-16)
**Slice:** 1 of N (foundation + vertical AI slice). Later slices: draw.io adapter, archify/PaperBanana publication adapters, pencil vector adapter, interactive-learning step-through, LMS embed.

## North-star (locked during brainstorming)

> **One canvas. All graphics render on the same React Flow surface, whatever generated them. The tools (AI, draw.io, archify, pencil) are invisible backends; the user never leaves the canvas.** Goal = reduce cognitive load while working with AI.

This slice delivers the **foundation** (a generic shape + connector model so the canvas can represent more than the one `sovern` node) **plus a thin vertical slice** of the first invisible backend: **type a prompt → an editable diagram appears on the canvas.**

## Locked decisions

- **AI↔canvas interchange = JSON Canvas** (Obsidian spec), the app's **native** format — already wired via `src/utils/canvasConverter.ts` (`toJSONCanvas`/`fromJSONCanvas`). **NOT Mermaid** (deprecated/legacy in the SOVERN/DesOps stack — see memory `feedback_no_mermaid_desops`). Structured JSON, editable on landing, zero new parser, open interop → fits the "invisible backends" thesis.
- **Shape vocabulary v1:** `rectangle`, `rounded`, `decision` (diamond), `terminal` (pill/start-end), `note`. Existing `sovern`/`lane` node types untouched (specialized cases).
- **Shapes ride in JSON Canvas node `metadata`** under the `mm:` namespace (e.g. `metadata['mm:shape'] = 'decision'`) — the spec permits metadata and the converter already carries a metadata bag.
- **Generation is an Edit-Mode structural edit** (enters `isEditing`, frozen poll, undoable via the existing zundo history, autosaved). Layout via existing dagre (`autoLayout`).
- **LLM access via the LiteLLM gateway** (`localhost:4001`, the single SOVERN gateway — memory `feedback_ai_gateway`). No provider keys in the app; the gateway holds them. Browser dev reaches it via a **Vite dev proxy** (avoids CORS), same pattern as `/board.canvas`.
- **DesOps governance:** add a root `DESIGN.md` and store any exported diagrams under `design/diagrams/` (DesOps Standard).

## Current state (constraints)

- Stack: Tauri 2, React 19, TS 5.8, Vite 7, Tailwind v4, @xyflow/react 12, dagre, Zustand 5 (+ zundo temporal), vitest/jsdom.
- One custom node type `sovern` + `lane`. `fromJSONCanvas` hardcodes `type: 'sovern'` (`canvasConverter.ts:52`); `toJSONCanvas` writes only `sovern:*` metadata.
- Edges are bare `{id,source,target,label?}`; diagram view already styles them with `MarkerType.ArrowClosed` + smoothstep (App.tsx `displayEdges`).
- Store has Edit Mode (`enterEditMode`/`isEditing`, poll freeze), `autoLayout` (dagre), undo (zundo, structural-only), autosave to workspace file.
- `JSONCanvasNode` type: `{id, type:'text'|'file'|'link'|'group', x,y,width,height, color?, text?, metadata?}`. `JSONCanvasEdge`: `{id, fromNode, toNode, label?, metadata?}`.

---

## 1. Generic shape node (foundation)

### Data model
Extend `SOVERNNodeData` (in `src/types/index.ts`) with an optional discriminator:
```ts
shape?: 'rectangle' | 'rounded' | 'decision' | 'terminal' | 'note';
```
A node is a "generic shape" when `type === 'shape'` (React Flow node type) and `data.shape` is set. `sovern` nodes are unaffected (no `shape`).

### Component — `src/components/nodes/ShapeNode.tsx`
A single React Flow node component registered as `shape` in `App.tsx` `nodeTypes`. Renders the label inside a container whose geometry depends on `data.shape`:
- `rectangle` — square-cornered box.
- `rounded` — rounded box.
- `decision` — diamond (CSS rotate-45 wrapper or clip-path), label upright.
- `terminal` — pill (fully rounded).
- `note` — box with a folded corner.

All styling uses existing theme-token utility classes (`bg-surface`, `text-primary`, `border-edge`, `border-accent` on select). Top `target` + bottom `source` handles (same as `SOVERNNode`). Inline editing reuses the existing pattern: subscribe to `editingNodeId === id`, render a `textarea` when editing (so keyboard authoring + double-click-rename work on shapes too).

### Converter round-trip — `src/utils/canvasConverter.ts`
- `toJSONCanvas`: for a node with `data.shape`, write `metadata['mm:shape'] = data.shape` and keep `type:'text'`. (sovern nodes keep their `sovern:*` metadata as today.)
- `fromJSONCanvas`: if `node.metadata?.['mm:shape']` is present → emit `{ type:'shape', data:{ label, shape } }`; else fall back to the existing `sovern` mapping. This is the **only** change to existing behavior and is backward-compatible (old canvases have no `mm:shape`).

## 2. Enriched connectors

JSON Canvas edges already carry `label`. For v1, connectors render with an arrowhead by default. Reuse the existing diagram-view edge styling: in the canvas render path, default edges to `type:'smoothstep'` + `markerEnd: ArrowClosed` + show `label`. Line-style/typed-connector variants (dashed, multiplicity) are **out of scope** for slice 1 (later: technical-diagram slice).

## 3. AI adapter — "prompt → diagram on canvas"

New module `src/ai/`:

### `src/ai/diagramPrompt.ts` (pure)
`buildDiagramMessages(userPrompt: string): ChatMessage[]` — a system prompt that instructs the model to output **only** a JSON Canvas document (no prose, no code fences) using our shape metadata. Documents: the JSON Canvas node/edge shape, the allowed `mm:shape` values, and "edges connect node ids; use `label` for edge text." Includes 1 few-shot example.

### `src/ai/litellmClient.ts`
`requestCompletion(messages, opts?): Promise<string>` — POSTs to the gateway chat-completions endpoint. Base URL from config (`VITE_LLM_GATEWAY` → default `/llm` dev-proxied to `http://localhost:4001`); model from config (`VITE_LLM_MODEL`, a gateway alias) so the gateway's free→local→paid hierarchy governs routing. Returns the assistant message text. No keys in the app.

### `src/ai/extractCanvas.ts` (pure — THE testable core)
`extractCanvas(raw: string): JSONCanvas` — turns messy LLM text into a valid `JSONCanvas`:
1. Strip markdown code fences / surrounding prose; locate the outermost `{...}` JSON object.
2. `JSON.parse`; throw a typed `DiagramParseError` on failure.
3. **Validate + repair:** ensure `nodes`/`edges` arrays exist; each node has an `id` (generate if missing), default `x/y` (0,0 — dagre re-lays out), default `width/height`, coerce unknown `mm:shape` → `rectangle`; drop edges whose endpoints don't exist; dedupe ids.
Returns a guaranteed-renderable `JSONCanvas`.

### `src/ai/generateDiagram.ts` (orchestrator)
`generateDiagram(prompt): Promise<void>`:
`buildDiagramMessages` → `requestCompletion` → `extractCanvas` → `fromJSONCanvas` → `store.enterEditMode()` → add the new nodes/edges to the canvas (fresh-id namespaced to avoid collisions with existing graph) → `store.autoLayout()` (dagre) → fit view. Errors surface via the existing `notify()` toast.

### UI — `src/components/AiPromptBar.tsx`
A prompt bar (bottom-center, theme-styled, hidden in presentation mode): text input + "Generate" button + busy/error state. Calls `generateDiagram`. Wired into `App.tsx` `Flow()`.

## 4. Dev proxy + config

- `vite.config.ts`: add a dev proxy `'/llm' → http://localhost:4001` (mirrors how `/board.canvas` is served) so the browser build avoids CORS. In Tauri, the same `/llm` path resolves (or the Tauri http plugin is used) — base URL stays configurable.
- Config constants in `src/ai/config.ts`: `GATEWAY_BASE` (default `/llm`), `MODEL` (default a gateway alias, e.g. `sovern-default`). Overridable via `import.meta.env`.

---

## Components & boundaries (each independently testable)

| Unit | Responsibility | Depends on |
|------|----------------|-----------|
| `ShapeNode.tsx` | render 5 shape kinds + inline edit | theme tokens, store editing state |
| `canvasConverter` (extended) | JSON Canvas ⇄ React Flow incl. `mm:shape` | types |
| `diagramPrompt.ts` | build LLM messages | — (pure) |
| `litellmClient.ts` | gateway HTTP | fetch, config |
| `extractCanvas.ts` | LLM text → valid JSONCanvas | types (pure) |
| `generateDiagram.ts` | orchestrate prompt→canvas | the above + store |
| `AiPromptBar.tsx` | prompt UI | generateDiagram, notify |

## Testing plan

- **Unit (vitest, pure):**
  - `extractCanvas` — strips fences/prose; parses; repairs missing ids/positions; coerces unknown `mm:shape`→rectangle; drops dangling edges; throws `DiagramParseError` on non-JSON. (Core coverage.)
  - `canvasConverter` — round-trip a `shape` node (`data.shape` → `mm:shape` → back to `type:'shape'`); confirm `sovern` nodes still map unchanged (backward-compat).
  - `diagramPrompt` — messages include the shape contract + the user prompt.
- **Integration (jsdom):** `generateDiagram` with `litellmClient` **mocked** to return a known JSON Canvas string → asserts nodes/edges land in the store, Edit Mode entered, layout applied. Error path: mocked malformed output → `notify` called, store unchanged.
- Build (`npm run build`) exit 0 + full `npx vitest run` green per task.

## Out of scope (later slices)

draw.io `.drawio` import/export adapter; archify & PaperBanana publication adapters; pencil `.pen` vector adapter; interactive-learning step-through / clickable mode; LMS embed; typed/dashed connectors & richer stencils; multi-source layout reconciliation.

## Implementation order (for the plan)

1. `data.shape` type + `ShapeNode.tsx` + register `shape` in `nodeTypes` (+ inline-edit reuse).
2. `canvasConverter` `mm:shape` round-trip (+ tests).
3. `extractCanvas.ts` validator/repair (+ tests) — the core.
4. `diagramPrompt.ts` (+ test) and `litellmClient.ts` + `config.ts` + Vite `/llm` proxy.
5. `generateDiagram.ts` orchestrator (+ mocked integration test): enter Edit Mode, add nodes, dagre layout, fit.
6. `AiPromptBar.tsx` UI wired into `App.tsx`.
7. Root `DESIGN.md` (DesOps) + `design/diagrams/` dir.
