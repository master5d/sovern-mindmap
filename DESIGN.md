# DESIGN.md — sovern-mindmap

Unified AI diagramming canvas. All graphics render on one React Flow surface;
generators (AI via LiteLLM, draw.io, archify, pencil) are invisible backends.

## Tokens
Theme tokens live in `src/theme/tokens.css` (dark/light) + design-token upload.

## Diagrams
Exported diagrams live in `design/diagrams/` (DesOps Standard).
AI↔canvas interchange is JSON Canvas (Obsidian spec) — never Mermaid.

## Shapes (v1)
rectangle · rounded · decision · terminal · note — carried in JSON Canvas
node metadata under `mm:shape`.
