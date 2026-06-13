import { useEffect, useRef, useState } from 'react';
import { useBoardSync } from './hooks/useBoardSync';
import {
  ReactFlow,
  Controls,
  Background,
  Node,
  Edge,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RefreshCcw, Save, FolderOpen, Zap, Grid2X2, Network, CalendarRange, Columns2, Workflow, ListTree, Rows3, Eye, EyeOff, ImageDown } from 'lucide-react';

import { ThemeSwitcher } from './components/ThemeSwitcher';
import { TokenUpload } from './components/TokenUpload';
import { useThemeStore } from './store/useThemeStore';
import { useWorkflowStore, ViewMode } from './store/useWorkflowStore';
import { SOVERNNode } from './components/nodes/SOVERNNode';
import { LaneNode } from './components/nodes/LaneNode';
import { NodeSidebar } from './components/NodeSidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { MatrixView } from './components/MatrixView';
import { TimelineView } from './components/TimelineView';
import { usePersistence } from './utils/persistence';
import { exportCanvasPng, exportDomViewPng } from './utils/exportPng';
import { SOVERNNodeData } from './types';

const nodeTypes = {
  sovern: SOVERNNode,
  lane: LaneNode,
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

const VIEW_BUTTONS: { mode: ViewMode; Icon: typeof Network; active: string }[] = [
  { mode: 'mindmap', Icon: Network, active: 'bg-blue-600 text-white' },
  { mode: 'diagram', Icon: Workflow, active: 'bg-cyan-600 text-white' },
  { mode: 'matrix', Icon: Grid2X2, active: 'bg-purple-600 text-white' },
  { mode: 'timeline', Icon: CalendarRange, active: 'bg-orange-600 text-white' },
  { mode: 'kanban', Icon: Columns2, active: 'bg-emerald-600 text-white' },
];

function Flow() {
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    setNodes, setEdges, recalculate, selectedNodeId,
    viewMode, setViewMode, isSyncing,
    diagramLayout, setDiagramLayout, presentationMode, setPresentationMode,
  } = useWorkflowStore();

  const resolved = useThemeStore((s) => s.resolved);
  const { saveToFile, loadFromFile } = usePersistence();
  const { fitView } = useReactFlow();
  const initialized = useRef(false);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const notify = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  };

  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (viewMode === 'mindmap' || viewMode === 'diagram') {
        // lane-фоны полноширинные — исключаем из bounds, иначе fit-to-content раздувается
        await exportCanvasPng(nodes.filter((n) => n.type !== 'lane'), viewMode);
      } else {
        await exportDomViewPng(viewMode);
      }
      notify('PNG exported');
    } catch (err) {
      notify(`⚠ export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  useBoardSync(
    (loaded) => {
      if (initialized.current) return;
      initialized.current = true;
      if (!loaded) {
        // board недоступен (нет vite-плагина / файла) — fallback на demo PRD-граф
        console.log('[SOVERN] board.canvas недоступен — demo-граф');
        setNodes(prdNodes);
        setEdges(prdEdges);
      }
      setTimeout(() => fitView({ padding: 0.2 }), 500);
    },
    // poll подхватил изменения board'а → layout пере-применён → вписать viewport
    () => {
      if (['mindmap', 'diagram'].includes(useWorkflowStore.getState().viewMode)) {
        setTimeout(() => fitView({ padding: 0.15, duration: 350 }), 50);
      }
    },
  );

  // Смена layout перемещает ноды в новые canvas-координаты — viewport обязан
  // следовать за ними, иначе вид «пустой» (исходный kanban-баг).
  useEffect(() => {
    if (viewMode !== 'mindmap' && viewMode !== 'diagram') return; // canvas-вью; остальное DOM
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 350 }), 50);
    return () => clearTimeout(t);
  }, [viewMode, diagramLayout, fitView]);

  const isCanvasView = viewMode === 'mindmap' || viewMode === 'diagram';
  const displayEdges = !isCanvasView
    ? []
    : viewMode === 'diagram'
      ? edges.map((e) => ({
          ...e,
          type: 'smoothstep' as const,
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        }))
      : edges;

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: 'var(--bg-canvas)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes as any}
        nodesDraggable={viewMode !== 'diagram'}
        fitView
        minZoom={0.05}
        colorMode={resolved}
      >
        <Background color={resolved === 'dark' ? '#1e293b' : '#cbd5e1'} variant={'dots' as any} gap={20} size={2} />
        {!presentationMode && <Controls className="bg-surface/80 border-edge fill-[var(--text-primary)]" />}
      </ReactFlow>

      {/* DOM-вью поверх canvas (полностью перекрывают его); canvas — только mindmap */}
      {viewMode === 'kanban' && <KanbanBoard />}
      {viewMode === 'matrix' && <MatrixView />}
      {viewMode === 'timeline' && <TimelineView />}

      {/* Header — вне ReactFlow, виден во всех режимах (кроме presentation) */}
      {!presentationMode && (
        <div className="absolute top-6 left-6 z-20 bg-surface/80 backdrop-blur-xl p-5 border border-edge rounded-2xl shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center relative">
              <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
              <Zap size={12} className="text-white fill-white relative" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-tighter text-primary leading-none">SOVERN <span className="text-accent">Control Plane</span></h1>
              <div className="mt-1.5 text-[10px] text-muted font-bold tracking-[0.2em] uppercase flex items-center">
                <span className={`w-1.5 h-1.5 rounded-full mr-2 ${isSyncing ? 'bg-orange-500 animate-spin' : 'bg-green-500'}`} />
                {viewMode.toUpperCase()} Active
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar — вне ReactFlow, виден во всех режимах (кроме presentation) */}
      {!presentationMode && (
        <div className="absolute bottom-6 right-6 z-20 bg-surface/90 backdrop-blur-md p-2.5 border border-edge rounded-2xl shadow-2xl flex space-x-3 items-center">
          <ThemeSwitcher />
          <TokenUpload notify={notify} />
          <div className="flex space-x-1.5 px-2 border-r border-edge">
            {VIEW_BUTTONS.map(({ mode, Icon, active }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={mode}
                className={`p-2.5 rounded-xl ${viewMode === mode ? active : 'text-secondary hover:bg-hover'}`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
          <div className="flex space-x-1.5 px-2 border-r border-edge">
            <button onClick={loadFromFile} title="Load canvas" className="p-2.5 text-secondary hover:text-orange-400"><FolderOpen size={18} /></button>
            <button onClick={saveToFile} title="Save canvas" className="p-2.5 text-secondary hover:text-accent"><Save size={18} /></button>
            <button onClick={onExport} disabled={exporting} title="Export PNG" className="p-2.5 text-secondary hover:text-accent disabled:opacity-40"><ImageDown size={18} /></button>
          </div>
          <button onClick={recalculate} className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-hover text-secondary hover:bg-primary hover:text-canvas transition-all shadow-inner">
            <RefreshCcw size={16} />
            <span className="text-[11px] font-black tracking-widest uppercase text-xs">Sync</span>
          </button>
        </div>
      )}

      {viewMode === 'diagram' && !presentationMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-surface/90 backdrop-blur-md p-2 border border-edge rounded-2xl shadow-2xl flex space-x-1.5">
          <button
            onClick={() => setDiagramLayout('tree')}
            title="Tree layout"
            className={`p-2.5 rounded-xl ${diagramLayout === 'tree' ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'}`}
          >
            <ListTree size={18} />
          </button>
          <button
            onClick={() => setDiagramLayout('lanes')}
            title="Dependency lanes"
            className={`p-2.5 rounded-xl ${diagramLayout === 'lanes' ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'}`}
          >
            <Rows3 size={18} />
          </button>
          <button
            onClick={() => setPresentationMode(true)}
            title="Presentation mode"
            className="p-2.5 rounded-xl text-secondary hover:bg-hover"
          >
            <Eye size={18} />
          </button>
        </div>
      )}
      {presentationMode && (
        <button
          onClick={() => setPresentationMode(false)}
          title="Exit presentation"
          className="absolute bottom-6 right-6 z-20 p-3 rounded-xl bg-surface/90 border border-edge text-secondary hover:text-primary shadow-2xl"
        >
          <EyeOff size={18} />
        </button>
      )}

      {selectedNodeId && <NodeSidebar />}
      {notice && (
        <div className="absolute bottom-24 right-6 z-30 bg-surface border border-edge text-primary text-xs px-4 py-2.5 rounded-xl shadow-2xl">
          {notice}
        </div>
      )}
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
