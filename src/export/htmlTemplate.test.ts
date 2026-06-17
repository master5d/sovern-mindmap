import { describe, it, expect } from 'vitest';
import { buildInteractiveHtml } from './htmlTemplate';

const build = (title = 'Diagram') =>
  buildInteractiveHtml({ lightSvg: '<svg id="L"></svg>', darkSvg: '<svg id="D"></svg>', title });

describe('buildInteractiveHtml', () => {
  it('returns a complete HTML document', () => {
    const h = build();
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('<html');
    expect(h.trim().endsWith('</html>')).toBe(true);
  });

  it('embeds both SVG payloads', () => {
    const h = buildInteractiveHtml({ lightSvg: '__LIGHT_SVG__', darkSvg: '__DARK_SVG__', title: 'x' });
    expect(h).toContain('__LIGHT_SVG__');
    expect(h).toContain('__DARK_SVG__');
  });

  it('has a theme toggle and a pan/zoom script', () => {
    const h = build();
    expect(h).toContain('id="theme"');
    expect(h).toContain('<script>');
    expect(h.toLowerCase()).toContain('wheel');
  });

  it('escapes the title (no HTML injection)', () => {
    const h = build('<img src=x onerror=alert(1)>');
    expect(h).toContain('&lt;img');
    expect(h).not.toContain('<img');
  });

  it('references no external resources (self-contained)', () => {
    const h = build();
    expect(h).not.toContain('src="http');
    expect(h).not.toContain('href="http');
  });
});
