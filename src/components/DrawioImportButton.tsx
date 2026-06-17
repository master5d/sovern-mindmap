import { useRef } from 'react';
import type React from 'react';
import { Import } from 'lucide-react';
import { importDrawio } from '../drawio/importDrawio';
import { useWorkflowStore } from '../store/useWorkflowStore';

export function DrawioImportButton({ notify }: { notify: (msg: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const before = useWorkflowStore.getState().nodes.length;
    await importDrawio(file, { onError: (m) => notify('⚠ import: ' + m) });
    const after = useWorkflowStore.getState().nodes.length;
    if (after > before) notify(`Imported ${after - before} nodes`);
    e.target.value = ''; // allow re-importing the same file
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".drawio,.xml,application/xml"
        className="hidden"
        onChange={onPick}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title="Import .drawio"
        className="p-2.5 text-secondary hover:text-orange-400"
      >
        <Import size={18} />
      </button>
    </>
  );
}
