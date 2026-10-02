// Контракт значений layer/status для MCP-инструментов create_node/update_node (intake NAUTILUS#278:
// главный механизм просадки tool use на русских репликах — свободная форма значения вместо канона).
// layer="кодинг" или "Coding" раньше создавал узел, который не попадал ни на одну дорожку доски.
import { describe, it, expect } from 'vitest';
import { createCanvasNode, updateCanvasNode, SOVERN_LAYERS, SOVERN_STATUSES } from './canvasFileStore';
import { LAYERS, STATUSES } from '../theme/designTokens';

const empty = () => ({ nodes: [], edges: [] } as any);

describe('layer/status contract', () => {
  it('MCP list mirrors the UI list (one canon, no drift)', () => {
    expect([...SOVERN_LAYERS]).toEqual([...LAYERS]);
    expect([...SOVERN_STATUSES]).toEqual([...STATUSES]);
  });

  it('rejects a layer outside the canon and names the valid ones', () => {
    expect(() => createCanvasNode(empty(), { label: 'x', layer: 'кодинг' })).toThrow(/coding/);
    expect(() => createCanvasNode(empty(), { label: 'x', layer: 'Coding' })).toThrow(/unknown layer/i);
  });

  it('rejects a status outside the canon', () => {
    expect(() => createCanvasNode(empty(), { label: 'x', layer: 'coding', status: 'в работе' })).toThrow(/active/);
  });

  it('accepts canonical values', () => {
    const n = createCanvasNode(empty(), { label: 'x', layer: 'coding', status: 'active' });
    expect(n.metadata!['sovern:layer']).toBe('coding');
  });

  it('update_node validates status too', () => {
    const c = empty();
    const n = createCanvasNode(c, { label: 'x', layer: 'boss' });
    expect(() => updateCanvasNode(c, n.id, { status: 'готово' })).toThrow(/done/);
    expect(updateCanvasNode(c, n.id, { status: 'done' }).metadata!['sovern:status']).toBe('done');
  });
});
