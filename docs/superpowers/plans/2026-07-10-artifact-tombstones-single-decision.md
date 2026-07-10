# Artifact Tombstones + Single Decision-Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deleted artifact nodes stay deleted (ledger tombstones) and Approve+Export writes exactly one complete decision entry.

**Architecture:** Third verdict `'deleted'` in the existing decisions JSONL; `readArtifactsWithDecisions` filters latest-deleted out of the feed. Client: `/export` becomes the sole write on approve-with-projectDir (server adds `variant_group`), plain `/decision` stays for reject / no-projectDir / export-failure fallback; node deletion on the review board fires a tombstone POST.

**Tech Stack:** TypeScript, vitest, React 18 (`createRoot` + `act` test pattern), vite dev middleware, zustand.

**Spec:** `docs/superpowers/specs/2026-07-10-artifact-tombstones-single-decision-design.md`

## Global Constraints

- Repo: `C:/telo/Efforts/On/MindMapping/sovern-mindmap`, branch `master` (trunk convention).
- Tests: `npx vitest run <file>` per file; full suite `npm test`. Whole suite stays green after every task.
- `withoutHistory` semantics preserved: tombstone POST is a side-effect, never an undo-history event; node deletion itself STAYS undoable (do not wrap the existing remove-change application differently).
- `sweepUserBoardArtifacts` and `stripArtifactContent` must NOT tombstone — sweep is hygiene, not user intent (they bypass `onNodesChange`, so this holds automatically; do not add tombstone calls there).
- `ArtifactWithDecision.decision` stays `'approved' | 'rejected'` on the wire — `deleted` never reaches the client feed.
- Commit only your own files; the tree may carry unrelated changes (`decks/`, `diagrams/` untracked dirs — leave them).

## Time Estimate

| Task | Scope | T_model | T_glue |
|---|---|---|---|
| 1 | ledger tombstone filter + middleware (TDD) | 0:20–0:40 | 0:03–0:05 |
| 2 | decide() single-write (TDD) | 0:20–0:40 | 0:03–0:05 |
| 3 | deletion tombstone hook (TDD) | 0:15–0:30 | 0:02–0:05 |
| 4 | live smoke + push | 0:10–0:20 | 0:05–0:10 |

<!-- gte {"t_model": [65, 130], "t_glue": [13, 25], "total": [78, 155]} -->

## Key context for the implementer

- `src/mcp/artifactInbox.ts`: JSONL ledger, `DecisionEntry.decision: 'approved' | 'rejected'`, `readArtifactsWithDecisions()` merges latest decision per artifactId (with an exportedTo-preservation rule) and ANNOTATES artifacts — it never filters today.
- `vite.config.ts:70` `const DECISIONS = ['approved', 'rejected'];` validates POST `/api/artifacts/decision`. `/export` handler (~line 139–216) loads `artifact` at line ~185 and calls `appendDecision({artifactId, decision:'approved', name, exportedTo: finalPath})` — dropping `artifact.variant_group`.
- `src/components/nodes/ArtifactNode.tsx` `decide()` (~line 73): POSTs `/decision`; then, if `approved && data.projectDir`, POSTs `/export`. Two ledger writes.
- `src/store/useWorkflowStore.ts:174` `onNodesChange`: React Flow deletion arrives as `change.type === 'remove'` BEFORE `applyNodeChanges` — node data is still in `get().nodes` at that point. `deleteNodeCascade` (line 267) bypasses `onNodesChange` (mind-map tree deletes; check its call sites — if artifact nodes are unreachable from it, leave it alone and say so in the report).
- Test patterns: `src/mcp/artifactInbox.test.ts` (tmpdir via `SOVERN_ARTIFACT_DIR`, dynamic `await import`), `src/components/nodes/ArtifactNode.test.tsx` (`createRoot`+`act`, `makeProps`, fetch mocking with `vi`).
- Review-board check: `useWorkflowStore.getState().boards.find(b => b.id === activeBoardId)?.kind === 'review'`.

---

### Task 1: ledger tombstone filter + middleware

**Files:**
- Modify: `src/mcp/artifactInbox.ts` (DecisionEntry type; `readArtifactsWithDecisions`)
- Modify: `vite.config.ts` (line 70 `DECISIONS`; `/export` appendDecision)
- Test: `src/mcp/artifactInbox.test.ts` (append cases)

**Interfaces:**
- Produces: `DecisionEntry.decision: 'approved' | 'rejected' | 'deleted'`; `readArtifactsWithDecisions()` EXCLUDES artifacts whose latest decision is `'deleted'`. POST `/decision {decision:'deleted'}` validates. Export write carries `variant_group`.

