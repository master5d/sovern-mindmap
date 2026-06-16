import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkflowStore } from './useWorkflowStore';

const reset = () =>
  useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null, isEditing: false });

describe('edit mode', () => {
  beforeEach(reset);

  it('enterEditMode sets isEditing true, exit sets it false', () => {
    expect(useWorkflowStore.getState().isEditing).toBe(false);
    useWorkflowStore.getState().enterEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(true);
    useWorkflowStore.getState().exitEditMode();
    expect(useWorkflowStore.getState().isEditing).toBe(false);
  });
});
