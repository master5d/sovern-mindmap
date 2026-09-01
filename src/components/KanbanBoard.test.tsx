import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { KanbanBoard } from './KanbanBoard';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

const ticket = {
  id: 'fb_000000000000',
  type: 'default',
  position: { x: 0, y: 0 },
  data: { label: 'ticket', status: 'idle', layer: 'infra', impact: 5, urgency: 5 },
} as any;

/** The column div is two levels up from its title <span> (span → header row → column). */
function columnByTitle(container: HTMLElement, title: string): HTMLElement {
  const titleEl = [...container.querySelectorAll('span')].find((el) => el.textContent === title)!;
  return titleEl.parentElement!.parentElement as HTMLElement;
}

/** Simulate a card drop the way KanbanBoard's onDrop reads it: text/plain payload
 *  on a fake DataTransfer, dispatched on the target column's native `drop` event. */
function dropCard(container: HTMLElement, columnTitle: string, id: string) {
  const column = columnByTitle(container, columnTitle);
  const data: Record<string, string> = { 'text/plain': id };
  const evt = new Event('drop', { bubbles: true, cancelable: true }) as any;
  evt.dataTransfer = { getData: (k: string) => data[k], setData: (k: string, v: string) => { data[k] = v; } };
  Object.defineProperty(evt, 'preventDefault', { value: vi.fn() });
  column.dispatchEvent(evt);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KanbanBoard onDrop × запись только там, где она возможна', () => {
  it('на непишущем живом борде drop не шлёт /api/feedback/status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const readOnly: BoardMeta = { id: 'fb-board', name: 'ghost', kind: 'file', sourceId: 'src-1', writable: false };
    useWorkflowStore.setState({ nodes: [ticket], boards: [readOnly], activeBoardId: 'fb-board' });

    const { container, cleanup } = mount(<KanbanBoard />);
    await act(async () => {
      dropCard(container, 'Done', 'fb_000000000000');
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    cleanup();
  });

  it('на писабельном борде drop шлёт boardId = sourceId активной вкладки', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ json: async () => ({ ok: true }) } as any);
    const writable: BoardMeta = { id: 'fb-board', name: 'live', kind: 'file', sourceId: 'src-42', writable: true };
    useWorkflowStore.setState({ nodes: [ticket], boards: [writable], activeBoardId: 'fb-board' });

    const { container, cleanup } = mount(<KanbanBoard />);
    await act(async () => {
      dropCard(container, 'Done', 'fb_000000000000');
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/feedback/status',
      expect.objectContaining({ body: expect.stringContaining('"boardId":"src-42"') }),
    );
    cleanup();
  });

  it('на непишущем борде показывает причину тостом, а не молчит', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const readOnly: BoardMeta = { id: 'fb-board', name: 'ghost', kind: 'file', sourceId: 'src-1', writable: false };
    useWorkflowStore.setState({ nodes: [ticket], boards: [readOnly], activeBoardId: 'fb-board' });

    const { container, cleanup } = mount(<KanbanBoard />);
    await act(async () => {
      dropCard(container, 'Done', 'fb_000000000000');
      await Promise.resolve();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('правки не сохраняются');
    cleanup();
  });
});
