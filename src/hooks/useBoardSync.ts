import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { loadBoardsRegistry } from '../utils/persistence';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { POLL_MS, nextDelay } from './pollBackoff';

// Тип берётся ИЗ модуля сервера через `import type`: он стирается при сборке,
// поэтому node:fs в браузерный бандл не попадает, а второй копии формы,
// расходящейся с сервером, не заводится.
import type { BoardSource } from '../mcp/boardIndex';

/**
 * Browser-режим: опрашивает /api/boards и подтягивает содержимое АКТИВНОЙ
 * живой вкладки. Сообщает об исходе первой загрузки через onFirstLoad.
 *
 * Почему индекс, а не файл: живых бордов может быть много, и поллинг каждого
 * целиком означал бы N полных файлов на каждый тик. Индекс несёт mtime —
 * перечитываем только изменившееся.
 */
export const useBoardSync = (
  onFirstLoad: (loaded: boolean) => void,
  onChange?: () => void,
) => {
  /** Ключ — sourceId борда, значение — mtime последнего применённого чтения. */
  const applied = useRef<Map<string, number>>(new Map());
  const onFirstLoadRef = useRef(onFirstLoad);
  onFirstLoadRef.current = onFirstLoad;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Отступ при ошибках: упавший дев-сервер иначе опрашивается вечно
    // с базовым интервалом. Сбрасывается первым же успешным ответом.
    let delay = POLL_MS;

    const tick = async (first: boolean) => {
      let ok = true;
      try {
        const res = await fetch('/api/boards', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const index: BoardSource[] = JSON.parse(await res.text());
        if (!alive) return;

        useWorkflowStore
          .getState()
          .syncFileBoards(
            index.map((b) => ({ id: b.id, name: b.name, writable: b.writable, error: b.error })),
          );

        // view-first: пока пользователь редактирует руками, не перетираем граф.
        // applied НЕ обновляем — изменение переподхватится после exitEditMode.
        if (useWorkflowStore.getState().isEditing) {
          if (first) onFirstLoadRef.current(true);
          return; // finally{} перепланирует следующий tick
        }

        // Multi-board data safety: when a boards registry exists, the boards system
        // owns canvas content and a live feed renders ONLY on its own file tab
        // (kind 'file' — a live mirror of the repo file, never persisted to a board
        // key). Applying to any other tab — including the FIRST apply — is forbidden:
        // StrictMode runs the effect twice, and a stray first-apply landing after
        // initBoardsFlow flooded the active board with board.canvas content that the
        // next tab switch persisted under the board's key. Fresh installs without a
        // registry keep the legacy live-feed-as-main-canvas behavior.
        const registry = await loadBoardsRegistry();
        if (!alive) return;
        const store = useWorkflowStore.getState();
        const active = store.boards.find((b) => b.id === store.activeBoardId);
        if (registry && active?.kind !== 'file') {
          // Don't consume `applied` — switching to a file tab must re-apply.
          if (first) onFirstLoadRef.current(true);
          return;
        }

        // Тянем ТОЛЬКО активный борд: иначе каждый тик качает N файлов целиком.
        const target = active?.kind === 'file' && active.sourceId
          ? index.find((b) => b.id === active.sourceId)
          : index[0];
        if (!target) {
          if (first) onFirstLoadRef.current(true);
          return;
        }
        // Борд с error — это «не смог прочитать», а не «пустой»: пустой граф
        // здесь соврал бы, что борд пуст.
        if (target.error) {
          if (first) onFirstLoadRef.current(true);
          return;
        }
        if (applied.current.get(target.id) === target.mtime) {
          if (first) onFirstLoadRef.current(true);
          return;
        }

        const body = await fetch(`/board/${target.id}.canvas`, { cache: 'no-store' });
        if (!body.ok) throw new Error(String(body.status));
        const text = await body.text();
        if (!alive) return;
        applied.current.set(target.id, target.mtime);
        const { nodes, edges } = fromJSONCanvas(JSON.parse(text));
        const s = useWorkflowStore.getState();
        s.setNodes(nodes);
        s.setEdges(edges);
        // пере-применить layout текущего вида, чтобы новые ноды встали по местам
        s.setViewMode(s.viewMode);
        if (!first) onChangeRef.current?.();
        if (first) onFirstLoadRef.current(true);
      } catch {
        ok = false;
        if (first && alive) onFirstLoadRef.current(false);
      } finally {
        delay = nextDelay(delay, ok);
        if (alive) timer = setTimeout(() => tick(false), delay);
      }
    };

    tick(true);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
};
