import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, Node } from '@xyflow/react';

const MAX_DIM = 8192; // px, кап большей стороны итогового изображения
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

const fileName = (view: string) => `sovern-${view}-${new Date().toISOString().slice(0, 10)}.png`;

async function savePng(dataUrl: string, name: string) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return;
    const base64 = dataUrl.split(',')[1];
    await writeFile(path, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  } else {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    a.click();
  }
}

/** mindmap/diagram: весь граф fit-to-content (рецепт React Flow). */
export async function exportCanvasPng(nodes: Node[], view: string) {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + 80);
  const height = Math.ceil(bounds.height + 80);
  const pixelRatio = Math.min(2, MAX_DIM / Math.max(width, height));
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0.04);

  const dataUrl = await toPng(el, {
    width,
    height,
    pixelRatio,
    backgroundColor: bgColor(),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  await savePng(dataUrl, fileName(view));
}

/** kanban/matrix/timeline: снимок DOM-контейнера вью. */
export async function exportDomViewPng(view: string) {
  const el = document.querySelector('[data-export-root]') as HTMLElement | null;
  if (!el) throw new Error('view container not found');
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bgColor() });
  await savePng(dataUrl, fileName(view));
}
