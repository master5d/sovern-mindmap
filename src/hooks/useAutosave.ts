import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { saveBoardContent } from '../utils/persistence';

export type SaveState = 'idle' | 'saving' | 'saved';

/** Debounced autosave of the ACTIVE board's content, active only while editing. */
export function useAutosave(): SaveState {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const activeBoardId = useWorkflowStore((s) => s.activeBoardId);
  const activeKind = useWorkflowStore((s) => s.boards.find((b) => b.id === s.activeBoardId)?.kind);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // No active board yet (startup init still running) → nothing to key the save under.
    // `file` boards mirror /board.canvas: the repo file is the source of truth,
    // in-app edits there are volatile and must never persist to a board key.
    if (!isEditing || !activeBoardId || activeKind === 'file') return;
    setState('saving');
    window.clearTimeout(timer.current);
    // id + nodes + edges are captured together in this closure: a stale timer can
    // only ever write a board's own snapshot under its own key, never another
    // board's. On switchBoard the setNodes/exitEditMode re-run clears the timer,
    // and switchBoard itself already saved the outgoing board directly.
    timer.current = window.setTimeout(async () => {
      await saveBoardContent(activeBoardId, nodes, edges);
      setState('saved');
    }, 800);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isEditing, activeBoardId, activeKind]);

  return state;
}
