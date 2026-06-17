import { describe, it, expect } from 'vitest';
import { buildLearnHtml } from './learnHtmlTemplate';

const build = () =>
  buildLearnHtml({
    frames: [
      { svg: '<svg id="F1"></svg>', note: 'First step.' },
      { svg: '<svg id="F2"></svg>', note: 'Second step.' },
    ],
    title: 'Walkthrough',
  });

describe('buildLearnHtml', () => {
  it('returns a complete HTML document', () => {
    const h = build();
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('<html');
    expect(h.trim().endsWith('</html>')).toBe(true);
  });

  it('embeds every frame SVG and its narration', () => {
    const h = buildLearnHtml({
      frames: [{ svg: '__F1__', note: 'note one' }, { svg: '__F2__', note: 'note two' }],
      title: 'x',
    });
    expect(h).toContain('__F1__');
    expect(h).toContain('__F2__');
    expect(h).toContain('note one');
    expect(h).toContain('note two');
  });

  it('has prev/next controls, a step counter, and a script', () => {
    const h = build();
    expect(h).toContain('id="prev"');
    expect(h).toContain('id="next"');
    expect(h).toMatch(/\/ 2/); // counter total of 2
    expect(h).toContain('<script>');
  });

  it('escapes a malicious note and title', () => {
    const h = buildLearnHtml({
      frames: [{ svg: '<svg/>', note: '<img src=x onerror=alert(1)>' }],
      title: '<b>t</b>',
    });
    expect(h).toContain('&lt;img');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;b&gt;t&lt;/b&gt;');
  });

  it('includes the hybrid stage background and no external resources', () => {
    const h = build();
    expect(h).toContain('linear-gradient');
    expect(h).not.toContain('src="http');
    expect(h).not.toContain('href="http');
  });
});
