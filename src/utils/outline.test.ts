import { describe, it, expect } from 'vitest';
import { selectOutlineRows, outlineToMarkdown } from './outline';

const N = (id: string, label: string, extra: any = {}) =>
  ({ id, type: 'sovern', position: { x: 0, y: 0 }, data: { label, layer: 'projects', status: 'idle', ...extra } });
const E = (s: string, t: string) => ({ id: `e-${s}-${t}`, source: s, target: t });

describe('selectOutlineRows', () => {
  it('emits DFS pre-order: a parent immediately precedes its subtree (not BFS)', () => {
    const nodes = [N('root', 'Root'), N('a', 'A'), N('a1', 'A1'), N('b', 'B')] as any;
    const edges = [E('root', 'a'), E('a', 'a1'), E('root', 'b')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id)).toEqual(['root', 'a', 'a1', 'b']); // BFS would be root,a,b,a1
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
    expect(rows[0].isRoot).toBe(true);
    expect(rows[1].isRoot).toBe(false);
  });

  it('treats each in-degree-0 node as its own root, in array order', () => {
    const nodes = [N('r1', 'R1'), N('r2', 'R2'), N('c', 'C')] as any;
    const edges = [E('r1', 'c')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id)).toEqual(['r1', 'c', 'r2']);
    expect(rows.filter((r) => r.isRoot).map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('excludes lane nodes', () => {
    const nodes = [{ ...N('lane', 'Lane'), type: 'lane' }, N('root', 'Root')] as any;
    const rows = selectOutlineRows({ nodes, edges: [] });
    expect(rows.map((r) => r.id)).toEqual(['root']);
  });

  it('terminates on an isolated cycle and emits every node once (totality sweep)', () => {
    const nodes = [N('x', 'X'), N('y', 'Y')] as any;
    const edges = [E('x', 'y'), E('y', 'x')];
    const rows = selectOutlineRows({ nodes, edges });
    expect(rows.map((r) => r.id).sort()).toEqual(['x', 'y']);
    expect(rows.length).toBe(2);
  });

  it('carries a non-empty note and drops blank ones', () => {
    const nodes = [N('root', 'Root', { note: 'the seed' }), N('b', 'B', { note: '  ' })] as any;
    const rows = selectOutlineRows({ nodes, edges: [E('root', 'b')] });
    expect(rows[0].note).toBe('the seed');
    expect(rows[1].note).toBeUndefined();
  });

  it('returns [] for an empty graph', () => {
    expect(selectOutlineRows({ nodes: [], edges: [] })).toEqual([]);
  });
});

describe('outlineToMarkdown', () => {
  it('renders roots as headings and descendants as 2-space-per-level bullets', () => {
    const nodes = [N('root', 'Root'), N('a', 'A'), N('a1', 'A1'), N('b', 'B')] as any;
    const edges = [E('root', 'a'), E('a', 'a1'), E('root', 'b')];
    const md = outlineToMarkdown(selectOutlineRows({ nodes, edges }));
    expect(md).toBe('# Root\n- A\n  - A1\n- B');
  });

  it('blank-lines between root sections and renders a note italic', () => {
    const nodes = [N('r1', 'R1', { note: 'first' }), N('r2', 'R2')] as any;
    const md = outlineToMarkdown(selectOutlineRows({ nodes, edges: [] }));
    expect(md).toBe('# R1\n_first_\n\n# R2');
  });
});
