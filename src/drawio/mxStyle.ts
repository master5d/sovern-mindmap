import { ShapeKind } from '../types';

/**
 * Best-effort map of a drawio `style` string to one of our 12 shapes.
 * First match wins; anything unrecognized falls back to `rectangle`.
 */
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
