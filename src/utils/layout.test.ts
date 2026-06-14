import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { getTreeLayout, getLaneLayout, LANE_HEIGHT } from './layout';

const n = (id: string, layer: string): Node => ({
  id, type: 'sovern', position: { x: 0, y: 0 }, data: { label: id, layer },
});
const e = (s: string, t: string): Edge => ({ id: `${s}-${t}`, source: s, target: t });

describe('getTreeLayout', () => {
  it('locks nodes and places parent above child', () => {
    const { nodes } = getTreeLayout([n('root', 'human'), n('child', 'boss')], [e('root', 'child')]);
    const root = nodes.find((x) => x.id === 'root')!;
    const child = nodes.find((x) => x.id === 'child')!;
    expect(root.draggable).toBe(false);
    expect(child.draggable).toBe(false);
    expect(root.position.y).toBeLessThan(child.position.y);
  });
});

describe('getLaneLayout', () => {
  const graph = [n('a', 'boss'), n('b', 'coding'), n('c', 'coding'), n('d', 'tools')];
  const edges = [e('a', 'b'), e('b', 'c'), e('a', 'd')];

  it('creates one lane node per distinct layer, in first-appearance order', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const lanes = nodes.filter((x) => x.type === 'lane');
    expect(lanes.map((x) => x.id)).toEqual(['lane_boss', 'lane_coding', 'lane_tools']);
    expect(lanes.map((x) => x.position.y)).toEqual([0, LANE_HEIGHT, LANE_HEIGHT * 2]);
  });

  it('keeps content nodes inside their lane row', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const c = nodes.find((x) => x.id === 'c')!;
    expect(c.position.y).toBeGreaterThanOrEqual(LANE_HEIGHT);
    expect(c.position.y).toBeLessThan(LANE_HEIGHT * 2);
  });

  it('orders dependencies left-to-right', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const x = (id: string) => nodes.find((nn) => nn.id === id)!.position.x;
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
  });

  it('separates same-lane same-rank collisions horizontally', () => {
    // b и c в одном layer и одном dagre-ранге (оба дети a)
    const g = [n('a', 'boss'), n('b', 'coding'), n('c', 'coding')];
    const ed = [e('a', 'b'), e('a', 'c')];
    const { nodes } = getLaneLayout(g, ed);
    const xs = nodes.filter((x) => x.type !== 'lane' && (x.data as any).layer === 'coding')
      .map((x) => x.position.x).sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(280);
  });

  it('ignores pre-existing lane nodes in input', () => {
    const withLane = [...graph, { id: 'lane_boss', type: 'lane', position: { x: 0, y: 0 }, data: { label: 'boss' } } as Node];
    const { nodes } = getLaneLayout(withLane, edges);
    expect(nodes.filter((x) => x.id === 'lane_boss')).toHaveLength(1);
  });
});
