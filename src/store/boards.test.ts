import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore, REVIEW_BOARD_NAME } from './useWorkflowStore';
import type { BoardMeta } from './useWorkflowStore';
import {
  loadBoardsRegistry,
  loadBoardContent,
  migrateLegacyWorkspace,
} from '../utils/persistence';

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
