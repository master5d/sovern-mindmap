import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CanvasFileStore,
  resolveBoardPath,
  DEFAULT_BOARD_PATH,
  createCanvasNode,
  updateCanvasNode,
  readCanvasBranch,
  calculateCanvasRollup,
  withFileLock,
} from './canvasFileStore';
import { normalizeBoardPath } from './boardSources';
import type { JSONCanvas } from '../types/index';

// Фикстура повторяет реальный формат board.canvas владельца (fb.mjs build):
// text-ноды с sovern:* metadata + ключи, которых наша модель не знает.
const ownerFixture: JSONCanvas = {
  nodes: [
    {
      id: 'area_lms',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      text: '📂 LMS',
      metadata: {
        'sovern:layer': 'lms',
        'sovern:status': 'idle',
        'sovern:impact': 5,
        'sovern:urgency': 5,
      },
    },
    {
      id: 'fb_aaaaaaaaaaaa',
      type: 'text',
      x: 40,
      y: 160,
      width: 260,
      height: 120,
      text: 'починить логин',
      metadata: {
        'sovern:layer': 'lms',
        'sovern:status': 'pending',
        'sovern:budget': 100,
        'custom:unknown-key': 'must survive',
      },
    },
    {
      id: 'fb_bbbbbbbbbbbb',
      type: 'text',
      x: 40,
      y: 320,
      width: 260,
      height: 120,
      text: 'вторая задача',
      metadata: { 'sovern:layer': 'lms', 'sovern:status': 'idle', 'sovern:budget': 50 },
    },
  ],
  edges: [
    { id: 'e1', fromNode: 'area_lms', toNode: 'fb_aaaaaaaaaaaa' },
    { id: 'e2', fromNode: 'fb_aaaaaaaaaaaa', toNode: 'fb_bbbbbbbbbbbb' },
  ],
};

let dir: string;
let boardPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'canvas-store-'));
  boardPath = join(dir, 'board.canvas');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const writeFixture = () =>
  writeFileSync(boardPath, JSON.stringify(ownerFixture, null, 2) + '\n', 'utf8');

