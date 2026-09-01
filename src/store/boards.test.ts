import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore, REVIEW_BOARD_NAME } from './useWorkflowStore';
import type { BoardMeta } from './useWorkflowStore';
import {
  loadBoardsRegistry,
  loadBoardContent,
  migrateLegacyWorkspace,
  saveBoardContent,
  saveBoardsRegistry,
} from '../utils/persistence';
import { initBoardsFlow } from '../utils/boardsInit';

const node = (id: string, label: string) => ({
  id,
  type: 'sovern' as const,
  position: { x: 0, y: 0 },
  data: { label, layer: 'projects' as const, status: 'pending' as const },
});

const boardA: BoardMeta = { id: 'board-a', name: 'Alpha', kind: 'user' };
const boardB: BoardMeta = { id: 'board-b', name: 'Beta', kind: 'user' };

beforeEach(() => {
  localStorage.clear();
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isEditing: false,
    boards: [],
    activeBoardId: '',
    boardsReady: false,
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().pause();
});

describe('createBoard', () => {
  it('adds meta and switches to the new board with an empty graph', async () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA], activeBoardId: 'board-a' });
    useWorkflowStore.getState().setNodes([node('n1', 'alpha node')] as any);

    const id = await useWorkflowStore.getState().createBoard('Second');

    const s = useWorkflowStore.getState();
    expect(s.boards.map((b) => b.name)).toEqual(['Alpha', 'Second']);
    expect(s.boards.find((b) => b.id === id)?.kind).toBe('user');
    expect(s.activeBoardId).toBe(id);
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);

    // registry persisted with the new active board
    const reg = await loadBoardsRegistry();
    expect(reg?.activeBoardId).toBe(id);
    expect(reg?.boards).toHaveLength(2);
  });
});

describe('switchBoard', () => {
  it('saves the outgoing board content and restores the target content', async () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA, boardB], activeBoardId: 'board-a' });
    useWorkflowStore.getState().setNodes([node('n1', 'alpha node')] as any);

    await useWorkflowStore.getState().switchBoard('board-b');
    expect(useWorkflowStore.getState().activeBoardId).toBe('board-b');
    expect(useWorkflowStore.getState().nodes).toEqual([]); // fresh board

    useWorkflowStore.getState().setNodes([node('n2', 'beta node')] as any);
    await useWorkflowStore.getState().switchBoard('board-a');

    const s = useWorkflowStore.getState();
    expect(s.activeBoardId).toBe('board-a');
    expect(s.nodes.map((n) => n.data.label)).toEqual(['alpha node']);

    // content was written IMMEDIATELY under the per-board keys
    expect(localStorage.getItem('sovern-workspace:board-a')).toBeTruthy();
    expect(localStorage.getItem('sovern-workspace:board-b')).toBeTruthy();
    // undo history does not leak across boards
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
  });

  it('missing or corrupt target content yields an empty board without crashing', async () => {
    localStorage.setItem('sovern-workspace:board-b', '{not valid json');
    useWorkflowStore.getState().initBoards({ boards: [boardA, boardB], activeBoardId: 'board-a' });
    useWorkflowStore.getState().setNodes([node('n1', 'alpha node')] as any);

    await useWorkflowStore.getState().switchBoard('board-b');

    const s = useWorkflowStore.getState();
    expect(s.activeBoardId).toBe('board-b');
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
  });
});

// Task 3 carry-over sweep: artifact nodes live ONLY on the review board — any
// persisted into a user board during the Task-2 era are stripped at load time.
const artifactNode = (id: string) => ({
  id: `artifact-${id}`,
  type: 'artifact' as const,
  position: { x: 0, y: 0 },
  data: { artifactId: id, code: 'const X=()=>null;', status: 'pending' as const },
});

