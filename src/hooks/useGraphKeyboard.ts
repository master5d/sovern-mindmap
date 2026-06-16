import { useEffect } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';

/** True when focus is in a text field / contentEditable — keyboard authoring must defer. */
const isTextTarget = (el: Element | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
};

/** Tab=child, Enter=sibling, F2=rename, Delete=remove, Esc=clear/cancel. Canvas views only. */
export function useGraphKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkflowStore.getState();
      if (isTextTarget(document.activeElement)) return;
      const id = s.selectedNodeId;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        useWorkflowStore.temporal.getState().redo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'c' && id && !isTextTarget(document.activeElement)) {
        s.copySubtree(id);
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        s.pasteSubtree(id ?? undefined);
        return;
      }

      if (e.key === 'Tab' && id) {
        e.preventDefault();
        s.beginInlineEdit(s.addChildNode(id));
      } else if (e.key === 'Enter' && id) {
        e.preventDefault();
        s.beginInlineEdit(s.addSiblingNode(id));
      } else if (e.key === 'F2' && id) {
        e.preventDefault();
        s.beginInlineEdit(id);
      } else if (e.key === 'Delete' && id) {
        e.preventDefault();
        const hasChildren = s.edges.some((edge) => edge.source === id);
        if (!hasChildren || window.confirm('Delete this node and all its children?')) {
          s.deleteNodeCascade(id);
        }
      } else if (e.key === 'Escape') {
        s.cancelInlineEdit();
        s.setSelectedNode(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
