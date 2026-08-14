SOVERN v3.3 · LOOP 4

# PRD — SOVERN MindMap Control Plane

Product Requirements Document · v1.0

Визуальная плоскость управления для AI-first организации одного человека

| Документ: | PRD — SOVERN MindMap Control Plane v1.0 |
| --- | --- |
| Дата: | 5 мая 2026 |
| Автор: | Alexander (Solo Vibe Coder) |
| Статус: | ● Draft |
| Архитектура: | SOVERN v3.3, Loop 4 |
| Бюджет на PoC: | $0 (open-source only) |
| Платформа: | Surface Laptop Studio 2 · i7-13800H · 64 GB DDR5 · RTX 4060 8 GB · Win11 Pro |

# 1. Executive Summary (TL;DR)

| Ключевые тезисы •  Что: Десктопное приложение на Tauri 2.x + React Flow 12.x — интерактивная визуальная mind-map-based плоскость управления, в которой все 8 слоёв SOVERN v3.3 представлены как граф с custom-нодами, drag-and-drop, zoom/pan, minimap и Gantt-видом. •  Зачем: Устранить когнитивную перегрузку от управления 8-уровневым AI-стеком «в голове». Заменить фрагментацию между Grafana / Streamlit / Obsidian единой «плоскостью стекла» (single pane of glass). •  Архитектурный выбор: Tauri (3–10 MB, <200 ms startup) вместо Electron; React Flow (36.4K★, MIT) вместо tldraw/Excalidraw; JSON Canvas (Obsidian-совместимый) как формат данных; MCP Server — AI-агенты являются first-class пользователями графа. •  Бюджет: $0 дополнительных расходов — весь стек MIT/Apache 2.0, open-source only. •  Сроки: Phase 1 (графовый движок + MCP) — 3 недели, Phase 2 (PM layer) — ещё 3 недели, Phase 3 (views + automation) — 4 недели. Итого 10 недель до полнофункционального Control Plane. |
| --- |

# 2. Проблема и мотивация

## 2.1. Когнитивная перегрузка

SOVERN v3.3 — это 8-слойная AI-архитектура с десятками компонентов: от Hermes Agent (Boss) через LiteLLM gateway до graphiti knowledge graph и Langfuse observability. Сегодня вся карта зависимостей, приоритетов и статусов живёт исключительно в голове одного человека. Это создаёт критический bottleneck: один потерянный контекст = часы на восстановление.

## 2.2. Фрагментация инструментов

Текущий набор инструментов покрывает отдельные измерения, но не даёт целостной картины:

| Инструмент | Что показывает | Чего не хватает |
| --- | --- | --- |
| Grafana | Метрики инфраструктуры, uptime | Нет проектной структуры, нет задач |
| Streamlit dashboards | Ad-hoc аналитика, данные | Нет графа зависимостей, stateless |
| Obsidian vault (~/life/) | PARA-структура, заметки, Canvas | Нет PM-функций, нет Gantt, нет AutoCalc |
| Langfuse | LLM traces, стоимость вызовов | Нет визуальной карты агентов |

## 2.3. Отсутствие визуального представления для AI-агентов

AI-агенты (Hermes, Aider, Cline, Claude Code) оперируют в SOVERN без визуальной карты системы, в которой они работают. Они не видят зависимости между задачами, не знают текущий статус соседних подсистем, не могут сами инициировать реструктуризацию проекта. Агенты заслуживают быть first-class пользователями — читать и писать граф через MCP.

## 2.4. Рыночные альтернативы не подходят

- MindManager — $349/год, проприетарный, корпоративно-ориентированный, не agent-native, нет MCP. Функционально — золотой стандарт (AutoCalc, Gantt, Roll-Up), но не suверенный.

- n8n — великолепный канвас (Vue Flow), но это workflow automation tool, не mind-mapping и не project management. Нет Gantt, нет формул в нодах, нет иерархии задач.

- Freeplane — MIT, mind-mapping, но Java desktop 2000-х, нет agent API, нет современного канваса.

- Obsidian Canvas — JSON Canvas формат (отлично!), но минимальный UI, нет PM-слоя, нет MCP.

| ❗ Вывод Нужен инструмент с UI/UX как у n8n (нодовый канвас, React Flow) + функционалом как у MindManager (Gantt, AutoCalc, Roll-Up) + agent-native MCP API — и всё это open-source, local-first, $0. |
| --- |

# 3. Целевой пользователь и персоны

| Персона | Тип | Роли | Как взаимодействует с графом |
| --- | --- | --- | --- |
| Alexander (Solo Vibe Coder) | Primary (Человек) | Architect · PM · Operator · Reviewer | GUI: drag-and-drop ноды, создаёт проекты, устанавливает приоритеты, ревьюит изменения агентов, переключает виды (граф → Gantt → матрица) |
| Hermes Agent (Boss) | Secondary (AI-агент) | Orchestrator · Dispatcher · Monitor | MCP client: read_graph(), update_node(), create_subtask(), get_layer_status(). Диспатчит задачи sub-агентам, обновляет статусы, отправляет алерты в Telegram |
| Coding Sub-agents (Aider, Cline, Claude Code) | Tertiary (AI-агенты) | Worker · Reporter | Через Hermes: сообщают о завершении задач, читают зависимости (какие ноды блокируют их задачу), обновляют status: pending → done |

