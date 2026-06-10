# Инструкция: Подключение SOVERN MCP Server к ИИ-агентам

Ваш **SOVERN MindMap Control Plane** теперь имеет встроенный MCP-сервер, который позволяет ИИ-агентам (Hermes, Claude Desktop, Cursor) видеть ваш проект и управлять им.

## 1. Сборка сервера

Перед подключением необходимо убедиться, что сервер скомпилирован:

```bash
cd "01_Projects/MindMapping/sovern-mindmap"
npm run build
```

## 2. Конфигурация для Claude Desktop

Добавьте следующий блок в ваш файл конфигурации Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json` на Windows):

```json
{
  "mcpServers": {
    "sovern-control-plane": {
      "command": "node",
      "args": [
        "C:/telo/Efforts/On/MindMapping/sovern-mindmap/dist-mcp/server.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```
*(Примечание: Убедитесь, что путь к `server.js` указан верно после сборки).*

## 3. Доступные инструменты (Tools) для Агента

Теперь ваш агент может вызывать следующие команды:

1.  `read_graph` — получить всю карту в формате JSON Canvas.
2.  `create_node` — создать новую задачу (нужно указать `label`, `layer` и опционально `parent_id`).
3.  `update_node` — изменить статус, бюджет или текст задачи.
4.  `calculate_budget_rollup` — спросить агента: "Сколько всего стоит эта ветка?".

## 4. Примеры промптов для Hermes

Теперь вы можете отдавать Hermes (Boss Agent) такие команды:

*   *"Hermes, посмотри на мой Control Plane и скажи, какие задачи сейчас заблокированы (blocked)?"*
*   *"Проанализируй ветку разработки MCP и декомпозируй задачу 'Frontend Integration' на 3 подзадачи в слое Coding."*
*   *"Обнови статус задачи 'Tailwind Setup' на 'done' и пересчитай общий бюджет проекта."*

## 5. Безопасность (Human-in-the-loop)

Согласно вашему PRD, деструктивные действия (удаление крупных веток или изменение бюджета более чем на 10%) должны проходить через ваше подтверждение. На текущем этапе агент будет предлагать изменения, а вы будете видеть их результат на визуальном холсте.

---
**SOVERN v3.3 · MindMap Control Plane**
*Визуализируй. Управляй. Масштабируй.*
