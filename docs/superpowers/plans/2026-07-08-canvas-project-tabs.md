# Canvas Project Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вкладки-проекты на канвасе sovern-mindmap: независимые борды + служебная «Design Review» для DesOps-артефактов (spec: `docs/superpowers/specs/2026-07-08-canvas-project-tabs-design.md`).

**Architecture:** Реестр бордов + per-board персистенция поверх существующего `persistence.ts`; board-поля в `useWorkflowStore` (вне temporal partialize); `useArtifactInbox` гейтится на активный review-борд; TabBar — новый компонент в App.

**Tech Stack:** React 18, zustand + zundo, @xyflow/react 12, vitest, vite dev middleware (артефакты), Tauri fs (prod-путь).

## Global Constraints

- Repo: `C:\telo\Efforts\On\MindMapping\sovern-mindmap`, ветка **master**, коммиты прямо в master. TDD: RED→GREEN на каждую логику; `npx vitest run` весь набор зелёный перед каждым коммитом.
- Программные мутации графа — только через `withoutHistory` (zundo-гоча); поля вкладок НЕ попадают в temporal `partialize` (он уже ограничен nodes/edges — не трогать).
- `ingestArtifacts` остаётся чистой функцией с текущей сигнатурой (её тесты не ломать); гейтинг — в хуке `useArtifactInbox`.
- Персистенция дуальна: browser=localStorage, Tauri=appData (динамические import'ы как в persistence.ts). Легаси-ключ `sovern-workspace`/`workspace.canvas` при миграции НЕ удалять.
- Дизайн TabBar: семантические токены приложения (bg-surface, border-edge, text-secondary...) — DESIGN.md проекта; никаких сырых hex (staged-only гейт стоит).
- Dev server (:1420) уже запущен фоном — hot reload; не запускать второй.

---

### Task 1: Мульти-борд персистенция + store-слайс

**Files:**
- Modify: `src/utils/persistence.ts`
- Modify: `src/store/useWorkflowStore.ts`
- Test: `src/store/boards.test.ts` (новый)

**Interfaces (Produces):**
- `persistence.ts`: `loadBoardsRegistry(): Promise<{boards: BoardMeta[], activeBoardId: string} | null>`, `saveBoardsRegistry(reg): Promise<void>`, `saveBoardContent(id, nodes, edges): Promise<void>`, `loadBoardContent(id): Promise<{nodes, edges} | null>`, `migrateLegacyWorkspace(): Promise<{boards, activeBoardId}>` (легаси → борд «Main»; без легаси → пустой «Main»).
- Store: `boards: BoardMeta[]`, `activeBoardId: string`, `initBoards(reg)`, `switchBoard(id)`, `createBoard(name?)`, `renameBoard(id, name)`, `deleteBoard(id)`, `ensureReviewBoard(): string` (id review-борда; создаёт при отсутствии). `BoardMeta`/`REVIEW_BOARD_NAME='Design Review'` экспортируются из store.
- `switchBoard` контракт: сохранить текущий контент → загрузить целевой (`withoutHistory` + `setNodes/setEdges`) → `exitEditMode()`; несуществующий контент → пустой борд.

- [ ] **Step 1 (RED):** `src/store/boards.test.ts` — тесты: (a) `createBoard` добавляет meta и переключает на него с пустым графом; (b) `switchBoard` сохраняет контент A и восстанавливает контент B (мокнуть localStorage через `vi.stubGlobal` или jsdom); (c) `deleteBoard` запрещён для последнего user-борда и для review; (d) `ensureReviewBoard` идемпотентен; (e) `migrateLegacyWorkspace` подхватывает старый `sovern-workspace` ключ как «Main». Запустить — FAIL (нет API).
- [ ] **Step 2 (GREEN):** реализовать persistence-функции (browser-ветка sync localStorage внутри async-обёрток; Tauri-ветка по образцу существующих) и store-слайс. `switchBoard` использует `saveBoardContent` НАПРЯМУЮ (не debounce). Прогнать новые тесты + ВЕСЬ vitest.
- [ ] **Step 3:** Commit `feat(boards): multi-board registry + per-board persistence + store slice`.

### Task 2: TabBar UI + интеграция в App

**Files:**
- Create: `src/components/TabBar.tsx`
- Modify: `src/App.tsx` (mount + init), `src/hooks/useAutosave.ts` (ключ активного борда)
- Test: `src/components/TabBar.test.tsx`

**Interfaces (Consumes):** store-слайс Task 1.

- [ ] **Step 1 (RED):** TabBar-тесты (testing-library уже в проекте — проверить по соседним тестам; если нет — тестировать чистые хелперы): активная вкладка подсвечена; «+» зовёт `createBoard`; дабл-клик открывает input, Enter коммитит `renameBoard`, Escape отменяет; «×» отсутствует у последнего user-борда и у review-борда; бейдж рендерится при `pendingCount > 0`.
- [ ] **Step 2 (GREEN):** компонент (абсолютное позиционирование top-left под брендом, `z-20`, скрыт в presentation/learn — как тулбар в App.tsx:325). Пропсы: `pendingCount` (из Task 3, пока 0). В App: при старте (`initialized` ref, App.tsx:110) — `migrateLegacyWorkspace()` → `initBoards` → загрузка активного борда (заменяет нынешний `loadWorkspace()` вызов); `useAutosave` сохраняет через `saveBoardContent(activeBoardId, ...)`.
- [ ] **Step 3:** ручной смок в браузере (:1420): создать вкладку, порисовать в обеих, переключиться туда-сюда — контент не смешивается, undo после переключения пуст; reload страницы — вкладки и активная восстановлены. Зафиксировать в отчёте.
- [ ] **Step 4:** Commit `feat(boards): TabBar UI + per-board autosave`.

### Task 3: Ретаргет артефакт-инбокса + pending-бейдж

**Files:**
- Modify: `src/hooks/useArtifactInbox.ts`
- Modify: `src/components/TabBar.tsx` (бейдж), `src/App.tsx` (проброс)
- Test: `src/hooks/useArtifactInbox.test.ts` (дополнить)

**Interfaces:** хук возвращает `pendingCount: number` (было `void`). Гейт: `ingestArtifacts` вызывается только если `boards.find(b => b.id === activeBoardId)?.kind === 'review'`; при `artifacts.length > 0` — `ensureReviewBoard()` (meta создаётся, но переключение НЕ автоматическое).

- [ ] **Step 1 (RED):** тесты: (a) на user-борде poll НЕ добавляет ноды, но pendingCount = числу артефактов без decision; (b) на review-борде — ноды добавляются (существующее поведение); (c) артефакты с decision в pendingCount не входят.
- [ ] **Step 2 (GREEN):** реализация; App пробрасывает `pendingCount` в TabBar.
- [ ] **Step 3:** живой e2e-смок: на канвасе (:1420) уже 6 pending-артефактов Warm Studio в инбоксе — на вкладке «Main» их ноды НЕ появляются, бейдж «Design Review (6)» горит; переключение на Design Review — все 6 материализуются рядами `ws-pill`/`ws-shell`. Playwright-скриншот в `design/tabs-smoke.png`.
- [ ] **Step 4:** Commit `feat(boards): artifact inbox targets Design Review board + pending badge`.

## После задач
Финальное ревью диффа ветки (sonnet достаточно — 3 задачи, UI+store), README/AGENT_INTEGRATION.md: абзац про вкладки и Design Review борд; memory `project_sovern_mindmap` — строка про вкладки.
