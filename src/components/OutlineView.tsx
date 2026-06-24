import { useWorkflowStore } from '../store/useWorkflowStore';
import { selectOutlineRows, outlineToMarkdown } from '../utils/outline';
import { saveFile } from '../export/saveFile';
import { Copy, FileDown } from 'lucide-react';

/** Read-only linear Markdown document of the graph (roots = headings, descendants = bullets). */
export function OutlineView({ notify }: { notify: (msg: string) => void }) {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const rows = selectOutlineRows({ nodes, edges });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(outlineToMarkdown(rows));
      notify('Outline copied');
    } catch {
      notify('⚠ copy failed');
    }
  };
  const onSave = async () => {
    try {
      await saveFile(outlineToMarkdown(rows), 'outline.md', 'text/markdown');
    } catch (e) {
      notify(`⚠ save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="absolute inset-0 bg-canvas z-10 overflow-y-auto custom-scrollbar pt-32 px-8 pb-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end gap-2 mb-4">
          <button onClick={onCopy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-edge text-secondary hover:text-primary text-xs font-bold">
            <Copy size={14} /> Copy
          </button>
          <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-edge text-secondary hover:text-accent text-xs font-bold">
            <FileDown size={14} /> Save .md
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="text-center text-muted text-sm py-20">Nothing to outline yet</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r) =>
              r.isRoot ? (
                <div key={r.id} className="pt-5">
                  <div className="text-lg font-black text-primary">{r.label}</div>
                  {r.note && <div className="text-xs italic text-muted mt-0.5">{r.note}</div>}
                </div>
              ) : (
                <div key={r.id} style={{ paddingLeft: `${(r.depth - 1) * 1.5 + 0.5}rem` }}>
                  <div className="text-sm text-secondary leading-relaxed">• {r.label}</div>
                  {r.note && <div className="text-xs italic text-muted" style={{ paddingLeft: '1rem' }}>{r.note}</div>}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
