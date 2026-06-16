import { Check, Pencil } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { usePersistence } from '../utils/persistence';

export function EditModeBanner({ saveState }: { saveState: 'idle' | 'saving' | 'saved' }) {
  const isEditing = useWorkflowStore((s) => s.isEditing);
  const exitEditMode = useWorkflowStore((s) => s.exitEditMode);
  const { saveWorkspace } = usePersistence();
  if (!isEditing) return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface/90 backdrop-blur-md px-4 py-2 border border-accent rounded-2xl shadow-2xl">
      <span className="flex items-center gap-2 text-xs font-bold text-accent">
        <Pencil size={14} /> Editing — live updates paused
      </span>
      <span className="text-[10px] text-muted min-w-[48px]">
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : ''}
      </span>
      <button
        onClick={async () => { await saveWorkspace(); exitEditMode(); }}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90"
      >
        <Check size={14} /> Done
      </button>
    </div>
  );
}
