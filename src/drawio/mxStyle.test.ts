import { describe, it, expect } from 'vitest';
import { mapDrawioStyleToShape } from './mxStyle';
import { SHAPE_KINDS } from '../types';

describe('mapDrawioStyleToShape', () => {
  const cases: [string, string][] = [
    ['ellipse;whiteSpace=wrap;', 'ellipse'],
    ['rhombus;whiteSpace=wrap;', 'decision'],
    ['shape=cylinder3;whiteSpace=wrap;', 'cylinder'],
    ['shape=cloud;', 'cloud'],
    ['shape=hexagon;', 'hexagon'],
    ['shape=parallelogram;', 'parallelogram'],
    ['shape=document;', 'document'],
    ['shape=umlActor;', 'actor'],
    ['shape=note;', 'note'],
    ['shape=terminator;', 'terminal'],
    ['text;html=1;', 'note'],
    ['rounded=1;whiteSpace=wrap;', 'rounded'],
    ['whiteSpace=wrap;html=1;', 'rectangle'],
    ['', 'rectangle'],
  ];
  it.each(cases)('maps %s → %s', (style, expected) => {
    expect(mapDrawioStyleToShape(style)).toBe(expected);
  });

  it('always returns a known ShapeKind (drift guard)', () => {
    const samples = ['ellipse', 'rhombus', 'foo=bar', '', 'shape=mystery', 'text;'];
    for (const s of samples) {
      expect(SHAPE_KINDS as readonly string[]).toContain(mapDrawioStyleToShape(s));
    }
  });
});
