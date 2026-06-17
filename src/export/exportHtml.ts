import { Node } from '@xyflow/react';
import { useThemeStore } from '../store/useThemeStore';
import { captureCanvasSvg } from './captureCanvasSvg';
import { buildInteractiveHtml } from './htmlTemplate';
import { saveFile } from './saveFile';

/** Wait two animation frames so a theme switch fully re-renders + repaints before capture. */
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface Deps {
  notify?: (message: string) => void;
}

/** Capture the canvas in both themes and save one self-contained interactive HTML file. */
export async function exportHtml(nodes: Node[], deps: Deps = {}): Promise<void> {
  const original = useThemeStore.getState().mode;
  try {
    useThemeStore.getState().setMode('light');
    await settle();
    const lightSvg = await captureCanvasSvg(nodes);

    useThemeStore.getState().setMode('dark');
    await settle();
    const darkSvg = await captureCanvasSvg(nodes);

    const title = `sovern-${new Date().toISOString().slice(0, 10)}`;
    const html = buildInteractiveHtml({ lightSvg, darkSvg, title });
    await saveFile(html, `${title}.html`, 'text/html');
    deps.notify?.('HTML exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    // Always restore the user's theme, even if capture failed mid-way.
    if (useThemeStore.getState().mode !== original) useThemeStore.getState().setMode(original);
  }
}
