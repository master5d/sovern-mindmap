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
