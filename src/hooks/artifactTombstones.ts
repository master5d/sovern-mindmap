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

// Session tombstone memory (Task 4): the server-side ledger closes the gap on
// the NEXT poll, but a tick whose GET /api/artifacts was already in flight
// when the tombstone POST fires still carries the artifact — ingestArtifacts
// only adds, so that one lost race is a PERMANENT resurrection. Belt to the
// server filter's suspenders: remember tombstoned ids client-side, in the
// same tick that fires the POST, so ingest can reject them regardless of
// which stale response lands.
const tombstonedIds = new Set<string>();

export function isTombstoned(id: string): boolean {
  return tombstonedIds.has(id);
}

/** Test-only: clear session tombstone memory between test cases. */
export function _resetTombstonedIdsForTests(): void {
  tombstonedIds.clear();
}

/** Fire-and-forget: ledger tombstones for deleted artifact nodes. Silent on
 * failure (same style as the poll) — the node just resurrects on a later poll.
 * Each id is remembered BEFORE the fetch fires (synchronously), so the race
 * window closes at call time, not at response time. */
export function postArtifactTombstones(payloads: TombstonePayload[]): void {
  payloads.forEach((p) => {
    tombstonedIds.add(p.artifactId);
    fetch('/api/artifacts/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }).catch(() => {});
  });
}
