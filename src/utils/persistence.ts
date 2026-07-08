import type { Node, Edge } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import type { BoardMeta } from '../store/useWorkflowStore';
import type { SOVERNNodeData } from '../types';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';

// Helper to check if we are running inside Tauri
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

// ── Multi-board persistence (Canvas Project Tabs) ──────────────────────────
// Registry:      localStorage 'sovern-boards'          / appData boards.json
// Board content: localStorage 'sovern-workspace:<id>'  / appData boards/<id>.canvas
// The legacy single-workspace key ('sovern-workspace' / workspace.canvas) is
// read once by migrateLegacyWorkspace() and NEVER deleted (safety).

export interface BoardsRegistry {
  boards: BoardMeta[];
  activeBoardId: string;
}

const BOARDS_REGISTRY_KEY = 'sovern-boards';
const LEGACY_WORKSPACE_KEY = 'sovern-workspace';
const boardContentKey = (id: string) => `${LEGACY_WORKSPACE_KEY}:${id}`;

// Tauri appData file helpers (dynamic imports — mirror saveWorkspace/loadWorkspace style).
const readAppDataFile = async (relative: string): Promise<string | null> => {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
  const path = await join(await appDataDir(), ...relative.split('/'));
  if (!(await exists(path))) return null;
  return readTextFile(path);
};

const writeAppDataFile = async (relative: string, content: string): Promise<void> => {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const parts = relative.split('/');
  const dir =
    parts.length > 1 ? await join(await appDataDir(), ...parts.slice(0, -1)) : await appDataDir();
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeTextFile(await join(dir, parts[parts.length - 1]), content);
};

const removeAppDataFile = async (relative: string): Promise<void> => {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { remove, exists } = await import('@tauri-apps/plugin-fs');
  const path = await join(await appDataDir(), ...relative.split('/'));
  if (await exists(path)) await remove(path);
};

export const loadBoardsRegistry = async (): Promise<BoardsRegistry | null> => {
  let json: string | null = null;
  if (!isTauri()) json = localStorage.getItem(BOARDS_REGISTRY_KEY);
  else json = await readAppDataFile('boards.json');
  if (!json) return null;
  try {
    const reg = JSON.parse(json);
    if (!Array.isArray(reg?.boards) || typeof reg?.activeBoardId !== 'string') return null;
    return reg as BoardsRegistry;
  } catch (error) {
    console.error('Failed to parse boards registry:', error);
    return null;
  }
};

export const saveBoardsRegistry = async (reg: BoardsRegistry): Promise<void> => {
  const json = JSON.stringify(reg, null, 2);
  if (!isTauri()) {
    try { localStorage.setItem(BOARDS_REGISTRY_KEY, json); } catch { /* quota — ignore */ }
    return;
  }
  await writeAppDataFile('boards.json', json);
};

export const saveBoardContent = async (
  id: string,
  nodes: Node<SOVERNNodeData>[],
  edges: Edge[],
): Promise<void> => {
  const canvasData = toJSONCanvas(nodes.filter((n) => n.type !== 'lane'), edges);
  const json = JSON.stringify(canvasData, null, 2);
  if (!isTauri()) {
    try { localStorage.setItem(boardContentKey(id), json); } catch { /* quota — ignore */ }
    return;
  }
  await writeAppDataFile(`boards/${id}.canvas`, json);
};

export const loadBoardContent = async (
  id: string,
): Promise<{ nodes: Node<SOVERNNodeData>[]; edges: Edge[] } | null> => {
  let json: string | null = null;
  if (!isTauri()) json = localStorage.getItem(boardContentKey(id));
  else json = await readAppDataFile(`boards/${id}.canvas`);
  if (!json) return null;
  try {
    return fromJSONCanvas(JSON.parse(json));
  } catch (error) {
    console.error(`Failed to load board content (${id}):`, error);
    return null;
  }
};

export const deleteBoardContent = async (id: string): Promise<void> => {
  if (!isTauri()) {
    localStorage.removeItem(boardContentKey(id));
    return;
  }
  await removeAppDataFile(`boards/${id}.canvas`).catch(() => {});
};

/**
 * First-run migration: no boards registry yet → adopt the legacy single
 * workspace ('sovern-workspace' / workspace.canvas) as board «Main».
 * The legacy key/file is copied, never deleted. Without legacy data the
 * result is an empty «Main» (no content key → empty board on load).
 */
export const migrateLegacyWorkspace = async (): Promise<BoardsRegistry> => {
  const id = `b-${crypto.randomUUID()}`;
  let legacy: string | null = null;
  if (!isTauri()) legacy = localStorage.getItem(LEGACY_WORKSPACE_KEY);
  else legacy = await readAppDataFile('workspace.canvas');
  if (legacy != null) {
    if (!isTauri()) {
      try { localStorage.setItem(boardContentKey(id), legacy); } catch { /* quota — ignore */ }
    } else {
      await writeAppDataFile(`boards/${id}.canvas`, legacy);
    }
  }
  const reg: BoardsRegistry = {
    boards: [{ id, name: 'Main', kind: 'user' }],
    activeBoardId: id,
  };
  await saveBoardsRegistry(reg);
  return reg;
};

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
