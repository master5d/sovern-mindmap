import type React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { SOVERNNodeData } from '../../types';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { SHAPE_GEOMETRY, ShapeKind } from './shapeGeometry';

export const ShapeNode = ({ id, data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const shape = (data.shape ?? 'rectangle') as ShapeKind;
  const geom = SHAPE_GEOMETRY[shape] ?? SHAPE_GEOMETRY.rectangle;

  const editing = useWorkflowStore((s) => s.editingNodeId === id);
  const commit = useWorkflowStore((s) => s.commitInlineEdit);
  const cancel = useWorkflowStore((s) => s.cancelInlineEdit);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) { setDraft(data.label); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, data.label]);

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

  const highlighted = selected || data.__current;
  const ring = highlighted ? 'ring-4 ring-accent/40' : '';
  const Icon = geom.Icon;

  let content: React.ReactNode;
  if (geom.mode === 'svg') {
    content = (
      <div className={`relative px-5 py-4 min-w-[150px] max-w-[240px] ${ring}`}>
        {geom.svg!(!!highlighted)}
        <div className="relative">{label}</div>
      </div>
    );
  } else if (geom.mode === 'icon') {
    content = (
      <div className={`px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 flex flex-col items-center gap-1 ${
        highlighted ? `border-accent ${ring}` : 'border-edge hover:border-edge-strong'
      } ${geom.className ?? ''}`}>
        {Icon && <Icon size={20} className="text-accent" />}
        {label}
      </div>
    );
  } else {
    content = (
      <div className={`px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 transition-all ${
        highlighted ? `border-accent ${ring}` : 'border-edge hover:border-edge-strong'
      } ${geom.className ?? ''}`}>
        {label}
      </div>
    );
  }

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
      {content}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
    </div>
  );
};
