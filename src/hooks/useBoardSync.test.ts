import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useBoardSync } from './useBoardSync';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { POLL_MS } from './pollBackoff';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal JSON Canvas payload the live feed would serve.
const CANVAS_TEXT = JSON.stringify({
  nodes: [{ id: 'feed-1', type: 'text', text: 'feed node', x: 0, y: 0, width: 100, height: 40 }],
  edges: [],
});

function Probe() {
  useBoardSync(() => {});
  return null;
}

async function mountAndSettle() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(Probe)));
  // let tick(true) run: fetch + registry check are microtask/short-macrotask chains
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

describe('useBoardSync × boards registry gate', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.getState().setNodes([]);
    useWorkflowStore.getState().setEdges([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/boards')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify([{ id: 'live', name: 'live', path: 'x', writable: false, mtime: 1 }]),
          };
        }
        return { ok: true, text: async () => CANVAS_TEXT };
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never applies the live feed when a boards registry exists (incl. the FIRST apply)', async () => {
    localStorage.setItem(
      'sovern-boards',
      JSON.stringify({ boards: [{ id: 'b-1', name: 'Main', kind: 'user' }], activeBoardId: 'b-1' }),
    );
    const cleanup = await mountAndSettle();
    // Registry owns content: the board.canvas payload must NOT reach the store.
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    cleanup();
  });

  it('keeps the legacy first-apply for fresh installs without a registry', async () => {
    const cleanup = await mountAndSettle();
    expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);
    cleanup();
  });

  it('applies the feed when the file service board is the active tab', async () => {
    localStorage.setItem(
      'sovern-boards',
      JSON.stringify({
        boards: [
          { id: 'b-1', name: 'Main', kind: 'user' },
          { id: 'b-f', name: 'board.canvas (live)', kind: 'file', sourceId: 'live' },
        ],
        activeBoardId: 'b-f',
      }),
    );
    useWorkflowStore.getState().initBoards({
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-f', name: 'board.canvas (live)', kind: 'file', sourceId: 'live' },
      ],
      activeBoardId: 'b-f',
    });
    const cleanup = await mountAndSettle();
    expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);
    cleanup();
    useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
  });

  it('mints the file service board once a registry-backed session sees the feed', async () => {
    localStorage.setItem(
      'sovern-boards',
      JSON.stringify({ boards: [{ id: 'b-1', name: 'Main', kind: 'user' }], activeBoardId: 'b-1' }),
    );
    useWorkflowStore
      .getState()
      .initBoards({ boards: [{ id: 'b-1', name: 'Main', kind: 'user' }], activeBoardId: 'b-1' });
    const cleanup = await mountAndSettle();
    expect(useWorkflowStore.getState().boards.some((b) => b.kind === 'file')).toBe(true);
    // ...but the feed itself did NOT touch the active user board.
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    cleanup();
    useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
  });
});

describe('useBoardSync × много живых бордов', () => {
  const INDEX = [
    { id: 'aaa', name: 'Флот', path: 'X:/a.canvas', writable: false, mtime: 1 },
    { id: 'bbb', name: 'Потоки', path: 'X:/b.canvas', writable: false, mtime: 1 },
  ];

  function stubFetch(index: unknown, bodies: Record<string, string>) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('/api/boards')) {
          return { ok: true, text: async () => JSON.stringify(index) };
        }
        const id = url.replace('/board/', '').replace('.canvas', '');
        return { ok: true, text: async () => bodies[id] ?? CANVAS_TEXT };
      }),
    );
    return calls;
  }

  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({ boards: [], activeBoardId: '' });
    useWorkflowStore.getState().setNodes([]);
    useWorkflowStore.getState().setEdges([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('заводит вкладку на каждый живой борд', async () => {
    stubFetch(INDEX, {});
    const cleanup = await mountAndSettle();
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file.map((b) => b.sourceId)).toEqual(['aaa', 'bbb']);
    cleanup();
  });

  it('тянет содержимое ТОЛЬКО активной вкладки, а не всех бордов', async () => {
    // Иначе каждый тик поллинга качает N файлов целиком.
    const calls = stubFetch(INDEX, {});
    const cleanup = await mountAndSettle();
    const bodyCalls = calls.filter((u) => u.startsWith('/board/'));
    expect(bodyCalls.length).toBeLessThanOrEqual(1);
    cleanup();
  });

  it('борд с error не роняет соседей и не выдаёт себя за пустой', async () => {
    stubFetch(
      [{ ...INDEX[0], error: 'файл недоступен' }, INDEX[1]],
      {},
    );
    const cleanup = await mountAndSettle();
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(2);
    cleanup();
  });

  it('неизменившийся mtime — второй тик не перечитывает борд заново', async () => {
    // Активная вкладка = файловый борд 'aaa'; иначе тик вообще не доходит
    // до чтения содержимого (см. registry-gate выше).
    useWorkflowStore.getState().initBoards({
      boards: [{ id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' }],
      activeBoardId: 'b-live',
    });
    const calls = stubFetch(INDEX, {});

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));
      // Первый тик: чистые микротаски мока fetch, без реальных таймеров.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const afterFirst = calls.filter((u) => u.startsWith('/board/')).length;
      expect(afterFirst).toBe(1);

      // Второй тик: тот же индекс, тот же mtime — перечитывать нечего.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const afterSecond = calls.filter((u) => u.startsWith('/board/')).length;
      expect(afterSecond).toBe(1);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });
});
