import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useBoardSync } from './useBoardSync';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';
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
    // boards/activeBoardId/boardsReady сбрасывать ОБЯЗАТЕЛЬНО, тем же
    // набором, что у соседнего describe («много живых бордов») — иначе
    // порядок-зависимость: сосед зовёт initBoards(...), который оставляет
    // boardsReady: true и непустой boards, и следующий тест ЭТОГО блока
    // (например «keeps the legacy first-apply for fresh installs without a
    // registry») наследует чужой boardsReady при перемешанном порядке
    // тестов — ровно то, что было объявлено закрытым, но чинилось только в
    // одном из двух beforeEach (F6).
    useWorkflowStore.setState({ boards: [], activeBoardId: '', boardsReady: false });
    useWorkflowStore.getState().setNodes([]);
    useWorkflowStore.getState().setEdges([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/boards')) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify([
                { id: 'live', name: 'live', path: 'x', writable: false, mtime: 1, size: 10 },
              ]),
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
    { id: 'aaa', name: 'Флот', path: 'X:/a.canvas', writable: false, mtime: 1, size: 10 },
    { id: 'bbb', name: 'Потоки', path: 'X:/b.canvas', writable: false, mtime: 1, size: 20 },
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
    // boardsReady сбрасывать ОБЯЗАТЕЛЬНО вместе с boards: без него
    // syncFileBoards — пустышка (см. часового готовности в useWorkflowStore),
    // и тесты этого блока зеленели бы только на флаге, протёкшем из соседнего
    // describe. Порядок-зависимый сьют — это не «работает» (F6).
    useWorkflowStore.setState({ boards: [], activeBoardId: '', boardsReady: true });
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

  it('тело тянется РОВНО за активную вкладку: ноль запросов на пользовательской, только свой борд на живой', async () => {
    // Две цели в одном тесте, и обе нужны (F5):
    //  (1) реестр есть, активна ПОЛЬЗОВАТЕЛЬСКАЯ доска -> РОВНО НОЛЬ запросов
    //      тела. Прежняя формулировка `toBeLessThanOrEqual(1)` зеленела на
    //      нуле, который получался вообще не по делу: activeBoardId был пуст,
    //      и ранний заслон многобордовой безопасности возвращал управление
    //      до кода выбора цели. Снятие этого заслона теперь красит тест.
    //  (2) активна ЖИВАЯ вкладка -> запрошен ИМЕННО её борд, а не index[0].
    //      Подмена выбора цели безусловным index[0] теперь тоже красит.
    const registry: { boards: BoardMeta[]; activeBoardId: string } = {
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-live-b', name: 'Потоки', kind: 'file', sourceId: 'bbb' },
      ],
      activeBoardId: 'b-1',
    };
    localStorage.setItem('sovern-boards', JSON.stringify(registry));

    // (1) активна пользовательская доска.
    useWorkflowStore.getState().initBoards(registry);
    const userCalls = stubFetch(INDEX, {});
    const cleanupUser = await mountAndSettle();
    expect(userCalls.filter((u) => u.startsWith('/board/'))).toHaveLength(0);
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    cleanupUser();
    vi.unstubAllGlobals();

    // (2) активна живая вкладка ВТОРОГО борда — index[0] здесь не подойдёт.
    useWorkflowStore.getState().initBoards({ ...registry, activeBoardId: 'b-live-b' });
    const liveCalls = stubFetch(INDEX, {});
    const cleanupLive = await mountAndSettle();
    const bodyCalls = liveCalls.filter((u) => u.startsWith('/board/'));
    expect(bodyCalls).toHaveLength(1);
    expect(bodyCalls[0]).toBe('/board/bbb.canvas');
    cleanupLive();
    useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
  });

  it('борд с error не роняет соседей, не выдаёт себя за пустой и не запрашивает тело', async () => {
    // Ошибочный борд — АКТИВНАЯ вкладка: иначе multi-board-safety-гейт
    // возвращается раньше, чем выполнение доходит до ветки `target.error`,
    // и она остаётся непроверенной ничем (см. находку ревью C3).
    useWorkflowStore.getState().initBoards({
      boards: [{ id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' }],
      activeBoardId: 'b-live',
    });
    const calls = stubFetch(
      [{ ...INDEX[0], error: 'файл недоступен' }, INDEX[1]],
      {},
    );
    const cleanup = await mountAndSettle();
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(2);
    const bodyCalls = calls.filter((u) => u.startsWith('/board/'));
    expect(bodyCalls).toHaveLength(0); // error — это не «пустой», тело не запрашиваем
    expect(useWorkflowStore.getState().nodes).toHaveLength(0); // и граф не тронут
    cleanup();
    useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
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

  it('переключение активной вкладки, пока грузится тело, не даёт чужому контенту сесть на новую активную (C1)', async () => {
    useWorkflowStore.getState().initBoards({
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' },
      ],
      activeBoardId: 'b-live',
    });

    let resolveBody: (() => void) | null = null;
    const bodyGate = new Promise<void>((res) => {
      resolveBody = res;
    });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('/api/boards')) {
          return { ok: true, text: async () => JSON.stringify(INDEX) };
        }
        if (url.startsWith('/board/aaa')) {
          await bodyGate; // застреваем здесь, пока тест сам не отпустит
        }
        return { ok: true, text: async () => CANVAS_TEXT };
      }),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(Probe)));

    // Дать тику дойти до fetch('/board/aaa.canvas') и застрять на bodyGate.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(calls.some((u) => u.startsWith('/board/aaa'))).toBe(true);

    // Пока тело летит — пользователь переключается на пользовательскую доску.
    useWorkflowStore.setState({ activeBoardId: 'b-1' });

    // Теперь отпускаем тело живого борда 'aaa'.
    await act(async () => {
      resolveBody!();
      await new Promise((r) => setTimeout(r, 0));
    });

    // 'aaa' не должен был сесть на текущую (уже другую) активную вкладку.
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);

    act(() => root.unmount());
    container.remove();
    useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
  });

  it('борд, ставший битым ПОСЛЕ успешного применения, не застревает на битой версии — тик пробует снова (C2)', async () => {
    // Сценарий специально НЕ «первый тик сразу битый» — там применённого
    // ранее нет, и деинвалидация lastRenderedTabId (C5) сама вынудит повтор
    // независимо от того, где стоит applied.set. Настоящий риск C2 — когда
    // борд УЖЕ был успешно применён, потом обновился до новой битой версии:
    // если applied.set стоит до парсинга, кэш поверит, что новый (битый)
    // mtime уже применён, и следующий тик с тем же битым mtime не станет
    // перечитывать вообще.
    useWorkflowStore.getState().initBoards({
      boards: [{ id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' }],
      activeBoardId: 'b-live',
    });

    let mtime = 1;
    let corrupt = false;
    const bodyCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/boards')) {
          return {
            ok: true,
            text: async () => JSON.stringify([{ ...INDEX[0], mtime }, INDEX[1]]),
          };
        }
        if (url.startsWith('/board/aaa')) {
          bodyCalls.push(url);
          return { ok: true, text: async () => (corrupt ? '{не json' : CANVAS_TEXT) };
        }
        return { ok: true, text: async () => CANVAS_TEXT };
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));

      // Тик 1: mtime=1, тело исправно — применяется.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(bodyCalls).toHaveLength(1);
      expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);

      // Файл обновился и стал битым.
      mtime = 2;
      corrupt = true;

      // Тик 2 (задержка после успеха = POLL_MS): mtime сменился — перечитывает,
      // тело битое, JSON.parse бросает.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const afterCorruptTick = bodyCalls.length;
      expect(afterCorruptTick).toBe(2);

      // Тик 3 (задержка после ошибки удваивается: POLL_MS*2): файл всё ещё
      // на том же битом mtime=2 — если applied помечен ДО парсинга, кэш решит,
      // что mtime=2 уже применён, и тело больше не запросится.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      });
      const afterThirdTick = bodyCalls.length;
      expect(afterThirdTick).toBeGreaterThan(afterCorruptTick);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });

  it('во время isEditing список живых вкладок не меняется, после выхода — подхватывается (C4)', async () => {
    stubFetch(INDEX, {});
    useWorkflowStore.getState().enterEditMode();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(useWorkflowStore.getState().boards.filter((b) => b.kind === 'file')).toHaveLength(0);

      useWorkflowStore.getState().exitEditMode();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
      expect(file.map((b) => b.sourceId)).toEqual(['aaa', 'bbb']);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      // Гарантия против утечки isEditing в следующие тесты, даже если один
      // из assert'ов выше бросил раньше штатного exitEditMode().
      useWorkflowStore.getState().exitEditMode();
    }
  });

  it('возврат на неизменившуюся живую вкладку перечитывает её содержимое заново (C5)', async () => {
    useWorkflowStore.getState().initBoards({
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' },
      ],
      activeBoardId: 'b-live',
    });
    stubFetch(INDEX, {}); // mtime 'aaa' не меняется на протяжении теста

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);

      // Уходим на пользовательскую доску: живой борд не персистится, обычный
      // switchBoard на его месте загрузил бы null-контент и очистил холст —
      // здесь это симулируется напрямую, чтобы не тянуть Tauri/appData слой.
      useWorkflowStore.setState({ activeBoardId: 'b-1', nodes: [], edges: [] });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      // Возвращаемся на ту же живую вкладку — mtime 'aaa' всё ещё тот же.
      useWorkflowStore.setState({ activeBoardId: 'b-live' });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });

  it('вход в режим правки, пока летит тело, не даёт содержимому сесть поверх работы (F1)', async () => {
    // view-first проверяется наверху тика, но между той проверкой и apply
    // стоят ДВА await (индекс и тело). Пользователь, вошедший в правку, пока
    // тело летело, получал setNodes/setEdges поверх своей работы — регресс
    // относительно состояния до ветки живых бордов.
    useWorkflowStore.getState().initBoards({
      boards: [{ id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' }],
      activeBoardId: 'b-live',
    });

    let resolveBody: (() => void) | null = null;
    const bodyGate = new Promise<void>((res) => {
      resolveBody = res;
    });
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('/api/boards')) {
          return { ok: true, text: async () => JSON.stringify(INDEX) };
        }
        if (url.startsWith('/board/aaa')) {
          await bodyGate; // тело зависло в полёте
        }
        return { ok: true, text: async () => CANVAS_TEXT };
      }),
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(Probe)));

    try {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(calls.some((u) => u.startsWith('/board/aaa'))).toBe(true);

      // Пока тело летит — пользователь начал править граф руками.
      useWorkflowStore.getState().enterEditMode();

      await act(async () => {
        resolveBody!();
        await new Promise((r) => setTimeout(r, 0));
      });

      // Содержимое борда НЕ имеет права лечь поверх правки.
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);
    } finally {
      act(() => root.unmount());
      container.remove();
      useWorkflowStore.getState().exitEditMode();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });

  it('уход и возврат на живую вкладку БЕЗ тика между ними всё равно перечитывают борд (F2)', async () => {
    // Отличие от C5: там между уходом и возвратом тест прокручивал интервал
    // опроса, и инвалидация успевала «наблюдиться» тиком. Здесь возврат
    // быстрее опроса — сэмплирование состояния тиком не увидит ничего, и
    // холст, очищенный switchBoard'ом, останется пустым до следующего
    // реального изменения файла на диске.
    useWorkflowStore.getState().initBoards({
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' },
      ],
      activeBoardId: 'b-live',
    });
    stubFetch(INDEX, {}); // mtime/size 'aaa' не меняются на протяжении теста

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);

      // Уход и возврат подряд, БЕЗ прокрутки таймеров между ними: ни один
      // тик поллинга не наблюдал промежуточное состояние.
      useWorkflowStore.setState({ activeBoardId: 'b-1', nodes: [], edges: [] });
      useWorkflowStore.setState({ activeBoardId: 'b-live' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });

      expect(useWorkflowStore.getState().nodes.length).toBeGreaterThan(0);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });

  it('тот же mtime при ДРУГОМ размере — тело перечитывается (ключ клиента = пара, как у сервера) (F3)', async () => {
    // Сервер кэширует разбор борда по (mtime, size). Ключуй клиент одним
    // mtime — файл, восстановленный с сохранённым таймстемпом, но другого
    // размера: сервер промахнётся мимо кэша и отдаст НОВОЕ имя, а клиент
    // тело не перечитает. Новое имя со старым содержимым.
    useWorkflowStore.getState().initBoards({
      boards: [{ id: 'b-live', name: 'live', kind: 'file', sourceId: 'aaa' }],
      activeBoardId: 'b-live',
    });

    let size = 10;
    const bodyCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/boards')) {
          return {
            ok: true,
            text: async () => JSON.stringify([{ ...INDEX[0], mtime: 1, size }, INDEX[1]]),
          };
        }
        bodyCalls.push(url);
        return { ok: true, text: async () => CANVAS_TEXT };
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(createElement(Probe)));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(bodyCalls).toHaveLength(1);

      // Тот же mtime, ДРУГОЙ размер: содержимое борда изменилось.
      size = 999;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(bodyCalls).toHaveLength(2);

      // Контроль: пара не изменилась — второго перечитывания быть не должно.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS);
      });
      expect(bodyCalls).toHaveLength(2);

      act(() => root.unmount());
      container.remove();
    } finally {
      vi.useRealTimers();
      useWorkflowStore.getState().initBoards({ boards: [], activeBoardId: '' });
    }
  });

  it('размонтирование отписывается от activeBoardId — заслон не декоративен', async () => {
    // Прямая проверка cleanup'а: подписка на смену активной вкладки (см.
    // комментарий у lastRenderedTabId в useBoardSync.ts) обязана сниматься
    // строго в cleanup эффекта. Оборачиваем subscribe шпионом, чтобы
    // поймать САМ вызов возвращённой unsubscribe-функции — если строку
    // `unsubscribe();` в cleanup убрать, эта отписка не произойдёт, а весь
    // остальной сьют (включая тесты выше) останется зелёным, потому что
    // после unmount таймер и так очищен и новых fetch не будет независимо
    // от того, снята подписка или нет.
    const realSubscribe = useWorkflowStore.subscribe.bind(useWorkflowStore);
    const unsubSpy = vi.fn();
    const subscribeSpy = vi
      .spyOn(useWorkflowStore, 'subscribe')
      .mockImplementationOnce((listener: Parameters<typeof realSubscribe>[0]) => {
        const unsub = realSubscribe(listener);
        return () => {
          unsubSpy();
          unsub();
        };
      });

    stubFetch(INDEX, {});
    const cleanup = await mountAndSettle();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(unsubSpy).not.toHaveBeenCalled();

    cleanup();
    expect(unsubSpy).toHaveBeenCalledTimes(1);

    subscribeSpy.mockRestore();
  });
});
