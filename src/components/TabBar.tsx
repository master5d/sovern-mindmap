import { useState } from 'react';
import type React from 'react';
import { Plus, X, Palette, FileText } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';

/** A user board is closable only while another user board remains; service boards (review/file) — never. */
export function canCloseBoard(board: BoardMeta, boards: BoardMeta[]): boolean {
  return board.kind === 'user' && boards.filter((b) => b.kind === 'user').length > 1;
}

/**
 * Board tabs (Canvas Project Tabs). Sits top-left under the SOVERN brand plate;
 * hidden in presentation/learn mode by the caller (same gating as the toolbar).
 * `pendingCount` — artifacts awaiting a decision, badged on the review tab
 * (wired by the artifact-inbox retarget; the App passes 0 until then).
 */
export function TabBar({ pendingCount }: { pendingCount: number }) {
  const boards = useWorkflowStore((s) => s.boards);
  const activeBoardId = useWorkflowStore((s) => s.activeBoardId);
  const switchBoard = useWorkflowStore((s) => s.switchBoard);
  const createBoard = useWorkflowStore((s) => s.createBoard);
  const renameBoard = useWorkflowStore((s) => s.renameBoard);
  const deleteBoard = useWorkflowStore((s) => s.deleteBoard);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (boards.length === 0) return null; // boards not initialized yet

  const commitRename = (id: string) => {
    renameBoard(id, draft); // trims + ignores empty names in the store
    setEditingId(null);
  };

  const onTabKeyDown = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename(id);
    else if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <div
      role="tablist"
      aria-label="Boards"
      // top row, right of the SOVERN brand plate (brand ≈416px wide; left-6 + 28rem clears it).
      // NOT top-left below the brand: the vertically-centered ShapeLibrary rides up under it
      // on short viewports and intercepts clicks.
      className="absolute top-6 left-[28rem] z-20 flex items-center gap-1 bg-surface/80 backdrop-blur-xl p-1.5 border border-edge rounded-2xl shadow-2xl max-w-[45vw] overflow-x-auto"
    >
      {boards.map((b) => {
        const active = b.id === activeBoardId;
        return (
          <div
            key={b.id}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            onClick={() => { if (!active) void switchBoard(b.id); }}
            onDoubleClick={() => { setEditingId(b.id); setDraft(b.name); }}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap select-none cursor-pointer transition-colors ${
              active ? 'bg-hover text-primary' : 'text-secondary hover:bg-hover'
            }`}
          >
            {b.kind === 'review' && <Palette size={12} className="text-accent shrink-0" />}
            {b.kind === 'file' && (
              <FileText
                size={12}
                className="text-secondary shrink-0"
                aria-label={
                  b.writable
                    ? 'живой борд: правки уходят в fb.mjs'
                    : 'живой борд из файла: правки не сохраняются'
                }
              />
            )}
            {b.kind === 'file' && b.sourceError && (
              // Причина в разметке, а не только в консоли: молчащая вкладка
              // читается как «борд пуст», а он не прочитан.
              // shrink-0 отменён нарочно: путь+текст исключения файловой системы
              // легко раздувают одну вкладку и выталкивают остальные за край
              // прокрутки — эта вкладка обязана ужиматься наравне с другими.
              <span
                className="text-danger min-w-0 max-w-[9rem] truncate text-[10px]"
                title={b.sourceError}
              >
                ⚠ {b.sourceError}
              </span>
            )}
            {editingId === b.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onTabKeyDown(b.id)}
                onBlur={() => commitRename(b.id)}
                onClick={(e) => e.stopPropagation()}
                className="w-24 bg-transparent outline-none border-b border-edge text-primary text-xs"
              />
            ) : (
              <span>{b.name}</span>
            )}
            {b.kind === 'review' && pendingCount > 0 && (
              <span
                aria-label={`${pendingCount} pending`}
                className="min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold leading-none flex items-center justify-center shrink-0"
              >
                {pendingCount}
              </span>
            )}
            {canCloseBoard(b, boards) && (
              <button
                title={`Close ${b.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete board «${b.name}»? Its content will be removed.`)) {
                    void deleteBoard(b.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted hover:text-primary transition-opacity shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button
        title="New board"
        onClick={() => void createBoard()}
        className="p-1.5 rounded-xl text-secondary hover:bg-hover hover:text-primary shrink-0"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
