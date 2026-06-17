import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData, ShapeKind } from '../types';
import { mapShapeToDrawioStyle } from './mxStyle';

/** Escape the five XML metacharacters for safe inclusion in attribute values. */
function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/** Serialize the canvas to an uncompressed .drawio (mxGraph) document string. */
export function canvasToDrawio(nodes: Node<SOVERNNodeData>[], edges: Edge[]): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];

  for (const n of nodes) {
    const shape = (n.data?.shape ?? 'rectangle') as ShapeKind;
    const style = mapShapeToDrawioStyle(shape);
    const x = Math.round(n.position?.x ?? 0);
    const y = Math.round(n.position?.y ?? 0);
    const w = Math.round(n.measured?.width ?? (n as any).width ?? 120);
    const h = Math.round(n.measured?.height ?? (n as any).height ?? 60);
    const value = escapeXml(n.data?.label ?? '');
    cells.push(
      `<mxCell id="${escapeXml(n.id)}" value="${value}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`,
    );
  }

  for (const e of edges) {
    const value = escapeXml((e.label as string) ?? '');
    cells.push(
      `<mxCell id="${escapeXml(e.id)}" value="${value}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;" edge="1" parent="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}">` +
        `<mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  }

  return (
    `<mxfile host="sovern-mindmap"><diagram id="sovern" name="Page-1">` +
    `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1">` +
    `<root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`
  );
}
