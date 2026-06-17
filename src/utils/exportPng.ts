import { toPng } from 'html-to-image';
import { Node } from '@xyflow/react';
import { computeExportViewport } from '../export/fitViewport';
import { saveFile } from '../export/saveFile';

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

const fileName = (view: string) => `sovern-${view}-${new Date().toISOString().slice(0, 10)}.png`;

const dataUrlToBytes = (dataUrl: string) =>
  Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));

/** mindmap/diagram: whole graph fit-to-content (React Flow recipe). */
export async function exportCanvasPng(nodes: Node[], view: string) {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const { width, height, pixelRatio, viewport } = computeExportViewport(nodes);
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
  await saveFile(dataUrlToBytes(dataUrl), fileName(view), 'image/png');
}

/** kanban/matrix/timeline: snapshot of the view's DOM container. */
export async function exportDomViewPng(view: string) {
  const el = document.querySelector('[data-export-root]') as HTMLElement | null;
  if (!el) throw new Error('view container not found');
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bgColor() });
  await saveFile(dataUrlToBytes(dataUrl), fileName(view), 'image/png');
}
