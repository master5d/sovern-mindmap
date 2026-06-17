import { getNodesBounds, getViewportForBounds, Node } from '@xyflow/react';

const MAX_DIM = 8192; // px, cap on the larger side of the exported image

/** Fit-to-content size + viewport for exporting the whole graph (shared by PNG/HTML). */
export function computeExportViewport(nodes: Node[]) {
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + 80);
  const height = Math.ceil(bounds.height + 80);
  const pixelRatio = Math.min(2, MAX_DIM / Math.max(width, height));
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0.04);
  return { width, height, pixelRatio, viewport };
}
