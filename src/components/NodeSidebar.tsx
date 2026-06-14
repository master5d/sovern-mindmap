import { useWorkflowStore } from '../store/useWorkflowStore';
import { X, Save, Trash2, Calendar, DollarSign, Target, Zap } from 'lucide-react';

export const NodeSidebar = () => {
  const { nodes, selectedNodeId, updateNodeData, setSelectedNode } = useWorkflowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) return null;

  const handleChange = (field: string, value: any) => {
    updateNodeData(selectedNodeId!, { [field]: value });
    // fb_-тикеты: статус персистится в feedback.jsonl через dev-middleware
    if (field === 'status' && selectedNodeId!.startsWith('fb_')) {
      fetch('/api/feedback/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedNodeId, status: value }),
      }).catch(() => {});
    }
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    const newDates = { ...(selectedNode.data.dates || {}), [field]: value };
    handleChange('dates', newDates);
  };

  return (
    <div className="absolute right-6 top-6 bottom-6 w-80 bg-surface/95 backdrop-blur-2xl border border-edge rounded-3xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="p-5 border-b border-edge flex items-center justify-between bg-surface/50">
        <div>
          <h2 className="text-sm font-black uppercase tracking-tighter text-primary">Node Details</h2>
          <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">Edit Properties</p>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-2 hover:bg-hover rounded-full text-secondary hover:text-primary transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted tracking-widest">Title</label>
          <input
            type="text"
            value={selectedNode.data.label}
            onChange={(e) => handleChange('label', e.target.value)}
            className="w-full bg-surface-2 border border-edge rounded-xl px-4 py-2.5 text-sm text-primary focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Grid: Layer & Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted tracking-widest">Layer</label>
            <select
              value={selectedNode.data.layer}
              onChange={(e) => handleChange('layer', e.target.value)}
              className="w-full bg-surface-2 border border-edge rounded-xl px-3 py-2.5 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <optgroup label="SOVERN">
                <option value="human">Human</option>
                <option value="boss">Boss</option>
                <option value="skills">Skills</option>
                <option value="coding">Coding</option>
                <option value="tools">Tools</option>
                <option value="memory">Memory</option>
                <option value="projects">Projects</option>
              </optgroup>
              <optgroup label="mc_hub feedback">
                <option value="lms">LMS</option>
                <option value="blog">Blog</option>
                <option value="hub">Hub</option>
                <option value="mentor">Mentor</option>
                <option value="workers">Workers</option>
                <option value="course">Course</option>
                <option value="infra">Infra</option>
              </optgroup>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted tracking-widest">Status</label>
            <select
              value={selectedNode.data.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full bg-surface-2 border border-edge rounded-xl px-3 py-2.5 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="idle">Idle</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </div>

        {/* Budget */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-muted tracking-widest flex items-center">
            <DollarSign size={10} className="mr-1 text-accent" /> Budget
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              type="number"
              value={selectedNode.data.budget || 0}
              onChange={(e) => handleChange('budget', parseFloat(e.target.value))}
              className="w-full bg-surface-2 border border-edge rounded-xl pl-8 pr-4 py-2.5 text-sm text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase text-muted tracking-widest flex items-center">
            <Calendar size={10} className="mr-1 text-orange-500" /> Timeline
          </label>
          <div className="grid grid-cols-1 gap-2">
            <input
              type="date"
              value={selectedNode.data.dates?.start || ''}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="w-full bg-surface-2 border border-edge rounded-xl px-4 py-2 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
            />
            <input
              type="date"
              value={selectedNode.data.dates?.end || ''}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="w-full bg-surface-2 border border-edge rounded-xl px-4 py-2 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Triage info (mc_hub feedback тикеты) */}
        {selectedNode.data.feedback && (
          <div className="pt-4 border-t border-edge space-y-2">
            <label className="text-[10px] font-black uppercase text-muted tracking-widest">Triage</label>
            <div className="bg-surface-2 border border-edge rounded-xl p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-muted">category</span><span className="text-primary font-bold">{selectedNode.data.feedback.category}</span></div>
              <div className="flex justify-between"><span className="text-muted">severity</span><span className="font-bold" style={{ color: selectedNode.data.color || 'var(--text-primary)' }}>{selectedNode.data.feedback.severity}</span></div>
              <div className="flex justify-between"><span className="text-muted">confidence</span><span className="text-primary font-bold">{selectedNode.data.feedback.confidence}</span></div>
              {selectedNode.data.feedback.reason && (
                <p className="text-secondary leading-snug pt-1.5 border-t border-edge/60">{selectedNode.data.feedback.reason}</p>
              )}
              <div className="text-muted font-mono text-[10px] pt-1">{selectedNode.id}</div>
            </div>
          </div>
        )}

        {/* Matrix Priority (New) */}
        <div className="pt-4 border-t border-edge space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted tracking-widest flex items-center">
              <Zap size={10} className="mr-1 text-yellow-500" /> Urgency (1-10)
            </label>
            <input
              type="range" min="1" max="10"
              value={selectedNode.data.urgency || 5}
              onChange={(e) => handleChange('urgency', parseInt(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted tracking-widest flex items-center">
              <Target size={10} className="mr-1 text-green-500" /> Impact (1-10)
            </label>
            <input
              type="range" min="1" max="10"
              value={selectedNode.data.impact || 5}
              onChange={(e) => handleChange('impact', parseInt(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-edge bg-surface/50 flex space-x-3">
        <button
          onClick={() => setSelectedNode(null)}
          className="flex-1 bg-accent hover:bg-accent/90 text-white font-bold text-[11px] uppercase tracking-widest py-3 rounded-xl transition-all shadow-lg shadow-accent/20 flex items-center justify-center"
        >
          <Save size={14} className="mr-2" /> Save Node
        </button>
        <button className="p-3 bg-hover hover:bg-red-500/10 text-secondary hover:text-red-500 rounded-xl transition-all">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};
