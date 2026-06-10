import { useMemo, useState, DragEvent } from 'react';
import { Search, Inbox, Clock3, PlayCircle, CheckCircle2, Ban, AlertTriangle } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { NodeStatus, SOVERNNodeData } from '../types';
import { Node } from '@xyflow/react';

// ── конфиг колонок ────────────────────────────────────────────────────────────
const COLUMNS: { status: NodeStatus; title: string; accent: string; Icon: typeof Inbox }[] = [
  { status: 'idle', title: 'Triage', accent: '#64748b', Icon: Inbox },
  { status: 'pending', title: 'Pending', accent: '#eab308', Icon: Clock3 },
  { status: 'active', title: 'Active', accent: '#3b82f6', Icon: PlayCircle },
  { status: 'done', title: 'Done', accent: '#22c55e', Icon: CheckCircle2 },
  { status: 'blocked', title: 'Blocked', accent: '#ef4444', Icon: Ban },
];

const AREA_COLORS: Record<string, string> = {
  lms: '#10b981', blog: '#8b5cf6', hub: '#0ea5e9', mentor: '#d946ef',
  workers: '#f59e0b', course: '#84cc16', infra: '#64748b',
};

const CATEGORY_EMOJI: Record<string, string> = {
  bug: '🐛', feature: '✨', ux: '🎨', question: '❓', idea: '💡',
};

// Priority Matrix quadrant — те же пороги, что в /triage skill
const quadrant = (impact = 5, urgency = 5) => {
  if (impact >= 6 && urgency >= 6) return { label: 'Do First', color: '#ef4444' };
  if (impact >= 6) return { label: 'Schedule', color: '#3b82f6' };
  if (urgency >= 6) return { label: 'Quick', color: '#eab308' };
  return { label: 'Backlog', color: '#64748b' };
};

type TicketNode = Node<SOVERNNodeData>;

// ── карточка ──────────────────────────────────────────────────────────────────
function KanbanCard({ node, onDragStart }: { node: TicketNode; onDragStart: (e: DragEvent, id: string) => void }) {
  const { setSelectedNode, selectedNodeId } = useWorkflowStore();
  const fb = node.data.feedback as Record<string, any> | undefined;
  const impact = node.data.impact ?? 5;
  const urgency = node.data.urgency ?? 5;
  const q = quadrant(impact, urgency);
  const area = node.data.layer;
  const selected = selectedNodeId === node.id;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, node.id)}
      onClick={() => setSelectedNode(node.id)}
      className={`group cursor-grab active:cursor-grabbing select-none rounded-xl bg-slate-900 border transition-all p-3 pl-3.5 relative overflow-hidden hover:border-slate-600 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-black/40 ${
        selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-800'
      }`}
    >
      {/* severity strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: node.data.color || '#334155' }} />

      <div className="text-[12px] leading-snug text-slate-200 font-medium mb-2.5">
        {CATEGORY_EMOJI[fb?.category] ?? ''} {String(node.data.label).replace(/^[🐛✨🎨❓💡]\s*/u, '')}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border"
          style={{ color: AREA_COLORS[area] || '#94a3b8', borderColor: (AREA_COLORS[area] || '#94a3b8') + '40', backgroundColor: (AREA_COLORS[area] || '#94a3b8') + '15' }}
        >
          {area}
        </span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{ color: q.color, backgroundColor: q.color + '18' }}
        >
          {q.label}
        </span>
        <span className="ml-auto text-[9px] font-mono text-slate-500" title={`impact ${impact} × urgency ${urgency}`}>
          I{impact}·U{urgency}
        </span>
      </div>

      {fb?.severity && (fb.severity === 'critical' || fb.severity === 'high') && (
        <div className="mt-2 flex items-center text-[9px] font-bold uppercase tracking-wider" style={{ color: node.data.color }}>
          <AlertTriangle size={10} className="mr-1" /> {fb.severity}
        </div>
      )}
    </div>
  );
}

// ── доска ─────────────────────────────────────────────────────────────────────
export function KanbanBoard() {
  const { nodes, updateNodeData } = useWorkflowStore();
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<NodeStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // только реальные тикеты (fb_*); area_*-группы — навигация mindmap'а, не карточки
  const tickets = useMemo(
    () => (nodes as TicketNode[]).filter((n) => n.id.startsWith('fb_')),
    [nodes],
  );

  const areas = useMemo(
    () => [...new Set(tickets.map((t) => t.data.layer))].sort(),
    [tickets],
  );

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (!areaFilter || t.data.layer === areaFilter) &&
        (!s || String(t.data.label).toLowerCase().includes(s)),
    );
  }, [tickets, search, areaFilter]);

  const byStatus = useMemo(() => {
    const map: Record<string, TicketNode[]> = {};
    COLUMNS.forEach((c) => (map[c.status] = []));
    visible.forEach((t) => (map[t.data.status || 'idle'] ?? map.idle).push(t));
    // сортировка: priority score (impact × urgency) по убыванию
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (b.data.impact ?? 5) * (b.data.urgency ?? 5) - (a.data.impact ?? 5) * (a.data.urgency ?? 5)),
    );
    return map;
  }, [visible]);

  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = async (e: DragEvent, status: NodeStatus) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const node = tickets.find((t) => t.id === id);
    if (!node || node.data.status === status) return;

    const prev = node.data.status;
    updateNodeData(id, { status }); // optimistic
    try {
      const res = await fetch('/api/feedback/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setToast(`${id.slice(0, 11)}… → ${status}`);
    } catch (err) {
      updateNodeData(id, { status: prev }); // rollback
      setToast(`⚠ write-back failed: ${String(err).slice(0, 80)}`);
    }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#020617] z-10">
      {/* toolbar */}
      {/* pl-[470px] — место под фиксированный header SOVERN Control Plane */}
      <div className="flex items-center gap-3 pl-[470px] pr-6 pt-8 pb-4 shrink-0 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 w-64 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
          />
        </div>
        <div className="flex gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              onClick={() => setAreaFilter(areaFilter === a ? null : a)}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border transition-colors ${
                areaFilter === a ? 'text-white' : 'text-slate-500 border-slate-800 hover:border-slate-600'
              }`}
              style={
                areaFilter === a
                  ? { backgroundColor: (AREA_COLORS[a] || '#475569') + '30', borderColor: AREA_COLORS[a] || '#475569', color: AREA_COLORS[a] }
                  : undefined
              }
            >
              {a}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          {visible.length} / {tickets.length} tickets
        </div>
      </div>

      {/* columns */}
      <div className="flex-1 flex gap-4 px-6 pb-6 overflow-x-auto min-h-0">
        {COLUMNS.map(({ status, title, accent, Icon }) => (
          <div
            key={status}
            onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
            onDragLeave={() => setDragOver((d) => (d === status ? null : d))}
            onDrop={(e) => onDrop(e, status)}
            className={`flex flex-col w-[280px] shrink-0 rounded-2xl border transition-colors ${
              dragOver === status ? 'border-blue-500/60 bg-blue-500/5' : 'border-slate-800/60 bg-slate-900/30'
            }`}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 shrink-0">
              <Icon size={14} style={{ color: accent }} />
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-300">{title}</span>
              <span
                className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: accent, backgroundColor: accent + '18' }}
              >
                {byStatus[status].length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar">
              {byStatus[status].map((node) => (
                <KanbanCard key={node.id} node={node} onDragStart={onDragStart} />
              ))}
              {byStatus[status].length === 0 && (
                <div className="text-center text-[10px] text-slate-700 uppercase tracking-widest pt-8 font-bold">empty</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* toast */}
      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-slate-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
