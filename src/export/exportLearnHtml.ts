import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { useWorkflowStore, selectLearnOrder, selectLearnStepText } from '../store/useWorkflowStore';
import { useThemeStore } from '../store/useThemeStore';
import { captureCanvasSvg } from './captureCanvasSvg';
import { buildLearnHtml } from './learnHtmlTemplate';
import { saveFile } from './saveFile';

/** Wait two animation frames so a state change fully re-renders + repaints before capture. */
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface Deps {
  notify?: (message: string) => void;
}

/** Drive Learn mode through every step, capture each as a transparent frame, save one HTML file. */
export async function exportLearnHtml(nodes: Node<SOVERNNodeData>[], edges: Edge[], deps: Deps = {}): Promise<void> {
  const originalMode = useThemeStore.getState().mode;
  const originalLearnMode = useWorkflowStore.getState().learnMode;
  const originalLearnStep = useWorkflowStore.getState().learnStep;
  try {
    useThemeStore.getState().setMode('dark');
    useWorkflowStore.getState().enterLearnMode();
    await settle();

    const { total } = selectLearnOrder({ nodes, edges });
    const frames: { svg: string; note: string }[] = [];
    for (let k = 1; k <= total; k++) {
      useWorkflowStore.setState({ learnStep: k });
      await settle();
      const svg = await captureCanvasSvg(nodes, { transparent: true });
      const note = selectLearnStepText({ nodes, edges }, k).text;
      frames.push({ svg, note });
    }

    const title = `sovern-learn-${new Date().toISOString().slice(0, 10)}`;
    const html = buildLearnHtml({ frames, title });
    await saveFile(html, `${title}.html`, 'text/html');
    deps.notify?.('Learn HTML exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    // Restore the user's prior state regardless of outcome.
    if (!originalLearnMode) useWorkflowStore.getState().exitLearnMode();
    else useWorkflowStore.setState({ learnStep: originalLearnStep });
    if (useThemeStore.getState().mode !== originalMode) useThemeStore.getState().setMode(originalMode);
  }
}
