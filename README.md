# 🛰️ SOVERN MindMap Control Plane (v3.3)

> **Visual Control Plane for the AI-First One-Person Organization.**

The **SOVERN MindMap Control Plane** is a high-performance orchestration tool designed for the "Solo Vibe Coder." It bridges the gap between structured mind-mapping and active project management, integrating a deterministic execution engine with native AI Agent connectivity.

---

## 🚀 Key Features

### 1. Multimodal Visualization (The 4 Views)
Switch seamlessly between four analytical dimensions:
*   **🕸️ MindMap Mode:** Hierarchical visualization of the SOVERN 8-layer architecture.
*   **📊 Priority Matrix (2x2):** Eisenhower/SWOT analysis. Nodes automatically position themselves based on **Impact** and **Urgency** (1-10).
*   **📅 Timeline Roadmap:** Horizontal roadmap organizing tasks by real dates and system layers.
*   **📋 Kanban Board:** Status-oriented flow tracking tasks through *IDLE, PENDING, ACTIVE, DONE, BLOCKED* columns with perfect grid alignment.

### 2. Deterministic AI-First PM Engine
*   **⚡ Token Budgeting:** Replaced traditional currency with **AI Tokens**. Costs roll up automatically from subtasks to parent projects.
*   **⏳ Temporal Roll-Up:** Automatic calculation of project phases based on earliest-start and latest-end dates of leaf nodes.
*   **🤖 Agent-Native:** Built-in **MCP Server** (Model Context Protocol) allows Hermes or Claude to read and mutate the graph programmatically.
*   **🛰️ n8n Integration:** Ready-to-use webhook infrastructure that triggers external automation on status changes.

### 3. Sovereign Infrastructure
*   **Local-First & Obsidian Ready:** Native support for the `.canvas` format. Your "Control Plane" and "Second Brain" share a single source of truth.
*   **Cyberpunk Aesthetics:** High-contrast Dark Mode with neon accents, animated data flows, and glassmorphism UI.

---

## 🛠️ Tech Stack

*   **Core:** [Tauri 2.0](https://tauri.app/) (Secure Rust Bridge)
*   **UI:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
*   **Graph Logic:** [@xyflow/react](https://reactflow.dev/) + [Dagre](https://github.com/dagrejs/dagre) (Auto-layout)
*   **State:** [Zustand](https://zustand-demo.pmnd.rs/)

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
*   [`/src/utils/pmEngine.ts`](./src/utils/pmEngine.ts) — Deterministic math for tokens and dates.
*   [`AGENT_INTEGRATION.md`](./AGENT_INTEGRATION.md) — How to connect your agents.

---
**Alexander (Solo Vibe Coder) · SOVERN v3.3 · Alpha Phase Complete**
