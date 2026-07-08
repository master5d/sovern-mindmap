import { loadBoardsRegistry, migrateLegacyWorkspace, loadBoardContent } from './persistence';
import { useWorkflowStore, withoutHistory, stripArtifactContent } from '../store/useWorkflowStore';

/**
 * Startup path for Canvas Project Tabs:
 * registry (or first-run legacy migration) → store board meta → load the active board.
 *
 * STRICTLY READ-ONLY on board content — it must be impossible for a startup to
 * write the initial empty graph over a real board (Точка Сборки safety). Saving
 * only ever happens via the debounced autosave and switchBoard, both of which
 * run after this flow has put the board's real content on the canvas.
 *
 * Deliberately NOT switchBoard(activeBoardId): switchBoard saves the outgoing
 * board first, which at startup would persist the empty boot graph under the
 * active board's key before its content was loaded.
 *
 * @returns boardLoaded=false when the active board has no stored content yet —
 * the caller decides what the canvas shows (live board.canvas feed / demo graph).
 */
export async function initBoardsFlow(): Promise<{ boardLoaded: boolean }> {
  const reg = (await loadBoardsRegistry()) ?? (await migrateLegacyWorkspace());
  useWorkflowStore.getState().initBoards(reg);
  const content = await loadBoardContent(reg.activeBoardId);
  if (!content) return { boardLoaded: false };
  // Artifacts live ONLY on the review board — sweep any that leaked into a
  // user board before the inbox was board-gated (in-memory strip before render;
  // the corrected content persists via the normal autosave, not here).
  const active = reg.boards.find((b) => b.id === reg.activeBoardId);
  const clean =
    active?.kind === 'review' ? content : stripArtifactContent(content.nodes, content.edges);
  withoutHistory(() => {
    useWorkflowStore.getState().setNodes(clean.nodes);
    useWorkflowStore.getState().setEdges(clean.edges);
  });
  return { boardLoaded: true };
}
