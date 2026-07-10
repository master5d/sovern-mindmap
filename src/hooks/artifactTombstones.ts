// Deletion tombstones (Task 3): a user deleting an artifact node on the review
// board is a decision — record it server-side so the 2s poll doesn't
// resurrect it on the next tick. Kept store-free (no import of
// useWorkflowStore) so both useWorkflowStore.ts and useArtifactInbox.ts can
// import this module without an import cycle (useArtifactInbox.ts already
// imports from useWorkflowStore.ts).
import { Node } from '@xyflow/react';

export interface TombstonePayload {
  artifactId: string;
  decision: 'deleted';
  name?: string;
  variant_group?: string;
}

/** Pure half: map React Flow remove-changes to tombstone POST payloads for
 * artifact nodes. Runs against the PRE-apply node list (data still present). */
export function artifactTombstonePayloads(
  nodes: Node[],
  changes: { type: string; id?: string }[],
): TombstonePayload[] {
  const removed = new Set(changes.filter((c) => c.type === 'remove' && c.id).map((c) => c.id as string));
  if (removed.size === 0) return [];
  return nodes
    .filter((n) => removed.has(n.id) && n.type === 'artifact' && typeof (n.data as any)?.artifactId === 'string')
    .map((n) => ({
      artifactId: (n.data as any).artifactId as string,
      decision: 'deleted' as const,
      name: (n.data as any).name,
      variant_group: (n.data as any).variantGroup,
    }));
}

/** Fire-and-forget: ledger tombstones for deleted artifact nodes. Silent on
 * failure (same style as the poll) — the node just resurrects on a later poll. */
export function postArtifactTombstones(payloads: TombstonePayload[]): void {
  payloads.forEach((p) => {
    fetch('/api/artifacts/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }).catch(() => {});
  });
}
