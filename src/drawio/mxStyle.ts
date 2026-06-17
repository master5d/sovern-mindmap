import { ShapeKind } from '../types';

/**
 * Best-effort map of a drawio `style` string to one of our 12 shapes.
 * First match wins; anything unrecognized falls back to `rectangle`.
 */
/**
 * Inverse of mapDrawioStyleToShape: each of our 12 shapes → a representative drawio style.
 * The Record type forces all SHAPE_KINDS to be covered (compile-time drift guard), and the
 * chosen styles satisfy mapDrawioStyleToShape(mapShapeToDrawioStyle(s)) === s.
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
};

export function mapShapeToDrawioStyle(shape: ShapeKind): string {
  return SHAPE_STYLE[shape] ?? SHAPE_STYLE.rectangle;
}

export function mapDrawioStyleToShape(style: string): ShapeKind {
  const s = (style || '').toLowerCase();
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
