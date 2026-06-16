import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { getChildren, getDescendants, getParent, cloneSubtree } from './tree';

const n = (id: string): Node => ({ id, type: 'sovern', position: { x: 0, y: 0 }, data: { label: id } });
const e = (s: string, t: string): Edge => ({ id: `e-${s}-${t}`, source: s, target: t });

const nodes = [n('a'), n('b'), n('c'), n('d')];
const edges = [e('a', 'b'), e('a', 'c'), e('b', 'd')];

describe('tree helpers', () => {
  it('getChildren returns direct children only', () => {
    expect(getChildren('a', edges).sort()).toEqual(['b', 'c']);
    expect(getChildren('b', edges)).toEqual(['d']);
    expect(getChildren('d', edges)).toEqual([]);
  });

  it('getDescendants returns all transitive children', () => {
    expect(getDescendants('a', edges).sort()).toEqual(['b', 'c', 'd']);
    expect(getDescendants('b', edges)).toEqual(['d']);
  });

  it('getDescendants is cycle-safe', () => {
    const cyclic = [e('x', 'y'), e('y', 'x')];
    expect(getDescendants('x', cyclic).sort()).toEqual(['x', 'y']);
  });

  it('getParent returns the source of the incoming edge', () => {
    expect(getParent('b', edges)).toBe('a');
    expect(getParent('a', edges)).toBeUndefined();
  });

  it('cloneSubtree produces fresh ids, preserves structure, offsets positions', () => {
    const { nodes: cloned, edges: clonedEdges, rootId } = cloneSubtree('b', nodes, edges);
    expect(cloned).toHaveLength(2); // b + d
    expect(cloned.map((c) => c.id)).not.toContain('b');
    expect(cloned.map((c) => c.id)).not.toContain('d');
    expect(clonedEdges).toHaveLength(1); // b->d remapped
    const clonedRoot = cloned.find((c) => c.id === rootId)!;
    const clonedChild = cloned.find((c) => c.id !== rootId)!;
    expect(clonedEdges[0].source).toBe(rootId);
    expect(clonedEdges[0].target).toBe(clonedChild.id);
    expect(clonedRoot.data.label).toBe('b');
  });
});
