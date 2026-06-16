import { useWorkflowStore } from '../store/useWorkflowStore';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';

// Helper to check if we are running inside Tauri
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export const usePersistence = () => {
  const { nodes, edges, setNodes, setEdges } = useWorkflowStore();

  const saveToFile = async () => {
    if (!isTauri()) {
      alert("Saving files is only available in the SOVERN Desktop App.");
      return;
    }

    try {
      // Dynamic import to prevent crash in browser during static import phase
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        filters: [{
          name: 'JSON Canvas',
          extensions: ['canvas']
        }]
      });

      if (filePath) {
        const canvasData = toJSONCanvas(nodes.filter((n) => n.type !== 'lane'), edges);
        await writeTextFile(filePath, JSON.stringify(canvasData, null, 2));
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const loadFromFile = async () => {
    if (!isTauri()) {
      alert("Loading files is only available in the SOVERN Desktop App.");
      return;
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await open({
        multiple: false,
        filters: [{
          name: 'JSON Canvas',
          extensions: ['canvas']
        }]
      });

      if (filePath && typeof filePath === 'string') {
        const content = await readTextFile(filePath);
        const canvasData = JSON.parse(content);
        const { nodes: loadedNodes, edges: loadedEdges } = fromJSONCanvas(canvasData);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
      }
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const WORKSPACE_KEY = 'sovern-workspace';

  const saveWorkspace = async () => {
    const canvasData = toJSONCanvas(nodes.filter((n) => n.type !== 'lane'), edges);
    const json = JSON.stringify(canvasData, null, 2);
    if (!isTauri()) {
      try { localStorage.setItem(WORKSPACE_KEY, json); } catch { /* quota — ignore */ }
      return;
    }
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = await appDataDir();
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeTextFile(await join(dir, 'workspace.canvas'), json);
  };

  const loadWorkspace = async () => {
    let json: string | null = null;
    if (!isTauri()) {
      json = localStorage.getItem(WORKSPACE_KEY);
    } else {
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      const path = await join(await appDataDir(), 'workspace.canvas');
      if (await exists(path)) json = await readTextFile(path);
    }
    if (!json) return false;
    try {
      const { nodes: ln, edges: le } = fromJSONCanvas(JSON.parse(json));
      setNodes(ln);
      setEdges(le);
      return true;
    } catch (error) {
      console.error('Failed to load workspace:', error);
      return false;
    }
  };

  return { saveToFile, loadFromFile, saveWorkspace, loadWorkspace };
};
