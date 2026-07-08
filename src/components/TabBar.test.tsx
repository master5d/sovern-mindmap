import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { TabBar, canCloseBoard } from './TabBar';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Keep references to the real store actions so per-test spies can be undone.
const original = useWorkflowStore.getState();

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

const userA: BoardMeta = { id: 'a', name: 'Alpha', kind: 'user' };
const userB: BoardMeta = { id: 'b', name: 'Beta', kind: 'user' };
const review: BoardMeta = { id: 'r', name: 'Design Review', kind: 'review' };

const tabs = (c: HTMLElement) => [...c.querySelectorAll('[role="tab"]')] as HTMLElement[];
const tabByName = (c: HTMLElement, name: string) =>
  tabs(c).find((t) => t.textContent?.includes(name))!;

/** Set a controlled input's value the way a user would (native setter + input event). */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  useWorkflowStore.setState({
    boards: [userA, userB, review],
    activeBoardId: 'a',
    switchBoard: original.switchBoard,
    createBoard: original.createBoard,
    renameBoard: original.renameBoard,
    deleteBoard: original.deleteBoard,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('canCloseBoard', () => {
  it('review board is never closable', () => {
    expect(canCloseBoard(review, [userA, userB, review])).toBe(false);
  });
  it('the last user board is not closable', () => {
    expect(canCloseBoard(userA, [userA, review])).toBe(false);
  });
  it('a user board among several is closable', () => {
    expect(canCloseBoard(userA, [userA, userB, review])).toBe(true);
  });
});

describe('TabBar', () => {
  it('renders nothing while boards are not initialized', () => {
    useWorkflowStore.setState({ boards: [], activeBoardId: '' });
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    cleanup();
  });

  it('highlights the active tab via aria-selected', () => {
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);
    expect(tabByName(container, 'Alpha').getAttribute('aria-selected')).toBe('true');
    expect(tabByName(container, 'Beta').getAttribute('aria-selected')).toBe('false');
    cleanup();
  });

  it('clicking an inactive tab calls switchBoard; the active tab does not', () => {
    const switchBoard = vi.fn().mockResolvedValue(undefined);
    useWorkflowStore.setState({ switchBoard });
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);

    act(() => { tabByName(container, 'Beta').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(switchBoard).toHaveBeenCalledWith('b');

    switchBoard.mockClear();
    act(() => { tabByName(container, 'Alpha').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(switchBoard).not.toHaveBeenCalled();
    cleanup();
  });

  it('the «+» button calls createBoard', () => {
    const createBoard = vi.fn().mockResolvedValue('new-id');
    useWorkflowStore.setState({ createBoard });
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);

    const plus = container.querySelector('button[title="New board"]')!;
    act(() => { plus.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(createBoard).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('double-click opens inline rename; Enter commits via renameBoard', () => {
    const renameBoard = vi.fn();
    useWorkflowStore.setState({ renameBoard });
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);

    act(() => { tabByName(container, 'Alpha').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Alpha');

    act(() => { typeInto(input, 'Renamed'); });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

    expect(renameBoard).toHaveBeenCalledWith('a', 'Renamed');
    expect(container.querySelector('input')).toBeNull(); // editor closed
    cleanup();
  });

  it('Escape cancels inline rename without calling renameBoard', () => {
    const renameBoard = vi.fn();
    useWorkflowStore.setState({ renameBoard });
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);

    act(() => { tabByName(container, 'Alpha').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const input = container.querySelector('input') as HTMLInputElement;
    act(() => { typeInto(input, 'Never'); });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

    expect(renameBoard).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
    cleanup();
  });

  it('close button: present on user tabs (when >1), absent on review and on the last user board', () => {
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);
    expect(tabByName(container, 'Alpha').querySelector('button[title^="Close"]')).toBeTruthy();
    expect(tabByName(container, 'Design Review').querySelector('button[title^="Close"]')).toBeNull();
    cleanup();

    // single user board → its × disappears
    useWorkflowStore.setState({ boards: [userA, review], activeBoardId: 'a' });
    const second = mount(<TabBar pendingCount={0} />);
    expect(tabByName(second.container, 'Alpha').querySelector('button[title^="Close"]')).toBeNull();
    second.cleanup();
  });

  it('close asks for confirm() and only then calls deleteBoard', () => {
    const deleteBoard = vi.fn().mockResolvedValue(undefined);
    useWorkflowStore.setState({ deleteBoard });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container, cleanup } = mount(<TabBar pendingCount={0} />);

    const close = tabByName(container, 'Beta').querySelector('button[title^="Close"]')!;
    act(() => { close.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteBoard).not.toHaveBeenCalled(); // user said no

    confirmSpy.mockReturnValue(true);
    act(() => { close.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(deleteBoard).toHaveBeenCalledWith('b');
    cleanup();
  });

  it('review tab shows the pending badge only when pendingCount > 0', () => {
    const withBadge = mount(<TabBar pendingCount={3} />);
    const reviewTab = tabByName(withBadge.container, 'Design Review');
    const badge = reviewTab.querySelector('[aria-label="3 pending"]');
    expect(badge?.textContent).toBe('3');
    withBadge.cleanup();

    const noBadge = mount(<TabBar pendingCount={0} />);
    expect(
      tabByName(noBadge.container, 'Design Review').querySelector('[aria-label$="pending"]'),
    ).toBeNull();
    noBadge.cleanup();
  });
});
