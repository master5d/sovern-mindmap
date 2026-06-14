import { describe, it, expect } from 'vitest';
import { parseDesignTokens } from './designTokens';

describe('parseDesignTokens', () => {
  it('maps known flat paths', () => {
    const r = parseDesignTokens({
      color: {
        background: { $value: '#101010', $type: 'color' },
        accent: { $value: '#ff00aa' },
      },
    });
    expect(r.overrides).toEqual({ '--bg-canvas': '#101010', '--accent': '#ff00aa' });
    expect(r.warnings).toEqual([]);
  });

  it('maps nested text group and normalizes case/slashes', () => {
    const r = parseDesignTokens({
      Color: { Text: { Primary: { $value: '#111111' } } },
    });
    expect(r.overrides['--text-primary']).toBe('#111111');
  });

  it('maps layer.* and status.* with and without color. prefix', () => {
    const r = parseDesignTokens({
      layer: { boss: { $value: '#aa00ff' } },
      color: { status: { blocked: { $value: '#cc0000' } } },
    });
    expect(r.overrides['--layer-boss']).toBe('#aa00ff');
    expect(r.overrides['--status-blocked']).toBe('#cc0000');
  });

  it('resolves aliases and guards cycles', () => {
    const r = parseDesignTokens({
      base: { red: { $value: '#ef4444' } },
      color: { accent: { $value: '{base.red}' } },
      a: { $value: '{b}' },
      b: { $value: '{a}' },
    });
    expect(r.overrides['--accent']).toBe('#ef4444');
    expect(r.overrides).not.toHaveProperty('--a');
  });

  it('skips non-color $type, unmapped paths, invalid colors — with warnings', () => {
    const r = parseDesignTokens({
      color: {
        accent: { $value: '16px', $type: 'dimension' },
        surface: { $value: 'not-a-color' },
      },
      spacing: { md: { $value: '#ffffff' } },
    });
    expect(r.overrides).toEqual({});
    expect(r.warnings).toHaveLength(3);
  });

  it('rejects css-injection attempts in color values', () => {
    const r = parseDesignTokens({
      color: { accent: { $value: 'rgb(0,0,0)}body{background:url(//evil)' } },
    });
    expect(r.overrides).toEqual({});
    expect(r.warnings).toHaveLength(1);
  });

  it('handles non-object input gracefully', () => {
    expect(parseDesignTokens(null).overrides).toEqual({});
    expect(parseDesignTokens([1, 2]).overrides).toEqual({});
  });
});
