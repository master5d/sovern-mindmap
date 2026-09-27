import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { Node, Edge } from '@xyflow/react';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';
import { SOVERNNodeData, JSONCanvas } from '../types';
import { MARK_IDS } from './evidenceMarks';

const shapeNode = (): Node<SOVERNNodeData> => ({
  id: 's1', type: 'shape', position: { x: 10, y: 20 },
  data: { label: 'Decision?', layer: 'projects', status: 'idle', shape: 'decision' },
});

describe('canvasConverter mm:shape', () => {
  it('toJSONCanvas writes shape into metadata["mm:shape"]', () => {
    const c = toJSONCanvas([shapeNode()], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('decision');
  });

  it('fromJSONCanvas restores a shape node as type "shape" with data.shape', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 's1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Q?', metadata: { 'mm:shape': 'decision' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
    expect(nodes[0].data.label).toBe('Q?');
  });

  it('fromJSONCanvas still maps a non-shape node as sovern (backward compatible)', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Task', metadata: { 'sovern:layer': 'coding' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('sovern');
    expect(nodes[0].data.layer).toBe('coding');
  });

  it('round-trips a shape node', () => {
    const c = toJSONCanvas([shapeNode()], []);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('decision');
  });

  it('round-trips геометрию: позиция и размер переживают оба конца', () => {
    // Числа намеренно РАЗНЫЕ и ненулевые. Остальные roundtrip-тесты сидят
    // на {x:0,y:0}: с такими координатами потеря позиции, перепутанные оси
    // и дефолт-подстановка неотличимы от корректной работы — тест зелёный
    // при сломанном конвертере.
    const node: Node<SOVERNNodeData> = {
      id: 'geo', type: 'shape', position: { x: 137, y: 42 },
      measured: { width: 220, height: 90 },
      data: { label: 'Geo', layer: 'projects', status: 'idle', shape: 'cylinder' },
    };
    const c = toJSONCanvas([node], []);
    expect([c.nodes[0].x, c.nodes[0].y]).toEqual([137, 42]);
    expect([c.nodes[0].width, c.nodes[0].height]).toEqual([220, 90]);

    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].position).toEqual({ x: 137, y: 42 });
  });

  it('дробные координаты округляются, а не теряются', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'frac', type: 'shape', position: { x: 10.6, y: -3.2 },
      measured: { width: 150, height: 60 },
      data: { label: 'F', layer: 'projects', status: 'idle', shape: 'rectangle' },
    };
    const c = toJSONCanvas([node], []);
    expect([c.nodes[0].x, c.nodes[0].y]).toEqual([11, -3]);
  });

  it('без measured берётся дефолтный размер, а не undefined', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'nom', type: 'shape', position: { x: 5, y: 7 },
      data: { label: 'N', layer: 'projects', status: 'idle', shape: 'rectangle' },
    };
    const c = toJSONCanvas([node], []);
    expect([c.nodes[0].width, c.nodes[0].height]).toEqual([150, 60]);
  });

  it('round-trips an extended shape (cylinder)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'db', type: 'shape', position: { x: 0, y: 0 },
      data: { label: 'Users', layer: 'projects', status: 'idle', shape: 'cylinder' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:shape']).toBe('cylinder');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('shape');
    expect(nodes[0].data.shape).toBe('cylinder');
  });

  it('round-trips step + note through mm:step / mm:note', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Intro', layer: 'projects', status: 'idle', step: 2, note: 'First we set the scene.' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata?.['mm:step']).toBe(2);
    expect(c.nodes[0].metadata?.['mm:note']).toBe('First we set the scene.');
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBe(2);
    expect(nodes[0].data.note).toBe('First we set the scene.');
  });

  it('omits mm:step / mm:note when absent (backward compatible)', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'Plain', layer: 'projects', status: 'idle' },
    };
    const c = toJSONCanvas([node], []);
    expect(c.nodes[0].metadata && 'mm:step' in c.nodes[0].metadata).toBe(false);
    expect(c.nodes[0].metadata && 'mm:note' in c.nodes[0].metadata).toBe(false);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.step).toBeUndefined();
    expect(nodes[0].data.note).toBeUndefined();
  });
});