| Примечание Это НЕ корпоративный инструмент. Нет multi-tenancy, нет команд, нет RBAC между людьми. Есть один человек и его AI-армия. RBAC нужен только для разделения привилегий между агентами (Hermes может удалять ноды, Aider — нет). |
| --- |

# 4. Архитектурный обзор — слоистая модель

Архитектура SOVERN MindMap Control Plane состоит из 8 слоёв, каждый из которых выбран с обоснованием и имеет чёткую зону ответственности.

## 4.1. Presentation Layer — Tauri 2.x Shell

| Параметр | Описание |
| --- | --- |
| Технология | Tauri 2.x — Rust backend + WebView2 (native на Win11) |
| Размер бинарника | 3–10 MB (Electron: 120–200 MB) |
| Startup time | <200 ms (Electron: 1–3 sec) |
| RAM idle | ~50 MB (Electron: 150–400 MB) |
| Возможности | Native file system access, system tray, push-to-talk (Handy), IPC Rust↔JS, auto-updater, deep links |
| Почему не Electron | Bloat, не sovereignty-aligned, Chromium bundling = 120–200 MB, 150–400 MB RAM idle. Tauri использует системный WebView2, уже установленный на Win11. |

## 4.2. Canvas Engine — React Flow 12.x

React Flow (xyflow) — MIT-лицензия, 36.4K★ на GitHub, 7.43M weekly npm installs. Это де-факто стандарт для нодовых редакторов в React-экосистеме.

Ключевые возможности:

- Virtualized rendering — рендерятся только видимые ноды (критично для 1000+ нод SOVERN)

- Custom node components — каждый тип SOVERN-слоя = свой React-компонент с уникальным визуалом

- Edge routing — auto-routing соединений между нодами с bezier/smoothstep/straight

- Minimap, Controls, Zoom/Pan — встроенные компоненты из коробки

- Drag-and-drop — нативный DnD для реструктуризации графа

- Official mind-map tutorial — xyflow имеет готовый туториал для mind-map layout

Референсная архитектура n8n: NodeView → WorkflowCanvas → Canvas → VueFlow → CanvasNode/CanvasEdge. Наш эквивалент: AppShell → SOVERNCanvas → ReactFlow → SOVERNNode/SOVERNEdge.

## 4.3. State Management — Zustand + Yjs CRDT

Zustand — минималистичный state manager для React. Хранит канвас-состояние (ноды, позиции, viewport). Yjs — CRDT-библиотека для offline-first persistence и (в будущем) co-editing между человеком и агентами. Yjs используется в n8n для коллаборативного редактирования. На Phase 1 — только Zustand; Yjs добавляется в Phase 3 при необходимости.

## 4.4. Data Format — JSON Canvas (Obsidian spec)

Открытый формат, созданный командой Obsidian. Ноды имеют id, type, x/y/width/height. Рёбра — fromNode/toNode. Расширяем через namespace sovern:* для метаданных (layer, status, budget, dependencies). Файлы .canvas хранятся в ~/life/projects/sovern-mindmap/ — прямая совместимость с Obsidian vault.

## 4.5. PM Engine

- Frappe Gantt (MIT, zero dependencies) — timeline/Gantt-вид с drag-and-drop, привязка к нодам графа, bi-directional sync

- Jspreadsheet CE (MIT) — Excel-like формулы прямо в нодах: =SUM(children.budget), =COUNTIF(status,"done")/COUNT(*)

- DAG calculator — custom модуль для Roll-Up budget aggregation (bottom-up traversal)

## 4.6. Agent API — встроенный MCP Server

Node.js/TypeScript MCP Server, работающий как sidecar к Tauri-приложению. Hermes Agent (WSL2) подключается как MCP client через stdio transport. Подробная спецификация API — в разделе 7.

## 4.7. Persistence Layer

- JSON Canvas файлы — source of truth, Obsidian-совместимые

- SQLite — индексированные метаданные для быстрого поиска и фильтрации

- Yjs IndexedDB — offline state для CRDT (Phase 3)

## 4.8. Integration Layer

