# AI-Canvas Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic shape/connector model to the canvas and a thin vertical slice that turns a text prompt into an editable diagram on the same React Flow surface (via the LiteLLM gateway, JSON Canvas interchange).

**Architecture:** A new `shape` React Flow node type (5 kinds) renders generic diagram shapes; shapes round-trip through the app's native JSON Canvas format via a `metadata['mm:shape']` key. A prompt bar calls the LiteLLM gateway (dev-proxied at `/llm`), the raw LLM text is normalized into a valid `JSONCanvas` by a pure `extractCanvas` function, converted to React Flow nodes/edges, id-namespaced, and appended to the canvas as one undoable Edit-Mode edit with dagre layout.

**Tech Stack:** React 19, TS 5.8, Vite 7, @xyflow/react 12, Zustand 5 (+ zundo), dagre, vitest/jsdom, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-16-ai-canvas-foundation-design.md`

---

## File Structure

**New files:**
- `src/components/nodes/ShapeNode.tsx` — generic shape node (rectangle/rounded/decision/terminal/note) + inline edit.
- `src/ai/config.ts` — gateway base URL + model name (from `import.meta.env`).
- `src/ai/diagramPrompt.ts` — builds LLM chat messages instructing JSON Canvas output. (+ test)
- `src/ai/litellmClient.ts` — POSTs chat completions to the gateway.
- `src/ai/extractCanvas.ts` — pure: messy LLM text → valid `JSONCanvas`. (+ test) **Core.**
- `src/ai/generateDiagram.ts` — orchestrator: prompt → canvas → store. (+ test)
- `src/components/AiPromptBar.tsx` — prompt UI.
- `DESIGN.md`, `design/diagrams/.gitkeep` — DesOps governance.

**Modified files:**
- `src/types/index.ts` — add `shape?` to `SOVERNNodeData`; export `ChatMessage`.
- `src/utils/canvasConverter.ts` — `mm:shape` round-trip. (+ new test file)
- `src/store/useWorkflowStore.ts` — `addGeneratedGraph` action.
- `src/App.tsx` — register `shape` in `nodeTypes`; mount `<AiPromptBar>`.
- `vite.config.ts` — `/llm` dev proxy → `http://localhost:4001` (server-side auth header).

---

## Task 1: Generic shape node type

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/components/nodes/ShapeNode.tsx`
- Modify: `src/App.tsx`

> Rendering React Flow nodes needs a provider; per existing convention `SOVERNNode` has no unit test. Verify this task by build. Logic is covered by Tasks 2/3/5.

- [ ] **Step 1: Add the `shape` field to the node data type**

In `src/types/index.ts`, inside `interface SOVERNNodeData` (after `color?: string;`), add:

```ts
  shape?: 'rectangle' | 'rounded' | 'decision' | 'terminal' | 'note';
```

- [ ] **Step 2: Create `src/components/nodes/ShapeNode.tsx`**

```tsx
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { SOVERNNodeData } from '../../types';
import { useWorkflowStore } from '../../store/useWorkflowStore';

const SHAPE_CLASS: Record<string, string> = {
  rectangle: 'rounded-none',
  rounded: 'rounded-xl',
  terminal: 'rounded-full',
  note: 'rounded-md',
  decision: 'rounded-md', // diamond handled via wrapper rotation below
};

