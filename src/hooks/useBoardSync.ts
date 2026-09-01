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
  /** id вкладки (BoardMeta.id, НЕ sourceId), при которой applied в последний
   *  раз реально легло на холст. Живые борды не персистятся: уход с их
   *  вкладки стирает граф (switchBoard грузит null-контент). Если активная
   *  вкладка успела смениться с прошлого удачного применения — то, что сейчас
   *  на холсте, точно не наш последний apply, даже если mtime борда не
   *  изменился, и перечитывать нужно безусловно (иначе возврат на ту же
   *  вкладку показывал бы пустой холст до следующего реального изменения
   *  файла — см. инцидент C5). */
  const lastRenderedTabId = useRef<string | null>(null);
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

        // view-first: пока пользователь редактирует руками, ничего не трогаем —
        // ни содержимое (ниже), ни список вкладок. Список — тоже: снос
        // пропавшей вкладки или переключение активной прямо под курсором во
        // время правки не менее разрушительны, чем перезапись графа.
        // applied/lastRenderedTabId НЕ трогаем — переподхватится после exitEditMode.
        if (useWorkflowStore.getState().isEditing) {
          if (first) onFirstLoadRef.current(true);
          return; // finally{} перепланирует следующий tick
        }

        useWorkflowStore
          .getState()
          .syncFileBoards(
            index.map((b) => ({ id: b.id, name: b.name, writable: b.writable, error: b.error })),
          );

        // Живых бордов, которых больше нет в индексе, applied помнить не должен —
        // иначе Map растёт вечно на удалённые/переименованные пути.
        const liveIds = new Set(index.map((b) => b.id));
        for (const id of applied.current.keys()) {
          if (!liveIds.has(id)) applied.current.delete(id);
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

        // Инвалидация C5: активная вкладка отличается от той, при которой мы
        // в последний раз реально применили содержимое — холст с тех пор
        // мог быть стёрт switchBoard'ом. Забываем "применено", пока не
        // применим заново на этой самой вкладке.
        if (store.activeBoardId !== lastRenderedTabId.current) {
          lastRenderedTabId.current = null;
        }

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
        const unchanged =
          lastRenderedTabId.current === store.activeBoardId &&
          applied.current.get(target.id) === target.mtime;
        if (unchanged) {
          if (first) onFirstLoadRef.current(true);
          return;
        }

        const body = await fetch(`/board/${target.id}.canvas`, { cache: 'no-store' });
        if (!body.ok) throw new Error(String(body.status));
        const text = await body.text();
        if (!alive) return;

        // C1: пока тело летело, активная вкладка могла смениться (или сама
        // вкладка — исчезнуть). Применять контент target'а сейчас — тот же
        // класс порчи, от которой существует StrictMode-заслон выше, только
        // через другой канал (гонка await, а не двойной рендер эффекта).
        // Перепроверяем состояние ПОСЛЕ await, а не полагаемся на active/target,
        // снятые до него — тот же приём, что switchBoard применяет к своему
        // собственному await (см. useWorkflowStore.switchBoard).
        const storeAfter = useWorkflowStore.getState();
        const activeAfter = storeAfter.boards.find((b) => b.id === storeAfter.activeBoardId);
        const targetAfter = activeAfter?.kind === 'file' && activeAfter.sourceId
          ? index.find((b) => b.id === activeAfter.sourceId)
          : index[0];
        const stillTarget =
          !(registry && activeAfter?.kind !== 'file') && targetAfter?.id === target.id;
        if (!stillTarget) {
          if (first) onFirstLoadRef.current(true);
          return; // applied/lastRenderedTabId НЕ трогаем — target не наш
        }

        // applied помечается ТОЛЬКО после успешного разбора и применения:
        // если тело битое, JSON.parse бросает исключение до этой строки, и
        // борд не должен навсегда застрять «уже применённым» без содержимого —
        // следующий тик обязан попробовать снова.
        const { nodes, edges } = fromJSONCanvas(JSON.parse(text));
        applied.current.set(target.id, target.mtime);
        lastRenderedTabId.current = storeAfter.activeBoardId;
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