- [ ] **Step 1: Write the failing tests** (append to `artifactInbox.test.ts` inside the existing `describe`)

```typescript
  it('tombstone: latest deleted hides the artifact from the feed', async () => {
    const { appendArtifact, appendDecision, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Doomed', variant_group: 'g1' });
    const b = appendArtifact({ code: 'const App=()=>null;', name: 'Alive' });
    appendDecision({ artifactId: a.id, decision: 'deleted', variant_group: 'g1' });
    const rows = readArtifactsWithDecisions();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(b.id);
  });

  it('tombstone: approved AFTER deleted resurrects (latest-wins)', async () => {
    const { appendArtifact, appendDecision, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Undone' });
    appendDecision({ artifactId: a.id, decision: 'deleted' });
    appendDecision({ artifactId: a.id, decision: 'approved' });
    const rows = readArtifactsWithDecisions();
    expect(rows).toHaveLength(1);
    expect(rows[0].decision).toBe('approved');
  });

  it('tombstone: deleted AFTER approved hides despite earlier exportedTo', async () => {
    const { appendArtifact, appendDecision, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Exported' });
    appendDecision({ artifactId: a.id, decision: 'approved', exportedTo: 'C:/telo/x/design/drafts/v.tsx' });
    appendDecision({ artifactId: a.id, decision: 'deleted' });
    expect(readArtifactsWithDecisions()).toHaveLength(0);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/mcp/artifactInbox.test.ts`
Expected: 3 new tests FAIL — today `deleted` rows annotate instead of filtering (rows length 2/1/1); TypeScript may also reject `'deleted'` — that IS the red signal for the type change.

- [ ] **Step 3: Implement in `artifactInbox.ts`**

Type: `decision: 'approved' | 'rejected' | 'deleted';` in `DecisionEntry` (line 22). `ArtifactWithDecision` (line 86–89) is UNCHANGED — add this mapping instead: in `readArtifactsWithDecisions`, replace the final `return readArtifacts().map(...)` with:

```typescript
  const out: ArtifactWithDecision[] = [];
  for (const a of readArtifacts()) {
    const decision = latestByArtifactId.get(a.id);
    if (decision?.decision === 'deleted') continue; // tombstoned — never reaches the feed
    if (!decision) out.push(a);
    else out.push({ ...a, decision: decision.decision, exportedTo: decision.exportedTo });
  }
  return out;
```

(The `decision.decision` assignment stays type-safe because the `'deleted'` case `continue`s first; if tsc still widens, narrow with `decision.decision as 'approved' | 'rejected'` — the guard above makes it sound.)

Update the function's doc comment: add one line — "Artifacts whose latest decision is 'deleted' (tombstones) are excluded entirely."

- [ ] **Step 4: `vite.config.ts` — two edits**

Line 70: `const DECISIONS = ['approved', 'rejected', 'deleted'];`
In the `/export` handler's `appendDecision` call (~line 202), add `variant_group: artifact.variant_group,` after `name,`.

- [ ] **Step 5: Run tests + typecheck + full suite**

```bash
npx vitest run src/mcp/artifactInbox.test.ts   # all pass incl. 3 new
npx tsc --noEmit                                # type change is sound
npm test                                        # whole suite green
```

- [ ] **Step 6: Commit**

```bash
git add src/mcp/artifactInbox.ts src/mcp/artifactInbox.test.ts vite.config.ts
git commit -m "feat(inbox): ledger tombstones (decision:'deleted') + export write carries variant_group"
```

---

### Task 2: `decide()` single-write

**Files:**
- Modify: `src/components/nodes/ArtifactNode.tsx` (`decide()`, ~line 73–129)
- Test: `src/components/nodes/ArtifactNode.test.tsx`

**Interfaces:**
- Consumes: `/export` now writes the complete approved entry (Task 1).
- Produces: approve-with-projectDir → exactly ONE fetch to `/export` (no `/decision`); export failure → fallback single POST `/decision {approved}`; reject and approve-without-projectDir unchanged.

