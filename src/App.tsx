import { useEffect, useCallback, useRef } from 'react';
import { useBoardSync } from './hooks/useBoardSync';
import {
  ReactFlow,
  Controls,
  Background,
  Panel,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RefreshCcw, Save, FolderOpen, Zap, Grid2X2, Network, CalendarRange, CloudSync, Columns, AlertTriangle, Terminal } from 'lucide-react';

import { useWorkflowStore, ViewMode } from './store/useWorkflowStore';
import { SOVERNNode } from './components/nodes/SOVERNNode';
import { NodeSidebar } from './components/NodeSidebar';
import { usePersistence } from './utils/persistence';
import { SOVERNNodeData } from './types';

const nodeTypes = {
  sovern: SOVERNNode,
};

const prdNodes: Node<SOVERNNodeData>[] = [
  { id: 'root', type: 'sovern', position: { x: 500, y: 0 }, data: { label: 'SOVERN MindMap Control Plane', layer: 'human', status: 'active', budget: 0, urgency: 10, impact: 10, dates: { start: '2026-05-05', end: '2026-07-30' } } },
  { id: 'boss-core', type: 'sovern', position: { x: 500, y: 150 }, data: { label: 'System Orchestrator', layer: 'boss', status: 'active', agent: 'Hermes', urgency: 9, impact: 10 } },
  { id: 'p1-scaffold', type: 'sovern', position: { x: 200, y: 300 }, data: { label: 'Phase 1: Tauri Scaffold', layer: 'coding', status: 'done', budget: 50000, urgency: 10, impact: 8, dates: { start: '2026-05-05', end: '2026-05-06' } } },
  { id: 'p2-engine', type: 'sovern', position: { x: 400, y: 300 }, data: { label: 'Phase 2: PM Engine', layer: 'coding', status: 'done', budget: 75000, urgency: 10, impact: 9, dates: { start: '2026-05-06', end: '2026-05-06' } } },
  { id: 'p2-persistence', type: 'sovern', position: { x: 600, y: 300 }, data: { label: 'Persistence Engine', layer: 'memory', status: 'done', budget: 25000, urgency: 8, impact: 9, dates: { start: '2026-05-06', end: '2026-05-07' } } },
  { id: 'p3-views', type: 'sovern', position: { x: 800, y: 300 }, data: { label: 'Phase 3: Views', layer: 'projects', status: 'active', budget: 120000, urgency: 7, impact: 10, dates: { start: '2026-05-07', end: '2026-05-15' } } },
  { id: 'v-mindmap', type: 'sovern', position: { x: 700, y: 450 }, data: { label: 'MindMap', layer: 'skills', status: 'done', budget: 15000, urgency: 5, impact: 7, dates: { start: '2026-05-07', end: '2026-05-07' } } },
  { id: 'v-matrix', type: 'sovern', position: { x: 800, y: 450 }, data: { label: 'Matrix', layer: 'skills', status: 'done', budget: 25000, urgency: 6, impact: 8, dates: { start: '2026-05-07', end: '2026-05-07' } } },
  { id: 'v-timeline', type: 'sovern', position: { x: 900, y: 450 }, data: { label: 'Timeline', layer: 'skills', status: 'done', budget: 25000, urgency: 6, impact: 8, dates: { start: '2026-05-07', end: '2026-05-07' } } },
  { id: 'v-kanban', type: 'sovern', position: { x: 1000, y: 450 }, data: { label: 'Kanban', layer: 'skills', status: 'done', budget: 25000, urgency: 6, impact: 8, dates: { start: '2026-05-07', end: '2026-05-07' } } },
  { id: 'mcp-server', type: 'sovern', position: { x: 400, y: 450 }, data: { label: 'MCP API', layer: 'tools', status: 'done', agent: 'Hermes', budget: 100000, urgency: 9, impact: 10, dates: { start: '2026-05-06', end: '2026-05-07' } } },
  { id: 'n8n-infra', type: 'sovern', position: { x: 200, y: 450 }, data: { label: 'n8n Infra', layer: 'tools', status: 'active', budget: 45000, urgency: 5, impact: 7, dates: { start: '2026-05-07', end: '2026-05-10' } } },
  { id: 'heuristic-checks', type: 'sovern', position: { x: 300, y: 600 }, data: { label: 'Heuristic Checks', layer: 'boss', status: 'pending', budget: 150000, urgency: 4, impact: 6, dates: { start: '2026-05-20', end: '2026-06-15' } } },
];

