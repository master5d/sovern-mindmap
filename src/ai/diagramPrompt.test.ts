import { describe, it, expect } from 'vitest';
import { buildDiagramMessages } from './diagramPrompt';

describe('buildDiagramMessages', () => {
  it('returns a system message describing JSON Canvas + the shapes, and the user prompt', () => {
    const msgs = buildDiagramMessages('a login flow');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('JSON Canvas');
    expect(msgs[0].content).toContain('mm:shape');
    expect(msgs[0].content).toContain('decision');
    const user = msgs[msgs.length - 1];
    expect(user.role).toBe('user');
    expect(user.content).toContain('a login flow');
  });

  it('documents the extended shapes', () => {
    const sys = buildDiagramMessages('x')[0].content;
    expect(sys).toContain('cylinder');
    expect(sys).toContain('actor');
    expect(sys).toContain('cloud');
  });

  it('documents the optional walkthrough keys mm:step and mm:note', () => {
    const sys = buildDiagramMessages('anything')[0].content;
    expect(sys).toContain('mm:step');
    expect(sys).toContain('mm:note');
  });

  it('documents the home AI-lab shapes and guards their scope', () => {
    const sys = buildDiagramMessages('x')[0].content;
    for (const kind of [
      'server', 'gpu', 'workstation', 'laptop', 'storage',
      'router', 'switch', 'firewall', 'wifi',
      'model', 'agent', 'vector-store', 'gateway', 'container',
    ]) {
      expect(sys).toContain(kind);
    }
    // Scope guard so these don't leak into ordinary business flowcharts.
    expect(sys).toContain('Home AI-lab infrastructure');
  });
});