- [ ] **Step 1: Write the failing tests** (append to `ArtifactNode.test.tsx`, following the file's existing fetch-mock style — read the file first and reuse its helpers)

Test cases (write them with the file's real helpers; assertions below are the contract):

```typescript
  it('approve with projectDir calls ONLY /export (single ledger write)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ ok: true, path: 'C:/telo/p/design/drafts/v.tsx' }) } as any;
    }));
    // mount with data.projectDir = 'C:/telo/p', click Approve, await act
    // then:
    expect(calls).toEqual(['/api/artifacts/export']);   // no /decision call
  });

  it('approve with projectDir falls back to /decision when export fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith('/export')) return { ok: false, status: 500 } as any;
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }));
    // mount with projectDir, click Approve, await act
    expect(calls).toEqual(['/api/artifacts/export', '/api/artifacts/decision']);
    // node status patched to 'approved' (approved-not-exported semantics preserved)
  });

  it('approve WITHOUT projectDir posts /decision only (unchanged)', async () => {
    // calls === ['/api/artifacts/decision']
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/nodes/ArtifactNode.test.tsx`
Expected: first test FAILS with `calls == ['/api/artifacts/decision', '/api/artifacts/export']` (today decision goes first).

- [ ] **Step 3: Rework `decide()`**

```typescript
  /** POST the review decision; only patch node status after a confirmed ok response.
   * Approve+projectDir writes ONE ledger entry via /export (server fills
   * variant_group + exportedTo); /decision remains for reject, plain approve,
   * and the export-failure fallback (approved-not-exported). */
  async function decide(e: React.MouseEvent, decision: 'approved' | 'rejected') {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let newExportedTo: string | undefined;
      if (decision === 'approved' && data.projectDir) {
        const exportRes = await fetch('/api/artifacts/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artifactId: data.artifactId,
            projectDir: data.projectDir,
            name: data.name ?? data.artifactId,
          }),
        }).catch(() => null);
        if (exportRes?.ok) {
          newExportedTo = (await exportRes.json())?.path;
        } else {
          // export failed — record the approve alone (single fallback write)
          console.warn(`artifact export failed: HTTP ${exportRes?.status ?? 'network'}`);
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
            console.warn(`artifact decision failed: HTTP ${res.status}`);
            setError(`Decision failed (HTTP ${res.status}) — retry`);
            return;
          }
          setError('Export failed — approved, not exported');
        }
      } else {
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
          console.warn(`artifact decision failed: HTTP ${res.status}`);
          setError(`Decision failed (HTTP ${res.status}) — retry`);
          return;
        }
      }
      setExportedTo(newExportedTo);
      patchNodeStatus(id, { status: decision, ...(newExportedTo ? { exportedTo: newExportedTo } : {}) });
    } catch (err) {
      console.warn('artifact decision failed:', err);
      setError('Decision failed (network) — retry');
    } finally {
      setBusy(false);
    }
  }
```

Adapt surrounding state names to the actual file (`setExportedTo`, `patchNodeStatus`, `busy` already exist — reuse, don't rename).

- [ ] **Step 4: Run tests + full suite**

```bash
npx vitest run src/components/nodes/ArtifactNode.test.tsx
npm test
```
Expected: new tests pass; pre-existing decide() tests may need their fetch-call expectations updated ONLY where they asserted the old double-write order — behavior contract per spec, flag any other adjustment in the report.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/ArtifactNode.tsx src/components/nodes/ArtifactNode.test.tsx
git commit -m "fix(artifact): approve+export = single ledger write via /export, /decision fallback"
```

---

### Task 3: deletion tombstone hook

**Files:**
- Modify: `src/hooks/useArtifactInbox.ts` (new exported helpers)
- Modify: `src/store/useWorkflowStore.ts` (`onNodesChange`, line 174)
- Test: `src/hooks/useArtifactInbox.test.ts` IF it exists, else the file the existing `ingestArtifacts` tests live in (`grep -rn "ingestArtifacts" src --include="*.test.*"` — add there).

**Interfaces:**
- Produces: `artifactTombstonePayloads(nodes, changes)` (pure — unit-tested) and `postArtifactTombstones(payloads)` (fire-and-forget fetch wrapper, thin like `useArtifactInbox`).

- [ ] **Step 1: Write the failing tests** (store-level, follow the existing `ingestArtifacts` test file's setup for seeding the store)

```typescript
  it('artifactTombstonePayloads: remove-changes on review board yield payloads for artifact nodes only', () => {
    // seed store: review board active; nodes = one artifact node (artifactId 'a1',
    // name 'V1', variantGroup 'g1') + one regular idea node 'n2'
    const changes = [
      { type: 'remove', id: 'artifact-a1' },
      { type: 'remove', id: 'n2' },
    ] as any[];
    const payloads = artifactTombstonePayloads(useWorkflowStore.getState().nodes, changes);
    expect(payloads).toEqual([
      { artifactId: 'a1', decision: 'deleted', name: 'V1', variant_group: 'g1' },
    ]);
  });

  it('artifactTombstonePayloads: empty on non-remove changes', () => {
    expect(artifactTombstonePayloads(nodes, [{ type: 'select', id: 'artifact-a1', selected: true } as any])).toEqual([]);
  });

  it('onNodesChange remove of an artifact node posts a tombstone (review board active)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true } as any));
    vi.stubGlobal('fetch', fetchMock);
    // seed store as above, review board active
    useWorkflowStore.getState().onNodesChange([{ type: 'remove', id: 'artifact-a1' } as any]);
    // fire-and-forget: flush microtasks, then:
    expect(fetchMock).toHaveBeenCalledWith('/api/artifacts/decision', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ artifactId: 'a1', decision: 'deleted', name: 'V1', variant_group: 'g1' }),
    }));
    // and the node is actually gone from the store (deletion behavior unchanged)
  });