export const ShapeNode = ({ id, data, selected }: NodeProps<{ data: SOVERNNodeData } & any>) => {
  const shape = (data.shape ?? 'rectangle') as string;
  const isDiamond = shape === 'decision';

  const editing = useWorkflowStore((s) => s.editingNodeId === id);
  const commit = useWorkflowStore((s) => s.commitInlineEdit);
  const cancel = useWorkflowStore((s) => s.cancelInlineEdit);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) { setDraft(data.label); inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing, data.label]);

  const base = `px-4 py-3 min-w-[140px] max-w-[240px] shadow-xl bg-surface border-2 transition-all ${
    selected ? 'ring-4 ring-accent/20 border-accent' : 'border-edge hover:border-edge-strong'
  } ${SHAPE_CLASS[shape] ?? 'rounded-md'}`;

  const label = editing ? (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(id, draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(id, draft); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        e.stopPropagation();
      }}
      className="nodrag nopan font-semibold text-sm text-primary leading-tight bg-surface-2 border border-accent rounded-md p-1 w-full resize-none outline-none"
      rows={2}
    />
  ) : (
    <div
      className="font-semibold text-sm text-primary leading-tight text-center cursor-text"
      onDoubleClick={() => useWorkflowStore.getState().beginInlineEdit(id)}
    >
      {data.label}
    </div>
  );

  return (
    <div className={isDiamond ? 'relative' : ''}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
      {isDiamond ? (
        <div className={`${base} rotate-45 flex items-center justify-center aspect-square`}>
          <div className="-rotate-45 w-full">{label}</div>
        </div>
      ) : (
        <div className={base}>{label}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-edge-strong border-2 border-surface" />
    </div>
  );
};
```

- [ ] **Step 3: Register the node type in App.tsx**

In `src/App.tsx`, add the import:

```tsx
import { ShapeNode } from './components/nodes/ShapeNode';
```

Extend the `nodeTypes` map (currently `{ sovern: SOVERNNode, lane: LaneNode }`):

```tsx
const nodeTypes = {
  sovern: SOVERNNode,
  lane: LaneNode,
  shape: ShapeNode,
};
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/components/nodes/ShapeNode.tsx src/App.tsx
git commit -m "feat(canvas): generic shape node type (rectangle/rounded/decision/terminal/note)"
```

---

## Task 2: JSON Canvas `mm:shape` round-trip

**Files:**
- Modify: `src/utils/canvasConverter.ts`
- Test: `src/utils/canvasConverter.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/utils/canvasConverter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';
import { SOVERNNodeData, JSONCanvas } from '../types';

const shapeNode = (): Node<SOVERNNodeData> => ({
  id: 's1', type: 'shape', position: { x: 10, y: 20 },
  data: { label: 'Decision?', layer: 'projects', status: 'idle', shape: 'decision' },
});

describe('canvasConverter mm:shape', () => {
  it('toJSONCanvas writes shape into metadata["mm:shape"]', () => {
    const c = toJSONCanvas([shapeNode()], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('decision');
  });

  it('fromJSONCanvas restores a shape node as type "shape" with data.shape', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 's1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Q?', metadata: { 'mm:shape': 'decision' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
    expect(nodes[0].data.label).toBe('Q?');
  });

  it('fromJSONCanvas still maps a non-shape node as sovern (backward compatible)', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Task', metadata: { 'sovern:layer': 'coding' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('sovern');
    expect(nodes[0].data.layer).toBe('coding');
  });

  it('round-trips a shape node', () => {
    const c = toJSONCanvas([shapeNode()], []);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/utils/canvasConverter.test.ts`
Expected: FAIL — `mm:shape` not written / node restored as `sovern`.

- [ ] **Step 3: Implement the round-trip**

In `src/utils/canvasConverter.ts`, in `toJSONCanvas`, after the `metadata` object is built (before `if (node.data.color)`), add the shape key:

```ts
    if (node.data.shape) canvasNode.metadata!['mm:shape'] = node.data.shape;
```

In `fromJSONCanvas`, replace the single `.map(...)` that hardcodes `type: 'sovern'` with a branch on `mm:shape`:

```ts
  const nodes: Node<SOVERNNodeData>[] = canvas.nodes.map((node) => {
    const shape = node.metadata?.['mm:shape'];
    if (shape) {
      return {
        id: node.id,
        type: 'shape',
        position: { x: node.x, y: node.y },
        data: {
          label: node.text || '',
          layer: node.metadata?.['sovern:layer'] || 'projects',
          status: node.metadata?.['sovern:status'] || 'idle',
          shape,
          color: node.color,
        },
      };
    }
    return {
      id: node.id,
      type: 'sovern',
      position: { x: node.x, y: node.y },
      data: {
        label: node.text || '',
        layer: node.metadata?.['sovern:layer'] || 'projects',
        status: node.metadata?.['sovern:status'] || 'idle',
        budget: node.metadata?.['sovern:budget'],
        agent: node.metadata?.['sovern:agent'],
        dates: node.metadata?.['sovern:dates'],
        impact: node.metadata?.['sovern:impact'],
        urgency: node.metadata?.['sovern:urgency'],
        created: node.metadata?.['sovern:created'],
        feedback: node.metadata?.['feedback'],
        color: node.color,
      },
    };
  });
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/utils/canvasConverter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/canvasConverter.ts src/utils/canvasConverter.test.ts
git commit -m "feat(canvas): round-trip generic shapes through JSON Canvas mm:shape metadata"
```

---

## Task 3: `extractCanvas` — LLM text → valid JSONCanvas (core)

**Files:**
- Create: `src/ai/extractCanvas.ts`
- Test: `src/ai/extractCanvas.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/ai/extractCanvas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractCanvas, DiagramParseError } from './extractCanvas';

describe('extractCanvas', () => {
  it('parses a clean JSON Canvas object', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}';
    const c = extractCanvas(raw);
    expect(c.nodes).toHaveLength(1);
    expect(c.nodes[0].id).toBe('a');
  });

  it('strips markdown code fences and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[]}\n```\nEnjoy!';
    expect(extractCanvas(raw).nodes[0].id).toBe('a');
  });

  it('repairs missing ids, positions, and sizes', () => {
    const raw = '{"nodes":[{"text":"A"}],"edges":[]}';
    const n = extractCanvas(raw).nodes[0];
    expect(typeof n.id).toBe('string');
    expect(n.id.length).toBeGreaterThan(0);
    expect(n.x).toBe(0); expect(n.y).toBe(0);
    expect(n.width).toBeGreaterThan(0); expect(n.height).toBeGreaterThan(0);
    expect(n.type).toBe('text');
  });

  it('coerces an unknown mm:shape to rectangle', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A","metadata":{"mm:shape":"hexagon"}}],"edges":[]}';
    expect(extractCanvas(raw).nodes[0].metadata!['mm:shape']).toBe('rectangle');
  });

  it('drops edges whose endpoints do not exist', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"}],"edges":[{"id":"e1","fromNode":"a","toNode":"ghost"}]}';
    expect(extractCanvas(raw).edges).toHaveLength(0);
  });

  it('keeps a valid edge and generates a missing edge id', () => {
    const raw = '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":150,"height":60,"text":"A"},{"id":"b","type":"text","x":0,"y":0,"width":150,"height":60,"text":"B"}],"edges":[{"fromNode":"a","toNode":"b","label":"yes"}]}';
    const e = extractCanvas(raw).edges;
    expect(e).toHaveLength(1);
    expect(typeof e[0].id).toBe('string');
    expect(e[0].label).toBe('yes');
  });

  it('throws DiagramParseError on non-JSON', () => {
    expect(() => extractCanvas('I cannot draw that.')).toThrow(DiagramParseError);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/ai/extractCanvas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ai/extractCanvas.ts`**

```ts
import { JSONCanvas, JSONCanvasNode, JSONCanvasEdge } from '../types';

const SHAPES = ['rectangle', 'rounded', 'decision', 'terminal', 'note'];

export class DiagramParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramParseError';
  }
}

/** Extract the outermost {...} JSON object from possibly-fenced, prose-wrapped text. */
function isolateJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new DiagramParseError('no JSON object found in model output');
  }
  return raw.slice(start, end + 1);
}

