import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { loadBoardsRegistry } from '../utils/persistence';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { POLL_MS, nextDelay } from './pollBackoff';

/**
 * Browser-режим: грузит /board.canvas при старте и поллит изменения.
 * Сообщает об исходе первой загрузки через onFirstLoad (для fallback на demo-ноды).
 * Сравнение по сырому тексту файла — дешевле и надёжнее hash'а.
 */
export const useBoardSync = (
  onFirstLoad: (loaded: boolean) => void,
  onChange?: () => void,
) => {
  const lastText = useRef<string | null>(null);
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
        const res = await fetch('/board.canvas', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        if (!alive) return;
        // view-first: пока пользователь редактирует руками, не перетираем граф.
        // lastText НЕ обновляем — изменение переподхватится после exitEditMode.
        if (useWorkflowStore.getState().isEditing) {
          if (first) onFirstLoadRef.current(true);
          return; // finally{} перепланирует следующий tick
        }
        // Multi-board data safety: when a boards registry exists, the boards system
        // owns canvas content and the feed renders ONLY on its own service tab
        // (kind 'file' — a live mirror of the repo file, never persisted to a board
        // key). Applying to any other tab — including the FIRST apply — is forbidden:
        // StrictMode runs the effect twice, and a stray first-apply landing after
        // initBoardsFlow flooded the active board with board.canvas content that the
        // next tab switch persisted under the board's key. Fresh installs without a
        // registry keep the legacy live-feed-as-main-canvas behavior.
        const registry = await loadBoardsRegistry();
        if (!alive) return;
        if (registry) {
          const store = useWorkflowStore.getState();
          if (store.boards.length > 0) store.ensureFileBoard();
          const active = store.boards.find((b) => b.id === store.activeBoardId);
          if (active?.kind !== 'file') {
            // Don't consume lastText — switching to the file tab must re-apply.
            if (first) onFirstLoadRef.current(true);
            return;
          }
        }
        if (text !== lastText.current) {
          lastText.current = text;
          const { nodes, edges } = fromJSONCanvas(JSON.parse(text));
          const store = useWorkflowStore.getState();
          store.setNodes(nodes);
          store.setEdges(edges);
          // пере-применить layout текущего вида, чтобы новые ноды встали по местам
          store.setViewMode(store.viewMode);
          if (!first) onChangeRef.current?.();
        }
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
