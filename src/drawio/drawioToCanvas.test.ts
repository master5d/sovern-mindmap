import { describe, it, expect } from 'vitest';
import { drawioToCanvas } from './drawioToCanvas';
import { DrawioParseError } from './errors';

const MODEL = `
<mxGraphModel><root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="2" value="&lt;b&gt;Start&lt;/b&gt;" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="40" y="80" width="120" height="60" as="geometry"/>
  </mxCell>
  <mxCell id="3" value="DB" style="shape=cylinder3;" vertex="1" parent="1">
    <mxGeometry x="240" y="80" width="100" height="80" as="geometry"/>
  </mxCell>
  <mxCell id="4" value="saves" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3"/>
  <mxCell id="5" value="dangling" edge="1" parent="1" source="2" target="999"/>
</root></mxGraphModel>`;

describe('drawioToCanvas', () => {
  it('maps vertices to nodes with shape, label, and geometry', () => {
    const c = drawioToCanvas(MODEL);
    const start = c.nodes.find((n) => n.id === '2')!;
    expect(start.text).toBe('Start');                 // HTML stripped
    expect(start.metadata!['mm:shape']).toBe('rounded');
    expect([start.x, start.y, start.width, start.height]).toEqual([40, 80, 120, 60]);
    const db = c.nodes.find((n) => n.id === '3')!;
    expect(db.metadata!['mm:shape']).toBe('cylinder');
  });

  it('skips structural cells 0 and 1', () => {
    const c = drawioToCanvas(MODEL);
    expect(c.nodes.map((n) => n.id).sort()).toEqual(['2', '3']);
  });

  it('keeps a valid edge and drops one with a dangling endpoint', () => {
    const c = drawioToCanvas(MODEL);
    expect(c.edges).toHaveLength(1);
    expect(c.edges[0]).toMatchObject({ fromNode: '2', toNode: '3', label: 'saves' });
  });

  it('throws DrawioParseError when there is no <mxGraphModel>', () => {
    expect(() => drawioToCanvas('<foo/>')).toThrow(DrawioParseError);
  });
});