```

- [ ] **Step 2: Run to verify they fail** (helpers don't exist → import error)

- [ ] **Step 3: Implement**

In `useArtifactInbox.ts`:

```typescript
export interface TombstonePayload {
  artifactId: string;
  decision: 'deleted';
  name?: string;
  variant_group?: string;
}

/** Pure half: map React Flow remove-changes to tombstone POST payloads for
 * artifact nodes. Runs against the PRE-apply node list (data still present). */
export function artifactTombstonePayloads(nodes: Node[], changes: { type: string; id?: string }[]): TombstonePayload[] {
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
```

In `useWorkflowStore.ts` `onNodesChange`, immediately BEFORE the `withoutHistory(... applyNodeChanges ...)` line (node data must still be present):

```typescript
    // Ledger tombstones: deleting an artifact node on the review board is a
    // user decision — record it server-side so the poll doesn't resurrect it.
    if (changes.some((c) => c.type === 'remove')) {
      const { boards, activeBoardId } = get();
      if (boards.find((b) => b.id === activeBoardId)?.kind === 'review') {
        postArtifactTombstones(artifactTombstonePayloads(get().nodes, changes as any));
      }
    }
```

Import the two helpers at the top of the store file. CHECK for an import cycle: `useArtifactInbox.ts` imports from `useWorkflowStore.ts` — if adding the reverse import creates a cycle warning/breakage, move `artifactTombstonePayloads`/`postArtifactTombstones` into a new tiny module `src/hooks/artifactTombstones.ts` (no store import needed — both helpers are store-free) and import THAT from both sides. Report which layout you shipped.

Also grep `deleteNodeCascade` call sites: if artifact nodes are reachable through it (they should not be — cascade is mind-map tree semantics), add the same guarded call there; otherwise state "unreachable, left alone" in the report.

- [ ] **Step 4: Run tests + full suite**

```bash
npx vitest run <the test file>
npm test && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ src/store/useWorkflowStore.ts <test file>
git commit -m "feat(inbox): deletion tombstones — review-board artifact removal posts decision:'deleted'"
```

---

### Task 4: live smoke + push

**Files:** none (verification ops).

- [ ] **Step 1: Start the dev server** (port 1420 is pinned; if busy, another instance is running — reuse it)

`npm run dev` (background). Wait for ready.

- [ ] **Step 2: Seed one artifact and verify the full loop**

```bash
# from repo root — append a pending artifact via the node API used by tests:
node -e "
process.env.SOVERN_ARTIFACT_DIR = '.sovern';
import('./src/mcp/artifactInbox.ts').catch(() => import('./dist-mcp/mcp/artifactInbox.js')).then(m => {
  const e = m.appendArtifact({ code: 'const App = () => <div>tombstone smoke</div>;', name: 'TombSmoke' });
  console.log('seeded', e.id);
});"
```
(If ts import fails under plain node, seed by writing the JSONL line directly — shape per `ArtifactEntry`.)

Then in the browser (`http://localhost:1420`, review tab):
1. Artifact card appears within ~2s.
2. Delete the node (select + Delete key). It must NOT reappear over ≥3 poll cycles (6s+) nor after a page reload.
3. `.sovern/artifact-decisions.jsonl` tail shows exactly one `{"decision":"deleted",...}` line for that id.
4. Seed a second artifact WITH `project_dir` (any `C:\telo\...` dir with `design/drafts` writable), Approve it → exactly ONE new ledger line: `approved` + `exportedTo` + `variant_group` (if set) — no second entry.

- [ ] **Step 3: Push + record actuals**

```bash
git push origin master
cd C:/telo/Efforts/Ongoing/NAUTILUS && python core/gte/gte.py record C:/telo/Efforts/On/MindMapping/sovern-mindmap/docs/superpowers/plans/2026-07-10-artifact-tombstones-single-decision.md --actual <Xh Ym>
```

Then check off both items in `C:/telo/Efforts/Ongoing/NAUTILUS/BACKLOG.md` (DesOps Pipeline v4 backlog: tombstones + double decision-write) and commit that in NAUTILUS.