/** Turn messy LLM text into a guaranteed-renderable JSONCanvas. */
export function extractCanvas(raw: string): JSONCanvas {
  let parsed: any;
  try {
    parsed = JSON.parse(isolateJson(raw));
  } catch {
    throw new DiagramParseError('model output was not valid JSON');
  }

  const rawNodes: any[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  const rawEdges: any[] = Array.isArray(parsed?.edges) ? parsed.edges : [];

  const nodes: JSONCanvasNode[] = [];
  const ids = new Set<string>();
  for (const n of rawNodes) {
    let id = typeof n?.id === 'string' && n.id ? n.id : `n-${crypto.randomUUID()}`;
    while (ids.has(id)) id = `n-${crypto.randomUUID()}`;
    ids.add(id);
    const metadata = { ...(n?.metadata ?? {}) };
    if (metadata['mm:shape'] && !SHAPES.includes(metadata['mm:shape'])) {
      metadata['mm:shape'] = 'rectangle';
    }
    nodes.push({
      id,
      type: 'text',
      x: Number.isFinite(n?.x) ? n.x : 0,
      y: Number.isFinite(n?.y) ? n.y : 0,
      width: Number.isFinite(n?.width) ? n.width : 150,
      height: Number.isFinite(n?.height) ? n.height : 60,
      text: typeof n?.text === 'string' ? n.text : '',
      metadata,
    });
  }

  const edges: JSONCanvasEdge[] = [];
  for (const e of rawEdges) {
    if (!ids.has(e?.fromNode) || !ids.has(e?.toNode)) continue;
    edges.push({
      id: typeof e?.id === 'string' && e.id ? e.id : `e-${crypto.randomUUID()}`,
      fromNode: e.fromNode,
      toNode: e.toNode,
      label: typeof e?.label === 'string' ? e.label : undefined,
    });
  }

  return { nodes, edges };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/ai/extractCanvas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/extractCanvas.ts src/ai/extractCanvas.test.ts
git commit -m "feat(ai): extractCanvas — normalize/repair LLM output into valid JSON Canvas"
```

---

## Task 4: Prompt builder, config, gateway client, dev proxy

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/ai/config.ts`
- Create: `src/ai/diagramPrompt.ts`
- Test: `src/ai/diagramPrompt.test.ts`
- Create: `src/ai/litellmClient.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add the `ChatMessage` type**

In `src/types/index.ts`, add (near the bottom, after the `JSONCanvas` interface):

```ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

- [ ] **Step 2: Write failing test** — create `src/ai/diagramPrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDiagramMessages } from './diagramPrompt';

describe('buildDiagramMessages', () => {
  it('returns a system message describing JSON Canvas + the shapes, and the user prompt', () => {
    const msgs = buildDiagramMessages('a login flow');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('JSON Canvas');
    expect(msgs[0].content).toContain('mm:shape');
    expect(msgs[0].content).toContain('decision');
    const user = msgs[msgs.length - 1];
    expect(user.role).toBe('user');
    expect(user.content).toContain('a login flow');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run src/ai/diagramPrompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/ai/diagramPrompt.ts`**

```ts
import { ChatMessage } from '../types';

const SYSTEM = `You convert a request into a diagram expressed as an Obsidian JSON Canvas document.
Output ONLY the JSON object — no prose, no markdown code fences.

Schema:
{
  "nodes": [{ "id": "n1", "type": "text", "x": 0, "y": 0, "width": 160, "height": 64,
              "text": "label", "metadata": { "mm:shape": "rounded" } }],
  "edges": [{ "id": "e1", "fromNode": "n1", "toNode": "n2", "label": "optional" }]
}

"mm:shape" must be one of: rectangle, rounded, decision, terminal, note.
- terminal = start/end, decision = a yes/no branch, rounded = a step, rectangle = a generic box, note = an annotation.
Use short ids ("n1","n2"...). Connect nodes with edges by id. Put branch conditions in edge "label".
Positions can be 0 — they will be auto-laid-out.

Example for "simple login":
{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Start","metadata":{"mm:shape":"terminal"}},{"id":"n2","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Enter credentials","metadata":{"mm:shape":"rounded"}},{"id":"n3","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Valid?","metadata":{"mm:shape":"decision"}},{"id":"n4","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Dashboard","metadata":{"mm:shape":"terminal"}}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2"},{"id":"e2","fromNode":"n2","toNode":"n3"},{"id":"e3","fromNode":"n3","toNode":"n4","label":"yes"},{"id":"e4","fromNode":"n3","toNode":"n2","label":"no"}]}`;

export function buildDiagramMessages(userPrompt: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userPrompt },
  ];
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run src/ai/diagramPrompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `src/ai/config.ts`**

```ts
// Gateway base path. Dev: '/llm' is proxied to the LiteLLM gateway by vite.config.ts.
export const GATEWAY_BASE = (import.meta.env.VITE_LLM_GATEWAY as string) ?? '/llm';
// Model alias resolved by the gateway (free→local→paid hierarchy lives in the gateway).
export const MODEL = (import.meta.env.VITE_LLM_MODEL as string) ?? 'sovern-default';
```

- [ ] **Step 7: Create `src/ai/litellmClient.ts`**

```ts
import { ChatMessage } from '../types';
import { GATEWAY_BASE, MODEL } from './config';