describe('artifact sweep on board load', () => {
  it('switchBoard strips persisted artifact nodes from a user board', async () => {
    await saveBoardContent('board-b', [node('n1', 'beta node'), artifactNode('stray')] as any, []);
    useWorkflowStore.getState().initBoards({ boards: [boardA, boardB], activeBoardId: 'board-a' });

    await useWorkflowStore.getState().switchBoard('board-b');

    const s = useWorkflowStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(['n1']); // artifact gone, user node kept
  });

  it('switchBoard keeps artifact nodes when loading the review board', async () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA], activeBoardId: 'board-a' });
    const reviewId = useWorkflowStore.getState().ensureReviewBoard();
    await saveBoardContent(reviewId, [artifactNode('keep')] as any, []);

    await useWorkflowStore.getState().switchBoard(reviewId);

    expect(useWorkflowStore.getState().nodes.filter((n) => n.type === 'artifact')).toHaveLength(1);
  });

  it('initBoardsFlow strips artifact nodes from the loaded active user board', async () => {
    await saveBoardsRegistry({ boards: [boardA], activeBoardId: 'board-a' });
    await saveBoardContent('board-a', [node('n1', 'alpha node'), artifactNode('stray')] as any, []);

    const { boardLoaded } = await initBoardsFlow();

    expect(boardLoaded).toBe(true);
    expect(useWorkflowStore.getState().nodes.map((n) => n.id)).toEqual(['n1']);
  });
});

describe('deleteBoard', () => {
  it('is forbidden for the last user board and for the review board', async () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA], activeBoardId: 'board-a' });
    const reviewId = useWorkflowStore.getState().ensureReviewBoard();

    await useWorkflowStore.getState().deleteBoard('board-a'); // last user board
    await useWorkflowStore.getState().deleteBoard(reviewId); // review board

    const s = useWorkflowStore.getState();
    expect(s.boards.find((b) => b.id === 'board-a')).toBeTruthy();
    expect(s.boards.find((b) => b.id === reviewId)).toBeTruthy();
  });

  it('removes meta + content key and re-targets the active board', async () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA, boardB], activeBoardId: 'board-a' });
    useWorkflowStore.getState().setNodes([node('n1', 'alpha node')] as any);
    await useWorkflowStore.getState().switchBoard('board-b'); // persists A content

    await useWorkflowStore.getState().deleteBoard('board-b'); // delete the ACTIVE board

    const s = useWorkflowStore.getState();
    expect(s.boards.map((b) => b.id)).toEqual(['board-a']);
    expect(s.activeBoardId).toBe('board-a');
    expect(s.nodes.map((n) => n.data.label)).toEqual(['alpha node']); // fell back to A
    expect(localStorage.getItem('sovern-workspace:board-b')).toBeNull(); // content key deleted
  });
});

describe('ensureReviewBoard', () => {
  it('is idempotent and does not switch the active board', () => {
    useWorkflowStore.getState().initBoards({ boards: [boardA], activeBoardId: 'board-a' });

    const id1 = useWorkflowStore.getState().ensureReviewBoard();
    const id2 = useWorkflowStore.getState().ensureReviewBoard();

    expect(id1).toBe(id2);
    const reviews = useWorkflowStore.getState().boards.filter((b) => b.kind === 'review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].name).toBe(REVIEW_BOARD_NAME);
    expect(useWorkflowStore.getState().activeBoardId).toBe('board-a');
  });
});

describe('migrateLegacyWorkspace', () => {
  it('adopts the legacy sovern-workspace key as board "Main" and never deletes it', async () => {
    const legacy = JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Legacy' }],
      edges: [],
    });
    localStorage.setItem('sovern-workspace', legacy);

    const reg = await migrateLegacyWorkspace();

    expect(reg.boards).toHaveLength(1);
    expect(reg.boards[0].name).toBe('Main');
    expect(reg.boards[0].kind).toBe('user');
    expect(reg.activeBoardId).toBe(reg.boards[0].id);

    const content = await loadBoardContent(reg.boards[0].id);
    expect(content?.nodes.map((n) => n.data.label)).toEqual(['Legacy']);

    // legacy key untouched (safety) + registry persisted
    expect(localStorage.getItem('sovern-workspace')).toBe(legacy);
    const persisted = await loadBoardsRegistry();
    expect(persisted?.activeBoardId).toBe(reg.activeBoardId);
  });

  it('without legacy data creates an empty "Main"', async () => {
    const reg = await migrateLegacyWorkspace();
    expect(reg.boards[0].name).toBe('Main');
    expect(reg.boards[0].kind).toBe('user');
    expect(await loadBoardContent(reg.boards[0].id)).toBeNull(); // empty board on load
  });
});

describe('temporal isolation', () => {
  it('board registry fields do not enter undo history', () => {
    useWorkflowStore.temporal.getState().resume();
    useWorkflowStore.getState().initBoards({ boards: [boardA, boardB], activeBoardId: 'board-a' });
    useWorkflowStore.getState().ensureReviewBoard();
    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
  });
});


