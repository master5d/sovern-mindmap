import { toSvg } from 'html-to-image';
import { Node } from '@xyflow/react';
import { computeExportViewport } from './fitViewport';

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

/** Capture the whole graph as a self-contained inline SVG markup string. */
export async function captureCanvasSvg(nodes: Node[], opts?: { transparent?: boolean }): Promise<string> {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const { width, height, viewport } = computeExportViewport(nodes);
  const dataUrl = await toSvg(el, {
    width,
    height,
    backgroundColor: opts?.transparent ? undefined : bgColor(),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  // toSvg → "data:image/svg+xml;charset=utf-8,<urlencoded svg>"; recover the raw markup.
  const comma = dataUrl.indexOf(',');
  return decodeURIComponent(dataUrl.slice(comma + 1));
}
