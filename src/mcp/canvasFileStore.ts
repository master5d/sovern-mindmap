// Файловый бэкенд канваса для MCP-сервера: ТОТ ЖЕ board.canvas, который читает
// UI (vite serveBoard → useBoardSync поллит /board.canvas). Единый источник
// правды: env SOVERN_BOARD — то же имя, тот же дефолт, что у vite.config.ts.
//
// Мутации работают ПРЯМО на сыром JSON Canvas — никакого round-trip через
// React-Flow-конверсию (fromJSONCanvas → toJSONCanvas): та теряет width/height
// (сервер не знает measured-размеров) и незнакомые metadata-ключи чужих нод.
// Правим только то, что попросили, остальные байты нод не трогаем.
//
// Конкурентный доступ (UI открыт параллельно, fb.mjs пишет тот же файл):
// перечитываем файл перед КАЖДОЙ мутацией и пишем атомарно (tmp + rename),
// чтобы поллер UI никогда не увидел недописанный JSON.
import { readFileSync, writeFileSync, renameSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JSONCanvas, JSONCanvasNode, JSONCanvasEdge } from '../types/index.js';

export const DEFAULT_BOARD_PATH = 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';

export function resolveBoardPath(): string {
  return process.env.SOVERN_BOARD ?? DEFAULT_BOARD_PATH;
}

function assertCanvasShape(parsed: unknown, path: string): asserts parsed is JSONCanvas {
  const c = parsed as JSONCanvas;
  if (!Array.isArray(c?.nodes) || !Array.isArray(c?.edges)) {
    throw new Error(`${path}: not a JSON Canvas file (expected {"nodes":[...],"edges":[...]})`);
  }
}

export class CanvasFileStore {
  constructor(readonly path: string) {}

  exists(): boolean {
    return existsSync(this.path);
  }

  /** Файла нет → пустой граф (не крах: warning печатает вызывающий).
   *  Битый JSON / не-canvas → честная ошибка с путём. */
  read(): JSONCanvas {
    if (!existsSync(this.path)) return { nodes: [], edges: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8'));
    } catch (e) {
      throw new Error(`${this.path}: unreadable JSON Canvas: ${(e as Error).message}`);
    }
    assertCanvasShape(parsed, this.path);
    return parsed;
  }

  /** Перечитать → изменить → атомарно записать. Свежий read на каждый вызов —
   *  правки UI/fb.mjs между инструментами не перетираются нашей старой копией. */
  mutate<T>(fn: (canvas: JSONCanvas) => T): T {
    const canvas = this.read();
    const result = fn(canvas);
    this.writeAtomic(canvas);
    return result;
  }

  private writeAtomic(canvas: JSONCanvas): void {
    mkdirSync(dirname(this.path), { recursive: true });
    // Уникальный tmp: два параллельных процесса не подерутся за одно имя.
    const tmp = `${this.path}.${process.pid}-${randomUUID().slice(0, 8)}.tmp`;
    try {
      // Та же сериализация, что у fb.mjs / UI: pretty-print 2 + завершающий \n.
      writeFileSync(tmp, JSON.stringify(canvas, null, 2) + '\n', 'utf8');
      renameSync(tmp, this.path);
    } catch (e) {
      try {
        rmSync(tmp, { force: true });
      } catch {
        /* уборка tmp не важнее исходной ошибки */
      }
      throw e;
    }
  }
}

// ── Операции над сырым канвасом (используются server.ts) ────────────────────

export interface CreateNodeInput {
  label: string;
  layer: string;
  parentId?: string;
  status?: string;
  budget?: number;
}

/** Добавляет ноду (и ребро от родителя) в сыром формате JSON Canvas. */
export function createCanvasNode(canvas: JSONCanvas, input: CreateNodeInput): JSONCanvasNode {
  if (input.parentId && !canvas.nodes.some((n) => n.id === input.parentId)) {
    throw new Error(`Parent node not found: ${input.parentId}`);
  }
  const node: JSONCanvasNode = {
    id: randomUUID(),
    type: 'text',
    x: Math.round(Math.random() * 500),
    y: Math.round(Math.random() * 500),
    width: 200,
    height: 80,
    text: input.label,
    metadata: {
      'sovern:layer': input.layer,
      'sovern:status': input.status ?? 'idle',
      'sovern:created': new Date().toISOString(),
    },
  };
  if (input.budget !== undefined) node.metadata!['sovern:budget'] = input.budget;
  canvas.nodes.push(node);
  if (input.parentId) {
    canvas.edges.push({
      id: `e-${input.parentId}-${node.id}`,
      fromNode: input.parentId,
      toNode: node.id,
    });
  }
  return node;
}

export interface UpdateNodePatch {
  label?: string;
  status?: string;
  budget?: number;
  agent?: string;
}

/** Точечный патч известных полей; чужие metadata-ключи и геометрия не трогаются. */
export function updateCanvasNode(canvas: JSONCanvas, nodeId: string, patch: UpdateNodePatch): JSONCanvasNode {
  const node = canvas.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (patch.label !== undefined) node.text = patch.label;
  const meta = (node.metadata ??= {});
  if (patch.status !== undefined) meta['sovern:status'] = patch.status;
  if (patch.budget !== undefined) meta['sovern:budget'] = patch.budget;
  if (patch.agent !== undefined) meta['sovern:agent'] = patch.agent;
  return node;
}

/** Поддерево от node_id по направленным рёбрам fromNode→toNode (read-only). */
export function readCanvasBranch(canvas: JSONCanvas, rootId: string): JSONCanvas {
  if (!canvas.nodes.some((n) => n.id === rootId)) {
    throw new Error(`Node not found: ${rootId}`);
  }
  const inTree = new Set<string>([rootId]);
  const branchEdges: JSONCanvasEdge[] = [];
  // Дети добавляются по мере обхода — обычный BFS по списку рёбер.
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of canvas.edges) {
      if (edge.fromNode === current && !inTree.has(edge.toNode)) {
        inTree.add(edge.toNode);
        branchEdges.push(edge);
        queue.push(edge.toNode);
      }
    }
  }
  return {
    nodes: canvas.nodes.filter((n) => inTree.has(n.id)),
    edges: branchEdges,
  };
}

/** Сумма sovern:budget по поддереву (read-only, без записи файла). */
export function calculateCanvasRollup(canvas: JSONCanvas, rootId: string): number {
  const branch = readCanvasBranch(canvas, rootId);
  return branch.nodes.reduce((sum, n) => {
    const b = n.metadata?.['sovern:budget'];
    return sum + (typeof b === 'number' ? b : 0);
  }, 0);
}