describe('syncFileBoards: вкладка на живой борд', () => {
  beforeEach(() => {
    localStorage.clear();
    // boardsReady: true — большинство тестов этого блока проверяют штатную,
    // уже инициализированную работу; тест C2 ниже намеренно переопределяет
    // это в false для сценария «до инициализации».
    useWorkflowStore.setState({ boards: [], activeBoardId: '', boardsReady: true });
  });

  it('заводит по вкладке на каждый борд и помнит sourceId', () => {
    useWorkflowStore.getState().syncFileBoards([
      { id: 'aaa', name: 'Флот и ярусы' },
      { id: 'bbb', name: 'Потоки данных' },
    ]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file.map((b) => b.sourceId)).toEqual(['aaa', 'bbb']);
    expect(file.map((b) => b.name)).toEqual(['Флот и ярусы', 'Потоки данных']);
  });

  it('повторный вызов не плодит дублей и обновляет имя', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'Старое' }]);
    s.syncFileBoards([{ id: 'aaa', name: 'Новое' }]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(1);
    expect(file[0].name).toBe('Новое');
  });

  it('исчезнувший борд убирает свою вкладку, а пользовательские не трогает', () => {
    const s = useWorkflowStore.getState();
    s.createBoard('Моя доска');
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'bbb', name: 'B' }]);
    s.syncFileBoards([{ id: 'bbb', name: 'B' }]);
    const boards = useWorkflowStore.getState().boards;
    expect(boards.filter((b) => b.kind === 'file').map((b) => b.sourceId)).toEqual(['bbb']);
    expect(boards.some((b) => b.name === 'Моя доска')).toBe(true);
  });

  it('вставка борда в СЕРЕДИНУ не переставляет существующие вкладки', () => {
    // Ради этого id — хеш пути, а не индекс.
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'ccc', name: 'C' }]);
    const idOfA = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    s.syncFileBoards([
      { id: 'aaa', name: 'A' },
      { id: 'bbb', name: 'B' },
      { id: 'ccc', name: 'C' },
    ]);
    expect(useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id).toBe(idOfA);
  });

  it('переносит writable и error на вкладку — их показывает интерфейс', () => {
    useWorkflowStore.getState().syncFileBoards([
      { id: 'aaa', name: 'Обратная связь', writable: true },
      { id: 'bbb', name: 'ghost', error: 'файл недоступен' },
    ]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file[0].writable).toBe(true);
    expect(file[0].sourceError).toBeUndefined();
    // I4: строгий toBe(false), а не toBeFalsy() — источник вообще не прислал
    // writable (undefined), и только явный дефолт `?? false` в реализации
    // превращает его в false. toBeFalsy() пропустил бы undefined и не поймал
    // бы мутацию, снимающую этот дефолт.
    expect(file[1].writable).toBe(false);
    expect(file[1].sourceError).toBe('файл недоступен');
  });

  it('починившийся борд теряет sourceError, а не носит его вечно', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A', error: 'файл недоступен' }]);
    s.syncFileBoards([{ id: 'aaa', name: 'A' }]);
    const file = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!;
    expect(file.sourceError).toBeUndefined();
  });

  it('активная вкладка исчезнувшего борда не оставляет activeBoardId в никуда и не переносит её контент на новую активную доску', async () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'bbb', name: 'B' }]);
    const idOfA = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    // Узел-маркер: если контент активного борда переживёт исчезновение вкладки
    // и осядет на новой активной доске — это порча чужого контента, ровно тот
    // класс бага, который защита в useBoardSync призвана предотвращать.
    useWorkflowStore.setState({
      activeBoardId: idOfA,
      nodes: [node('ghost-a', 'ПРИЗРАК БОРДА A')],
      edges: [],
    });

    s.syncFileBoards([{ id: 'bbb', name: 'B' }]); // 'aaa' исчез, был активным

    const afterSync = useWorkflowStore.getState();
    expect(afterSync.boards.some((b) => b.id === afterSync.activeBoardId)).toBe(
      afterSync.activeBoardId !== '',
    );

    // switchBoard(next) внутри syncFileBoards запущен fire-and-forget —
    // дождаться, пока он осядет, прежде чем судить о содержимом графа.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const settled = useWorkflowStore.getState();
    const idOfB = settled.boards.find((b) => b.sourceId === 'bbb')!.id;
    expect(settled.activeBoardId).toBe(idOfB);
    expect(settled.nodes.some((n) => n.data.label === 'ПРИЗРАК БОРДА A')).toBe(false);
  });

  it('бордов не осталось вовсе — activeBoardId уходит в пустую строку, switchBoard не зовётся', async () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }]);
    const idOfA = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    useWorkflowStore.setState({ activeBoardId: idOfA });

    s.syncFileBoards([]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const st = useWorkflowStore.getState();
    expect(st.boards).toHaveLength(0);
    expect(st.activeBoardId).toBe('');
  });

  // ── M5: дубли одного и того же живого борда во входном списке ──────────
  it('дубли одного борда во входном списке не заводят две вкладки на один sourceId', () => {
    useWorkflowStore.getState().syncFileBoards([
      { id: 'aaa', name: 'A-старое' },
      { id: 'aaa', name: 'A-новое' },
    ]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(1);
    expect(file[0].sourceId).toBe('aaa');
    expect(file[0].name).toBe('A-новое'); // последний элемент по порядку побеждает
  });

  // ── I3: заслон «ничего не изменилось» проверен ФАКТОМ отсутствия записи,
  //    не только итоговым содержимым списка ─────────────────────────────
  it('без изменений повторный вызов не создаёт новый массив boards (заслон ничего-не-изменилось)', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A', writable: true }]);
    const boardsRefBefore = useWorkflowStore.getState().boards;

    s.syncFileBoards([{ id: 'aaa', name: 'A', writable: true }]); // тот же вход, ничего не поменялось

    const boardsRefAfter = useWorkflowStore.getState().boards;
    // Ссылочное равенство: set({ boards }) не звался вообще — иначе массив
    // был бы новым (spread), даже с идентичным содержимым.
    expect(boardsRefAfter).toBe(boardsRefBefore);
  });

  // ── C1: switchBoard не воскрешает пропавшую вкладку, если она исчезла,
  //    пока корутина «спала» на loadBoardContent ──────────────────────────
  it('switchBoard, догоняющий асинхронно, не воскрешает вкладку, исчезнувшую во время загрузки контента', async () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'bbb', name: 'B' }]);
    const idOfA = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    const idOfB = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'bbb')!.id;
    // 'bbb' уже когда-то имел контент — если switchBoard применит его после
    // того, как вкладка исчезла, маркер осядет на графе и выдаст утечку.
    await saveBoardContent(idOfB, [node('ghost-b', 'ПРИЗРАК БОРДА B')], []);
    useWorkflowStore.setState({ activeBoardId: idOfA, nodes: [], edges: [] });

    // Начать переключение на 'bbb' и НЕ ждать: async-функция выполняется
    // синхронно до первого await (loadBoardContent) и отдаёт управление сюда
    // раньше, чем стор обновится — ровно момент, когда во втором тике
    // поллинга (см. C1 в ревью) вкладка 'bbb' успевает пропасть целиком.
    const pending = s.switchBoard(idOfB);
    // Второй тик поллинга: список живых бордов опустел вовсе.
    useWorkflowStore.setState({ boards: [], activeBoardId: '' });

    await pending;

    const st = useWorkflowStore.getState();
    expect(st.boards.some((b) => b.id === st.activeBoardId)).toBe(st.activeBoardId !== '');
    expect(st.activeBoardId).not.toBe(idOfB);
    expect(st.nodes.some((n) => n.data.label === 'ПРИЗРАК БОРДА B')).toBe(false);
  });

  // ── C2: до инициализации бордов синк не пишет НИЧЕГО ────────────────────
  it('до инициализации бордов (boardsReady=false) синк не меняет boards и не пишет реестр', async () => {
    useWorkflowStore.setState({ boards: [], activeBoardId: '', boardsReady: false });
    const boardsRefBefore = useWorkflowStore.getState().boards;

    useWorkflowStore.getState().syncFileBoards([{ id: 'aaa', name: 'A' }]);

    const st = useWorkflowStore.getState();
    expect(st.boards).toBe(boardsRefBefore); // ссылка не поменялась — set() не звался
    expect(st.boards).toHaveLength(0);
    expect(await loadBoardsRegistry()).toBeNull(); // ничего не сохранено
  });

  it('после инициализации (boardsReady=true) синк работает как прежде', () => {
    useWorkflowStore.setState({ boards: [], activeBoardId: '', boardsReady: true });
    useWorkflowStore.getState().syncFileBoards([{ id: 'aaa', name: 'A' }]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file.map((b) => b.sourceId)).toEqual(['aaa']);
  });
});
