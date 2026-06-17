import { ChatMessage } from '../types';

const SYSTEM = `You convert a request into a diagram expressed as an Obsidian JSON Canvas document.
Output ONLY the JSON object — no prose, no markdown code fences.

Schema:
{
  "nodes": [{ "id": "n1", "type": "text", "x": 0, "y": 0, "width": 160, "height": 64,
              "text": "label", "metadata": { "mm:shape": "rounded" } }],
  "edges": [{ "id": "e1", "fromNode": "n1", "toNode": "n2", "label": "optional" }]
}

"mm:shape" must be one of these, chosen by meaning:
- terminal = start or end point
- rounded = a step / action
- rectangle = a generic box
- decision = a yes/no branch (use edge "label" for the conditions)
- note = an annotation / comment
- cylinder = a database / datastore
- actor = a user, person, or external role
- cloud = an external service or the internet
- parallelogram = input or output (data in/out)
- hexagon = a process / preparation step
- document = a document, file, or report
- ellipse = an event or state

Use short ids ("n1","n2"...). Connect nodes with edges by id. Positions can be 0 — they will be auto-laid-out.

Example for "user signs up; data saved to a database; a confirmation email is sent via a queue":
{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":160,"height":64,"text":"User","metadata":{"mm:shape":"actor"}},{"id":"n2","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Sign-up form","metadata":{"mm:shape":"rounded"}},{"id":"n3","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Users DB","metadata":{"mm:shape":"cylinder"}},{"id":"n4","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Email queue","metadata":{"mm:shape":"parallelogram"}},{"id":"n5","type":"text","x":0,"y":0,"width":160,"height":64,"text":"Email service","metadata":{"mm:shape":"cloud"}}],"edges":[{"id":"e1","fromNode":"n1","toNode":"n2","label":"submits"},{"id":"e2","fromNode":"n2","toNode":"n3","label":"save"},{"id":"e3","fromNode":"n2","toNode":"n4","label":"enqueue"},{"id":"e4","fromNode":"n4","toNode":"n5","label":"send"}]}`;

export function buildDiagramMessages(userPrompt: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userPrompt },
  ];
}