/** POST chat-completions to the LiteLLM gateway (OpenAI-compatible). Returns assistant text. */
export async function requestCompletion(
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal },
): Promise<string> {
  const res = await fetch(`${GATEWAY_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2 }),
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('gateway returned no content');
  return content;
}
```

- [ ] **Step 8: Add the `/llm` dev proxy to `vite.config.ts`**

In `vite.config.ts`, replace the `server` block:

```ts
  server: {
    port: 1420,
    strictPort: true,
  },
```

with one that adds the proxy (the gateway key, if any, is attached server-side from a Node env var and never reaches the client bundle):

```ts
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/llm': {
        target: process.env.SOVERN_LLM_GATEWAY ?? 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ''),
        configure: (proxy) => {
          const key = process.env.LITELLM_KEY;
          if (key) proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Authorization', `Bearer ${key}`));
        },
      },
    },
  },
```

- [ ] **Step 9: Build + run the new tests**

Run: `npm run build && npx vitest run src/ai/diagramPrompt.test.ts`
Expected: build exit 0, test PASS.

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts src/ai/config.ts src/ai/diagramPrompt.ts src/ai/diagramPrompt.test.ts src/ai/litellmClient.ts vite.config.ts
git commit -m "feat(ai): diagram prompt builder + LiteLLM gateway client + /llm dev proxy"
```

---

## Task 5: Store action + `generateDiagram` orchestrator

**Files:**
- Modify: `src/store/useWorkflowStore.ts`
- Create: `src/ai/generateDiagram.ts`
- Test: `src/ai/generateDiagram.test.ts`

- [ ] **Step 1: Add the `addGeneratedGraph` store action**

In `src/store/useWorkflowStore.ts`, add to the `WorkflowState` interface (near the authoring actions):

```ts
  addGeneratedGraph: (newNodes: Node<SOVERNNodeData>[], newEdges: Edge[]) => void;
```

Add to the store body (after `pasteSubtree`):

```ts
  addGeneratedGraph: (newNodes, newEdges) => {
    get().enterEditMode();
    set({ nodes: [...get().nodes, ...newNodes], edges: [...get().edges, ...newEdges] });
    get().autoLayout();
  },
```

(`Node`, `Edge`, `SOVERNNodeData` are already imported in this file.)

- [ ] **Step 2: Write failing integration test** — create `src/ai/generateDiagram.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { generateDiagram } from './generateDiagram';

const CANVAS = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Start', metadata: { 'mm:shape': 'terminal' } },
    { id: 'b', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Step', metadata: { 'mm:shape': 'rounded' } },
  ],
  edges: [{ id: 'e1', fromNode: 'a', toNode: 'b', label: 'go' }],
});

