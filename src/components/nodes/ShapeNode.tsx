import { Handle, Position, NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { SOVERNNodeData } from '../../types';
import { useWorkflowStore } from '../../store/useWorkflowStore';

const SHAPE_CLASS: Record<string, string> = {
  rectangle: 'rounded-none',
  rounded: 'rounded-xl',
  terminal: 'rounded-full',
  note: 'rounded-md',
  decision: 'rounded-md', // diamond handled via wrapper rotation below
};

export const ShapeNode = ({ id, data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const shape = (data.shape ?? 'rectangle') as string;
  const isDiamond = shape === 'decision';

  const editing = useWorkflowStore((s) => s.editingNodeId === id);
  const commit = useWorkflowStore((s) => s.commitInlineEdit);
  const cancel = useWorkflowStore((s) => s.cancelInlineEdit);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) { setDraft(data.label); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, data.label]);

  const base = `px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 transition-all ${
    selected ? 'ring-4 ring-accent/20 border-accent' : 'border-edge hover:border-edge-strong'
  } ${SHAPE_CLASS[shape] ?? 'rounded-md'}`;

  const label = editing ? (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(id, draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(id, draft); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        e.stopPropagation();
      }}
      className="nodrag nopan font-semibold text-sm text-primary leading-tight bg-surface-2 border border-accent rounded-md p-1 w-full resize-none outline-none"
      rows={2}
    />
  ) : (
    <div
      className="font-semibold text-sm text-primary leading-tight text-center cursor-text"
      onDoubleClick={() => useWorkflowStore.getState().beginInlineEdit(id)}
    >
      {data.label}
    </div>
  );

  return (
    <div className={isDiamond ? 'relative' : ''}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
      {isDiamond ? (
        <div className={`${base} rotate-45 flex items-center justify-center aspect-square`}>
          <div className="-rotate-45 w-full">{label}</div>
        </div>
      ) : (
        <div className={base}>{label}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
    </div>
  );
};
