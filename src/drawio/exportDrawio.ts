import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { canvasToDrawio } from './canvasToDrawio';
import { saveFile } from '../export/saveFile';

interface Deps {
  notify?: (message: string) => void;
}

/** Serialize the canvas to a .drawio file and save it. */
export async function exportDrawio(nodes: Node<SOVERNNodeData>[], edges: Edge[], deps: Deps = {}): Promise<void> {
  try {
    const xml = canvasToDrawio(nodes, edges);
    const name = `sovern-${new Date().toISOString().slice(0, 10)}.drawio`;
    await saveFile(xml, name, 'application/xml');
    deps.notify?.('.drawio exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  }
}