describe('canvasConverter mm:artifact', () => {
  const artifactNode = (): Node<SOVERNNodeData> => ({
    id: 'a1', type: 'artifact', position: { x: 5, y: 15 },
    data: {
      artifactId: 'a1',
      code: 'ART-001',
      name: 'Login screen',
      variantGroup: 'auth',
      status: 'approved',
      projectDir: '/tmp/project',
    } as unknown as SOVERNNodeData,
  });

  it('toJSONCanvas writes artifact fields into metadata["mm:artifact"]', () => {
    const c = toJSONCanvas([artifactNode()], []);
    expect(c.nodes[0].text).toBe('Login screen');
    expect(c.nodes[0].metadata?.['mm:artifact']).toEqual({
      artifactId: 'a1',
      code: 'ART-001',
      name: 'Login screen',
      variantGroup: 'auth',
      status: 'approved',
      projectDir: '/tmp/project',
    });
  });

  it('round-trips an artifact node (artifactId, code, status, variantGroup)', () => {
    const c = toJSONCanvas([artifactNode()], []);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].type).toBe('artifact');
    expect(nodes[0].data.artifactId).toBe('a1');
    expect(nodes[0].data.code).toBe('ART-001');
    expect(nodes[0].data.status).toBe('approved');
    expect(nodes[0].data.variantGroup).toBe('auth');
  });

  it('fromJSONCanvas defaults status to "pending" when absent', () => {
    const canvas: JSONCanvas = {
      nodes: [{
        id: 'a2', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Draft',
        metadata: { 'mm:artifact': { artifactId: 'a2', code: 'ART-002' } },
      }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('artifact');
    expect(nodes[0].data.status).toBe('pending');
  });

  it('does not affect non-artifact nodes (backward compatible)', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'Task', metadata: { 'sovern:layer': 'coding' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].type).toBe('sovern');
    expect(nodes[0].data.layer).toBe('coding');
  });
});

