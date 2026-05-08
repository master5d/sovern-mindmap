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
        const canvasData = toJSONCanvas(nodes, edges);
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

  return { saveToFile, loadFromFile };
};
