import { useMemo } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { SOVERNNodeData } from '../types';
import { Node } from '@xyflow/react';
import { AREA_COLORS, CATEGORY_EMOJI, STATUS_COLORS, stripEmoji, alpha } from '../utils/feedback';

type TicketNode = Node<SOVERNNodeData>;

const DAY = 24 * 60 * 60 * 1000;
const fmtDay = (t: number) =>
  new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function TimelineCard({ node }: { node: TicketNode }) {
  const { setSelectedNode, selectedNodeId } = useWorkflowStore();
  const fb = node.data.feedback as Record<string, any> | undefined;
  const selected = selectedNodeId === node.id;
  return (
    <button
      onClick={() => setSelectedNode(node.id)}
      title={stripEmoji(node.data.label)}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 bg-surface/90 text-left transition-all hover:border-edge-strong hover:translate-y-[-1px] w-[180px] ${
        selected ? 'border-accent ring-2 ring-accent/20' : 'border-edge-strong/70'
      }`}
      style={{ borderLeftColor: node.data.color || 'var(--border-strong)', borderLeftWidth: 3 }}
    >
      <span className="text-[11px] shrink-0">{CATEGORY_EMOJI[fb?.category] ?? '📌'}</span>
      <span className="text-[10px] text-primary truncate leading-tight">{stripEmoji(node.data.label)}</span>
      <span
        className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full"
        title={node.data.status}
        style={{ backgroundColor: STATUS_COLORS[node.data.status] || 'var(--status-idle)' }}
      />
    </button>
  );
}

export function TimelineView() {
  const { nodes } = useWorkflowStore();
  const tickets = useMemo(
    () => (nodes as TicketNode[]).filter((n) => n.id.startsWith('fb_') && n.data.created),
    [nodes],
  );

  const { lanes, minT, maxT, gridDays } = useMemo(() => {
    const times = tickets.map((t) => new Date(t.data.created!).getTime());
    const rawMin = times.length ? Math.min(...times) : Date.now() - 7 * DAY;
    const rawMax = times.length ? Math.max(...times) : Date.now();
    // паддинг по полдня с краёв, чтобы карточки не липли к границам
    const minT = rawMin - DAY / 2;
    const maxT = rawMax + DAY / 2;
    const lanes = new Map<string, TicketNode[]>();
    tickets.forEach((t) => {
      const area = t.data.layer;
      (lanes.get(area) ?? lanes.set(area, []).get(area)!).push(t);
    });
    lanes.forEach((arr) => arr.sort((a, b) => new Date(a.data.created!).getTime() - new Date(b.data.created!).getTime()));
    // дневные деления
    const gridDays: number[] = [];
    for (let t = Math.ceil(minT / DAY) * DAY; t <= maxT; t += DAY) gridDays.push(t);
    return { lanes: [...lanes.entries()].sort(), minT, maxT, gridDays };
  }, [tickets]);

  const xPct = (iso: string) => ((new Date(iso).getTime() - minT) / (maxT - minT)) * 100;

  if (tickets.length === 0) {
    return (
      <div data-export-root className="absolute inset-0 flex items-center justify-center bg-canvas z-10">
        <div className="text-muted text-xs uppercase tracking-widest font-bold">нет тикетов с датами</div>
      </div>
    );
  }

  return (
    <div data-export-root className="absolute inset-0 flex flex-col bg-canvas z-10 pt-44 pb-8 px-10">
      <div className="relative flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-2xl border border-edge/60">
        {/* дневная сетка + даты */}
        <div className="absolute inset-0 pointer-events-none">
          {gridDays.map((t) => (
            <div key={t} className="absolute top-0 bottom-0 border-l border-edge/40" style={{ left: `${((t - minT) / (maxT - minT)) * 100}%` }}>
              <span className="absolute top-1.5 left-1.5 text-[9px] font-bold text-muted uppercase whitespace-nowrap">{fmtDay(t)}</span>
            </div>
          ))}
        </div>

        {/* дорожки по area */}
        <div className="relative pt-8">
          {lanes.map(([area, arr]) => (
            <div key={area} className="relative border-b border-edge/40 py-3 min-h-[56px]">
              <div
                className="sticky left-0 inline-block text-[9px] font-black uppercase tracking-[0.25em] px-2.5 py-1 rounded-md ml-2 mb-2 z-10"
                style={{ color: AREA_COLORS[area] || 'var(--text-secondary)', backgroundColor: alpha(AREA_COLORS[area] || 'var(--text-secondary)', 8) }}
              >
                {area} · {arr.length}
              </div>
              {/* карточки: x по created; вертикальный стек при наложении */}
              <div className="relative" style={{ height: laneHeight(arr, xPct) }}>
                {stackLane(arr, xPct).map(({ node, row }) => (
                  <div key={node.id} className="absolute" style={{ left: `min(${xPct(node.data.created!)}%, calc(100% - 190px))`, top: row * 30 }}>
                    <TimelineCard node={node} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// жадная укладка: карточка занимает ~12% ширины; кладём в первый ряд, где не пересекается
function stackLane(arr: TicketNode[], xPct: (iso: string) => number) {
  const CARD_W_PCT = 12;
  const rowEnds: number[] = [];
  return arr.map((node) => {
    const x = xPct(node.data.created!);
    let row = rowEnds.findIndex((end) => x >= end);
    if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
    rowEnds[row] = x + CARD_W_PCT;
    return { node, row };
  });
}

function laneHeight(arr: TicketNode[], xPct: (iso: string) => number) {
  const rows = Math.max(...stackLane(arr, xPct).map((p) => p.row), 0) + 1;
  return rows * 30 + 4;
}
