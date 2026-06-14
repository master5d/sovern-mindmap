# 🛰️ SOVERN MindMap Control Plane (v3.3)

> **Visual Control Plane for the AI-First One-Person Organization.**

The **SOVERN MindMap Control Plane** is a high-performance orchestration tool designed for the "Solo Vibe Coder." It bridges the gap between structured mind-mapping and active project management, integrating a deterministic execution engine with native AI Agent connectivity.

---

## 🚀 Key Features

### 1. Multimodal Visualization (The 5 Views)
Switch seamlessly between five analytical dimensions. The MindMap and Diagram are React Flow canvases; Matrix, Timeline and Kanban are dedicated DOM views layered on top:
*   **🕸️ MindMap Mode:** Hierarchical canvas. Feedback boards get a **cluster layout** (area columns with card grids); generic graphs fall back to Dagre auto-layout.
*   **🧭 Diagram Mode:** Strict org-chart tree or dependency swimlanes (one lane per layer), orthogonal edges with arrows, plus a read-only **presentation mode** for demos and exports.
*   **📊 Priority Matrix (2x2):** Eisenhower quadrants (*Do First / Schedule / Quick Wins / Backlog*) with tinted backgrounds. Tickets render as compact chips positioned by **Impact × Urgency** (1-10); same-cell tickets stack with a "+N" expander.
*   **📅 Timeline:** Area lanes over a real time axis (ticket `created` date), day gridlines, greedy stacking on overlap.
*   **📋 Kanban Board:** *Triage / Pending / Active / Done / Blocked* columns with counts, search, area filters and **drag-and-drop** — dropping a card persists the status change back to `feedback.jsonl` via the dev-server API (`POST /api/feedback/status` → `fb.mjs`).

### 2. Deterministic AI-First PM Engine
*   **⚡ Token Budgeting:** Replaced traditional currency with **AI Tokens**. Costs roll up automatically from subtasks to parent projects.
*   **⏳ Temporal Roll-Up:** Automatic calculation of project phases based on earliest-start and latest-end dates of leaf nodes.
*   **🤖 Agent-Native:** Built-in **MCP Server** (Model Context Protocol) allows Hermes or Claude to read and mutate the graph programmatically.
*   **🛰️ n8n Integration:** Ready-to-use webhook infrastructure that triggers external automation on status changes.

### 3. Sovereign Infrastructure
*   **Local-First & Obsidian Ready:** Native support for the `.canvas` format. Your "Control Plane" and "Second Brain" share a single source of truth.
*   **mc_hub Feedback Bridge:** Dev server serves `/board.canvas` from the mc_hub triage pipeline (path via `SOVERN_BOARD` env), polls it every 3s, and writes status changes back through `fb.mjs` — the board is a live two-way window into `feedback.jsonl`.
*   **🎨 Theming:** Dark (cyberpunk neon) / Light (clean professional) / System modes with persistence. Upload **W3C Design Tokens JSON** (Figma / Style Dictionary export) to re-skin the entire app — colors live in CSS custom properties.
*   **🖼️ PNG Export:** One click exports the full graph (fit-to-content) in canvas views or a snapshot of Kanban/Matrix/Timeline.

---

## 🛠️ Tech Stack

*   **Core:** [Tauri 2.0](https://tauri.app/) (Secure Rust Bridge)
*   **UI:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 7](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + CSS Custom Properties theming
*   **Graph Logic:** [@xyflow/react](https://reactflow.dev/) + [Dagre](https://github.com/dagrejs/dagre) (Auto-layout)
*   **State:** [Zustand](https://zustand-demo.pmnd.rs/)
*   **Tests:** [Vitest](https://vitest.dev/)

---

## 📦 Installation

```bash
# Clone the repository
cd sovern-mindmap

# Install dependencies
npm install

# Run Desktop version (Requires Rust)
npm run tauri dev

# Run Browser version (Safe Preview)
npm run dev
```

---

## 📂 Project Structure

*   [`/src/mcp`](./src/mcp) — MCP Server implementation for AI agents.
*   [`/src/store`](./src/store) — Zustand store managing the "Global Brain" of the app.
*   [`/src/components`](./src/components) — `KanbanBoard`, `MatrixView`, `TimelineView` (DOM views), `NodeSidebar`, `nodes/SOVERNNode`.
*   [`/src/utils/pmEngine.ts`](./src/utils/pmEngine.ts) — Deterministic math for tokens and dates.
*   [`/src/utils/layout.ts`](./src/utils/layout.ts) — Dagre auto-layout + feedback-board cluster layout.
*   [`/src/utils/feedback.ts`](./src/utils/feedback.ts) — Shared area/category/status palette + Priority Matrix quadrants.
*   [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md) — How to connect your agents.

---
**Alexander (Solo Vibe Coder) · SOVERN v3.3 · Alpha Phase Complete**
