import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore, selectLearnOrder, selectVisibleUpToStep, selectLearnStepText } from './useWorkflowStore';

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

describe('learn mode actions', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      nodes: [n('a'), n('b'), n('c')] as any,
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }],
      learnMode: false,
      learnStep: 1,
    });
  });

  it('enterLearnMode turns it on and resets to step 1', () => {
    useWorkflowStore.setState({ learnStep: 5 });
    useWorkflowStore.getState().enterLearnMode();
    expect(useWorkflowStore.getState().learnMode).toBe(true);
    expect(useWorkflowStore.getState().learnStep).toBe(1);
  });

  it('learnNext advances but clamps at total', () => {
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().learnNext(); // 2
    useWorkflowStore.getState().learnNext(); // 3
    useWorkflowStore.getState().learnNext(); // clamp at 3 (total)
    expect(useWorkflowStore.getState().learnStep).toBe(3);
  });

  it('learnPrev retreats but clamps at 1', () => {
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().learnPrev();
    expect(useWorkflowStore.getState().learnStep).toBe(1);
  });

  it('exitLearnMode leaves nodes and edges untouched', () => {
    const before = useWorkflowStore.getState().nodes;
    useWorkflowStore.getState().enterLearnMode();
    useWorkflowStore.getState().exitLearnMode();
    expect(useWorkflowStore.getState().learnMode).toBe(false);
    expect(useWorkflowStore.getState().nodes).toBe(before); // same reference, no data write
  });
});

describe('selectLearnStepText', () => {
  const nodes = [n('a', { note: 'Begin here.' }), n('b'), n('c')];
  const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'b', target: 'c' }];

  it('returns the current note, current id, and total', () => {
    const r = selectLearnStepText({ nodes, edges }, 1);
    expect(r.text).toBe('Begin here.');
    expect(r.currentId).toBe('a');
    expect(r.total).toBe(3);
  });

  it('falls back to the node label when the step has no note', () => {
    expect(selectLearnStepText({ nodes, edges }, 2).text).toBe('b');
  });

  it('clamps an out-of-range step into bounds', () => {
    expect(selectLearnStepText({ nodes, edges }, 99).currentId).toBe('c');
    expect(selectLearnStepText({ nodes, edges }, 0).currentId).toBe('a');
  });

  it('is safe on an empty canvas', () => {
    const r = selectLearnStepText({ nodes: [], edges: [] }, 1);
    expect(r).toEqual({ text: '', currentId: null, total: 0 });
  });
});