beforeEach(() => {
  useWorkflowStore.setState({ nodes: [], edges: [], isEditing: false, selectedNodeId: null });
  useWorkflowStore.temporal.getState().clear();
});

describe('generateDiagram', () => {
  it('adds generated shapes to the canvas and enters edit mode', async () => {
    const request = vi.fn().mockResolvedValue(CANVAS);
    await generateDiagram('a flow', { request });

    const { nodes, edges, isEditing } = useWorkflowStore.getState();
    expect(request).toHaveBeenCalledOnce();
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.type === 'shape')).toBe(true);
    // ids are namespaced, not the raw "a"/"b" from the model
    expect(nodes.map((n) => n.id)).not.toContain('a');
    expect(edges).toHaveLength(1);
    expect(isEditing).toBe(true);
  });

  it('calls onError and leaves the canvas unchanged on bad output', async () => {
    const request = vi.fn().mockResolvedValue('sorry, no diagram');
    const onError = vi.fn();
    await generateDiagram('x', { request, onError });

    expect(onError).toHaveBeenCalledOnce();
    expect(useWorkflowStore.getState().nodes).toHaveLength(0);
  });
});
```

- [ ] **Step 2b: Run test, verify it fails**

Run: `npx vitest run src/ai/generateDiagram.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ai/generateDiagram.ts`**

```ts
import { MarkerType } from '@xyflow/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { buildDiagramMessages } from './diagramPrompt';
import { requestCompletion } from './litellmClient';
import { extractCanvas } from './extractCanvas';
import { ChatMessage } from '../types';

interface Deps {
  request?: (messages: ChatMessage[]) => Promise<string>;
  onError?: (message: string) => void;
}

/** prompt → gateway → JSON Canvas → namespaced shapes appended to the canvas (undoable). */
export async function generateDiagram(prompt: string, deps: Deps = {}): Promise<void> {
  const request = deps.request ?? requestCompletion;
  try {
    const raw = await request(buildDiagramMessages(prompt));
    const canvas = extractCanvas(raw);
    const { nodes, edges } = fromJSONCanvas(canvas);

    // Namespace ids so a generated diagram never collides with what's already on the canvas.
    const idMap = new Map<string, string>();
    nodes.forEach((n) => idMap.set(n.id, `g-${crypto.randomUUID()}`));
    const newNodes = nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, selected: false }));
    const newEdges = edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: `e-${crypto.randomUUID()}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        type: 'smoothstep' as const,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      }));

    useWorkflowStore.getState().addGeneratedGraph(newNodes as any, newEdges);
  } catch (err) {
    deps.onError?.(err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/ai/generateDiagram.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + full suite**

Run: `npm run build && npx vitest run`
Expected: build exit 0, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/useWorkflowStore.ts src/ai/generateDiagram.ts src/ai/generateDiagram.test.ts
git commit -m "feat(ai): generateDiagram orchestrator + addGeneratedGraph store action (undoable)"
```

