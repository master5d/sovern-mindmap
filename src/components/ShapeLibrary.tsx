import type React from 'react';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Shapes } from 'lucide-react';
import { SHAPE_GROUPS } from './ShapePicker';
import { ShapeSwatch } from './nodes/ShapeSwatch';
import type { ShapeKind } from '../types';

/** Private MIME for the drag payload so the canvas ignores foreign drags (files / text). */
export const SHAPE_DND_MIME = 'application/sovern-shape';

/**
 * Persistent draggable shape palette pinned to the left edge (MindMap only).
 * Pure drag source — writes the shape kind to dataTransfer on drag start; never
 * touches the store. Reuses SHAPE_GROUPS + ShapeSwatch so it can't drift from SHAPE_KINDS.
 */
export function ShapeLibrary({ onPick }: { onPick: (kind: ShapeKind) => void }) {
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (e: React.DragEvent, kind: ShapeKind) => {
    e.dataTransfer.setData(SHAPE_DND_MIME, kind);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-surface/90 backdrop-blur-md border border-edge rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between gap-2 p-2 border-b border-edge">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted pl-1">
          <Shapes size={12} /> {!collapsed && 'Shapes'}
        </span>
        <button
          type="button"
          aria-label={collapsed ? 'Expand shape library' : 'Collapse shape library'}
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-lg text-secondary hover:bg-hover"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[60vh] w-[136px] overflow-y-auto p-2 space-y-3 custom-scrollbar">
          {SHAPE_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{group.label}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {group.kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, kind)}
                    onClick={() => onPick(kind)}
                    title={kind}
                    aria-label={kind}
                    className="flex cursor-grab items-center justify-center rounded-lg p-1 transition-colors hover:bg-hover active:cursor-grabbing"
                  >
                    <ShapeSwatch kind={kind} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
