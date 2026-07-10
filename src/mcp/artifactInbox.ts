// Node-side artifact inbox: JSONL append-only log for generated artifacts and
// human approve/reject decisions. NO React/vite imports — consumed by the
// MCP server (Task 2) and the vite dev middleware (Task 3) alike.
import { randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ArtifactEntry {
  id: string;
  ts: string;
  code: string;
  name?: string;
  variant_group?: string;
  project_dir?: string;
}

export interface DecisionEntry {
  id: string;
  ts: string;
  artifactId: string;
  decision: 'approved' | 'rejected' | 'deleted';
  name?: string;
  variant_group?: string;
  exportedTo?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/mcp -> repo root is two levels up
const repoRoot = join(__dirname, '..', '..');

/** Lazy dir resolution so tests can point at a temp dir via SOVERN_ARTIFACT_DIR. */
function inboxDir(): string {
  return process.env.SOVERN_ARTIFACT_DIR ?? join(repoRoot, '.sovern');
}

function inboxPath(): string {
  return join(inboxDir(), 'artifact-inbox.jsonl');
}

function decisionsPath(): string {
  return join(inboxDir(), 'artifact-decisions.jsonl');
}

function readJsonlEntries<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf-8');
  const entries: T[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as T);
    } catch {
      // skip corrupt line
    }
  }
  return entries;
}

function appendJsonlEntry(path: string, entry: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n');
}

export function appendArtifact(e: Omit<ArtifactEntry, 'id' | 'ts'>): ArtifactEntry {
  const entry: ArtifactEntry = { id: randomUUID(), ts: new Date().toISOString(), ...e };
  appendJsonlEntry(inboxPath(), entry);
  return entry;
}

export function readArtifacts(): ArtifactEntry[] {
  return readJsonlEntries<ArtifactEntry>(inboxPath());
}

export function appendDecision(d: Omit<DecisionEntry, 'id' | 'ts'>): DecisionEntry {
  const entry: DecisionEntry = { id: randomUUID(), ts: new Date().toISOString(), ...d };
  appendJsonlEntry(decisionsPath(), entry);
  return entry;
}

export function readDecisions(): DecisionEntry[] {
  return readJsonlEntries<DecisionEntry>(decisionsPath());
}

export interface ArtifactWithDecision extends ArtifactEntry {
  decision?: 'approved' | 'rejected';
  exportedTo?: string;
}

/**
 * Server-side reconciliation: merges the append-only artifact inbox with the
 * decisions ledger so a fresh canvas doesn't re-ingest already-decided
 * artifacts as 'pending'. Last decision write wins per artifactId; when the
 * latest decision for an id repeats the same verdict but drops exportedTo
 * (e.g. a plain approve followed by re-reading, or reordered writes), the
 * earlier exportedTo is preserved rather than lost.
 * Artifacts whose latest decision is 'deleted' (tombstones) are excluded entirely.
 */
export function readArtifactsWithDecisions(): ArtifactWithDecision[] {
  const decisions = readDecisions();
  const latestByArtifactId = new Map<string, DecisionEntry>();
  for (const d of decisions) {
    const existing = latestByArtifactId.get(d.artifactId);
    if (existing && existing.decision === d.decision && !d.exportedTo && existing.exportedTo) {
      latestByArtifactId.set(d.artifactId, { ...d, exportedTo: existing.exportedTo });
    } else {
      latestByArtifactId.set(d.artifactId, d);
    }
  }
  const out: ArtifactWithDecision[] = [];
  for (const a of readArtifacts()) {
    const decision = latestByArtifactId.get(a.id);
    if (decision?.decision === 'deleted') continue; // tombstoned — never reaches the feed
    if (!decision) out.push(a);
    else out.push({ ...a, decision: decision.decision as 'approved' | 'rejected', exportedTo: decision.exportedTo });
  }
  return out;
}
