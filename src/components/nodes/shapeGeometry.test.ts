import { describe, it, expect } from 'vitest';
import { SHAPE_KINDS } from '../../types';
import { SHAPE_GEOMETRY } from './shapeGeometry';
import { buildDiagramMessages } from '../../ai/diagramPrompt';

describe('shape vocabulary single source of truth', () => {
  it('registry covers exactly the shape kinds', () => {
    expect(new Set(Object.keys(SHAPE_GEOMETRY))).toEqual(new Set<string>(SHAPE_KINDS));
  });

  it('the generation prompt documents every shape kind', () => {
    const sys = buildDiagramMessages('x')[0].content;
    for (const kind of SHAPE_KINDS) expect(sys).toContain(kind);
  });
});
