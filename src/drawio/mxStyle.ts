import { ShapeKind, SHAPE_KINDS } from '../types';

/**
 * Best-effort map of a drawio `style` string to one of our `SHAPE_KINDS`.
 * First match wins; anything unrecognized falls back to `rectangle`.
 */
/**
 * Inverse of mapDrawioStyleToShape: each of our `SHAPE_KINDS` → a representative drawio style.
 * The Record type forces all SHAPE_KINDS to be covered (compile-time drift guard), and the
 * chosen styles satisfy mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s. The home-lab
 * icon shapes have no native drawio equivalent: they degrade to a rounded rect visually and
 * carry their identity in a `mmShape=<kind>` marker that mapDrawioStyleToShape parses first.
 */
const SHAPE_STYLE: Record<ShapeKind, string> = {
  rectangle: 'whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  decision: 'rhombus;whiteSpace=wrap;html=1;',
  terminal: 'shape=terminator;whiteSpace=wrap;html=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  parallelogram: 'shape=parallelogram;whiteSpace=wrap;html=1;',
  hexagon: 'shape=hexagon;whiteSpace=wrap;html=1;',
  cloud: 'shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;whiteSpace=wrap;html=1;',
  document: 'shape=document;whiteSpace=wrap;html=1;',
  server: 'rounded=1;whiteSpace=wrap;html=1;mmShape=server;',
  gpu: 'rounded=1;whiteSpace=wrap;html=1;mmShape=gpu;',
  workstation: 'rounded=1;whiteSpace=wrap;html=1;mmShape=workstation;',
  laptop: 'rounded=1;whiteSpace=wrap;html=1;mmShape=laptop;',
  storage: 'rounded=1;whiteSpace=wrap;html=1;mmShape=storage;',
  router: 'rounded=1;whiteSpace=wrap;html=1;mmShape=router;',
  switch: 'rounded=1;whiteSpace=wrap;html=1;mmShape=switch;',
  firewall: 'rounded=1;whiteSpace=wrap;html=1;mmShape=firewall;',
  wifi: 'rounded=1;whiteSpace=wrap;html=1;mmShape=wifi;',
  model: 'rounded=1;whiteSpace=wrap;html=1;mmShape=model;',
  agent: 'rounded=1;whiteSpace=wrap;html=1;mmShape=agent;',
  'vector-store': 'rounded=1;whiteSpace=wrap;html=1;mmShape=vector-store;',
  gateway: 'rounded=1;whiteSpace=wrap;html=1;mmShape=gateway;',
  container: 'rounded=1;whiteSpace=wrap;html=1;mmShape=container;',
};

export function mapShapeToDrawioStyle(shape: ShapeKind): string {
  return SHAPE_STYLE[shape] ?? SHAPE_STYLE.rectangle;
}

export function mapDrawioStyleToShape(style: string): ShapeKind {
  const s = (style || '').toLowerCase();
  // Our own export embeds the exact semantic shape as a style marker (icon-pack
  // shapes have no native drawio equivalent). Parse it back first; foreign drawio
  // lacks the marker and falls through to the visual heuristics below.
  const mm = s.match(/mmshape=([a-z-]+)/);
  if (mm && (SHAPE_KINDS as readonly string[]).includes(mm[1])) return mm[1] as ShapeKind;
  if (s.includes('ellipse')) return 'ellipse';
  if (s.includes('rhombus')) return 'decision';
  if (s.includes('cylinder')) return 'cylinder';
  if (s.includes('cloud')) return 'cloud';
  if (s.includes('hexagon')) return 'hexagon';
  if (s.includes('parallelogram')) return 'parallelogram';
  if (s.includes('document')) return 'document';
  if (s.includes('actor')) return 'actor';          // matches umlActor too
  if (s.includes('note')) return 'note';
  if (s.includes('terminator')) return 'terminal';
  if (s.startsWith('text;') || s === 'text') return 'note';
  if (/(^|;)rounded=1(;|$)/.test(s)) return 'rounded';
  return 'rectangle';
}
