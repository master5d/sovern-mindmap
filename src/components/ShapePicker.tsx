import { SHAPE_KINDS, ShapeKind } from '../types';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { ShapeSwatch } from './nodes/ShapeSwatch';

/** Two enum-derived groups so the palette can never drift from SHAPE_KINDS. */
export const SHAPE_GROUPS: { label: string; kinds: ShapeKind[] }[] = [
  { label: 'Basic', kinds: SHAPE_KINDS.slice(0, 12) as ShapeKind[] },
  { label: 'Home AI-lab', kinds: SHAPE_KINDS.slice(12, 26) as ShapeKind[] },
  { label: 'Cloud', kinds: SHAPE_KINDS.slice(26) as ShapeKind[] },
];

/** Shape palette for the selected node; clicking a swatch converts it to that shape. */
export function ShapePicker() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setNodeShape = useWorkflowStore((s) => s.setNodeShape);

  const selected = nodes.find((n) => n.id === selectedNodeId);
  if (!selected) return null;
  const current = (selected.data.shape ?? 'rectangle') as ShapeKind;

  return (
    <div className="space-y-3">
      {SHAPE_GROUPS.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted">{group.label}</div>
          <div className="grid grid-cols-6 gap-1.5">
            {group.kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                title={kind}
                aria-label={kind}
                onClick={() => setNodeShape(selectedNodeId!, kind)}
                className="flex items-center justify-center rounded-lg p-1 transition-colors hover:bg-hover"
              >
                <ShapeSwatch kind={kind} selected={kind === current} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
