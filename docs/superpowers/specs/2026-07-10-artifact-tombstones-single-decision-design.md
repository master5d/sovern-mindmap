# Artifact tombstones + single decision-write

**Date:** 2026-07-10
**Status:** approved (brainstorm → this spec)
**Source:** NAUTILUS BACKLOG «DesOps Pipeline v4 backlog» — deleted-node tombstones + double decision-write (both from the Phase 2 final review).

## Problems

1. **Deleted-node resurrection.** The artifact inbox (`.sovern/artifact-inbox.jsonl`)
   is append-only; `ingestArtifacts` dedupes against artifact ids currently on
   the board (`useArtifactInbox.ts` `seenIds`). Deleting an artifact node
   removes its id from the store, so the next 2s poll re-ingests it. Nodes
   cannot be permanently removed from the review board.
2. **Double decision-write on Approve+Export.** Approving an artifact that has
   `projectDir` makes the client POST `/api/artifacts/decision` (writes
   `approved` WITH `variant_group`, no `exportedTo`) and then
   `/api/artifacts/export` (writes a second `approved` WITHOUT
   `variant_group`, WITH `exportedTo`). The MCP tool `read_artifact_decisions`
   filtered by `variantGroup` (src/mcp/server.ts:181) never sees the
   `exportedTo` entry; unfiltered readers see a duplicate.

## Decision

**Tombstones live in the existing decisions ledger** (rejected alternatives:
client-persisted deleted-id list — splits the source of truth, another canvas
resurrects; inbox pruning — rewrites an append-only file and erases decided
artifacts from fresh canvases). **Approve+Export becomes a single ledger
write** performed by `/export`; the plain `/decision` POST remains only for
reject, approve-without-projectDir, and the export-failure fallback.

## Changes

### 1. `src/mcp/artifactInbox.ts`
- `DecisionEntry.decision`: `'approved' | 'rejected' | 'deleted'`.
- `readArtifactsWithDecisions()`: artifacts whose **latest** decision is
  `'deleted'` are **excluded** from the returned array (not annotated). The
  existing latest-wins merge (incl. the exportedTo-preservation rule) is
  otherwise unchanged. Consequence: `GET /api/artifacts` stops serving
  tombstoned artifacts → the poll never re-ingests them and fresh canvases
  never see them.
- `ArtifactWithDecision.decision` stays `'approved' | 'rejected'` — `deleted`
  never reaches the client feed.

### 2. `vite.config.ts` (dev middleware)
- `DECISIONS` gains `'deleted'` (so POST `/decision {decision:'deleted'}`
  validates).
- `/export`'s `appendDecision` call gains
  `variant_group: artifact.variant_group` — the artifact row is already
  loaded two lines above (line ~185); the field is simply dropped today.

### 3. `src/components/nodes/ArtifactNode.tsx` — `decide()`
- `decision === 'approved' && data.projectDir` → call **only** `/export`.
  On `ok`: one complete ledger entry (`approved` + `exportedTo` +
  `variant_group` + `name`), patch node status as today.
- Export failed (HTTP error or network) → **fallback**: POST plain
  `/decision {approved}` to preserve today's "approved, not exported"
  semantics (one entry in the failure path too), surface the same error
  chip as now.
- Reject and approve-without-projectDir: unchanged single `/decision` POST.

### 4. Deletion hook (client)
- When artifact node(s) are removed on the **review board** (React Flow
  deletion path — exact seam located at implementation time in
  `useWorkflowStore`/App; the known zundo gotcha applies: deletion is a
  hand-edit and stays undoable, the tombstone POST is a side-effect, not a
  history event), fire-and-forget POST `/api/artifacts/decision`
  `{artifactId, decision: 'deleted', name, variant_group}`.
- POST failure → node resurrects on a later poll (visible, self-explaining
  degradation; no retry queue — YAGNI).

### Documented edge cases
- **Undo after delete**: the node returns visually (its data is embedded in
  the board), but the server feed no longer carries it. A later Approve on
  such a node appends `approved` after `deleted` — latest-wins makes the
  artifact reappear in the feed, self-healing. Accepted.
- **MCP `read_artifact_decisions`** returns raw ledger rows (now incl.
  `deleted`) — meaningful signal for agents («owner removed it»); no MCP
  change needed.

## Error handling

- All writes remain append-only JSONL via the existing `appendJsonlEntry`;
  corrupt lines are already skipped on read.
- `/decision` validation covers the new verdict via the `DECISIONS` array —
  no new validation branch.
- Client deletion POST is try/catch-silent (same style as the poll fetch).

## Time Estimate

| Step | Scope | T_model | T_glue |
|---|---|---|---|
| Ledger + middleware | types, filter, DECISIONS, export variant_group (TDD) | 0:20–0:40 | 0:03–0:05 |
| Client | decide() branching + deletion hook + tests | 0:30–1:00 | 0:05–0:10 |
| Smoke | live dev-server: delete→no-resurrect, approve+export→one entry | 0:10–0:20 | 0:05–0:10 |

<!-- gte {"t_model": [60, 120], "t_glue": [13, 25], "total": [73, 145]} -->

## Testing

- `artifactInbox.test.ts`: tombstone hides the artifact from
  `readArtifactsWithDecisions`; `approved` after `deleted` brings it back
  (latest-wins); existing exportedTo-preservation cases stay green.
- Middleware/export: the export decision write carries `variant_group`
  (extend the existing export test pattern).
- Client: unit test on the new `decide()` branching (export-only happy path;
  fallback `/decision` on export failure) and on the deletion→POST hook,
  following the existing component/store test patterns.
- Live smoke on the dev server (port 1420 pinned): delete a pending artifact →
  stays gone across polls and reload; approve an artifact with projectDir →
  exactly one new ledger line with all fields.

## Non-goals

- No retry queue for failed tombstone POSTs.
- No MCP tool changes.
- No inbox compaction/pruning.
- No UI for "show deleted artifacts".
