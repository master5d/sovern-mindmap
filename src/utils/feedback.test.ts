import { describe, it, expect } from 'vitest';
import { alpha, layerColor, quadrant, AREA_COLORS, STATUS_COLORS } from './feedback';

describe('alpha', () => {
  it('wraps any color (incl. css vars) in color-mix', () => {
    expect(alpha('#ef4444', 9)).toBe('color-mix(in srgb, #ef4444 9%, transparent)');
    expect(alpha('var(--status-active)', 25)).toBe(
      'color-mix(in srgb, var(--status-active) 25%, transparent)',
    );
  });
});

describe('palette is var-based', () => {
  it('layerColor builds var with infra fallback', () => {
    expect(layerColor('lms')).toBe('var(--layer-lms, var(--layer-infra))');
  });
  it('AREA_COLORS / STATUS_COLORS are css vars', () => {
    expect(AREA_COLORS.lms).toBe('var(--layer-lms)');
    expect(STATUS_COLORS.active).toBe('var(--status-active)');
  });
  it('quadrant returns css-var colors with same thresholds', () => {
    expect(quadrant(7, 7)).toEqual({ label: 'Do First', color: 'var(--q-dofirst)' });
    expect(quadrant(7, 3)).toEqual({ label: 'Schedule', color: 'var(--q-schedule)' });
    expect(quadrant(3, 7)).toEqual({ label: 'Quick', color: 'var(--q-quick)' });
    expect(quadrant(3, 3)).toEqual({ label: 'Backlog', color: 'var(--q-backlog)' });
  });
});
