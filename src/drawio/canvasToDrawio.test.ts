import { describe, it, expect } from 'vitest';
import { canvasToDrawio } from './canvasToDrawio';
import { extractMxGraphModel } from './inflate';
import { drawioToCanvas } from './drawioToCanvas';

const shapeNode = (id: string, x: number, y: number, shape: string, label = id) => ({
  id, type: 'shape', position: { x, y }, measured: { width: 120, height: 60 },
  data: { label, layer: 'projects', status: 'idle', shape },
});

describe('canvasToDrawio', () => {
  it('emits the mxfile/mxGraphModel/root frame and structural cells', () => {
    const xml = canvasToDrawio([], []);
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('<root>');
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  it('emits a vertex per node with mapped style and geometry', () => {
    const nodes = [{
      id: 'n1', type: 'sovern', position: { x: 10, y: 20 }, measured: { width: 150, height: 60 },
      data: { label: 'Task', layer: 'coding', status: 'idle' }, // no shape → rectangle
    }];
    const xml = canvasToDrawio(nodes as any, []);
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('value="Task"');
    expect(xml).toContain('x="10" y="20" width="150" height="60"');
    expect(xml).toContain('style="whiteSpace=wrap;html=1;"'); // rectangle fallback
  });

  it('emits an edge cell per edge', () => {
    const nodes = [shapeNode('a', 0, 0, 'rectangle'), shapeNode('b', 200, 0, 'rectangle')];
    const xml = canvasToDrawio(nodes as any, [{ id: 'e1', source: 'a', target: 'b', label: 'flows' }] as any);
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
    expect(xml).toContain('value="flows"');
  });

  it('escapes XML special chars in labels', () => {
    const nodes = [shapeNode('n1', 0, 0, 'rectangle', '<b>A & "B"</b>')];
    const xml = canvasToDrawio(nodes as any, []);
    expect(xml).toContain('&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;');
    expect(xml).not.toContain('value="<b>');
  });

  it('round-trips through the real import pipeline (export ↔ import symmetry)', async () => {
    const nodes = [
      shapeNode('a', 40, 80, 'rounded', 'Start'),
      { id: 'b', type: 'shape', position: { x: 240, y: 80 }, measured: { width: 100, height: 80 },
        data: { label: 'DB', layer: 'projects', status: 'idle', shape: 'cylinder' } },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b', label: 'save' }];
    const canvas = drawioToCanvas(await extractMxGraphModel(canvasToDrawio(nodes as any, edges as any)));

    const a = canvas.nodes.find((n) => n.id === 'a')!;
    expect(a.text).toBe('Start');
    expect(a.metadata!['mm:shape']).toBe('rounded');
    expect([a.x, a.y, a.width, a.height]).toEqual([40, 80, 120, 60]);
    const b = canvas.nodes.find((n) => n.id === 'b')!;
    expect(b.metadata!['mm:shape']).toBe('cylinder');
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges[0]).toMatchObject({ fromNode: 'a', toNode: 'b', label: 'save' });
  });
});
