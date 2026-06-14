# Changelog - SOVERN MindMap Control Plane

All notable changes to this project will be documented in this file.

## [v1.0.0-alpha.3] - 2026-06-11

### 🚀 Added
- **Theming:** Dark / Light / System modes with persistence, built on a semantic CSS-variable layer.
- **Design Tokens:** Upload **W3C Design Tokens JSON** (Figma / Style Dictionary) to override theme colors; one-click reset to default.
- **Diagram View:** Fifth view mode — strict org-chart **tree** and dependency **swimlanes** (one lane per layer), orthogonal arrowed edges, plus a read-only **presentation mode**.
- **PNG Export:** Full-graph fit-to-content export for canvas views (MindMap / Diagram) and snapshot export for DOM views (Kanban / Matrix / Timeline), in both Tauri and browser.
- **Tests:** Vitest infrastructure with unit coverage for the theme store, palette helpers, token parser, and diagram layouts.

### 🛠️ Fixed
- **Dagre Layout:** Graph instance is now created per call instead of a module singleton — no more stale node/edge accumulation across layouts.

## [v1.0.0-alpha.2] - 2026-05-07

### 🚀 Added
- **Kanban Board View:** New status-oriented layout with perfect column alignment.
- **Tokens-First Economy:** Switched from currency to **AI Tokens** with recursive roll-up logic.
- **Pronounced Grid UI:** High-visibility background grid and enhanced Dark Mode contrast.
- **Environment Awareness:** Added `isTauri()` checks to prevent browser crashes when accessing desktop features.
- **Real Project Data:** Updated all initial nodes with realistic dates and estimated token budgets.

### 🛠️ Fixed
- **Critical Fix:** Resolved the "White Page" crash caused by a missing `autoLayout` reference.
- **Kanban Alignment:** Corrected the centering of 200px cards within 320px columns.
- **Browser Resilience:** Implemented Dynamic Imports for Tauri plugins to allow safe execution in non-desktop environments.
- **UI Polish:** Increased z-index for the diagnostic Top Bar and improved "active" node animations.

## [v1.0.0-alpha.1] - 2026-05-06

### 🚀 Added
- **Initial Core:** Tauri 2.0 / React / TS Scaffold.
- **Multimodal Visualization:** MindMap, 2x2 Matrix, and Timeline Roadmap.
- **PM Engine:** Basic recursive budget and date roll-up logic.
- **Obsidian Connectivity:** JSON Canvas serialization/deserialization.
- **Agent Integration:** Functional MCP Server with 4 core tools.
- **Interaction:** Glassmorphism Node Detail Sidebar for live editing.

---
**Alexander (Solo Vibe Coder) · SOVERN v3.3**
