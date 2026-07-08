import { useMemo, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import type { ArtifactNode as ArtifactNodeType } from '../../types';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkflowStore, withoutHistory } from '../../store/useWorkflowStore';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
};

/** Patches this node's data.status (and optionally exportedTo) without polluting undo history. */
function patchNodeStatus(nodeId: string, patch: Record<string, unknown>): void {
  const { nodes, setNodes } = useWorkflowStore.getState();
  withoutHistory(() => {
    setNodes(
      nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)) as typeof nodes,
    );
  });
}

export function ArtifactNode({ id, data }: NodeProps<ArtifactNodeType>) {
  const resolved = useThemeStore((s) => s.resolved);
  const [exportedTo, setExportedTo] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = data.status ?? 'pending';

  const srcDoc = useMemo(() => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/desops/tokens.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: 'var(--color-primary)',
            secondary: 'var(--color-secondary)',
            accent: 'var(--color-accent)',
            background: 'var(--color-background)',
            surface: 'var(--color-surface)',
            'text-primary': 'var(--color-text-primary)',
            'text-secondary': 'var(--color-text-secondary)',
          },
        },
      },
    };
  </script>
</head>
<body data-theme="${resolved}" class="${resolved === 'dark' ? 'dark ' : ''}p-4 bg-background text-text-primary min-h-screen">
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel" data-type="module">
    ${(data.code || 'const App = () => <div>No code provided</div>;').replace(/<\/script>/gi, '<\\/script>')}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
  </script>
</body>
</html>
    `;
  }, [data.code, resolved]);

  /** POST the review decision; only patch node status after a confirmed ok response. */
  async function decide(e: React.MouseEvent, decision: 'approved' | 'rejected') {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/artifacts/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId: data.artifactId,
          decision,
          name: data.name,
          variant_group: data.variantGroup,
        }),
      });
      if (!res.ok) {
        // server recorded nothing — keep status pending, keep buttons visible
        console.warn(`artifact decision failed: HTTP ${res.status}`);
        setError(`Decision failed (HTTP ${res.status}) — retry`);
        return;
      }

      let newExportedTo: string | undefined;
      if (decision === 'approved' && data.projectDir) {
        try {
          const exportRes = await fetch('/api/artifacts/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artifactId: data.artifactId,
              projectDir: data.projectDir,
              name: data.name ?? data.artifactId,
            }),
          });
          if (exportRes.ok) {
            newExportedTo = (await exportRes.json())?.path;
          } else {
            // decision is already recorded — approve stands, but surface the export failure
            console.warn(`artifact export failed: HTTP ${exportRes.status}`);
            setError('Export failed — approved, not exported');
          }
        } catch (err) {
          console.warn('artifact export failed:', err);
          setError('Export failed — approved, not exported');
        }
      }

      setExportedTo(newExportedTo);
      patchNodeStatus(id, { status: decision, ...(newExportedTo ? { exportedTo: newExportedTo } : {}) });
    } catch (err) {
      // network failure — nothing recorded, keep pending and allow retry
      console.warn('artifact decision failed:', err);
      setError('Decision failed (network) — retry');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-container rounded-xl shadow-lg border border-outline-variant overflow-hidden flex flex-col" style={{ width: 600, height: 400 }}>
      <div
        className="bg-surface-container-highest px-3 py-1 border-b border-outline-variant text-xs font-mono text-on-surface-variant flex items-center justify-between gap-2"
        title={exportedTo ?? data.exportedTo as string | undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[status] ?? STATUS_DOT.pending}`} />
          <span className="truncate">{data.name ?? 'Artifact'}</span>
          {data.variantGroup && (
            <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-[10px] shrink-0">
              {data.variantGroup}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {error && (
            <span className="text-red-500 text-[10px] truncate max-w-48" title={error}>
              {error}
            </span>
          )}
          {status === 'pending' && (
            <>
              <button
                type="button"
                onClick={(e) => decide(e, 'approved')}
                disabled={busy}
                className="nodrag nopan px-2 py-0.5 rounded bg-green-600/20 text-green-500 hover:bg-green-600/30 disabled:opacity-50"
              >
                ✓ Approve
              </button>
              <button
                type="button"
                onClick={(e) => decide(e, 'rejected')}
                disabled={busy}
                className="nodrag nopan px-2 py-0.5 rounded bg-red-600/20 text-red-500 hover:bg-red-600/30 disabled:opacity-50"
              >
                ✗ Reject
              </button>
            </>
          )}
        </div>
      </div>
      <iframe
        srcDoc={srcDoc}
        className="flex-1 w-full h-full bg-white"
        sandbox="allow-scripts"
      />
    </div>
  );
}