---

## Task 6: Prompt bar UI

**Files:**
- Create: `src/components/AiPromptBar.tsx`
- Modify: `src/App.tsx`

> UI wiring; verify by build. Logic covered by Task 5.

- [ ] **Step 1: Create `src/components/AiPromptBar.tsx`**

```tsx
import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { generateDiagram } from '../ai/generateDiagram';

export function AiPromptBar({ notify }: { notify: (msg: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    await generateDiagram(text, { onError: (m) => notify(`⚠ diagram: ${m}`) });
    setBusy(false);
    setPrompt('');
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur-md p-2 border border-edge rounded-2xl shadow-2xl w-[min(560px,80vw)]">
      <Sparkles size={16} className="text-accent ml-1 shrink-0" />
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
        placeholder="Describe a diagram…  (e.g. onboarding flow)"
        className="nodrag flex-1 bg-transparent text-sm text-primary placeholder:text-muted outline-none"
      />
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Generate
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in App.tsx**

In `src/App.tsx`, add the import:

```tsx
import { AiPromptBar } from './components/AiPromptBar';
```

Render it inside the `{!presentationMode && (...)}` region — add this line right after the `<EditModeBanner saveState={saveState} />` line:

```tsx
      {!presentationMode && <AiPromptBar notify={notify} />}
```

(`notify` already exists in `Flow()`.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/AiPromptBar.tsx src/App.tsx
git commit -m "feat(ai): prompt bar — type a description, get an editable diagram on the canvas"
```

---

## Task 7: DesOps governance files

**Files:**
- Create: `DESIGN.md`
- Create: `design/diagrams/.gitkeep`

- [ ] **Step 1: Create `DESIGN.md`**

```md
# DESIGN.md — sovern-mindmap

Unified AI diagramming canvas. All graphics render on one React Flow surface;
generators (AI via LiteLLM, draw.io, archify, pencil) are invisible backends.

## Tokens
Theme tokens live in `src/theme/tokens.css` (dark/light) + design-token upload.

## Diagrams
Exported diagrams live in `design/diagrams/` (DesOps Standard).
AI↔canvas interchange is JSON Canvas (Obsidian spec) — never Mermaid.

## Shapes (v1)
rectangle · rounded · decision · terminal · note — carried in JSON Canvas
node metadata under `mm:shape`.
```

- [ ] **Step 2: Create `design/diagrams/.gitkeep`** (empty file)

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md design/diagrams/.gitkeep
git commit -m "chore(desops): add DESIGN.md + design/diagrams per DesOps Standard"
```

---

## Final verification

- [ ] `npm run build && npx vitest run` — build exit 0, all tests green (existing 48 + new: 4 converter + 7 extractCanvas + 1 prompt + 2 generateDiagram = 62).
- [ ] Manual smoke (`npm run dev`, browser): type "onboarding flow" in the prompt bar → a diagram of shape nodes + arrowed connectors appears on the canvas, Edit-Mode banner shows, `Ctrl+Z` removes the whole generated diagram in one step. (Requires the LiteLLM gateway running at `localhost:4001`; without it the bar shows a gateway-error toast — expected.)
- [ ] Confirm generated nodes round-trip: Save canvas → reload → shapes preserved (`mm:shape`).

## Self-Review Notes (author)

- **Spec coverage:** shape node + 5 kinds (T1) ✓; JSON Canvas `mm:shape` round-trip (T2) ✓; `extractCanvas` validate/repair core (T3) ✓; prompt builder + gateway client + dev proxy + config (T4) ✓; orchestrator + Edit-Mode undoable add + dagre + arrowheads (T5) ✓; prompt bar UI (T6) ✓; DesOps governance (T7) ✓.
- **Type consistency:** `ChatMessage` (T4) used by `diagramPrompt`/`litellmClient`/`generateDiagram`; `addGeneratedGraph(Node[],Edge[])` (T5) matches the orchestrator call; `extractCanvas → JSONCanvas → fromJSONCanvas` chain consistent; `data.shape` union (T1) matches converter (T2) and `SHAPES` list (T3).
- **Decisions made explicit:** generation **appends** a namespaced cluster and re-runs whole-graph `autoLayout` (v1 simplification — disturbs existing positions but is undoable); gateway key injected server-side in the proxy (never bundled); arrowheads set on generated edges directly so they render in any view.
- **No placeholders.** Gateway must be running for the live call; tests inject a fake `request` so they need no network.
