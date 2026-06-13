import { Handle, Position, NodeProps } from '@xyflow/react';
import { Calendar, User, Zap } from 'lucide-react';
import { SOVERNNodeData } from '../../types';
import { layerColor } from '../../utils/feedback';

export const SOVERNNode = ({ data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const accentColor = layerColor(data.layer);

  const displayStart = data.rollupDates?.start || data.dates?.start;
  const displayEnd = data.rollupDates?.end || data.dates?.end;

  return (
    <div
      className={`px-4 py-3 shadow-2xl rounded-xl bg-surface border-2 transition-all ${
        selected ? 'ring-4 ring-accent/20 border-accent scale-105' : 'border-edge hover:border-edge-strong'
      }`}
      // severity-цвет тикета (mc_hub feedback) — левый стрип; ноды без data.color не затронуты
      style={data.color ? { borderLeftColor: data.color, borderLeftWidth: 4 } : undefined}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />

      <div className="flex flex-col min-w-[180px] max-w-[240px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
            {data.layer}
          </span>
          <div
            className={`w-2.5 h-2.5 rounded-full shadow-lg ${data.status === 'active' ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: `var(--status-${data.status}, var(--status-idle))` }}
            title={`Status: ${data.status}`}
          />
        </div>

        {/* Title — clamp, иначе тикеты раздувают карту */}
        <div className="font-bold text-sm text-primary leading-tight line-clamp-3">
          {data.label}
        </div>

        {/* Meta Grid */}
        <div className="grid grid-cols-1 gap-2 mt-3 empty:mt-0">
          {/* Tokens Budget — только если реально есть бюджет (0 — это шум) */}
          {((data.rollupBudget ?? data.budget ?? 0) > 0) && (
            <div className="flex items-center text-[11px] text-secondary font-medium bg-surface-2/50 p-1.5 rounded-lg border border-edge">
              <Zap size={12} className="mr-2 text-yellow-400 fill-yellow-400/20" />
              <span className="flex-1">Tokens:</span>
              <span className="font-bold text-yellow-400">
                {(data.rollupBudget ?? data.budget ?? 0).toLocaleString()}
              </span>
            </div>
          )}

          {/* Dates */}
          {(displayStart || displayEnd) && (
            <div className="flex items-center text-[11px] text-secondary font-medium bg-surface-2/50 p-1.5 rounded-lg border border-edge">
              <Calendar size={12} className="mr-2 text-orange-400" />
              <span className="flex-1">Timeline:</span>
              <span className="font-bold text-primary">
                {displayStart || '?'} → {displayEnd || '?'}
              </span>
            </div>
          )}

          {/* Agent */}
          {data.agent && (
            <div className="flex items-center text-[10px] text-secondary font-medium mt-1 pt-2 border-t border-edge">
              <User size={12} className="mr-2 text-purple-400" />
              <span className="flex-1 italic text-[9px]">Assigned:</span>
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-md font-bold text-[9px] border border-purple-500/20">
                {data.agent}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
    </div>
  );
};
