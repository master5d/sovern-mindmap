import { describe, it, expect } from 'vitest';
import { selectLearnOrder, selectVisibleUpToStep } from './useWorkflowStore';

const n = (id: string, extra: any = {}) => ({
  id, type: 'sovern', position: { x: 0, y: 0 },
  data: { label: id, layer: 'projects', status: 'idle', ...extra },
});

describe('selectLearnOrder', () => {
  it('orders by BFS from the single root when no steps are set', () => {
    const nodes = [n('c'), n('a'), n('b')]; // array order deliberately not BFS order
    const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];
    const { order, total } = selectLearnOrder({ nodes, edges });
    expect(order).toEqual(['a', 'b', 'c']);
    expect(total).toBe(3);
  });

  it('handles multiple roots deterministically (by array order)', () => {
    const nodes = [n('a'), n('x'), n('b')];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    // a and x are both roots (in-degree 0); a precedes x in the array.
    expect(selectLearnOrder({ nodes, edges }).order).toEqual(['a', 'b', 'x']);
  });

  it('respects explicit step order over graph order', () => {
    const nodes = [n('a', { step: 3 }), n('b', { step: 1 }), n('c', { step: 2 })];
    const edges: any[] = [];
    expect(selectLearnOrder({ nodes, edges }).order).toEqual(['b', 'c', 'a']);
  });

  it('puts stepped nodes first, then unstepped in BFS order', () => {
    const nodes = [n('a'), n('b', { step: 1 }), n('c')];
    const edges = [{ id: 'e1', source: 'a', target: 'c' }];
    const { order } = selectLearnOrder({ nodes, edges });
    expect(order[0]).toBe('b');           // the only stepped node leads
    expect(order.slice(1)).toEqual(['a', 'c']); // rest in BFS order
  });

  it('terminates and is deterministic on a pure cycle', () => {
    const nodes = [n('a'), n('b')];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'a' }];
    const { order, total } = selectLearnOrder({ nodes, edges });
    expect(total).toBe(2);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
  });
});

describe('selectVisibleUpToStep', () => {
  it('returns the cumulative prefix of the order', () => {
    expect([...selectVisibleUpToStep(['a', 'b', 'c'], 2)]).toEqual(['a', 'b']);
  });
  it('clamps a non-positive step to empty', () => {
    expect(selectVisibleUpToStep(['a', 'b'], 0).size).toBe(0);
  });
});
