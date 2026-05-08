import { Handle, Position, NodeProps } from '@xyflow/react';
import { Calendar, User, Zap } from 'lucide-react';
import { SOVERNNodeData } from '../../types';

const layerColors: Record<string, string> = {
  human: '#ef4444', // red-500
  boss: '#a855f7',  // purple-500
  skills: '#3b82f6', // blue-500
  coding: '#22c55e', // green-500
  gateway: '#eab308', // yellow-500
  memory: '#ec4899', // pink-500
  tools: '#06b6d4',  // cyan-500
  observability: '#f97316', // orange-500
  hosting: '#6366f1', // indigo-500
  projects: '#f43f5e', // rose-500
};

export const SOVERNNode = ({ data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const accentColor = layerColors[data.layer] || '#64748b';
  
  const displayStart = data.rollupDates?.start || data.dates?.start;
  const displayEnd = data.rollupDates?.end || data.dates?.end;

  return (
    <div 
      className={`px-4 py-3 shadow-2xl rounded-xl bg-slate-900 border-2 transition-all ${
        selected ? 'ring-4 ring-blue-500/20 border-blue-500 scale-105' : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-slate-700 border-2 border-slate-900" />
      
      <div className="flex flex-col min-w-[180px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accentColor }}>
            {data.layer}
          </span>
          <div 
            className={`w-2.5 h-2.5 rounded-full shadow-lg ${
              data.status === 'active' ? 'bg-green-500 animate-pulse shadow-green-500/50' : 
              data.status === 'blocked' ? 'bg-red-500 shadow-red-500/50' : 'bg-slate-700'
            }`} 
            title={`Status: ${data.status}`}
          />
        </div>
        
        {/* Title */}
        <div className="font-bold text-sm text-slate-100 leading-tight mb-3">
          {data.label}
        </div>
        
        {/* Meta Grid */}
        <div className="grid grid-cols-1 gap-2 mt-1">
          {/* Tokens Budget */}
          {(data.budget || data.rollupBudget) !== undefined && (
            <div className="flex items-center text-[11px] text-slate-400 font-medium bg-slate-950/50 p-1.5 rounded-lg border border-slate-800">
              <Zap size={12} className="mr-2 text-yellow-400 fill-yellow-400/20" />
              <span className="flex-1">Tokens:</span>
              <span className="font-bold text-yellow-400">
                {(data.rollupBudget ?? data.budget ?? 0).toLocaleString()}
              </span>
            </div>
          )}

          {/* Dates */}
          {(displayStart || displayEnd) && (
            <div className="flex items-center text-[11px] text-slate-400 font-medium bg-slate-950/50 p-1.5 rounded-lg border border-slate-800">
              <Calendar size={12} className="mr-2 text-orange-400" />
              <span className="flex-1">Timeline:</span>
              <span className="font-bold text-slate-200">
                {displayStart || '?'} → {displayEnd || '?'}
              </span>
            </div>
          )}

          {/* Agent */}
          {data.agent && (
            <div className="flex items-center text-[10px] text-slate-400 font-medium mt-1 pt-2 border-t border-slate-800">
              <User size={12} className="mr-2 text-purple-400" />
              <span className="flex-1 italic text-[9px]">Assigned:</span>
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-md font-bold text-[9px] border border-purple-500/20">
                {data.agent}
              </span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-slate-700 border-2 border-slate-900" />
    </div>
  );
};
