import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useBoardSync } from './useBoardSync';
import { useWorkflowStore } from '../store/useWorkflowStore';

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
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => CANVAS_TEXT })));
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
          { id: 'b-f', name: 'board.canvas (live)', kind: 'file' },
        ],
        activeBoardId: 'b-f',
      }),
    );
    useWorkflowStore.getState().initBoards({
      boards: [
        { id: 'b-1', name: 'Main', kind: 'user' },
        { id: 'b-f', name: 'board.canvas (live)', kind: 'file' },
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
