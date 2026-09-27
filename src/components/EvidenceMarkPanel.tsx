import type { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import {
  EVIDENCE_MARKS,
  THRESHOLD_MARK_IDS,
  isKnownMark,
  markColorVar,
  markGlyph,
} from '../utils/evidenceMarks';

interface EvidenceMarkPanelProps {
  nodes: Node<SOVERNNodeData>[];
  edges: Edge[];
  threshold: string;
  showRefuted: boolean;
  onThresholdChange: (id: string) => void;
  onShowRefutedChange: (on: boolean) => void;
}

/**
 * Легенда грейдов + переключатель порога «скрыть слабее X» — мост NAUTILUS
 * core/desops/dataviz (intake #171). Показывается ТОЛЬКО когда на борде есть
 * хоть одна известная марка (узел или ребро) — иначе панель не эмитится вовсе,
 * тот же принцип, что у `hasMarks` в NAUTILUS `render/html.js`.
 */
export function EvidenceMarkPanel({
  nodes,
  edges,
  threshold,
  showRefuted,
  onThresholdChange,
  onShowRefutedChange,
}: EvidenceMarkPanelProps) {
  const present = new Set<string>();
  nodes.forEach((n) => { if (isKnownMark(n.data?.mark)) present.add(n.data.mark as string); });
  edges.forEach((e) => { const m = (e.data as any)?.mark; if (isKnownMark(m)) present.add(m); });
  // Порядок — из шкалы (EVIDENCE_MARKS), а не из порядка появления на борде.
  const legendItems = EVIDENCE_MARKS.filter((m) => present.has(m.id));

  return (
    <div className="absolute top-6 right-6 z-20 bg-surface/90 backdrop-blur-md p-3 border border-edge rounded-2xl shadow-2xl flex flex-col gap-2 max-w-[220px]">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted">Evidence grade</div>

      <div className="flex flex-col gap-1">
        {legendItems.map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-[11px] text-secondary">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: markColorVar(m.id) }}
            />
            <span style={{ color: markColorVar(m.id) }}>{m.glyph}</span>
            <span>{m.label}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-edge pt-2 flex flex-col gap-1.5">
        <div className="text-[9px] font-bold uppercase tracking-wider text-muted">Hide weaker than</div>
        <div className="flex gap-1">
          {THRESHOLD_MARK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              title={id}
              aria-pressed={threshold === id}
              onClick={() => onThresholdChange(id)}
              className={`flex-1 py-1 rounded-lg text-xs transition-colors ${
                threshold === id ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'
              }`}
            >
              {markGlyph(id)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-secondary mt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={showRefuted}
            onChange={(e) => onShowRefutedChange(e.target.checked)}
          />
          show {markGlyph('refuted')} refuted
        </label>
      </div>
    </div>
  );
}