const prdEdges: Edge[] = [
  { id: 'e-root-boss', source: 'root', target: 'boss-core', animated: true },
  { id: 'e-boss-p1', source: 'boss-core', target: 'p1-scaffold' },
  { id: 'e-boss-p2', source: 'boss-core', target: 'p2-engine' },
  { id: 'e-boss-p2p', source: 'boss-core', target: 'p2-persistence' },
  { id: 'e-boss-p3', source: 'boss-core', target: 'p3-views' },
  { id: 'e-p3-v1', source: 'p3-views', target: 'v-mindmap' },
  { id: 'e-p3-v2', source: 'p3-views', target: 'v-matrix' },
  { id: 'e-p3-v3', source: 'p3-views', target: 'v-timeline' },
  { id: 'e-p3-v4', source: 'p3-views', target: 'v-kanban' },
  { id: 'e-boss-mcp', source: 'boss-core', target: 'mcp-server' },
  { id: 'e-boss-n8n', source: 'boss-core', target: 'n8n-infra' },
  { id: 'e-boss-heur', source: 'boss-core', target: 'heuristic-checks' },
];

function Flow() {
  const { 
    nodes, edges, onNodesChange, onEdgesChange, onConnect, 
    setNodes, setEdges, recalculate, autoLayout, selectedNodeId,
    viewMode, setViewMode, isSyncing
  } = useWorkflowStore();
  
  const { saveToFile, loadFromFile } = usePersistence();
  const { fitView } = useReactFlow();
  const initialized = useRef(false);

  useBoardSync((loaded) => {
    if (initialized.current) return;
    initialized.current = true;
    if (!loaded) {
      // board недоступен (нет vite-плагина / файла) — fallback на demo PRD-граф
      console.log('[SOVERN] board.canvas недоступен — demo-граф');
      setNodes(prdNodes);
      setEdges(prdEdges);
    }
    setTimeout(() => fitView({ padding: 0.2 }), 500);
  });

  useEffect(() => {
    console.log('[SOVERN] Mounting Flow...');
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#020617', position: 'relative' }}>
      {/* High-visibility diagnostic panel */}
      <div className="absolute top-0 left-0 w-full z-[100] bg-blue-600 text-white text-[10px] px-2 py-0.5 flex justify-between font-mono">
        <span>SOVERN STATUS: ENGINE ATTACHED</span>
        <span>MODES: {nodes.length} NODES LOADED</span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={viewMode === 'mindmap' ? edges : []}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes as any}
        fitView
        colorMode="dark"
      >
        <Background color="#1e293b" variant={'dots' as any} gap={20} size={2} />
        
        {viewMode === 'kanban' && (
          <div className="absolute inset-0 flex pointer-events-none px-[50px] pt-[80px]">
            {['IDLE', 'PENDING', 'ACTIVE', 'DONE', 'BLOCKED'].map((status) => (
              <div key={status} className="w-[320px] border-r border-slate-800/30 flex flex-col items-center">
                <div className="text-[10px] font-black tracking-[0.4em] text-slate-600 bg-slate-900/80 px-5 py-2 rounded-full border border-slate-800 mb-6">{status}</div>
              </div>
            ))}
          </div>
        )}

        <Controls className="bg-slate-900/80 border-slate-800 fill-slate-100" />
        
        <Panel position="top-left" className="bg-slate-900/80 backdrop-blur-xl p-5 border border-slate-800 rounded-2xl shadow-2xl m-6">
          <div className="flex items-center space-x-4">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center relative">
               <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
               <Zap size={12} className="text-white fill-white relative" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-tighter text-white leading-none">SOVERN <span className="text-blue-500">Control Plane</span></h1>
              <div className="mt-1.5 text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase flex items-center">
                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isSyncing ? 'bg-orange-500 animate-spin' : 'bg-green-500'}`} />
                {viewMode.toUpperCase()} Active
              </div>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right" className="bg-slate-900/90 backdrop-blur-md p-2.5 border border-slate-800 rounded-2xl shadow-2xl m-6 flex space-x-3 items-center">
          <div className="flex space-x-1.5 px-2 border-r border-slate-800">
            <button onClick={() => setViewMode('mindmap')} className={`p-2.5 rounded-xl ${viewMode === 'mindmap' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Network size={18} /></button>
            <button onClick={() => setViewMode('matrix')} className={`p-2.5 rounded-xl ${viewMode === 'matrix' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Grid2X2 size={18} /></button>
            <button onClick={() => setViewMode('timeline')} className={`p-2.5 rounded-xl ${viewMode === 'timeline' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><CalendarRange size={18} /></button>
            <button onClick={() => setViewMode('kanban')} className={`p-2.5 rounded-xl ${viewMode === 'kanban' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Columns size={18} /></button>
          </div>
          <div className="flex space-x-1.5 px-2 border-r border-slate-800">
            <button onClick={loadFromFile} className="p-2.5 text-slate-400 hover:text-orange-400"><FolderOpen size={18} /></button>
            <button onClick={saveToFile} className="p-2.5 text-slate-400 hover:text-blue-400"><Save size={18} /></button>
          </div>
          <button onClick={recalculate} className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-400 hover:bg-white hover:text-slate-950 transition-all shadow-inner`}>
            <RefreshCcw size={16} />
            <span className="text-[11px] font-black tracking-widest uppercase text-xs">Sync</span>
          </button>
        </Panel>
      </ReactFlow>
      {selectedNodeId && <NodeSidebar />}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
