import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { ingestArtifacts } from './useArtifactInbox';

const entry = (id: string, g?: string) => ({ id, ts: '2026-07-07', code: 'const App=()=>null;', name: id, variant_group: g });

describe('ingestArtifacts', () => {
  beforeEach(() => useWorkflowStore.getState().setNodes([]));

  it('adds artifact node with pending status', () => {
    ingestArtifacts([entry('a1')]);
    const n = useWorkflowStore.getState().nodes.find(n => (n.data as any).artifactId === 'a1');
    expect(n?.type).toBe('artifact');
    expect((n?.data as any).status).toBe('pending');
  });

  it('dedupes by artifactId', () => {
    ingestArtifacts([entry('a1')]); ingestArtifacts([entry('a1')]);
    expect(useWorkflowStore.getState().nodes.filter(n => (n.data as any).artifactId === 'a1')).toHaveLength(1);
  });

  it('lays out variant group in a row', () => {
    ingestArtifacts([entry('v1', 'g'), entry('v2', 'g'), entry('v3', 'g')]);
    const xs = useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === 'g').map(n => n.position.x);
    expect(new Set(xs).size).toBe(3);
    const ys = useWorkflowStore.getState().nodes.filter(n => (n.data as any).variantGroup === 'g').map(n => n.position.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('does not pollute undo history', () => {
    const before = (useWorkflowStore as any).temporal.getState().pastStates.length;
    ingestArtifacts([entry('a2')]);
    expect((useWorkflowStore as any).temporal.getState().pastStates.length).toBe(before);
  });
});
