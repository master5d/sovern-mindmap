import { describe, it, expect } from 'vitest';
import { computeExportViewport } from './fitViewport';

const node = (id: string, x: number, y: number) => ({
  id, position: { x, y }, width: 100, height: 50, measured: { width: 100, height: 50 }, data: {},
});

describe('computeExportViewport', () => {
  it('returns positive dimensions and a numeric viewport for a set of nodes', () => {
    const r = computeExportViewport([node('a', 0, 0), node('b', 300, 200)] as any);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.pixelRatio).toBeGreaterThan(0);
    expect(typeof r.viewport.x).toBe('number');
    expect(typeof r.viewport.zoom).toBe('number');
  });
});
