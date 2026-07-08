import { describe, it, expect, beforeEach } from 'vitest';
import { initBoardsFlow } from './boardsInit';
import { loadBoardContent } from './persistence';
import { useWorkflowStore } from '../store/useWorkflowStore';

// Легаси-контент = реальная карта пользователя («Точка Сборки»): миграция обязана
// сохранить его, а повторные старты приложения — никогда не перезаписать пустым графом.
const legacyCanvas = JSON.stringify({
  nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Точка Сборки' }],
  edges: [],
});

beforeEach(() => {
  localStorage.clear();
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isEditing: false,
    boards: [],
    activeBoardId: '',
  });
  useWorkflowStore.temporal.getState().clear();
  useWorkflowStore.temporal.getState().pause();
});

describe('initBoardsFlow', () => {
  it('first run: migrates the legacy workspace to «Main» and loads its content', async () => {
    localStorage.setItem('sovern-workspace', legacyCanvas);

    const { boardLoaded } = await initBoardsFlow();

    expect(boardLoaded).toBe(true);
    const s = useWorkflowStore.getState();
    expect(s.boards.map((b) => b.name)).toEqual(['Main']);
    expect(s.activeBoardId).toBe(s.boards[0].id);
    expect(s.nodes.map((n) => n.data.label)).toEqual(['Точка Сборки']);
    // legacy key is never deleted (safety)
    expect(localStorage.getItem('sovern-workspace')).toBe(legacyCanvas);
  });

  it('REGRESSION (init order): repeated startups never clobber real board content', async () => {
    localStorage.setItem('sovern-workspace', legacyCanvas);
    await initBoardsFlow(); // startup 1: migrate + load
    const boardId = useWorkflowStore.getState().activeBoardId;

    // simulate a page reload: the store boots with an EMPTY graph again
    useWorkflowStore.setState({ nodes: [], edges: [], boards: [], activeBoardId: '' });
    const { boardLoaded } = await initBoardsFlow(); // startup 2

    expect(boardLoaded).toBe(true);
    expect(useWorkflowStore.getState().nodes.map((n) => n.data.label)).toEqual(['Точка Сборки']);
    // the per-board copy survived both startups — init is strictly read-only on content
    const content = await loadBoardContent(boardId);
    expect(content?.nodes.map((n) => n.data.label)).toEqual(['Точка Сборки']);
  });

  it('fresh install: empty «Main», boardLoaded=false, canvas nodes left untouched', async () => {
    const sentinel = {
      id: 's', type: 'sovern' as const, position: { x: 0, y: 0 },
      data: { label: 'live-feed', layer: 'projects' as const, status: 'pending' as const },
    };
    useWorkflowStore.setState({ nodes: [sentinel] as any });

    const { boardLoaded } = await initBoardsFlow();

    expect(boardLoaded).toBe(false);
    const s = useWorkflowStore.getState();
    expect(s.boards.map((b) => b.name)).toEqual(['Main']);
    expect(s.boards[0].kind).toBe('user');
    // no stored content → the caller decides (live feed / demo fallback), init doesn't wipe
    expect(s.nodes.map((n) => n.data.label)).toEqual(['live-feed']);
  });

  it('does not pollute undo history', async () => {
    localStorage.setItem('sovern-workspace', legacyCanvas);
    useWorkflowStore.temporal.getState().resume();

    await initBoardsFlow();

    expect(useWorkflowStore.temporal.getState().pastStates.length).toBe(0);
  });
});