| Интеграция | Направление | Назначение |
| --- | --- | --- |
| graphiti MCP | ← in | Knowledge graph entities обогащают ноды контекстом |
| LiteLLM | ↔ bi | AI-анализ: summarize branch, estimate timeline, detect risks |
| Langfuse | → out | Трейсинг всех агентских операций с канвасом |
| Obsidian vault | ↔ bi | Bi-directional sync: ~/life/projects/*.canvas ↔ app state |
| Telegram | → out | Алерты: дедлайны, completion, approval requests через Hermes |

| 💡 Архитектурная диаграмма (текстовая) ┌──────────────────────────────────────────────────────────────┐ │  Alexander (GUI)          Hermes (MCP client)          │ │       │                         │                        │ │       ▼                         ▼                        │ │  ┌─────────────────────────────────────────────────────┐  │ │  │              Tauri 2.x Shell                       │  │ │  │  ┌─────────────────┐   ┌─────────────────┐  │  │ │  │  │ React Flow 12  │   │  MCP Server    │  │  │ │  │  │ (Canvas+Nodes) │   │ (Node.js/TS)  │  │  │ │  │  └─────────────────┘   └─────────────────┘  │  │ │  │         │                       │              │  │ │  │         ▼                       ▼              │  │ │  │  ┌─────────────────────────────────────┐  │  │ │  │  │  Zustand State + JSON Canvas Files  │  │  │ │  │  │  SQLite Index   |  Yjs CRDT (Ph3)  │  │  │ │  │  └─────────────────────────────────────┘  │  │ │  └─────────────────────────────────────────────────────┘  │ │                         │                              │ │     ┌─────────────┬──────────────┐          │ │     ▼              ▼              ▼                  │ │  Obsidian       graphiti MCP     Langfuse             │ │  ~/life/        FalkorDB         OpenLLMetry          │ │                 Qdrant                                 │ └──────────────────────────────────────────────────────────────┘ |
| --- | --- |

# 5. Визуальный язык — как SOVERN маппится на граф

Каждый слой SOVERN v3.3 имеет уникальное визуальное представление в графе. Визуальный язык обеспечивает мгновенное распознавание типа компонента без чтения label.

| SOVERN Layer | Node Type | Visual Style | Примеры нодов |
| --- | --- | --- | --- |
| 1. Human | Crown node (root) | Border: ■ Gold (#B8860B), avatar icon | Alexander (Architect·PM·Operator·Reviewer) |
| 2. Boss / Orchestration | Hub node | Background: ■ Purple (#6B21A8), pulsing border when active | Hermes Agent, Cron triggers, Skills dispatcher |
| 3. Skills | Leaf nodes с badges | ■ Green (stateless), ■ Orange (stateful) | architect.md, ingest_email, publish.podcast |
| 4. Coding Sub-agents | Worker nodes | ■ Blue (#2B5797), activity indicator (spinner/check) | Aider, Cline, Claude Code, Compound Engineering |
| 5. Model Gateway | Router node | Gradient fill: local (dark) → cloud (light) | LiteLLM, llama.cpp, Cerebras, Groq, NIM |
| 6. Memory | Cylinder (database) | ■ Teal (#008080), fill level = usage % | PARA vault, graphiti, FalkorDB, Qdrant |
| 7. Tool Layer | Hexagon (MCP) | ■ Gray (#888) с protocol icon | graphiti MCP, Telegram relay, Playwright, Apify |
| 8. Observability | Eye icon node | ■ Dark (#333) с inline sparklines | OpenLLMetry, Langfuse, Grafana |
| Hosting | Cloud/Server node | ■ Cloudflare orange, ■ Hetzner red | Pages, Workers, R2, CX22, Dokploy |
| Projects | Folder group | Color-coded по приоритету (P0=red, P1=orange, P2=blue, P3=gray) | #1 Knowledge Graph, #2 Affiliate, etc. |

### Правила визуальной иерархии

- Направление потока: слои располагаются сверху вниз (Human → Boss → Skills → Workers → …) или слева направо в landscape-режиме

- Соединения: стрелки показывают направление потока данных; толщина пропорциональна интенсивности

- Размер нодов: пропорционален ресурсопотреблению (RAM, API calls/day, budget allocation)

- Статус-бейджи: ● Green = running, ● Yellow = degraded, ● Red = down, ● Gray = idle

# 6. Ключевые функции (Feature Matrix)

| Feature | Pri | Phase | MindManager Equivalent | Implementation |
| --- | --- | --- | --- | --- |
| Canvas с custom SOVERN nodes, drag-and-drop, zoom/pan, minimap | P0 | 1 | Map View (core canvas) | React Flow 12 + custom node components per SOVERN layer type |
| JSON Canvas serialization / deserialization | P0 | 1 | .mmap file format | JSON Canvas spec + sovern:* extension namespace |
| MCP Server с read/write graph tools | P0 | 1 | — (нет аналога) | @modelcontextprotocol/sdk, stdio transport, 13 tools |
| Layer-based auto-layout (tree/layered) | P0 | 1 | Auto-arrange map | dagre (tree layout) + elkjs (layered/radial) |
| Gantt chart view с bi-directional sync | P1 | 2 | Gantt Pro view | Frappe Gantt (MIT, zero deps), drag-and-drop bars |
| Task dependencies и critical path calculation | P1 | 2 | Task Dependencies + Critical Path | Custom DAG traversal, topological sort, longest path |
| Budget/cost tracking (AutoCalc Roll-Up) | P1 | 2 | AutoCalc formulas + Roll-Up Task Info | Jspreadsheet CE for formulas, bottom-up DAG aggregation |
| Agent activity visualization (real-time) | P1 | 2 | — | MCP activity log → status badges on nodes, CSS animation |
| Node metadata panel (sidebar) | P1 | 2 | Topic Properties panel | React sidebar: all sovern:* metadata, history, agent log |
| 2×2 priority matrix view | P2 | 3 | Priority Matrix view | React Flow custom layout: 4-quadrant grid positioning |
| Timeline/roadmap horizontal view | P2 | 3 | Timeline layout | Nodes positioned by date on X-axis, layer on Y-axis |
| Mermaid export для GitHub READMEs | P2 | 3 | Export → HTML/Image | Graph → Mermaid flowchart/mindmap syntax string |
| Agent-initiated graph restructuring (с approval) | P2 | 3 | — | PreToolUse hook → Telegram approval → commit/rollback |
| Search и filter по layer, status, agent, date | P2 | 3 | Filter / Power Filter | SQLite FTS5 index + UI filter panel |
| Voice commands (Handy integration) | P3 | 4 | — | Tauri push-to-talk → Whisper STT → command parser |
| Pixel 6 Pro XL kiosk mode (read-only) | P3 | 4 | — | Lightweight WebView page served by Tauri HTTP |
| AI-powered node suggestions (LiteLLM) | P3 | 4 | Smart suggestions | LiteLLM HTTP → sidebar AI assistant, branch analysis |

# 7. MCP Server — контракт API

MCP Server — ядро agent-native архитектуры. Запускается как sidecar-процесс рядом с Tauri-приложением. Hermes Agent (WSL2) подключается через stdio transport. Каждый инструмент имеет typed-схему ввода/вывода.

## 7.1. Tools (13 инструментов)

┌──────────────────────────────────────────────────────────────────┐
│  GRAPH READ OPERATIONS                                        │
├──────────────────────────────────────────────────────────────────┤
│  read_graph()                                                  │
│    → Returns: Full JSON Canvas (all nodes + edges)             │
│                                                                  │
│  read_branch(node_id: string)                                   │
│    → Returns: Subtree rooted at node_id (recursive children)  │
│                                                                  │
│  get_layer_nodes(layer: SOVERNLayer)                            │
│    → Returns: All nodes matching layer enum                    │
│    → Layers: human|boss|skills|coding|gateway|memory|          │
│              tools|observability|hosting|projects               │
│                                                                  │
│  search_nodes(query: string, filters?: {                        │
│      layer?: string,                                             │
│      status?: "pending"|"active"|"done"|"blocked",               │
│      agent?: string                                              │
│  })                                                              │
│    → Returns: Matching nodes array with relevance score        │
│                                                                  │
│  get_agent_activity()                                           │
│    → Returns: Active agents, current node assignments,         │
│               last action timestamp                              │
├──────────────────────────────────────────────────────────────────┤
│  GRAPH WRITE OPERATIONS                                        │
├──────────────────────────────────────────────────────────────────┤
│  create_node(parent_id: string, type: NodeType,                 │
│      metadata: { title, layer, status?, budget?, dates? })      │
│    → Returns: New node ID (UUID v7)                            │
│                                                                  │
│  update_node(node_id: string, patch: {                          │
│      title?: string, status?: Status,                            │
│      budget?: number, dates?: {start, end}                       │
│  })                                                              │
│    → Returns: Updated node object                              │
│    ⚠ PreToolUse hook: budget change >10% requires approval    │
│                                                                  │
│  delete_node(node_id: string)                                   │
│    → Returns: Deleted node + orphaned children list            │
│    ⚠ REQUIRES APPROVAL if node has children                   │
│                                                                  │
│  create_edge(from: string, to: string,                          │
│      type: "data"|"dependency"|"hierarchy")                      │
│    → Returns: New edge ID                                      │
│                                                                  │
│  move_node(node_id: string, new_parent_id: string)              │
│    → Returns: Updated node with new parent                     │
│    ⚠ PreToolUse hook: restructuring requires approval         │
├──────────────────────────────────────────────────────────────────┤
│  CALCULATION OPERATIONS                                        │
├──────────────────────────────────────────────────────────────────┤
│  calculate_critical_path(root_id: string)                       │
│    → Returns: Ordered array of critical path node IDs          │
│               + total duration + slack per node                  │
│                                                                  │
│  calculate_budget_rollup(node_id: string)                       │
│    → Returns: { self, children_sum, total,                     │
│                 breakdown_by_layer }                             │
│                                                                  │
│  export_mermaid(node_id?: string)                               │
│    → Returns: Mermaid diagram string (flowchart or mindmap)    │
│    → If node_id omitted, exports full graph                    │
└──────────────────────────────────────────────────────────────────┘

## 7.2. Resources (MCP Resources)

| URI | Описание | MIME type |
| --- | --- | --- |
| sovern://graph/full | Полное состояние графа (все ноды + рёбра) | application/json |
| sovern://graph/layer/{layer_name} | Вид одного слоя (например, sovern://graph/layer/coding) | application/json |
| sovern://graph/node/{node_id} | Один нод со всеми рёбрами и метаданными | application/json |

## 7.3. Security Model

| Механизм | Описание |
| --- | --- |
| Bearer Token Auth | Уникальный токен для каждого агента. Hermes = full access, Aider/Cline = read + update own tasks only |
| Capability-based RBAC | Permissions per tool: { hermes: ["*"], aider: ["read_*", "update_node"], cline: ["read_*", "update_node"] } |
| PreToolUse Hooks | Деструктивные операции (delete_node с children, budget change >10%, move_node) требуют approval через Telegram |
| Audit Log | Каждая операция записывается в Langfuse trace + SQLite audit table |

# 8. Технологический стек — обоснование каждого выбора

| Component | Choice | License | Почему выбран | Отвергнутая альтернатива (почему) |
| --- | --- | --- | --- | --- |
| Shell | Tauri 2.x | MIT | 3–10 MB binary, <200 ms startup, Rust security, WebView2 native on Win11, system tray, file system access | Electron (120–200 MB, 150–400 MB RAM idle, Chromium bundling, not sovereignty-aligned) |
| Canvas | React Flow 12.x (xyflow) | MIT | 36.4K★ GitHub, virtualized rendering, custom nodes, official mind-map tutorial, 7.43M weekly npm | Vue Flow (Vue rewrite needed), tldraw (no node-graph semantics), Excalidraw (drawing tool, not graph engine) |
| State | Zustand + Yjs | MIT | Lightweight, React-native, CRDT for offline-first, Yjs = n8n collaboration engine | Redux (heavy boilerplate), MobX (less React-native) |
| Data Format | JSON Canvas | MIT | Obsidian-compatible, open spec, strict geometry (x,y,w,h), AI-parseable, human-readable | OPML (no spatial data), FreeMind XML (legacy, heavy) |
| Gantt | Frappe Gantt | MIT | Zero dependencies, drag-and-drop, ERPNext-proven production quality | Bryntum (commercial $$$), DHTMLX (restrictive license) |
| AutoCalc | Jspreadsheet CE | MIT | Excel-like formulas in browser, XLSX import/export, lightweight | HyperFormula (AGPL — viral license, not sovereignty-compatible) |
| Layout | dagre + elkjs | MIT | Auto-layout algorithms for DAG, tree, layered, radial. React Flow official recommendation | Manual positioning only (doesn't scale beyond 50 nodes) |
| MCP SDK | @modelcontextprotocol/sdk | MIT | Official SDK, TypeScript, stdio transport, ecosystem compatibility | Custom REST API (loses MCP ecosystem, non-standard) |
| Build | Vite 6 | MIT | Fast HMR (<50ms), native Tauri integration, ESM-first | Webpack (slow), Turbopack (not stable for production) |
| Languages | TypeScript + Rust | MIT/Apache | TS for UI + MCP Server (type safety, React ecosystem). Rust for Tauri backend (memory safety, performance) | Plain JS (no types), Python (no Tauri backend support) |

# 9. Интеграция с компонентами SOVERN v3.3

| SOVERN Component | Метод интеграции | Data Flow | Phase |
| --- | --- | --- | --- |
| Hermes Agent | MCP client → MindMap MCP server (stdio) | Читает состояние графа, обновляет статусы задач, диспатчит sub-агентам | Ph1 |
| Aider / Cline / Claude Code | Report через Hermes → MCP update | Task completion events: pending → active → done | Ph1 |
| Obsidian vault | File system watcher + JSON Canvas read/write | Bi-directional sync: ~/life/projects/*.canvas ↔ app state | Ph1 |
| Langfuse | OpenLLMetry SDK в MCP server | Трейсинг всех agent read/write операций | Ph1 |
| LiteLLM | HTTP API из Tauri backend | AI-анализ: summarize branch, estimate effort, risk detection | Ph2 |
| graphiti + FalkorDB | graphiti MCP server | Knowledge graph entities обогащают mind map ноды контекстом | Ph2 |
| Telegram | Hermes skill: mindmap_alert | Deadline warnings, agent completions, approval requests | Ph2 |
| Grafana / Streamlit | Embed via iframe / API data feed | Existing dashboards pull graph metrics через REST | Ph3 |
| n8n (Hetzner) | Webhook trigger из MCP server | Workflow automation по изменениям состояния графа | Ph3 |

# 10. Фазированный план разработки

План выровнен с SOVERN rollout phases. Все фазы — $0 бюджет, исключительно open-source компоненты.

## 10.1. Phase 1 — Графовый движок + MCP (Weeks 1–3)

| 🎯 Deliverable Phase 1 Работающее десктопное приложение, которое визуализирует всю архитектуру SOVERN как интерактивный граф. Hermes Agent может читать и писать граф через MCP. |
| --- |

- Tauri 2.x project scaffold: React + TypeScript + Vite 6

- React Flow canvas с 10 custom SOVERN node types (по одному на слой)

- JSON Canvas serialization / deserialization с sovern:* extensions

- Auto-layout: dagre (tree mode) + elkjs (layered mode), toggle в toolbar

- MCP Server с core tools: read_graph, read_branch, get_layer_nodes, search_nodes, create_node, update_node, delete_node, create_edge

- Obsidian vault file watcher: ~/life/projects/*.canvas bi-directional sync

- OpenLLMetry instrumentation: каждая MCP-операция = Langfuse trace

- Minimap, zoom/pan controls, keyboard shortcuts (Ctrl+Z undo, Ctrl+S save)

## 10.2. Phase 2 — PM Layer + Agent Intelligence (Weeks 4–6)

| 🎯 Deliverable Phase 2 Полные PM-возможности, сопоставимые с core-функциями MindManager: Gantt, критический путь, AutoCalc, Roll-Up бюджетов. |
| --- |

- Frappe Gantt интеграция с bi-directional sync: node dates ↔ Gantt bars

- Task dependencies: Finish-to-Start, Start-to-Start edges между нодами

- Critical path calculation: topological sort → longest path → highlight red

- Budget/cost tracking: Jspreadsheet CE формулы в нодах (=SUM(children.budget))

- Roll-Up aggregation: bottom-up DAG traversal для автоматического суммирования

- Node metadata sidebar panel: все sovern:* properties, history changelog, agent activity log

- Agent activity visualization: real-time status badges на нодах (spinner = working, ✓ = done)

- Telegram alerts через Hermes: deadline approaching, agent completed task, approval request

- graphiti MCP integration: knowledge graph entities → context enrichment tooltip

## 10.3. Phase 3 — Views + Automation (Weeks 7–10)

| 🎯 Deliverable Phase 3 Multi-view control plane с AI assistance: граф, Gantt, матрица, timeline — переключение без потери данных. |
| --- |

- 2×2 priority matrix view: Eisenhower-квадрант (Important/Urgent), drag ноды между квадрантами

- Timeline/roadmap horizontal view: ноды на оси X = дата, Y = слой

- Mermaid export: export_mermaid() → flowchart/mindmap syntax для GitHub README

- Agent-initiated restructuring: Hermes предлагает реструктуризацию → Telegram approval → commit/rollback

- Advanced search/filter panel: SQLite FTS5 по всем полям + UI-фильтры (layer, status, agent, date range)

- Kiosk mode для Pixel 6 Pro XL: read-only WebView, auto-refresh каждые 30 секунд

- n8n webhook integration: graph state change → trigger n8n workflow на Hetzner

- LiteLLM AI assistant в sidebar: «проанализируй эту ветку», «предложи декомпозицию», «оцени риски»

## 10.4. Phase 4 — Polish + Future (Weeks 11+)

- Voice commands через Handy / Whisper: push-to-talk → STT → command parser → graph action

- Theme engine: dark / light / SOVERN branded themes

- Performance optimization для 10,000+ нодов: webworker для layout, дополнительная виртуализация

- Plugin system: custom node types через ESM dynamic import

- Backup automation: SanDisk 4TB mirror через Tauri fs-watch

# 11. Критерии успеха (Definition of Done per Phase)

## 11.1. Phase 1 — Графовый движок + MCP

| Критерий | Метрика | Pass/Fail порог |
| --- | --- | --- |
| SOVERN 8-layer граф рендерится | Langfuse trace: время от read_graph() до paint | <2000 ms |
| Hermes читает полный граф через MCP | E2E test: все 13 tools возвращают корректные данные | 100% tools работают |
| JSON Canvas round-trip | Unit test: load → modify → save → load → compare | Zero data loss |
| App binary size | Tauri build output (cargo tauri build) | <15 MB |
| Cold start | Stopwatch: click icon → canvas interactive | <500 ms |

## 11.2. Phase 2 — PM Layer

| Критерий | Метрика | Pass/Fail порог |
| --- | --- | --- |
| Gantt ↔ Graph bi-directional sync | Performance test: change Gantt bar → node date updates | <100 ms задержка |
| Budget Roll-Up для 5 уровней вложенности | Unit test: leaf budgets → root.total = SUM(all leaves) | Математическая точность |
| Critical path совпадает с ручной проверкой | Test suite: 5 проектных графов с известными critical paths | 100% match |

## 11.3. Phase 3 — Views + Automation

| Критерий | Метрика | Pass/Fail порог |
| --- | --- | --- |
| 3+ вида переключаются без потери данных | Integration test: Graph → Gantt → Matrix → Graph round-trip | Zero state corruption |
| Agent restructuring requires approval | E2E test: move_node() → Telegram prompt → confirm/deny | Never auto-approved |
| Kiosk mode на Pixel 6 Pro XL | Manual test: весь граф читаем на расстоянии вытянутой руки | Readable at arm's length |

# 12. Таблица рисков и митигация

| Риск | Impact | Prob. | Митигация |
| --- | --- | --- | --- |
| React Flow performance с 1000+ SOVERN-нодами | High | Medium | Virtualized rendering (только видимые ноды), lazy loading поддеревьев, Zustand selectors per official docs, webworker для layout |
| Tauri WebView2 rendering differences vs Chrome | Medium | Low | Тестирование на Win11 WebView2 (Edge Chromium-based), fallback CSS без новых features |
| JSON Canvas spec слишком ограничен для PM metadata | Medium | High | Custom extension namespace sovern:* — Obsidian игнорирует неизвестные поля, base fields остаются совместимыми |
| MCP SDK breaking changes | High | Low | Pin version в package.json, wrap SDK в adapter layer, тесты на CI |
| Yjs complexity для solo developer | Medium | Medium | Начать без Yjs (Phase 1–2). Добавить в Phase 3 только если нужен co-editing. Zustand + JSON files достаточно для MVP |
| Frappe Gantt API limitations | Medium | Medium | Fork при необходимости — Frappe Gantt это MIT, <700 data-id="842" строк кода, хорошо документирован |
| Scope creep в full PM tool | High | High | Strict phase gates. Каждый feature проходит тест: «Это SOVERN-specific или generic PM?». Generic = отклонить. Focus: AI architecture visualization first |
| Hermes MCP client stability | Medium | Medium | Comprehensive error handling (retry 3x, exponential backoff), fallback к file-based sync (Hermes пишет JSON → app подхватывает через watcher) |

| ⚠ Главный риск Scope creep — самый вероятный и самый опасный. Каждая идея должна проходить фильтр: «Могу ли я реализовать это за 1 день? Это нужно для SOVERN, а не для generic PM?» Если оба ответа «нет» — в backlog Phase 4+. |
| --- |

# 13. Нефункциональные требования (NFR)

| Категория | Требование |
| --- | --- |
| Performance | <2 sec — initial render полного SOVERN-графа  <100 ms — node interaction (drag, click, expand)  <500 ms — cold start (icon click → canvas interactive)  <50 MB RAM — idle memory consumption |
| Security | YubiKey FIDO2 для app unlock (опционально, Phase 4)  Bearer tokens для MCP — per-agent, rotatable  Zero telemetry — никаких данных не уходит без explicit config  Никаких external API calls без явной конфигурации |
| Privacy | All data local by default — никакого cloud sync  JSON Canvas files = source of truth на локальном NVMe  SanDisk 4TB для encrypted backups |
| Sovereignty | Каждый компонент MIT или Apache 2.0  Нулевые проприетарные зависимости  Любой компонент заменяем за дни, не месяцы  Vendor lock-in = архитектурный дефект |
| Accessibility | Keyboard navigation по графу (Tab, Arrow keys, Enter, Escape)  High-contrast mode (Phase 3)  Screen reader basics: aria-labels на нодах |
| Portability | JSON Canvas файлы = единственный source of truth  Приложение disposable — данные вечны  Можно открыть .canvas в Obsidian, VS Code, текстовом редакторе  Миграция на другой app = скопировать .canvas файлы |

# 14. Приложение A — Сравнительная матрица решений

| Feature | SOVERN MindMap | MindManager | n8n | Obsidian Canvas | Freeplane | Neurite |
| --- | --- | --- | --- | --- | --- | --- |
| License | MIT | Proprietary | Fair-code (Source-available) | Proprietary (Core) | GPL-2.0 | MIT |
| Price | $0 | $349/yr | $0 (self-host) | $0 (core) | $0 | $0 |
| Agent-native | ✓ First-class MCP | ✗ (COM API only) | ✗ (workflow-only) | ✗ | ✗ | Partial (AI-assisted) |
| MCP Support | ✓ Built-in server | Via mindm-mcp (3rd party) | ✗ | ✗ | Via freeplane-mcp (3rd party) | ✗ |
| Gantt Chart | ✓ Frappe Gantt | ✓ Gantt Pro | ✗ | ✗ | ✗ | ✗ |
| AutoCalc / Formulas | ✓ Jspreadsheet CE | ✓ AutoCalc | ✗ | ✗ | ✗ | ✗ |
| Local-first | ✓ 100% local | ✓ (license phone-home) | ✓ (self-host) | ✓ | ✓ | ✓ |
| Custom Nodes | ✓ React components | Limited (topics only) | ✓ (workflow nodes) | Limited (text/file/link) | Limited (add-ons) | ✓ (fractal) |
| Platform | Win/Mac/Linux (Tauri) | Windows / macOS | Web (Docker) | Win/Mac/Linux/Mobile | Win/Mac/Linux (Java) | Web |
| Binary Size | 3–10 MB | ~500 MB | ~200 MB (Docker) | ~100 MB (Electron) | ~50 MB (JRE) | Web-only |

| 💡 Вывод Ни одно существующее решение не покрывает все три измерения: visual mind-map + PM depth (Gantt, AutoCalc) + agent-native (MCP). SOVERN MindMap — единственный инструмент, который является одновременно sovereignty-aligned, zero-cost и purpose-built для AI-first одного человека. |
| --- |

# 15. Приложение B — Glossary

| Термин | Определение |
| --- | --- |
| SOVERN | Sovereign Operator · Vibe Runtime · N-agents — 8-слойная AI-архитектура для one-person организации |
| MCP | Model Context Protocol — открытый протокол для связи AI-моделей с внешними инструментами (tools, resources, prompts) через stdio/SSE transport |
| JSON Canvas | Открытый формат файлов Obsidian для пространственных графов: ноды с координатами (x, y, width, height) + рёбра. Файлы .canvas |
| CRDT | Conflict-free Replicated Data Type — структура данных для eventual consistency без координации. Yjs — CRDT-библиотека для JavaScript |
| DAG | Directed Acyclic Graph — граф без циклов, используется для моделирования зависимостей задач и Roll-Up агрегации |
| Yjs | JavaScript CRDT-библиотека для offline-first collaborative editing. Используется в n8n, Tiptap, Liveblocks |
| React Flow | React-библиотека для построения нодовых интерфейсов (xyflow). MIT, 36.4K★ GitHub, 7.43M weekly npm installs |
| Tauri | Framework для desktop-приложений: Rust backend + WebView (native, не Chromium). 3–10 MB binary vs 120–200 MB Electron |
| Frappe Gantt | MIT JavaScript Gantt chart library, zero dependencies. Drag-and-drop timeline bars, proven in ERPNext |
| graphiti | Temporal knowledge graph engine (Zep AI). Хранит entities + relationships с временными метками в FalkorDB + Qdrant |
| PARA | Projects · Areas · Resources · Archive — методология организации цифровой информации (Tiago Forte) |
| DeepVista | SOVERN skills schema: матрица type (architect, operator, reviewer) × execution (sync, async, reactive) |
| Hermes Agent | Boss/Orchestration агент SOVERN v3.3. Работает в WSL2, диспатчит задачи sub-агентам, управляет lifecycle |
| LiteLLM | Model Gateway: единый OpenAI-compatible API для 100+ LLM-провайдеров. Маршрутизирует между local (llama.cpp) и cloud (Cerebras, Groq, NIM) |
| Roll-Up | Агрегация значений снизу вверх по DAG: сумма бюджетов leaf-нодов = бюджет parent-нода. Аналог MindManager Roll-Up Task Info |
| AutoCalc | Вычисляемые поля в нодах. Формулы типа =SUM(children.budget) или =COUNTIF(status,"done")/COUNT(*) |

# 16. Приложение C — Референсные проекты

| Проект | Релевантность | Что берём |
| --- | --- | --- |
| React Flow Mind Map Tutorial (xyflow) | Official tutorial от создателей React Flow для mind map layout | Стартовый scaffold, рекурсивный layout, node expansion, edge routing patterns |
| n8n Canvas Architecture | Production-grade node canvas с Vue Flow, CRDT collaboration | Архитектурный паттерн: NodeView → Canvas → Flow, custom node components, status badges, Yjs integration |
| mindm-mcp | MCP server для MindManager — мост между AI и mind maps | MCP tool design patterns, mind map CRUD operations, read/write API shape |
| chonky-task-manager-mcp | MCP-based task manager с hierarchical tasks | Task hierarchy model, status transitions, agent-driven task lifecycle |
| Pith (AI Task Manager) | AI-native task management с graph-based UI | AI-human interaction patterns, task decomposition UX, context panel design |
| Neurite | Fractal graph workspace с AI integration, infinite canvas | Infinite canvas UX, fractal zoom semantics, AI node generation patterns |
| Freeplane MCP Server | MCP server для Freeplane mind maps | Mind map MCP API patterns, node manipulation tools, tree traversal operations |
| timeline-generator-mcp | MCP server для генерации timeline визуализаций | Timeline/roadmap rendering patterns, date-axis positioning, Mermaid export |

Документ: PRD — SOVERN MindMap Control Plane v1.0

Статус: Draft | Дата: 5 мая 2026 | Автор: Alexander (Solo Vibe Coder)

Архитектура: SOVERN v3.3, Loop 4 | Бюджет PoC: $0

Следующий шаг: Review → Approve → Phase 1 scaffold (npm create tauri-app@latest sovern-mindmap -- --template react-ts)
