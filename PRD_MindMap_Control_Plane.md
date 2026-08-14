> Это КРАТКАЯ сводка-обновление от 7 мая (Alpha, статусы фаз). Полный текст PRD —
> в `PRD — SOVERN MindMap Control Plane.md` (конверсия одноимённого `.docx`, ревизия
> 5 мая, Draft): там разделы 3–9 целиком, таблицы сравнения альтернатив и приложения.
> Файлы НЕ дубликаты: у сводки более поздние статусы, у полного текста — тело.

SOVERN v3.3 · LOOP 4

PRD — SOVERN MindMap Control Plane

Product Requirements Document · v1.0 (Updated May 7, 2026)

Визуальная плоскость управления для AI-first организации одного человека

1. Executive Summary (TL;DR)
SOVERN MindMap Control Plane — это инструмент визуального управления проектами, заменяющий MindManager в стеке индивидуального разработчика. Инструмент изначально спроектирован для ИИ-агентов (first-class users) и поддерживает детерминированные вычисления (Token Roll-Up), 4 вида визуализации (Map, Matrix, Timeline, Kanban) и бесшовную интеграцию с Obsidian.

2. Проблема и мотивация
(Оставлено без изменений)

... (Слоистая модель) ...

4.5. PM Engine
Frappe Gantt — timeline/Gantt-вид.
Jspreadsheet CE — Excel-like формулы.
Token Budgeting — дефолтная единица стоимости: **ИИ-Токены**.
DAG calculator — авто-суммирование токенов и дат.

6. Ключевые функции (Feature Matrix)

| Категория | Функция | Описание | Приоритет | Статус |
| :--- | :--- | :--- | :--- | :--- |
| **Canvas** | Virtualized Rendering | Плавная работа с 1000+ нодами | P0 | DONE |
| **Canvas** | 4 View Modes | MindMap, 2x2 Matrix, Timeline, **Kanban** | P0 | DONE |
| **Canvas** | Auto-layout | Интеграция с Dagre | P0 | DONE |
| **PM Engine** | Token Roll-Up | Авто-суммирование ИИ-токенов по иерархии | P0 | DONE |
| **PM Engine** | Temporal Roll-Up | Авто-расчет дат веток на основе подзадач | P0 | DONE |
| **Agent API** | MCP Server | Полный контроль графа через инструменты для ИИ | P0 | DONE |
| **Integration** | Obsidian Sync | Двусторонняя синхронизация с .canvas файлами | P0 | DONE |
| **Reliability** | Environment-Aware | Корректная работа в браузере и Tauri shell | P1 | DONE |

7. MCP Server — контракт API
(Описанные 13 инструментов + новые эвристики)

...

10. Текущий статус (Current Status)

Phase 1 (Scaffold): 100%
Phase 2 (PM Engine & Persistence): 100%
Phase 3 (Views & Automation): 90% (Matrix, Roadmap, Kanban и Webhook infra готовы).

Документ: PRD — SOVERN MindMap Control Plane v1.0
Статус: Alpha | Дата: 7 мая 2026 | Автор: Alexander (Solo Vibe Coder)
Следующий шаг: Push to Git → Deploy MCP Server → Orchestrate Hermes.