describe('canvasConverter sovern:mark (грейд достоверности, мост NAUTILUS core/desops/dataviz)', () => {
  it('fromJSONCanvas читает известную марку узла в data.mark', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'A', metadata: { 'sovern:mark': 'measured' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].data.mark).toBe('measured');
  });

  it('отсутствие sovern:mark — data.mark undefined, а не measured/дефолт', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'A', metadata: {} }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].data.mark).toBeUndefined();
  });

  it('неизвестное значение sovern:mark (опечатка) — тоже «не размечено», не падение', () => {
    const canvas: JSONCanvas = {
      nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'A', metadata: { 'sovern:mark': 'вроде-измерено' } }],
      edges: [],
    };
    const { nodes } = fromJSONCanvas(canvas);
    expect(nodes[0].data.mark).toBeUndefined();
  });

  it('toJSONCanvas пишет metadata["sovern:mark"] только когда марка известна', () => {
    const marked: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'A', layer: 'projects', status: 'idle', mark: 'inferred' },
    };
    const unmarked: Node<SOVERNNodeData> = {
      id: 'n2', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'B', layer: 'projects', status: 'idle' },
    };
    const c = toJSONCanvas([marked, unmarked], []);
    expect(c.nodes[0].metadata?.['sovern:mark']).toBe('inferred');
    expect(c.nodes[1].metadata && 'sovern:mark' in c.nodes[1].metadata).toBe(false);
  });

  it('round-trips марку узла через оба конца конвертера', () => {
    const node: Node<SOVERNNodeData> = {
      id: 'n1', type: 'sovern', position: { x: 0, y: 0 },
      data: { label: 'A', layer: 'projects', status: 'idle', mark: 'declared' },
    };
    const c = toJSONCanvas([node], []);
    const { nodes } = fromJSONCanvas(c);
    expect(nodes[0].data.mark).toBe('declared');
  });

  it('ребро несёт СВОЮ марку, независимо от узлов на концах', () => {
    const canvas: JSONCanvas = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'A', metadata: {} },
        { id: 'b', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'B', metadata: { 'sovern:mark': 'measured' } },
      ],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b', metadata: { 'sovern:mark': 'refuted' } }],
    };
    const { edges } = fromJSONCanvas(canvas);
    expect((edges[0].data as any)?.mark).toBe('refuted');
  });

  it('ребро без sovern:mark — data вообще не заводится (обратная совместимость)', () => {
    const canvas: JSONCanvas = {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'A', metadata: {} },
        { id: 'b', type: 'text', x: 0, y: 0, width: 150, height: 60, text: 'B', metadata: {} },
      ],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'flow' }],
    };
    const { edges } = fromJSONCanvas(canvas);
    expect(edges[0].data).toBeUndefined();
    expect(edges[0].label).toBe('flow');
  });

  it('round-trips марку ребра', () => {
    const nodes: Node<SOVERNNodeData>[] = [
      { id: 'a', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'A', layer: 'projects', status: 'idle' } },
      { id: 'b', type: 'sovern', position: { x: 0, y: 0 }, data: { label: 'B', layer: 'projects', status: 'idle' } },
    ];
    const edges: Edge[] = [{ id: 'e', source: 'a', target: 'b', data: { mark: 'open' } }];
    const c = toJSONCanvas(nodes, edges);
    expect(c.edges[0].metadata?.['sovern:mark']).toBe('open');
    const back = fromJSONCanvas(c);
    expect((back.edges[0].data as any)?.mark).toBe('open');
  });

  describe('фикстура: llm-request-chain.canvas (мост NAUTILUS, после правки render/canvas.js)', () => {
    const fixture: JSONCanvas = JSON.parse(
      readFileSync(fileURLToPath(new NodeURL('./fixtures/llm-request-chain.canvas', import.meta.url)), 'utf8'),
    );

    it('фикстура несёт desops:derived — не нарисована руками', () => {
      expect(fixture.metadata?.['desops:derived']).toMatch(/generator=dataviz\/causal-chain/);
    });

    it('все 10 звеньев читаются с их марками (перенесены из chain-timeline.example.json)', () => {
      const { nodes } = fromJSONCanvas(fixture);
      const marks: Record<string, string | undefined> = {};
      nodes.forEach((n) => { marks[n.id] = n.data.mark; });
      expect(marks).toEqual({
        call: 'open',
        gateway: 'open',
        pool: 'declared',
        'provider-direct': 'measured',
        'floor-warm': 'measured',
        'provider-gateway': 'measured',
        'floor-cache': 'measured',
        'floor-work': 'measured',
        'floor-cold': 'measured',
        'fallback-worst': 'inferred',
      });
      // Ни одна марка не выдумана мимо схемы — все входят в канон.
      Object.values(marks).forEach((m) => expect(MARK_IDS).toContain(m));
    });

    it('ни у одного ребра фикстуры нет mark (жанр causal-chain марку на ребро не ставит)', () => {
      const { edges } = fromJSONCanvas(fixture);
      expect(edges.every((e) => (e.data as any)?.mark === undefined)).toBe(true);
      expect(edges.length).toBeGreaterThan(0);
    });

    it('round-trip фикстуры через оба конца конвертера не теряет ни одной марки', () => {
      const { nodes, edges } = fromJSONCanvas(fixture);
      const back = toJSONCanvas(nodes, edges);
      const byId = new Map(fixture.nodes.map((n) => [n.id, n]));
      for (const n of back.nodes) {
        const original = byId.get(n.id)!;
        expect(n.metadata?.['sovern:mark']).toBe(original.metadata?.['sovern:mark']);
      }
    });
  });
});
