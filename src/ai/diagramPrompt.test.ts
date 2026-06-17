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
});
