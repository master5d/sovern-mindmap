# Agent Integration — sovern-canvas MCP

SOVERN MindMap — не только canvas для человека, но и **design-review поверхность для агентов** (DesOps Pipeline v4, Phase 2). MCP-сервер `sovern-canvas` даёт агентам создавать UI-артефакты на живом холсте и читать вердикты человека.

## 1. Сборка и регистрация

```bash
cd C:/telo/Efforts/On/MindMapping/sovern-mindmap
npm run build:mcp          # обязательный шаг на свежем чекауте: dist-mcp/ gitignored
```

Регистрация (уже сделана для Claude Code в `C:\telo\.mcp.json`):

```json
{
  "mcpServers": {
    "sovern-canvas": {
      "command": "node",
      "args": ["C:/telo/Efforts/On/MindMapping/sovern-mindmap/dist-mcp/mcp/server.js"]
    }
  }
}
```

Тот же блок подходит для Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`) и других MCP-хостов.

После любой правки `src/mcp/**` — пересобрать `npm run build:mcp`, иначе тулы работают на старом коде.

## 2. Инструменты

| Tool | Параметры | Что делает |
|---|---|---|
| `create_artifact_node` | `code` (обяз., React-код с корневым `App`), `name`, `variant_group`, `project_dir` | Кладёт артефакт в inbox → через ≤2s появляется нодой на живом canvas. Вариации одной `variant_group` ложатся в ряд (галерея). `project_dir` включает экспорт approved-кода в `<project>\design\drafts\` |
| `read_artifact_decisions` | `variant_group?` | Возвращает вердикты человека (approved/rejected/**deleted** + exportedTo) — замыкание петли review. `deleted` = owner снёс ноду с борда (tombstone): не перегенерируйте тот же вариант вслепую |
| `read_graph` | — | Вся карта в JSON Canvas |
| `create_node` | `label`, `layer`, `parent_id?`, `status?`, `budget?` | Обычная SOVERN-нода (⚠️ пишет во внутренний граф MCP-процесса, НЕ на живой canvas — мост построен только для артефактов) |
| `update_node`, `calculate_budget_rollup` | см. схемы | Как create_node — внутренний граф |

## 3. Как работает мост (artifact bridge)

```
агент → MCP create_artifact_node → .sovern/artifact-inbox.jsonl (append-only JSONL)
   живой canvas (vite :1420) ── GET /api/artifacts (poll 2s, мержит decisions) → нода ArtifactNode
   человек: ✓ Approve / ✗ Reject на ноде → .sovern/artifact-decisions.jsonl (+export файла при projectDir)
   человек: Delete ноды на review-борде → tombstone decision:'deleted' → артефакт исчезает из фида НАВСЕГДА
   агент → read_artifact_decisions → видит вердикт и exportedTo
```

- **Одна запись на approve+export (2026-07-10):** approve артефакта с `project_dir` пишет РОВНО одну ledger-строку через `/export` — `approved` + `variant_group` + `exportedTo` вместе (раньше было две записи, и group-фильтрованный `read_artifact_decisions` не видел exportedTo).
- **Tombstones (2026-07-10):** удалённый с review-борда артефакт получает вердикт `deleted` и фильтруется из `GET /api/artifacts` — не воскресает ни на поллах, ни на свежем канвасе. Повторный `create_artifact_node` с новым кодом = новый id, живёт нормально.

- Canvas должен быть запущен: `npm run dev` (порт **1420 strictPort**). Без него артефакты копятся в inbox и появятся при следующем старте — уже со статусами из decisions-ledger.
- **Вкладки (2026-07-08):** канвас мульти-бордовый; артефакты материализуются ТОЛЬКО на служебной вкладке **«Design Review»** (создаётся сама; на других вкладках — только pending-бейдж). Artifact-ноды, попавшие в user-борды, автоматически вычищаются (sweep). Агенту ничего менять не нужно — мост тот же.
- iframe артефакта получает **DesOps-токены хаба** (`/desops/tokens.css` ← `NAUTILUS/core/desops/ui-kit/globals.css`) + tailwind-маппинг семантических классов (`bg-primary`, `text-text-secondary`, `bg-surface`...) + текущую тему приложения. Пишите код артефактов ТОЛЬКО на семантических классах.
- Артефакт-ноды переживают Save/Load через JSON Canvas (`metadata['mm:artifact']`).

## 4. Кто этим пользуется

Субагент **`desops-orchestrator`** (user scope, `~/.claude/agents/`) — штатный генератор UI DesOps-конвейера: Master Cycle, 3+ вариации на группу, никакого кода в чат. Definition: `NAUTILUS/core/desops/agent-layer/agents/desops-orchestrator.md`. Полная картина конвейера: `NAUTILUS/core/desops/README.md`.

## 5. Безопасность

- Экспорт пишет только внутрь `C:\telo\**\design\drafts\` (path-контейнмент на `path.resolve`, kebab-санитизация имени; код берётся из inbox по id — POST-телу не доверяем).
- iframe: `sandbox="allow-scripts"` без `allow-same-origin` — код артефакта не достаёт до origin/хранилища приложения.
- Human-in-the-loop: агент не может сам одобрить артефакт — вердикты только с canvas.

---
**SOVERN v3.4 · MindMap Control Plane + DesOps Canvas**
