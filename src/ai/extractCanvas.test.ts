import { describe, it, expect } from 'vitest';
import { extractCanvas, DiagramParseError } from './extractCanvas';

describe('extractCanvas', () => {
  it('parses a clean JSON Canvas object', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}';
    const c = extractCanvas(raw);
    expect(c.nodes).toHaveLength(1);
    expect(c.nodes[0].id).toBe('a');
  });

  it('strips markdown code fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}\n```\nEnjoy!';
    expect(extractCanvas(raw).nodes[0].id).toBe('a');
  });

  it('repairs missing ids, positions, and sizes', () => {
    const raw = '{"nodes":[{"text":"A"}],"edges":[]}';
    const n = extractCanvas(raw).nodes[0];
    expect(typeof n.id).toBe('string');
    expect(n.id.length).toBeGreaterThan(0);
    expect(n.x).toBe(0); expect(n.y).toBe(0);
    expect(n.width).toBeGreaterThan(0); expect(n.height).toBeGreaterThan(0);
    expect(n.type).toBe('text');
  });

  it('coerces an unknown mm:shape to rectangle', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:shape":"hexagon"}}],"edges":[]}';
    expect(extractCanvas(raw).nodes[0].metadata!['mm:shape']).toBe('rectangle');
  });

  it('drops edges whose endpoints do not exist', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[{"id":"e1","fromNode":"a","toNode":"ghost"}]}';
    expect(extractCanvas(raw).edges).toHaveLength(0);
  });

  it('keeps a valid edge and generates a missing edge id', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"},{"id":"b","type":"text","x":0,"y":0,"width":150,"height":60,"text":"B"}],"edges":[{"fromNode":"a","toNode":"b","label":"yes"}]}';
    const e = extractCanvas(raw).edges;
    expect(e).toHaveLength(1);
    expect(typeof e[0].id).toBe('string');
    expect(e[0].label).toBe('yes');
  });

  it('throws DiagramParseError on non-JSON', () => {
    expect(() => extractCanvas('I cannot draw that.')).toThrow(DiagramParseError);
  });

  it('skips/ignores non-object nodes without throwing', () => {
    const raw = '{"nodes":[null,5,{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}';
    const c = extractCanvas(raw);
    // every produced node is valid (string id, finite geometry)
    expect(c.nodes.every((n) => typeof n.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.width))).toBe(true);
    expect(c.nodes.some((n) => n.text === 'A')).toBe(true);
  });

  it('coerces a numeric node id to a generated string id', () => {
    const raw = '{"nodes":[{"id":42,"type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}';
    const n = extractCanvas(raw).nodes[0];
    expect(typeof n.id).toBe('string');
    expect(n.id).not.toBe('42');
  });

  it('throws DiagramParseError when the root JSON is an array', () => {
    expect(() => extractCanvas('[1,2,3]')).toThrow(DiagramParseError);
  });

  it('does not spread a primitive metadata into indexed keys', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":"hexagon"}],"edges":[]}';
    const md = extractCanvas(raw).nodes[0].metadata!;
    expect(md['0']).toBeUndefined();
  });
});