describe('resolveBoardPath: MCP пишет в ЕДИНСТВЕННУЮ пишущую полосу', () => {
  const prevOne = process.env.SOVERN_BOARD;
  const prevMany = process.env.SOVERN_BOARDS;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'resolve-board-'));
  });
  afterEach(() => {
    if (prevOne === undefined) delete process.env.SOVERN_BOARD;
    else process.env.SOVERN_BOARD = prevOne;
    if (prevMany === undefined) delete process.env.SOVERN_BOARDS;
    else process.env.SOVERN_BOARDS = prevMany;
    rmSync(tmp, { recursive: true, force: true });
  });

  it('SOVERN_BOARD чтится как и раньше', () => {
    delete process.env.SOVERN_BOARDS;
    process.env.SOVERN_BOARD = 'X:/somewhere/b.canvas';
    expect(resolveBoardPath()).toBe('X:/somewhere/b.canvas');
  });

  it('SOVERN_BOARD нормализуется (обратные слэши, строчная буква диска)', () => {
    // F3: следующая задача переводит дев-сервер на resolveBoardPaths/
    // readBoardIndex, которые нормализуют ВСЕГДА — без нормализации здесь два
    // модуля посчитали бы разные boardSourceId для одного и того же борда.
    delete process.env.SOVERN_BOARDS;
    process.env.SOVERN_BOARD = 'x:\\somewhere\\b.canvas';
    expect(resolveBoardPath()).toBe('X:/somewhere/b.canvas');
  });

  it('без переменных — прежний дефолт', () => {
    delete process.env.SOVERN_BOARD;
    delete process.env.SOVERN_BOARDS;
    // F5: не мокая console.warn, тест шумел бы в реальный stdout, если на
    // машине нет DEFAULT_BOARD_PATH рядом со scripts/fb.mjs.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBoardPath()).toBe(DEFAULT_BOARD_PATH);
    warn.mockRestore();
  });

  it('из списка выбирается WRITABLE борд, а не первый попавшийся', () => {
    // Артефакты дизайн-ревью обязаны ехать в полосу обратной связи, а не в
    // производный борд, который следующая пересборка перезапишет.
    const derived = join(tmp, 'dataflow.canvas');
    writeFileSync(derived, '{"nodes":[],"edges":[]}', 'utf8');
    const feedback = join(tmp, 'feedback');
    mkdirSync(join(feedback, 'scripts'), { recursive: true });
    const live = join(feedback, 'board.canvas');
    writeFileSync(live, '{"nodes":[],"edges":[]}', 'utf8');
    writeFileSync(join(feedback, 'scripts', 'fb.mjs'), '// cli', 'utf8');

    delete process.env.SOVERN_BOARD;
    process.env.SOVERN_BOARDS = `${derived};${live}`;
    expect(resolveBoardPath()).toBe(normalizeBoardPath(live));
  });

  it('F1: заданы ОБЕ переменные — выигрывает writable из SOVERN_BOARDS, а не сырой SOVERN_BOARD', () => {
    // Ревьюер показал, что снятие защиты `single && !many` (замена на
    // `if (single) return single;`) оставляла все тесты зелёными: ни один не
    // задавал обе переменные разом. SOVERN_BOARD здесь указывает на
    // производный борд БЕЗ fb.mjs — если резолвер вернёт его сырым, тест
    // упадёт.
    const derivedSingle = join(tmp, 'derived-only.canvas');
    writeFileSync(derivedSingle, '{"nodes":[],"edges":[]}', 'utf8');

    const feedback = join(tmp, 'feedback');
    mkdirSync(join(feedback, 'scripts'), { recursive: true });
    const live = join(feedback, 'board.canvas');
    writeFileSync(live, '{"nodes":[],"edges":[]}', 'utf8');
    writeFileSync(join(feedback, 'scripts', 'fb.mjs'), '// cli', 'utf8');
    const derivedInList = join(tmp, 'derived-in-list.canvas');
    writeFileSync(derivedInList, '{"nodes":[],"edges":[]}', 'utf8');

    process.env.SOVERN_BOARD = derivedSingle;
    process.env.SOVERN_BOARDS = `${derivedInList};${live}`;
    expect(resolveBoardPath()).toBe(normalizeBoardPath(live));
    expect(resolveBoardPath()).not.toBe(derivedSingle);
  });

  it('в списке нет ни одного writable — берётся первый, но это НЕ молча', () => {
    const a = join(tmp, 'a.canvas');
    const b = join(tmp, 'b.canvas');
    writeFileSync(a, '{"nodes":[],"edges":[]}', 'utf8');
    writeFileSync(b, '{"nodes":[],"edges":[]}', 'utf8');
    delete process.env.SOVERN_BOARD;
    process.env.SOVERN_BOARDS = `${a};${b}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBoardPath()).toBe(normalizeBoardPath(a));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('F2а: пишущего нет, первый борд битый — выбирается второй, читаемый', () => {
    const broken = join(tmp, 'broken.canvas');
    writeFileSync(broken, 'not json at all', 'utf8');
    const readableBoard = join(tmp, 'readable.canvas');
    writeFileSync(readableBoard, '{"nodes":[],"edges":[]}', 'utf8');
    delete process.env.SOVERN_BOARD;
    process.env.SOVERN_BOARDS = `${broken};${readableBoard}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBoardPath()).toBe(normalizeBoardPath(readableBoard));
    warn.mockRestore();
  });

  it('F2б: все борды битые — берётся первый, а предупреждение называет его ошибку', () => {
    const broken1 = join(tmp, 'broken1.canvas');
    writeFileSync(broken1, 'not json at all', 'utf8');
    const broken2 = join(tmp, 'broken2.canvas');
    writeFileSync(broken2, 'also not json', 'utf8');
    delete process.env.SOVERN_BOARD;
    process.env.SOVERN_BOARDS = `${broken1};${broken2}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBoardPath()).toBe(normalizeBoardPath(broken1));
    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(message).toMatch(/не читается/);
    expect(message).toMatch(/не разбирается как JSON/);
    warn.mockRestore();
  });

  it('F4: заданы обе переменные — note про это долетает в console.warn', () => {
    const one = join(tmp, 'one.canvas');
    writeFileSync(one, '{"nodes":[],"edges":[]}', 'utf8');
    const two = join(tmp, 'two.canvas');
    writeFileSync(two, '{"nodes":[],"edges":[]}', 'utf8');
    process.env.SOVERN_BOARD = one;
    process.env.SOVERN_BOARDS = two;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveBoardPath();
    expect(warn).toHaveBeenCalled();
    const message = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(message).toContain('SOVERN_BOARDS');
    warn.mockRestore();
  });
});

describe('CanvasFileStore.read', () => {
  it('читает реальный формат владельца без потерь', () => {
    writeFixture();
    const canvas = new CanvasFileStore(boardPath).read();
    expect(canvas).toEqual(ownerFixture);
  });

  it('файла нет → пустой граф, не крах', () => {
    const store = new CanvasFileStore(boardPath);
    expect(store.exists()).toBe(false);
    expect(store.read()).toEqual({ nodes: [], edges: [] });
  });

  it('битый JSON → честная ошибка с путём', () => {
    writeFileSync(boardPath, '{ not json', 'utf8');
    expect(() => new CanvasFileStore(boardPath).read()).toThrow(/board\.canvas.*unreadable/);
  });

  it('валидный JSON, но не canvas → честная ошибка', () => {
    writeFileSync(boardPath, '{"foo": 1}', 'utf8');
    expect(() => new CanvasFileStore(boardPath).read()).toThrow(/not a JSON Canvas/);
  });
});

describe('CanvasFileStore.mutate', () => {
  it('атомарная запись: tmp-файлов не остаётся, файл — валидный canvas с \\n на конце', () => {
    writeFixture();
    const store = new CanvasFileStore(boardPath);
    store.mutate((c) => createCanvasNode(c, { label: 'new', layer: 'lms' }));
    expect(readdirSync(dir)).toEqual(['board.canvas']);
    const raw = readFileSync(boardPath, 'utf8');
    expect(raw.endsWith('}\n')).toBe(true);
    expect(JSON.parse(raw).nodes).toHaveLength(4);
  });

  it('перечитывает файл перед мутацией: параллельная правка UI не теряется', () => {
    writeFixture();
    const store = new CanvasFileStore(boardPath);
    store.read(); // сервер уже «видел» старую версию
    // UI/fb.mjs дописали ноду между нашими вызовами
    const external: JSONCanvas = JSON.parse(readFileSync(boardPath, 'utf8'));
    external.nodes.push({
      id: 'ui_added',
      type: 'text',
      x: 1,
      y: 1,
      width: 10,
      height: 10,
      text: 'ui',
    });
    writeFileSync(boardPath, JSON.stringify(external, null, 2) + '\n', 'utf8');

    store.mutate((c) => createCanvasNode(c, { label: 'mcp', layer: 'lms' }));
    const final: JSONCanvas = JSON.parse(readFileSync(boardPath, 'utf8'));
    const ids = final.nodes.map((n) => n.id);
    expect(ids).toContain('ui_added'); // правка UI выжила
    expect(final.nodes).toHaveLength(5); // 3 фикстуры + ui + mcp
  });

  it('мутация берёт межпроцессный лок и снимает его за собой', () => {
    writeFixture();
    const store = new CanvasFileStore(boardPath);
    let lockedDuringMutation = false;
    store.mutate((c) => {
      lockedDuringMutation = existsSync(`${boardPath}.lock`);
      return createCanvasNode(c, { label: 'x', layer: 'lms' });
    });
    expect(lockedDuringMutation).toBe(true);
    expect(existsSync(`${boardPath}.lock`)).toBe(false);
  });

  it('лок занят чужим процессом → мутация ПАДАЕТ, а не затирает его запись', () => {
    writeFixture();
    // чужой держатель: свежий lock-файл, который никто не отпустит
    writeFileSync(`${boardPath}.lock`, '424242\n', 'utf8');
    const store = new CanvasFileStore(boardPath, { timeoutMs: 120 });
    expect(() =>
      store.mutate((c) => createCanvasNode(c, { label: 'проигравший', layer: 'lms' }))
    ).toThrow(/busy — held by another process/);
    // файл не тронут: 3 ноды фикстуры, чужой лок на месте
    expect(JSON.parse(readFileSync(boardPath, 'utf8')).nodes).toHaveLength(3);
    expect(existsSync(`${boardPath}.lock`)).toBe(true);
    rmSync(`${boardPath}.lock`, { force: true });
  });

  it('протухший лок (процесс убит) снимается, мутация проходит', () => {
    writeFixture();
    const lockPath = `${boardPath}.lock`;
    writeFileSync(lockPath, '424242\n', 'utf8');
    // «брошен час назад»
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(lockPath, hourAgo, hourAgo);
    const store = new CanvasFileStore(boardPath);
    store.mutate((c) => createCanvasNode(c, { label: 'после протухшего', layer: 'lms' }));
    expect(JSON.parse(readFileSync(boardPath, 'utf8')).nodes).toHaveLength(4);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('withFileLock: ошибка внутри критической секции не оставляет лок', () => {
    const target = join(dir, 'x.canvas');
    expect(() =>
      withFileLock(target, () => {
        throw new Error('boom');
      })
    ).toThrow(/boom/);
    expect(existsSync(`${target}.lock`)).toBe(false);
  });

  it('мутация первого запуска создаёт файл', () => {
    const store = new CanvasFileStore(boardPath);
    store.mutate((c) => createCanvasNode(c, { label: 'first', layer: 'projects' }));
    expect(existsSync(boardPath)).toBe(true);
    expect(JSON.parse(readFileSync(boardPath, 'utf8')).nodes).toHaveLength(1);
  });
});

describe('операции над сырым канвасом', () => {
  it('createCanvasNode: нода + ребро от родителя, sovern:* metadata', () => {
    const canvas = structuredClone(ownerFixture);
    const node = createCanvasNode(canvas, {
      label: 'дочка',
      layer: 'lms',
      parentId: 'area_lms',
      status: 'active',
      budget: 25,
    });
    expect(canvas.nodes[canvas.nodes.length - 1].id).toBe(node.id);
    expect(node.metadata).toMatchObject({
      'sovern:layer': 'lms',
      'sovern:status': 'active',
      'sovern:budget': 25,
    });
    const edge = canvas.edges[canvas.edges.length - 1];
    expect(edge.fromNode).toBe('area_lms');
    expect(edge.toNode).toBe(node.id);
  });

  it('createCanvasNode: несуществующий родитель → ошибка, канвас не тронут', () => {
    const canvas = structuredClone(ownerFixture);
    expect(() => createCanvasNode(canvas, { label: 'x', layer: 'lms', parentId: 'nope' })).toThrow(
      /Parent node not found/
    );
    expect(canvas.nodes).toHaveLength(3);
  });

  it('updateCanvasNode: патчит только своё, чужие metadata и геометрия целы', () => {
    const canvas = structuredClone(ownerFixture);
    updateCanvasNode(canvas, 'fb_aaaaaaaaaaaa', { label: 'починено', status: 'done', agent: 'claude' });
    const node = canvas.nodes.find((n) => n.id === 'fb_aaaaaaaaaaaa')!;
    expect(node.text).toBe('починено');
    expect(node.metadata!['sovern:status']).toBe('done');
    expect(node.metadata!['sovern:agent']).toBe('claude');
    // незнакомый ключ и размеры не потеряны (главный риск round-trip конверсии)
    expect(node.metadata!['custom:unknown-key']).toBe('must survive');
    expect(node.width).toBe(260);
    expect(node.height).toBe(120);
  });

  it('updateCanvasNode: несуществующая нода → ошибка, а не тихий успех', () => {
    expect(() => updateCanvasNode(structuredClone(ownerFixture), 'nope', { label: 'x' })).toThrow(
      /Node not found/
    );
  });

  it('readCanvasBranch: поддерево по направленным рёбрам', () => {
    const branch = readCanvasBranch(ownerFixture, 'fb_aaaaaaaaaaaa');
    expect(branch.nodes.map((n) => n.id).sort()).toEqual(['fb_aaaaaaaaaaaa', 'fb_bbbbbbbbbbbb']);
    expect(branch.edges.map((e) => e.id)).toEqual(['e2']);
    expect(() => readCanvasBranch(ownerFixture, 'nope')).toThrow(/Node not found/);
  });

  it('calculateCanvasRollup: сумма sovern:budget по поддереву', () => {
    expect(calculateCanvasRollup(ownerFixture, 'area_lms')).toBe(150);
    expect(calculateCanvasRollup(ownerFixture, 'fb_bbbbbbbbbbbb')).toBe(50);
  });
});
