# Canvas Project Tabs — Design

**Дата:** 2026-07-08 · **Статус:** APPROVED (owner: «ok по вкладкам»)
**Проблема:** холст один; DesOps-артефакты и пользовательские карты (Точка Сборки) валятся в одну кучу.

## Решение

**Мульти-борд с таб-баром.** Каждая вкладка = независимый борд (nodes+edges), своя персистенция, своя undo-история. Артефакты дизайн-ревью живут ТОЛЬКО в служебной вкладке «Design Review».

### Данные
- `BoardMeta = { id: string; name: string; kind: 'user' | 'review' }`
- Реестр: localStorage `sovern-boards` (browser) / appData `boards.json` (Tauri): `{ boards: BoardMeta[], activeBoardId }`.
- Контент борда: localStorage `sovern-workspace:<id>` / appData `boards/<id>.canvas` (JSON Canvas, существующий конвертер).
- **Миграция:** при первом запуске без реестра существующий `sovern-workspace` (или `workspace.canvas`) становится бордом «Main» (kind user); легаси-ключ не удаляется (safety).

### Store (useWorkflowStore, non-temporal поля)
- `boards`, `activeBoardId`, `switchBoard(id)`, `createBoard(name)`, `renameBoard(id, name)`, `deleteBoard(id)`.
- `switchBoard`: (1) немедленный save текущего борда (не ждать debounce), (2) load целевого `withoutHistory`, (3) `exitEditMode()` + `temporal.clear()`, (4) activeBoardId + persist реестра. Ошибка загрузки → пустой борд, не крэш.
- `deleteBoard`: нельзя удалить последний user-борд и review-борд; контент-ключ удаляется.

### Артефакт-инбокс (ретаргет)
- Poll (2s) продолжает работать всегда, но `ingestArtifacts` вызывается ТОЛЬКО когда активен review-борд.
- Review-борд создаётся лениво (`ensureReviewBoard`), когда в инбоксе есть артефакты.
- **Бейдж** на вкладке «Design Review» = число артефактов без decision (pending), считается из ответа `/api/artifacts` независимо от активной вкладки.
- Дедуп при повторном входе на вкладку — существующий (по `artifactId` в нодах; ноды переживают save/load через `mm:artifact` metadata).

### UI TabBar
- Горизонтальная полоса сверху слева (не пересекается с брендом/тулбаром), стиль приложения (surface/edge токены).
- Вкладка: имя, активная подсвечена; review-вкладка с иконкой 🎨 и pending-бейджем; «+» создаёт «Board N»; дабл-клик → inline-rename (Enter/Escape); «×» на hover для user-бордов (кроме последнего) с `confirm()`.
- Скрывается в presentation/learn mode (как тулбар).

### Инварианты
- Undo/redo не протекает между бордами (clear на switch); poll не жрёт чужие вкладки; автосейв пишет под ключ АКТИВНОГО борда; тулбарные Save/Load-файл работают с активным бордом как раньше.

## Вне скоупа
Drag-reorder вкладок; шаринг бордов; multi-window; tombstones инбокса (отдельный backlog-пункт).
