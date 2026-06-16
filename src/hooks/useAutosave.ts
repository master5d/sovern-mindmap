import { useEffect, useRef, useState } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { usePersistence } from '../utils/persistence';

export type SaveState = 'idle' | 'saving' | 'saved';

/** Debounced autosave to the workspace file, active only while editing. */
export function useAutosave(): SaveState {
  const { saveWorkspace } = usePersistence();
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isEditing) return;
    setState('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await saveWorkspace();
      setState('saved');
    }, 800);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isEditing]);

  return state;
}
