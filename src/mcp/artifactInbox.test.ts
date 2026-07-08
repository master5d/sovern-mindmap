import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('artifactInbox', () => {
  beforeEach(() => { process.env.SOVERN_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), 'sovern-inbox-')); });

  it('append+read roundtrip', async () => {
    const { appendArtifact, readArtifacts } = await import('./artifactInbox');
    const e = appendArtifact({ code: 'const App=()=>null;', name: 'V1', variant_group: 'dash' });
    expect(e.id).toMatch(/[0-9a-f-]{36}/);
    expect(readArtifacts()).toEqual([expect.objectContaining({ code: 'const App=()=>null;', variant_group: 'dash' })]);
  });

  it('read on missing file -> []', async () => {
    const { readArtifacts } = await import('./artifactInbox');
    expect(readArtifacts()).toEqual([]);
  });

  it('skips corrupt lines', async () => {
    const { appendArtifact, readArtifacts } = await import('./artifactInbox');
    // write a garbage line directly to the inbox file, then a valid entry via the API
    const dir = process.env.SOVERN_ARTIFACT_DIR!;
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'artifact-inbox.jsonl'), 'not-json-garbage\n');
    appendArtifact({ code: 'const App=()=>null;', name: 'Valid' });
    const entries = readArtifacts();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Valid');
  });

  it('decisions roundtrip', async () => {
    const { appendDecision, readDecisions } = await import('./artifactInbox');
    const d = appendDecision({ artifactId: 'abc-123', decision: 'approved', name: 'V1' });
    expect(d.id).toMatch(/[0-9a-f-]{36}/);
    expect(readDecisions()).toEqual([expect.objectContaining({ artifactId: 'abc-123', decision: 'approved' })]);
  });

  it('readArtifactsWithDecisions: undecided artifact has no decision field', async () => {
    const { appendArtifact, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Pending' });
    const rows = readArtifactsWithDecisions();
    expect(rows).toEqual([expect.objectContaining({ id: a.id, name: 'Pending' })]);
    expect(rows[0].decision).toBeUndefined();
  });

  it('readArtifactsWithDecisions: decided artifact carries decision + exportedTo', async () => {
    const { appendArtifact, appendDecision, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Approved' });
    appendDecision({ artifactId: a.id, decision: 'approved', name: 'Approved', exportedTo: '/tmp/foo.tsx' });
    const rows = readArtifactsWithDecisions();
    expect(rows).toEqual([
      expect.objectContaining({ id: a.id, decision: 'approved', exportedTo: '/tmp/foo.tsx' }),
    ]);
  });

  it('readArtifactsWithDecisions: last decision write wins for a given artifact', async () => {
    const { appendArtifact, appendDecision, readArtifactsWithDecisions } = await import('./artifactInbox');
    const a = appendArtifact({ code: 'const App=()=>null;', name: 'Flippy' });
    appendDecision({ artifactId: a.id, decision: 'rejected', name: 'Flippy' });
    appendDecision({ artifactId: a.id, decision: 'approved', name: 'Flippy' });
    const rows = readArtifactsWithDecisions();
    expect(rows[0].decision).toBe('approved');
  });
});
