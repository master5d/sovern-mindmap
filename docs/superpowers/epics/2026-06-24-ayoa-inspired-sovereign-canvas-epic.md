# EPIC — Ayoa-Inspired Sovereign Canvas

**Date:** 2026-06-24
**Status:** Active roadmap (each slice → its own brainstorm → spec → plan → SDD)
**Context:** Comparative analysis vs [Ayoa](https://www.ayoa.com/) — adopt what strengthens our *local-first, AI-first, sovereign* canvas; reject what only makes sense for a multi-tenant SaaS.

## Vision

sovern-mindmap is a local-first, single-surface AI diagramming canvas (invisible-backend generators; 5 views; 29-shape vocab; drawio/Obsidian interop; self-contained HTML/Learn-HTML exports; MCP/agent-native). Ayoa is a cloud team product (mind map + tasks + whiteboard + chat). This epic borrows Ayoa's genuinely good ideas **through a sovereignty filter** and adds the one capability we were missing — but reframed: real-time collaboration becomes **sovereign-node sync** (the SOVERN fleet co-editing one canvas), not cloud SaaS collaboration.

## What we adopt (and why it survives the filter)

| Ayoa idea | Our adoption | Sovereignty fit |
|---|---|---|
| Document / Outline view | graph ⇄ linear Markdown outline | local export-adapter; no cloud |
| Neuro-inclusivity (dyslexia fonts, calm backgrounds, plain mode) | reading preset over our design-tokens layer | pure client theming |
| Gantt (start/end bars, %progress, milestones) | upgrade the Timeline view | uses our pmEngine dates/rollup |
| Templates | starter-diagram gallery | ships in-bundle |
| Organic/radial mind map | radial layout option alongside Dagre | pure layout fn |
| AI ideation | node-level AI ("expand this node") | our existing LiteLLM path |
| Idea Bank | parking tray for unplaced nodes | local store |
| **Real-time collaboration** | **sovereign-node real-time sync (CRDT)** | **peer-to-peer between the user's OWN nodes — no SaaS, no third-party account** |

**Explicit non-goals (rejected):** multi-tenant cloud accounts, member permissions/billing, in-app chat-as-product, Google/Dropbox/email integrations, hosted infra. Collaboration is strictly between the operator's sovereign nodes.

## Where we already lead Ayoa (preserve, don't regress)

AI prompt → **editable** diagram (Ayoa's AI is ideation prompts only); drawio import/export round-trip; Obsidian JSON Canvas interop; MCP/agent-native; self-contained HTML + Learn-HTML for LMS embed; design-tokens theming; semantic 29-shape vocab (home-lab + cloud); Learn/Presentation step-through (their "reveal branches one-by-one", but exportable).

## Slice breakdown

Continues the project slice sequence (slices 1–12 shipped). Each slice is an independent spec → plan → SDD cycle. **Sequencing principle: cheap, high-value, store-light wins first; the deep, store-invasive sync last (it needs its own architecture brainstorm and reconciliation with our zundo/edit-mode/autosave discipline).**

### Phase 1 — Single-user enrichments (cheap wins, no new infra)

- **Slice 13 — Outline / Document view** · value HIGH / effort LOW-MED · **FIRST**
  Graph → linear, structured **Markdown outline** (headings + nested bullets by tree depth), as a new view and/or export adapter. Reuses `getChildren` / BFS ordering (`selectLearnOrder`) + the export-adapter pattern. Wins three ways: writing/LMS workflow, visual↔linear switch (neurodivergent-friendly), and another export format. Optional stretch: outline edits flow back to the graph.

- **Slice 14 — Neuro-inclusive reading preset** · value HIGH (operator audience) / effort LOW
  A toggle/preset layered on the existing theme + design-tokens system: dyslexia-friendly font (Atkinson Hyperlegible / OpenDyslexic), increased letter/line spacing, calm off-white background, "plain mode" (reduce motion/ornament). Ties to `[[project_neurodivert]]` and the Точка Сборки clarity-first principle. Vendored font, no CDN.

- **Slice 15 — Template gallery** · value MED / effort LOW-MED
  A small picker of starter diagrams (home-lab, flowchart, decision tree, cloud architecture, SOVERN fleet) seeded as JSON Canvas — onboarding + a showcase of the 29-shape vocab. In-bundle, no network.

- **Slice 16 — Timeline → Gantt** · value MED / effort MED
  Upgrade the Timeline view to real Gantt bars (start→end), %progress, and milestone markers. Builds on the existing `dates` + budget/timeline rollup in `pmEngine`.

- **Slice 17 — Radial / organic layout option** · value MED / effort MED
  A radial mind-map layout (d3-hierarchy radial or a dagre alternative) selectable alongside the current cluster/tree layouts — the "organic mind map" feel.

- **Slice 18 — Node-level AI** · value MED / effort MED
  Extend AI from whole-canvas generation to a node action: "expand / brainstorm children of this node." Reuses the LiteLLM gateway + `extractCanvas`; appends as one undoable Edit-Mode edit.

- **Slice 19 — Idea Bank (parking tray)** · value LOW-MED / effort LOW-MED
  A tray of unplaced/captured nodes you can drag onto the canvas later — capture-first, also neurodivergent-friendly.

### Phase 2 — Sovereign-node real-time sync (the pivot)

- **Slice 20 — Sovereign-node real-time canvas sync** · value HIGH / effort HIGH · **needs its own deep brainstorm**
  Two or more of the operator's sovereign nodes (Mac mini / M4 Studio / Hetzner relay) co-edit **one** canvas live, with presence (per-node cursors/selection) and node-anchored comments — communication between sovereign nodes, not a SaaS.
  **Likely architecture (to be designed, not yet committed):** local-first **CRDT** over the store's `{nodes, edges}` — **Yjs** (mature `awareness` API, `y-websocket` / `y-webrtc`) is the leading candidate; **Automerge** the alternative. Transport = a **sovereign relay** (a small WS relay on the existing SOVERN Hetzner box behind the CF Tunnel — see `[[project_sovern_infra]]` — for cross-network nodes; LAN WebRTC for same-network). **Hard problems for its brainstorm:** reconciling CRDT merge with our **zundo** undo discipline (one tracked step per edit), the **Edit-Mode poll-freeze**, and autosave; conflict semantics on structural edits (delete-vs-edit); presence model; auth between nodes. This slice is sequenced LAST deliberately — it is store-invasive and must not destabilize the shipped single-user core.

## Decomposition note

Phase 1 slices are independent and shippable in any order (13 recommended first). Phase 2 (slice 20) is a sub-project of its own — it gets a full brainstorm before any code, because the CRDT/undo/transport decisions are load-bearing and irreversible-ish. We do NOT start slice 20 by transcribing this epic; we brainstorm it fresh when we reach it.

## Definition of done (epic)

Phase 1: slices 13–19 shipped, each live-smoke-verified, merged, docs+memory updated — preserving the single-user core. Phase 2: slice 20 designed, prototyped between two real sovereign nodes, and shipped behind a clear "sync on/off" boundary so the app remains fully usable offline/solo.
