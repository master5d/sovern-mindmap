import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { fromJSONCanvas } from '../utils/canvasConverter';

const POLL_MS = 3000;

/**
 * Browser-режим: грузит /board.canvas при старте и поллит изменения.
 * Сообщает об исходе первой загрузки через onFirstLoad (для fallback на demo-ноды).
 * Сравнение по сырому тексту файла — дешевле и надёжнее hash'а.
 */
export const useBoardSync = (onFirstLoad: (loaded: boolean) => void) => {
  const lastText = useRef<string | null>(null);
  const onFirstLoadRef = useRef(onFirstLoad);
  onFirstLoadRef.current = onFirstLoad;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async (first: boolean) => {
      try {
        const res = await fetch('/board.canvas', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        if (!alive) return;
        if (text !== lastText.current) {
          lastText.current = text;
          const { nodes, edges } = fromJSONCanvas(JSON.parse(text));
          const store = useWorkflowStore.getState();
          store.setNodes(nodes);
          store.setEdges(edges);
          // пере-применить layout текущего вида, чтобы новые ноды встали по местам
          store.setViewMode(store.viewMode);
        }
        if (first) onFirstLoadRef.current(true);
      } catch {
        if (first && alive) onFirstLoadRef.current(false);
      } finally {
        if (alive) timer = setTimeout(() => tick(false), POLL_MS);
      }
    };

    tick(true);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
};
