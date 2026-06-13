import { useMemo, useState } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { SOVERNNodeData } from '../types';
import { Node } from '@xyflow/react';
import { AREA_COLORS, CATEGORY_EMOJI, quadrant, stripEmoji, alpha } from '../utils/feedback';

type TicketNode = Node<SOVERNNodeData>;

const QUADRANTS = [
  // [колонка (urgency-половина), ряд (impact-половина)] в grid-координатах
  { label: 'Schedule', sub: 'high impact · low urgency', color: 'var(--q-schedule)', col: 1, row: 1 },
  { label: 'Do First', sub: 'high impact · high urgency', color: 'var(--q-dofirst)', col: 2, row: 1 },
  { label: 'Backlog', sub: 'low impact · low urgency', color: 'var(--q-backlog)', col: 1, row: 2 },
  { label: 'Quick Wins', sub: 'low impact · high urgency', color: 'var(--q-quick)', col: 2, row: 2 },
];

const MAX_VISIBLE_PER_CELL = 2;

function Chip({ node }: { node: TicketNode }) {
  const { setSelectedNode, selectedNodeId } = useWorkflowStore();
  const fb = node.data.feedback as Record<string, any> | undefined;
  const area = node.data.layer;
  const selected = selectedNodeId === node.id;
  return (
    <button
      onClick={() => setSelectedNode(node.id)}
      title={`${stripEmoji(node.data.label)} — ${area}, ${fb?.severity ?? '?'}`}
      className={`flex items-center gap-1 max-w-full rounded-md border px-1.5 py-0.5 text-left bg-surface/90 backdrop-blur transition-all hover:translate-y-[-1px] hover:shadow-lg ${
        selected ? 'border-accent ring-2 ring-accent/20' : 'border-edge-strong/70 hover:border-edge-strong'
      }`}
      style={{ borderLeftColor: node.data.color || 'var(--border-strong)', borderLeftWidth: 3 }}
    >
      <span className="text-[11px] shrink-0">{CATEGORY_EMOJI[fb?.category] ?? '📌'}</span>
      <span className="text-[10px] text-primary truncate leading-tight">{stripEmoji(node.data.label)}</span>
      <span
        className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: AREA_COLORS[area] || 'var(--text-secondary)' }}
      />
    </button>
  );
}

export function MatrixView() {
  const { nodes } = useWorkflowStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tickets = useMemo(
    () => (nodes as TicketNode[]).filter((n) => n.id.startsWith('fb_')),
    [nodes],
  );

  // ячейки 10×10: cell[urgency][impact] — стек тикетов с одинаковыми координатами
  const cells = useMemo(() => {
    const map = new Map<string, TicketNode[]>();
    tickets.forEach((t) => {
      const key = `${t.data.urgency ?? 5}:${t.data.impact ?? 5}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    });
    // внутри ячейки — severity первыми (по цене бездействия)
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    map.forEach((arr) => arr.sort((a, b) => (rank[(a.data.feedback as any)?.severity] ?? 4) - (rank[(b.data.feedback as any)?.severity] ?? 4)));
    return map;
  }, [tickets]);

  return (
    <div data-export-root className="absolute inset-0 flex flex-col bg-canvas z-10 pt-44 pb-8 px-10">
      <div className="relative flex-1 min-h-0">
        {/* квадрантные фоны */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px rounded-2xl overflow-hidden border border-edge-strong/60">
          {QUADRANTS.map((q) => (
            <div
              key={q.label}
              className="relative"
              style={{ gridColumn: q.col, gridRow: q.row, backgroundColor: alpha(q.color, 3) }}
            >
              <div className="absolute top-3 left-4">
                <div className="text-[13px] font-black uppercase tracking-[0.25em]" style={{ color: alpha(q.color, 80) }}>{q.label}</div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-muted mt-0.5">{q.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* оси */}
        <div className="absolute -bottom-6 inset-x-0 flex justify-between text-[9px] font-black uppercase tracking-[0.3em] text-muted px-2">
          <span>← low urgency</span><span>high urgency →</span>
        </div>
        <div className="absolute -left-7 inset-y-0 flex flex-col justify-between items-center text-[9px] font-black uppercase tracking-[0.3em] text-muted py-2" style={{ writingMode: 'vertical-rl' }}>
          <span className="rotate-180">high impact →</span><span className="rotate-180">← low impact</span>
        </div>

        {/* тикеты: позиция в % по urgency/impact, стек внутри ячейки */}
        {[...cells.entries()].map(([key, arr]) => {
          const [u, i] = key.split(':').map(Number);
          const left = ((u - 1) / 9) * 92;          // 0..92% — место под ширину чипа
          const top = (1 - (i - 1) / 9) * 90;       // инверсия: impact 10 сверху
          const isOpen = expanded.has(key);
          const visible = isOpen ? arr : arr.slice(0, MAX_VISIBLE_PER_CELL);
          const hidden = arr.length - visible.length;
          const q = quadrant(i, u);
          return (
            <div
              key={key}
              className={`absolute flex flex-col gap-1 ${isOpen ? 'z-20 max-h-[60vh] overflow-y-auto custom-scrollbar rounded-xl bg-surface-2/90 p-1.5 border border-edge-strong/60' : ''}`}
              // ширина ≈ один шаг сетки (92%/9), чтобы чипы соседних колонок не наезжали
              style={{ left: `${left}%`, top: `${top}%`, width: isOpen ? 240 : 'max(9.5%, 96px)' }}
            >
              {visible.map((t) => <Chip key={t.id} node={t} />)}
              {(hidden > 0 || isOpen) && (
                <button
                  onClick={() => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                  className="text-[9px] font-bold px-2 py-0.5 rounded-md self-start hover:brightness-125"
                  style={{ color: q.color, backgroundColor: alpha(q.color, 9) }}
                >
                  {isOpen ? 'свернуть' : `+${hidden} ещё`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
