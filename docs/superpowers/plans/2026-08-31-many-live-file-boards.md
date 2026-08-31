# Many Live File Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живых файловых бордов становится много — вкладка на борд, — а писать по-прежнему умеет ровно один.

**Architecture:** Разбор списка и чтение индекса бордов живут в `src/mcp/` как чистые модули, потому что `vite.config.ts` лежит вне `src/**` и vitest его не видит; конфиг только вешает маршруты поверх них — тот же приём, что уже применён для `artifactInbox`, `httpBody`, `pathContainment`. Клиент вместо поллинга одного файла целиком опрашивает индекс и перечитывает лишь то, у чего сменился `mtime`. Способность к записи не объявляется конфигом, а выводится пробой файловой системы.

**Tech Stack:** TypeScript, Vite dev-middleware, React + zustand, vitest (`npm test` = `vitest run`, окружение jsdom).

**Spec:** `docs/superpowers/specs/2026-08-31-many-live-file-boards-design.md`

## Global Constraints

- Разделитель списка в `SOVERN_BOARDS` — `;`. Двоеточие исключено: путь Windows содержит `C:`.
- Элемент списка — файл `*.canvas` **либо каталог**; каталог разворачивается БЕЗ рекурсии.
- Порядок детерминирован: элементы как перечислены, внутри каталога — по имени файла.
- `SOVERN_BOARD` (ед. ч.) = список из одного элемента. Заданы обе → выигрывает `SOVERN_BOARDS`, и это **печатается в консоль**, а не решается молча.
- Обе пусты → дефолт `C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas`.
- `id` борда — **стабильный хеш пути, НЕ индекс**.
- Один и тот же файл, названный дважды, даёт ОДНУ запись.
- Битый/пропавший файл не роняет список: у записи появляется `error` (строка), `name` берётся из имени файла.
- Разбор файла ради `name` кэшируется по паре `(path, mtime)`.
- `writable` — результат пробы: рядом с бордом лежит `scripts/fb.mjs`.
- Запись в не-writable борд → **400 с внятной причиной**, не тихий успех.
- Защита от StrictMode в `useBoardSync` сохраняется: содержимое живого борда не должно садиться на пользовательскую доску.
- Существующий маршрут `GET /board.canvas` остаётся и отдаёт первый борд списка.
- Все сообщения об ошибках и комментарии — по-русски, как в остальном репозитории.

---

### Task 1: Разбор списка бордов (`boardSources.ts`)

**Files:**
- Create: `src/mcp/boardSources.ts`
- Test: `src/mcp/boardSources.test.ts`

**Interfaces:**
- Consumes: ничего из предыдущих задач.
- Produces:
  - `export const DEFAULT_BOARD_PATH: string`
  - `export function normalizeBoardPath(p: string): string`
  - `export function boardSourceId(p: string): string` — 12 hex-символов
  - `export function resolveBoardPaths(env?: NodeJS.ProcessEnv): { paths: string[]; note: string | null }`

- [ ] **Step 1: Написать падающий тест**

Создать `src/mcp/boardSources.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_BOARD_PATH,
  normalizeBoardPath,
  boardSourceId,
  resolveBoardPaths,
} from './boardSources';

let dir: string;
const touch = (p: string) => writeFileSync(p, '{"nodes":[],"edges":[]}', 'utf8');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'board-sources-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveBoardPaths', () => {
  it('обе переменные пусты — прежний дефолт, обратная совместимость', () => {
    const r = resolveBoardPaths({});
    expect(r.paths).toEqual([normalizeBoardPath(DEFAULT_BOARD_PATH)]);
    expect(r.note).toBeNull();
  });

  it('SOVERN_BOARD означает список из одного элемента', () => {
    const f = join(dir, 'a.canvas');
    touch(f);
    expect(resolveBoardPaths({ SOVERN_BOARD: f }).paths).toEqual([normalizeBoardPath(f)]);
  });

  it('SOVERN_BOARDS разбирается по «;» и сохраняет порядок перечисления', () => {
    const a = join(dir, 'a.canvas');
    const b = join(dir, 'b.canvas');
    touch(a);
    touch(b);
    expect(resolveBoardPaths({ SOVERN_BOARDS: `${b};${a}` }).paths).toEqual([
      normalizeBoardPath(b),
      normalizeBoardPath(a),
    ]);
  });

  it('каталог разворачивается в свои *.canvas по имени, БЕЗ рекурсии', () => {
    touch(join(dir, 'b.canvas'));
    touch(join(dir, 'a.canvas'));
    writeFileSync(join(dir, 'readme.md'), 'не борд', 'utf8');
    mkdirSync(join(dir, 'nested'));
    touch(join(dir, 'nested', 'deep.canvas'));
    const r = resolveBoardPaths({ SOVERN_BOARDS: dir });
    expect(r.paths).toEqual([
      normalizeBoardPath(join(dir, 'a.canvas')),
      normalizeBoardPath(join(dir, 'b.canvas')),
    ]);
  });

  it('смесь файла и каталога', () => {
    const solo = join(dir, 'solo.canvas');
    touch(solo);
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    touch(join(sub, 'x.canvas'));
    const r = resolveBoardPaths({ SOVERN_BOARDS: `${solo};${sub}` });
    expect(r.paths).toEqual([
      normalizeBoardPath(solo),
      normalizeBoardPath(join(sub, 'x.canvas')),
    ]);
  });

  it('заданы обе переменные — выигрывает множественная, и это СКАЗАНО вслух', () => {
    const a = join(dir, 'a.canvas');
    const b = join(dir, 'b.canvas');
    touch(a);
    touch(b);
    const r = resolveBoardPaths({ SOVERN_BOARD: a, SOVERN_BOARDS: b });
    expect(r.paths).toEqual([normalizeBoardPath(b)]);
    expect(r.note).toMatch(/SOVERN_BOARDS/);
    expect(r.note).toMatch(/SOVERN_BOARD/);
  });

  it('один и тот же файл, названный дважды, даёт ОДНУ запись', () => {
    const a = join(dir, 'a.canvas');
    touch(a);
    const r = resolveBoardPaths({ SOVERN_BOARDS: `${a};${dir};${a}` });
    expect(r.paths).toEqual([normalizeBoardPath(a)]);
  });

  it('пустые элементы и пробелы вокруг путей отбрасываются', () => {
    const a = join(dir, 'a.canvas');
    touch(a);
    expect(resolveBoardPaths({ SOVERN_BOARDS: ` ;  ${a}  ; ` }).paths).toEqual([
      normalizeBoardPath(a),
    ]);
  });

  it('несуществующий путь ОСТАЁТСЯ в списке — про него скажет индекс, а не молчание', () => {
    const ghost = join(dir, 'ghost.canvas');
    expect(resolveBoardPaths({ SOVERN_BOARDS: ghost }).paths).toEqual([
      normalizeBoardPath(ghost),
    ]);
  });
});

describe('boardSourceId', () => {
  it('одинаков для одного пути и различен для разных', () => {
    expect(boardSourceId('C:/x/a.canvas')).toBe(boardSourceId('C:/x/a.canvas'));
    expect(boardSourceId('C:/x/a.canvas')).not.toBe(boardSourceId('C:/x/b.canvas'));
  });

  it('не зависит от вида разделителя и регистра диска', () => {
    expect(boardSourceId('C:\\x\\a.canvas')).toBe(boardSourceId('c:/x/a.canvas'));
  });

  it('НЕ зависит от позиции в списке: вставка борда в середину не переставляет id', () => {
    // Мутационный смысл теста: сделать id индексом — и он покраснеет.
    const a = 'C:/x/a.canvas';
    const c = 'C:/x/c.canvas';
    const before = [a, c].map(boardSourceId);
    const after = [a, 'C:/x/b.canvas', c].map(boardSourceId);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/mcp/boardSources.test.ts`
Expected: FAIL — `Failed to resolve import "./boardSources"`.

- [ ] **Step 3: Написать модуль**

Создать `src/mcp/boardSources.ts`:

```ts
// Разбор списка живых бордов. Живёт здесь, а не в vite.config.ts, по той же
// причине, что artifactInbox/httpBody/pathContainment: конфиг лежит вне src/**,
// и vitest его не видит — логика в конфиге была бы непокрываемой.
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_BOARD_PATH = 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';

/** Единый вид пути: прямые слэши, без хвостового, диск в верхнем регистре.
 *  Нужен и для сравнения (дубли в списке), и для устойчивого id. */
export function normalizeBoardPath(p: string): string {
  const slashed = p.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return slashed.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
}

/** Идентификатор борда — хеш ПУТИ, а не позиция в списке.
 *  Индекс сдвинется при вставке борда в середину, и содержимое вкладок молча
 *  поменяется местами. */
export function boardSourceId(p: string): string {
  return createHash('sha1').update(normalizeBoardPath(p)).digest('hex').slice(0, 12);
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Каталог -> его *.canvas по имени. Без рекурсии: рекурсивный обход втянул бы
 *  node_modules и чужие артефакты. */
function expandDirectory(p: string): string[] {
  return readdirSync(p)
    .filter((f) => f.toLowerCase().endsWith('.canvas'))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => normalizeBoardPath(join(p, f)));
}

export function resolveBoardPaths(env: NodeJS.ProcessEnv = process.env): {
  paths: string[];
  note: string | null;
} {
  const many = env.SOVERN_BOARDS?.trim();
  const one = env.SOVERN_BOARD?.trim();

  let note: string | null = null;
  if (many && one) {
    // Молчаливый выбор между двумя источниками правды — то, из-за чего потом
    // полдня ищут, «почему открылся не тот борд».
    note = 'заданы обе переменные: SOVERN_BOARDS выигрывает, SOVERN_BOARD игнорируется';
  }

  const raw = many ?? one ?? DEFAULT_BOARD_PATH;
  const entries = raw
    .split(';')
    .map((e) => e.trim())
    .filter(Boolean);

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    // Несуществующий путь НЕ выбрасывается: про него скажет индекс отдельной
    // записью с причиной. Молча выпавший борд читался бы как «его и не было».
    const expanded = isDirectory(entry) ? expandDirectory(entry) : [normalizeBoardPath(entry)];
    for (const p of expanded) {
      if (seen.has(p)) continue;
      seen.add(p);
      paths.push(p);
    }
  }
  return { paths, note };
}
```

- [ ] **Step 4: Прогнать тест и убедиться, что он проходит**

Run: `npm test -- src/mcp/boardSources.test.ts`
Expected: PASS, 11 тестов.

- [ ] **Step 5: Мутационная проверка — id по индексу обязан краснеть**

Временно заменить тело `boardSourceId` на `return String(p.length);` и прогнать
`npm test -- src/mcp/boardSources.test.ts`. Ожидается падение теста «одинаков для одного
пути и различен для разных». Вернуть исходное тело. Если тест НЕ упал — тест декоративен,
чинить тест, а не код.

- [ ] **Step 6: Коммит**

```bash
git add src/mcp/boardSources.ts src/mcp/boardSources.test.ts
git commit -m "feat(boards): разбор SOVERN_BOARDS — файлы, каталоги, устойчивый id по пути"
```

---

### Task 2: Индекс бордов (`boardIndex.ts`)

**Files:**
- Create: `src/mcp/boardIndex.ts`
- Test: `src/mcp/boardIndex.test.ts`

**Interfaces:**
- Consumes: `boardSourceId`, `normalizeBoardPath` из `./boardSources`.
- Produces:
  - `export interface BoardSource { id: string; name: string; path: string; writable: boolean; mtime: number; error?: string }`
  - `export function fbCliFor(boardPath: string): string | null`
  - `export function readBoardIndex(paths: string[]): BoardSource[]`
  - `export function clearBoardNameCache(): void`

- [ ] **Step 1: Написать падающий тест**

Создать `src/mcp/boardIndex.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boardSourceId, normalizeBoardPath } from './boardSources';
import { readBoardIndex, fbCliFor, clearBoardNameCache } from './boardIndex';

let dir: string;

const board = (nodes: unknown[] = [], metadata?: Record<string, string>) =>
  JSON.stringify({ ...(metadata ? { metadata } : {}), nodes, edges: [] });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'board-index-'));
  clearBoardNameCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readBoardIndex', () => {
  it('имя берётся из metadata.desops:title, когда оно есть', () => {
    const p = join(dir, 'dataflow.canvas');
    writeFileSync(p, board([], { 'desops:title': 'Потоки данных' }), 'utf8');
    expect(readBoardIndex([p])[0].name).toBe('Потоки данных');
  });

  it('без desops:title имя — файл без расширения, а не «board.canvas (live)»', () => {
    const p = join(dir, 'fleet.canvas');
    writeFileSync(p, board(), 'utf8');
    expect(readBoardIndex([p])[0].name).toBe('fleet');
  });

  it('id записи совпадает с boardSourceId пути', () => {
    const p = join(dir, 'a.canvas');
    writeFileSync(p, board(), 'utf8');
    expect(readBoardIndex([p])[0].id).toBe(boardSourceId(p));
    expect(readBoardIndex([p])[0].path).toBe(normalizeBoardPath(p));
  });

  it('пропавший файл даёт запись с error и НЕ роняет соседей', () => {
    const good = join(dir, 'good.canvas');
    writeFileSync(good, board(), 'utf8');
    const ghost = join(dir, 'ghost.canvas');
    const r = readBoardIndex([ghost, good]);
    expect(r).toHaveLength(2);
    expect(r[0].error).toBeTruthy();
    expect(r[0].name).toBe('ghost');
    expect(r[1].error).toBeUndefined();
    expect(r[1].name).toBe('good');
  });

  it('битый JSON — это error, а не пустой борд', () => {
    const p = join(dir, 'broken.canvas');
    writeFileSync(p, '{ это не json', 'utf8');
    const r = readBoardIndex([p])[0];
    // «Не смог прочитать» обязано выглядеть иначе, чем «пусто».
    expect(r.error).toBeTruthy();
    expect(r.name).toBe('broken');
  });

  it('файл без nodes/edges — тоже error: это не JSON Canvas', () => {
    const p = join(dir, 'notcanvas.canvas');
    writeFileSync(p, JSON.stringify({ hello: 'world' }), 'utf8');
    expect(readBoardIndex([p])[0].error).toBeTruthy();
  });

  it('writable только там, где рядом лежит scripts/fb.mjs', () => {
    const feedback = join(dir, 'feedback');
    mkdirSync(join(feedback, 'scripts'), { recursive: true });
    const live = join(feedback, 'board.canvas');
    writeFileSync(live, board(), 'utf8');
    writeFileSync(join(feedback, 'scripts', 'fb.mjs'), '// cli', 'utf8');

    const derived = join(dir, 'dataflow.canvas');
    writeFileSync(derived, board(), 'utf8');

    const r = readBoardIndex([live, derived]);
    expect(r[0].writable).toBe(true);
    expect(r[1].writable).toBe(false);
    expect(fbCliFor(live)).toBe(normalizeBoardPath(join(feedback, 'scripts', 'fb.mjs')));
    expect(fbCliFor(derived)).toBeNull();
  });

  it('mtime отдаётся и меняется при перезаписи файла', () => {
    const p = join(dir, 'a.canvas');
    writeFileSync(p, board(), 'utf8');
    const first = readBoardIndex([p])[0].mtime;
    expect(first).toBeGreaterThan(0);
    utimesSync(p, new Date(), new Date(Date.now() + 5000));
    expect(readBoardIndex([p])[0].mtime).not.toBe(first);
  });

  it('разбор кэшируется по (path, mtime) и переснимается при смене mtime', () => {
    const p = join(dir, 'a.canvas');
    writeFileSync(p, board([], { 'desops:title': 'Первое' }), 'utf8');
    const stamp = new Date(Date.now() - 10_000);
    utimesSync(p, stamp, stamp);
    expect(readBoardIndex([p])[0].name).toBe('Первое');

    // Содержимое сменилось, mtime — нет: кэш обязан отдать прежнее имя.
    writeFileSync(p, board([], { 'desops:title': 'Второе' }), 'utf8');
    utimesSync(p, stamp, stamp);
    expect(readBoardIndex([p])[0].name).toBe('Первое');

    // Сменился mtime — имя переснимается.
    const later = new Date(Date.now() + 10_000);
    utimesSync(p, later, later);
    expect(readBoardIndex([p])[0].name).toBe('Второе');
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/mcp/boardIndex.test.ts`
Expected: FAIL — `Failed to resolve import "./boardIndex"`.

- [ ] **Step 3: Написать модуль**

Создать `src/mcp/boardIndex.ts`:

```ts
// Индекс живых бордов: что лежит по каждому пути, как это назвать, можно ли
// туда писать. Отдельно от boardSources, потому что это чтение диска, а не
// разбор конфигурации.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { boardSourceId, normalizeBoardPath } from './boardSources';

export interface BoardSource {
  id: string;
  name: string;
  path: string;
  writable: boolean;
  mtime: number;
  /** Причина, по которой борд не прочитан. Присутствие поля = «не смог
   *  прочитать», и это ДРУГОЕ состояние, чем пустой борд. */
  error?: string;
}

/** Проба способности к записи: CLI обратной связи лежит рядом с бордом.
 *  Способность выводится из файловой системы, а не объявляется конфигом —
 *  список исключений разъехался бы с реальностью. */
export function fbCliFor(boardPath: string): string | null {
  const cli = normalizeBoardPath(join(dirname(boardPath), 'scripts', 'fb.mjs'));
  return existsSync(cli) ? cli : null;
}

interface CacheEntry {
  mtime: number;
  name: string;
  error?: string;
}
const nameCache = new Map<string, CacheEntry>();

export function clearBoardNameCache(): void {
  nameCache.clear();
}

function titleFrom(text: string, fallback: string): { name: string; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { name: fallback, error: `не разбирается как JSON: ${(e as Error).message}` };
  }
  const c = parsed as { nodes?: unknown; edges?: unknown; metadata?: Record<string, string> };
  if (!Array.isArray(c?.nodes) || !Array.isArray(c?.edges)) {
    return { name: fallback, error: 'не JSON Canvas: ожидались массивы nodes и edges' };
  }
  const title = c.metadata?.['desops:title'];
  return { name: typeof title === 'string' && title.trim() ? title.trim() : fallback };
}

export function readBoardIndex(paths: string[]): BoardSource[] {
  return paths.map((raw) => {
    const path = normalizeBoardPath(raw);
    const id = boardSourceId(path);
    const fallback = basename(path).replace(/\.canvas$/i, '');
    const writable = fbCliFor(path) !== null;

    let mtime = 0;
    try {
      mtime = statSync(path).mtimeMs;
    } catch (e) {
      return { id, name: fallback, path, writable, mtime: 0, error: `файл недоступен: ${(e as Error).message}` };
    }

    // Разбор ради имени кэшируется по (path, mtime): иначе «клиент не тянет
    // файлы целиком» превратилось бы в «их целиком тянет сервер на каждый тик».
    const hit = nameCache.get(path);
    if (hit && hit.mtime === mtime) {
      return { id, name: hit.name, path, writable, mtime, ...(hit.error ? { error: hit.error } : {}) };
    }

    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (e) {
      return { id, name: fallback, path, writable, mtime, error: `файл не читается: ${(e as Error).message}` };
    }
    const { name, error } = titleFrom(text, fallback);
    nameCache.set(path, { mtime, name, error });
    return { id, name, path, writable, mtime, ...(error ? { error } : {}) };
  });
}
```

- [ ] **Step 4: Прогнать тест и убедиться, что он проходит**

Run: `npm test -- src/mcp/boardIndex.test.ts`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Мутационная проверка — проба записи обязана краснеть**

Временно заменить тело `fbCliFor` на `return normalizeBoardPath(join(dirname(boardPath), 'scripts', 'fb.mjs'));`
(то есть считать writable ВСЕХ) и прогнать `npm test -- src/mcp/boardIndex.test.ts`.
Ожидается падение теста «writable только там, где рядом лежит scripts/fb.mjs». Вернуть исходное.

- [ ] **Step 6: Коммит**

```bash
git add src/mcp/boardIndex.ts src/mcp/boardIndex.test.ts
git commit -m "feat(boards): индекс живых бордов — имя, mtime, проба записи, error вместо пустоты"
```

---

### Task 3: MCP-сервер пишет в writable-борд

**Files:**
- Modify: `src/mcp/canvasFileStore.ts:38-42`
- Test: `src/mcp/canvasFileStore.test.ts` (дополнить существующий блок про `resolveBoardPath`)

**Interfaces:**
- Consumes: `resolveBoardPaths` из `./boardSources`, `readBoardIndex` из `./boardIndex`.
- Produces: `resolveBoardPath()` продолжает возвращать `string`; `DEFAULT_BOARD_PATH` реэкспортируется из `./boardSources`, чтобы константа не жила двумя копиями.

- [ ] **Step 1: Написать падающий тест**

В `src/mcp/canvasFileStore.test.ts` заменить блок `describe`, содержащий тест
«честит env SOVERN_BOARD, иначе дефолт совпадает с vite.config.ts», на:

```ts
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

  it('без переменных — прежний дефолт', () => {
    delete process.env.SOVERN_BOARD;
    delete process.env.SOVERN_BOARDS;
    expect(resolveBoardPath()).toBe(DEFAULT_BOARD_PATH);
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
});
```

Дописать в шапку файла недостающие импорты: `mkdtempSync`, `mkdirSync`, `rmSync`, `writeFileSync`
из `node:fs`, `tmpdir` из `node:os`, `join` из `node:path`, `vi` из `vitest`, а также
`normalizeBoardPath` из `./boardSources` — если чего-то из этого там ещё нет.

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/mcp/canvasFileStore.test.ts`
Expected: FAIL на тесте «из списка выбирается WRITABLE борд» — сейчас возвращается
`process.env.SOVERN_BOARDS` целиком либо дефолт.

- [ ] **Step 3: Переписать резолвер**

В `src/mcp/canvasFileStore.ts` заменить

```ts
export const DEFAULT_BOARD_PATH = 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';

export function resolveBoardPath(): string {
  return process.env.SOVERN_BOARD ?? DEFAULT_BOARD_PATH;
}
```

на

```ts
// Константа больше не живёт здесь второй копией: единственное объявление —
// в boardSources, откуда её читают и конфиг, и этот модуль.
export { DEFAULT_BOARD_PATH } from './boardSources';

/** Куда пишет MCP. Живых бордов может быть много, но ПИШУЩАЯ полоса одна:
 *  артефакты дизайн-ревью обязаны ехать в неё, а не в производный борд,
 *  который следующая пересборка перезапишет. */
export function resolveBoardPath(): string {
  const single = process.env.SOVERN_BOARD?.trim();
  if (single && !process.env.SOVERN_BOARDS?.trim()) return single;

  const { paths } = resolveBoardPaths();
  const index = readBoardIndex(paths);
  const writable = index.find((b) => b.writable);
  if (writable) return writable.path;

  const first = index[0];
  // Тихий выбор здесь означал бы, что артефакты уедут в борд, который их
  // потеряет при следующей пересборке.
  console.warn(
    `[SOVERN] среди живых бордов нет ни одного пишущего (нет scripts/fb.mjs рядом); беру первый: ${first?.path ?? DEFAULT_BOARD_PATH}`,
  );
  return first?.path ?? DEFAULT_BOARD_PATH;
}
```

Добавить в шапку файла импорты:

```ts
import { resolveBoardPaths, DEFAULT_BOARD_PATH } from './boardSources';
import { readBoardIndex } from './boardIndex';
```

Проверить, что старая строка `export const DEFAULT_BOARD_PATH = ...` удалена, иначе
получится два объявления одного имени и сборка упадёт.

- [ ] **Step 4: Прогнать тесты и убедиться, что они проходят**

Run: `npm test -- src/mcp/canvasFileStore.test.ts`
Expected: PASS — весь файл, включая существующие тесты блокировок и мутаций.

- [ ] **Step 5: Коммит**

```bash
git add src/mcp/canvasFileStore.ts src/mcp/canvasFileStore.test.ts
git commit -m "feat(mcp): резолвер борда выбирает пишущую полосу, а не первый путь из списка"
```

---

### Task 4: Маршруты дев-сервера

**Files:**
- Modify: `vite.config.ts:29-33` (константы), `vite.config.ts:40-52` (`serveBoard`), `vite.config.ts:55-90` (`/api/feedback/status`)
- Test: покрытия нет по устройству — `vite.config.ts` вне `src/**`; вся логика уже покрыта задачами 1-2, здесь только проводка.

**Interfaces:**
- Consumes: `resolveBoardPaths` из `./src/mcp/boardSources`, `readBoardIndex` и `fbCliFor` из `./src/mcp/boardIndex`.
- Produces: HTTP-контракт для задач 5-7 — `GET /api/boards` → `BoardSource[]`, `GET /board/<id>.canvas` → тело файла, `POST /api/feedback/status { id, status, boardId }`.

- [ ] **Step 1: Заменить константы пути**

В `vite.config.ts` заменить

```ts
// Путь к board.canvas: env SOVERN_BOARD или дефолт — mc_hub feedback board.
const BOARD_PATH =
  process.env.SOVERN_BOARD ?? 'C:/telo/Efforts/Ongoing/mc_hub/feedback/board.canvas';
// fb.mjs живёт рядом с board.canvas: <feedback>/scripts/fb.mjs
const FB_CLI = join(dirname(BOARD_PATH), 'scripts', 'fb.mjs');
```

на

```ts
// Живых бордов может быть много: SOVERN_BOARDS перечисляет файлы И каталоги.
// Разбор — в src/mcp/boardSources, потому что этот файл вне src/** и vitest
// его не видит; логика здесь была бы непокрываемой.
const { paths: BOARD_PATHS, note: BOARD_NOTE } = resolveBoardPaths();
if (BOARD_NOTE) console.warn(`[SOVERN] ${BOARD_NOTE}`);
console.log(`[SOVERN] живых бордов: ${BOARD_PATHS.length}`);
```

и добавить к импортам в шапке файла:

```ts
import { resolveBoardPaths } from './src/mcp/boardSources';
import { readBoardIndex, fbCliFor } from './src/mcp/boardIndex';
```

Проверить, что `dirname` и `join` всё ещё используются где-то ниже; если после правки
они осиротели — убрать из импорта `node:path`, иначе сборка предупредит о неиспользуемом.

- [ ] **Step 2: Переписать `serveBoard`**

Заменить тело `server.middlewares.use('/board.canvas', ...)` и добавить два маршрута —
итоговый фрагмент внутри `configureServer(server)`:

```ts
    // GET /api/boards — что вообще живо, как это назвать и куда можно писать.
    server.middlewares.use('/api/boards', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(readBoardIndex(BOARD_PATHS)));
    });

    // GET /board/<id>.canvas — содержимое одного борда по устойчивому id.
    server.middlewares.use('/board/', (req, res) => {
      const id = String(req.url ?? '').replace(/^\//, '').replace(/\.canvas$/, '').split('?')[0];
      const found = readBoardIndex(BOARD_PATHS).find((b) => b.id === id);
      if (!found) {
        res.statusCode = 404;
        res.end(`борд с id ${id} не значится среди живых`);
        return;
      }
      if (!existsSync(found.path)) {
        res.statusCode = 404;
        res.end('борд не найден на диске: ' + found.path);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(found.path, 'utf8'));
    });

    // GET /board.canvas — ПЕРВЫЙ борд списка. Маршрут сохранён: на него смотрят
    // внешние потребители и вкладки, созданные до этой правки.
    server.middlewares.use('/board.canvas', (_req, res) => {
      const first = BOARD_PATHS[0];
      if (!first || !existsSync(first)) {
        res.statusCode = 404;
        res.end('board.canvas not found at ' + first);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(first, 'utf8'));
    });
```

- [ ] **Step 3: Закрыть запись в чужой борд**

В обработчике `/api/feedback/status` заменить разбор тела и вызов CLI:

```ts
          const { id, status } = JSON.parse(body);
          // strict-валидация: аргументы уходят в execFile без shell, но не доверяем входу
          if (!ID_RE.test(id) || !STATUSES.includes(status)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'invalid id or status' }));
            return;
          }
          const out = execFileSync(process.execPath, [FB_CLI, 'status', id, status], {
```

на

```ts
          const { id, status, boardId } = JSON.parse(body);
          // strict-валидация: аргументы уходят в execFile без shell, но не доверяем входу
          if (!ID_RE.test(id) || !STATUSES.includes(status)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'invalid id or status' }));
            return;
          }
          const target = readBoardIndex(BOARD_PATHS).find((b) => b.id === boardId);
          if (!target) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: `борд ${boardId} не значится среди живых` }));
            return;
          }
          const cli = fbCliFor(target.path);
          if (!cli) {
            // Без этой проверки перетаскивание карточки на ПРОИЗВОДНОМ борде
            // ушло бы в fb.mjs от mc_hub с идентификатором, которого там нет.
            res.statusCode = 400;
            res.end(JSON.stringify({
              ok: false,
              error: `борд «${target.name}» производный: править его нечем, рядом нет scripts/fb.mjs`,
            }));
            return;
          }
          const out = execFileSync(process.execPath, [cli, 'status', id, status], {
```

- [ ] **Step 4: Проверить руками, что дев-сервер жив**

Run:
```bash
npm run build
```
Expected: сборка проходит (это же проверяет типы конфига).

Затем поднять дев-сервер с двумя бордами и снять три ответа:
```bash
SOVERN_BOARDS="C:/telo/Efforts/Ongoing/mc_hub/feedback;C:/telo/Efforts/Ongoing/NAUTILUS/docs/plates/observatory" npm run dev
```
В другом окне:
```bash
curl -s http://localhost:1420/api/boards
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:1420/board.canvas
```
Expected: в списке ≥3 записи, ровно одна с `"writable":true`; `/board.canvas` отвечает 200.
Записать фактический вывод в отчёт — «сервер поднялся» без ответов не считается проверкой.

- [ ] **Step 5: Коммит**

```bash
git add vite.config.ts
git commit -m "feat(dev): /api/boards и /board/<id>.canvas; запись только в борд со своим fb.mjs"
```

---

### Task 5: Вкладка на борд в хранилище

**Files:**
- Modify: `src/store/useWorkflowStore.ts:32-36` (`BoardMeta`), `:118` (тип экшена), `:475-483` (`ensureFileBoard`)
- Test: `src/store/boards.test.ts` (дописать блок)

**Interfaces:**
- Consumes: ничего с сервера напрямую — принимает уже готовый список.
- Produces:
  - `BoardMeta = { id: string; name: string; kind: 'user' | 'review' | 'file'; sourceId?: string; writable?: boolean; sourceError?: string }`
  - `syncFileBoards(sources: { id: string; name: string; writable?: boolean; error?: string }[]): void`
  - `ensureFileBoard()` сохраняется как есть — на нём стоит существующий вызов в `useBoardSync`.

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `src/store/boards.test.ts`:

```ts
describe('syncFileBoards: вкладка на живой борд', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({ boards: [], activeBoardId: null });
  });

  it('заводит по вкладке на каждый борд и помнит sourceId', () => {
    useWorkflowStore.getState().syncFileBoards([
      { id: 'aaa', name: 'Флот и ярусы' },
      { id: 'bbb', name: 'Потоки данных' },
    ]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file.map((b) => b.sourceId)).toEqual(['aaa', 'bbb']);
    expect(file.map((b) => b.name)).toEqual(['Флот и ярусы', 'Потоки данных']);
  });

  it('повторный вызов не плодит дублей и обновляет имя', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'Старое' }]);
    s.syncFileBoards([{ id: 'aaa', name: 'Новое' }]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(1);
    expect(file[0].name).toBe('Новое');
  });

  it('исчезнувший борд убирает свою вкладку, а пользовательские не трогает', () => {
    const s = useWorkflowStore.getState();
    s.createBoard('Моя доска');
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'bbb', name: 'B' }]);
    s.syncFileBoards([{ id: 'bbb', name: 'B' }]);
    const boards = useWorkflowStore.getState().boards;
    expect(boards.filter((b) => b.kind === 'file').map((b) => b.sourceId)).toEqual(['bbb']);
    expect(boards.some((b) => b.name === 'Моя доска')).toBe(true);
  });

  it('вставка борда в СЕРЕДИНУ не переставляет существующие вкладки', () => {
    // Ради этого id — хеш пути, а не индекс.
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }, { id: 'ccc', name: 'C' }]);
    const idOfA = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    s.syncFileBoards([
      { id: 'aaa', name: 'A' },
      { id: 'bbb', name: 'B' },
      { id: 'ccc', name: 'C' },
    ]);
    expect(useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id).toBe(idOfA);
  });

  it('переносит writable и error на вкладку — их показывает интерфейс', () => {
    useWorkflowStore.getState().syncFileBoards([
      { id: 'aaa', name: 'Обратная связь', writable: true },
      { id: 'bbb', name: 'ghost', error: 'файл недоступен' },
    ]);
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file[0].writable).toBe(true);
    expect(file[0].sourceError).toBeUndefined();
    expect(file[1].writable).toBeFalsy();
    expect(file[1].sourceError).toBe('файл недоступен');
  });

  it('починившийся борд теряет sourceError, а не носит его вечно', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A', error: 'файл недоступен' }]);
    s.syncFileBoards([{ id: 'aaa', name: 'A' }]);
    const file = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!;
    expect(file.sourceError).toBeUndefined();
  });

  it('активная вкладка исчезнувшего борда не оставляет activeBoardId в никуда', () => {
    const s = useWorkflowStore.getState();
    s.syncFileBoards([{ id: 'aaa', name: 'A' }]);
    const gone = useWorkflowStore.getState().boards.find((b) => b.sourceId === 'aaa')!.id;
    useWorkflowStore.setState({ activeBoardId: gone });
    s.syncFileBoards([]);
    const st = useWorkflowStore.getState();
    expect(st.boards.some((b) => b.id === st.activeBoardId)).toBe(
      st.activeBoardId !== null,
    );
  });
});
```

Если в шапке `boards.test.ts` ещё нет `describe`/`beforeEach`/`expect`/`it` из `vitest`
или импорта `useWorkflowStore` — дописать их по образцу соседних блоков файла.

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/store/boards.test.ts`
Expected: FAIL — `syncFileBoards is not a function`.

- [ ] **Step 3: Реализовать в хранилище**

В `src/store/useWorkflowStore.ts` расширить тип:

```ts
export interface BoardMeta {
  id: string;
  name: string;
  kind: 'user' | 'review' | 'file';
  /** Идентификатор живого борда из /api/boards. Есть только у kind === 'file'.
   *  Хеш пути, а не позиция: вставка борда в середину списка не должна
   *  переставлять вкладки местами. */
  sourceId?: string;
  /** Можно ли писать в этот борд (рядом лежит scripts/fb.mjs). */
  writable?: boolean;
  /** Причина, по которой борд не прочитан. Присутствие поля = «не смог
   *  прочитать»; пустой холст в этом случае соврал бы, что борд пуст. */
  sourceError?: string;
}
```

Рядом с объявлением `ensureFileBoard: () => string;` (строка ~118) добавить в тип
хранилища:

```ts
  syncFileBoards: (sources: { id: string; name: string }[]) => void;
```

И рядом с реализацией `ensureFileBoard` добавить:

```ts
  syncFileBoards: (sources) => {
    const prev = get().boards;
    const wanted = new Map(sources.map((s) => [s.id, s]));

    /** Поля живого борда переносятся ЦЕЛИКОМ, включая отсутствие error:
     *  починившийся борд не должен носить прежнюю ошибку вечно. */
    const meta = (b: BoardMeta, s: { name: string; writable?: boolean; error?: string }) => {
      const next: BoardMeta = { ...b, name: s.name, writable: s.writable ?? false };
      delete next.sourceError;
      if (s.error) next.sourceError = s.error;
      return next;
    };

    // Пользовательские и review-вкладки живут своей жизнью: список живых
    // бордов не имеет права их трогать.
    const kept = prev.filter((b) => b.kind !== 'file' || wanted.has(b.sourceId ?? ''));
    const renamed = kept.map((b) =>
      b.kind === 'file' && b.sourceId && wanted.has(b.sourceId)
        ? meta(b, wanted.get(b.sourceId)!)
        : b,
    );
    const present = new Set(renamed.filter((b) => b.kind === 'file').map((b) => b.sourceId));
    const added: BoardMeta[] = sources
      .filter((s) => !present.has(s.id))
      .map((s) =>
        meta(
          { id: `b-${crypto.randomUUID()}`, name: s.name, kind: 'file', sourceId: s.id },
          s,
        ),
      );

    const boards = [...renamed, ...added];
    if (boards.length === prev.length && added.length === 0) {
      const same = boards.every(
        (b, i) =>
          b.name === prev[i].name &&
          b.writable === prev[i].writable &&
          b.sourceError === prev[i].sourceError,
      );
      if (same) return; // ничего не изменилось — не дёргаем подписчиков
    }

    // activeBoardId не имеет права указывать на снесённую вкладку.
    const activeBoardId = boards.some((b) => b.id === get().activeBoardId)
      ? get().activeBoardId
      : (boards[0]?.id ?? null);

    set({ boards, activeBoardId });
    void saveBoardsRegistry({ boards, activeBoardId });
  },
```

- [ ] **Step 4: Прогнать тесты и убедиться, что они проходят**

Run: `npm test -- src/store/boards.test.ts`
Expected: PASS — и новый блок, и все прежние тесты бордов.

- [ ] **Step 5: Мутационная проверка — уборка не должна съедать чужие вкладки**

Временно заменить `const kept = prev.filter((b) => b.kind !== 'file' || wanted.has(b.sourceId ?? ''));`
на `const kept = prev.filter((b) => wanted.has(b.sourceId ?? ''));` и прогнать
`npm test -- src/store/boards.test.ts`. Ожидается падение теста «исчезнувший борд убирает
свою вкладку, а пользовательские не трогает». Вернуть исходное.

- [ ] **Step 6: Коммит**

```bash
git add src/store/useWorkflowStore.ts src/store/boards.test.ts
git commit -m "feat(store): syncFileBoards — вкладка на живой борд, ключ sourceId"
```

---

### Task 6: Клиент опрашивает индекс, а не файл

**Files:**
- Modify: `src/hooks/useBoardSync.ts` (целиком тело эффекта)
- Test: `src/hooks/useBoardSync.test.ts` (дописать блок, существующие тесты не трогать)

**Interfaces:**
- Consumes: `GET /api/boards` → `{ id, name, path, writable, mtime, error? }[]`; `GET /board/<id>.canvas` → тело JSON Canvas; `syncFileBoards` из хранилища.
- Produces: сигнатура хука не меняется — `useBoardSync(onFirstLoad, onChange?)`.

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `src/hooks/useBoardSync.test.ts`:

```ts
describe('useBoardSync × много живых бордов', () => {
  const INDEX = [
    { id: 'aaa', name: 'Флот', path: 'X:/a.canvas', writable: false, mtime: 1 },
    { id: 'bbb', name: 'Потоки', path: 'X:/b.canvas', writable: false, mtime: 1 },
  ];

  function stubFetch(index: unknown, bodies: Record<string, string>) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('/api/boards')) {
          return { ok: true, text: async () => JSON.stringify(index) };
        }
        const id = url.replace('/board/', '').replace('.canvas', '');
        return { ok: true, text: async () => bodies[id] ?? CANVAS_TEXT };
      }),
    );
    return calls;
  }

  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({ boards: [], activeBoardId: null });
    useWorkflowStore.getState().setNodes([]);
    useWorkflowStore.getState().setEdges([]);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('заводит вкладку на каждый живой борд', async () => {
    stubFetch(INDEX, {});
    const cleanup = await mountAndSettle();
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file.map((b) => b.sourceId)).toEqual(['aaa', 'bbb']);
    cleanup();
  });

  it('тянет содержимое ТОЛЬКО активной вкладки, а не всех бордов', async () => {
    // Иначе каждый тик поллинга качает N файлов целиком.
    const calls = stubFetch(INDEX, {});
    const cleanup = await mountAndSettle();
    const bodyCalls = calls.filter((u) => u.startsWith('/board/'));
    expect(bodyCalls.length).toBeLessThanOrEqual(1);
    cleanup();
  });

  it('борд с error не роняет соседей и не выдаёт себя за пустой', async () => {
    stubFetch(
      [{ ...INDEX[0], error: 'файл недоступен' }, INDEX[1]],
      {},
    );
    const cleanup = await mountAndSettle();
    const file = useWorkflowStore.getState().boards.filter((b) => b.kind === 'file');
    expect(file).toHaveLength(2);
    cleanup();
  });
});
```

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/hooks/useBoardSync.test.ts`
Expected: FAIL на «заводит вкладку на каждый живой борд» — хук ходит в `/board.canvas`
и создаёт одну вкладку.

- [ ] **Step 3: Переписать хук**

Заменить содержимое `src/hooks/useBoardSync.ts` на:

```ts
import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { loadBoardsRegistry } from '../utils/persistence';
import { fromJSONCanvas } from '../utils/canvasConverter';
import { POLL_MS, nextDelay } from './pollBackoff';

// Тип берётся ИЗ модуля сервера через `import type`: он стирается при сборке,
// поэтому node:fs в браузерный бандл не попадает, а второй копии формы,
// расходящейся с сервером, не заводится.
import type { BoardSource } from '../mcp/boardIndex';

/**
 * Browser-режим: опрашивает /api/boards и подтягивает содержимое АКТИВНОЙ
 * живой вкладки. Сообщает об исходе первой загрузки через onFirstLoad.
 *
 * Почему индекс, а не файл: живых бордов может быть много, и поллинг каждого
 * целиком означал бы N полных файлов на каждый тик. Индекс несёт mtime —
 * перечитываем только изменившееся.
 */
export const useBoardSync = (
  onFirstLoad: (loaded: boolean) => void,
  onChange?: () => void,
) => {
  /** Ключ — sourceId борда, значение — mtime последнего применённого чтения. */
  const applied = useRef<Map<string, number>>(new Map());
  const onFirstLoadRef = useRef(onFirstLoad);
  onFirstLoadRef.current = onFirstLoad;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Отступ при ошибках: упавший дев-сервер иначе опрашивается вечно
    // с базовым интервалом. Сбрасывается первым же успешным ответом.
    let delay = POLL_MS;

    const tick = async (first: boolean) => {
      let ok = true;
      try {
        const res = await fetch('/api/boards', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const index: BoardSource[] = JSON.parse(await res.text());
        if (!alive) return;

        useWorkflowStore
          .getState()
          .syncFileBoards(
            index.map((b) => ({ id: b.id, name: b.name, writable: b.writable, error: b.error })),
          );

        // view-first: пока пользователь редактирует руками, не перетираем граф.
        // applied НЕ обновляем — изменение переподхватится после exitEditMode.
        if (useWorkflowStore.getState().isEditing) {
          if (first) onFirstLoadRef.current(true);
          return; // finally{} перепланирует следующий tick
        }

        // Multi-board data safety: when a boards registry exists, the boards system
        // owns canvas content and a live feed renders ONLY on its own file tab
        // (kind 'file' — a live mirror of the repo file, never persisted to a board
        // key). Applying to any other tab — including the FIRST apply — is forbidden:
        // StrictMode runs the effect twice, and a stray first-apply landing after
        // initBoardsFlow flooded the active board with board.canvas content that the
        // next tab switch persisted under the board's key. Fresh installs without a
        // registry keep the legacy live-feed-as-main-canvas behavior.
        const registry = await loadBoardsRegistry();
        if (!alive) return;
        const store = useWorkflowStore.getState();
        const active = store.boards.find((b) => b.id === store.activeBoardId);
        if (registry && active?.kind !== 'file') {
          // Don't consume `applied` — switching to a file tab must re-apply.
          if (first) onFirstLoadRef.current(true);
          return;
        }

        // Тянем ТОЛЬКО активный борд: иначе каждый тик качает N файлов целиком.
        const target = active?.kind === 'file' && active.sourceId
          ? index.find((b) => b.id === active.sourceId)
          : index[0];
        if (!target) {
          if (first) onFirstLoadRef.current(true);
          return;
        }
        // Борд с error — это «не смог прочитать», а не «пустой»: пустой граф
        // здесь соврал бы, что борд пуст.
        if (target.error) {
          if (first) onFirstLoadRef.current(true);
          return;
        }
        if (applied.current.get(target.id) === target.mtime) {
          if (first) onFirstLoadRef.current(true);
          return;
        }

        const body = await fetch(`/board/${target.id}.canvas`, { cache: 'no-store' });
        if (!body.ok) throw new Error(String(body.status));
        const text = await body.text();
        if (!alive) return;
        applied.current.set(target.id, target.mtime);
        const { nodes, edges } = fromJSONCanvas(JSON.parse(text));
        const s = useWorkflowStore.getState();
        s.setNodes(nodes);
        s.setEdges(edges);
        // пере-применить layout текущего вида, чтобы новые ноды встали по местам
        s.setViewMode(s.viewMode);
        if (!first) onChangeRef.current?.();
        if (first) onFirstLoadRef.current(true);
      } catch {
        ok = false;
        if (first && alive) onFirstLoadRef.current(false);
      } finally {
        delay = nextDelay(delay, ok);
        if (alive) timer = setTimeout(() => tick(false), delay);
      }
    };

    tick(true);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
};
```

- [ ] **Step 4: Прогнать ВЕСЬ файл тестов хука**

Run: `npm test -- src/hooks/useBoardSync.test.ts`
Expected: PASS — и новый блок, и оба существующих теста про реестр бордов.
Если старые тесты падают из-за заглушки `fetch`, отдающей только `CANVAS_TEXT`, — дописать
в их `beforeEach` ответ на `/api/boards` (массив из одного борда), НЕ ослабляя проверки:
их предмет — что содержимое не садится на чужую вкладку, и он обязан сохраниться.

- [ ] **Step 5: Мутационная проверка — защита от StrictMode обязана краснеть**

Временно заменить `if (registry && active?.kind !== 'file')` на `if (false)` и прогнать
`npm test -- src/hooks/useBoardSync.test.ts`. Ожидается падение теста «never applies the live
feed when a boards registry exists». Вернуть исходное. Это та самая защита, которую теряют
именно при таком переписывании.

- [ ] **Step 6: Коммит**

```bash
git add src/hooks/useBoardSync.ts src/hooks/useBoardSync.test.ts
git commit -m "feat(sync): поллинг индекса вместо файла — вкладка на борд, тянем только активный"
```

---

### Task 7: Запись только там, где она возможна

**Files:**
- Modify: `src/components/KanbanBoard.tsx:130` (вызов `/api/feedback/status`)
- Modify: `src/components/TabBar.tsx:64-66` (значок и подсказка вкладки)
- Test: `src/components/TabBar.test.tsx` (дописать блок)

**Interfaces:**
- Consumes: `BoardMeta.sourceId` из задачи 5; контракт `POST /api/feedback/status { id, status, boardId }` из задачи 4.
- Produces: ничего для последующих задач — это последняя.

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `src/components/TabBar.test.tsx`:

```ts
describe('TabBar × живые борды', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkflowStore.setState({ boards: [], activeBoardId: null });
  });

  it('показывает имя живого борда, а не «board.canvas (live)»', () => {
    useWorkflowStore.getState().syncFileBoards([{ id: 'aaa', name: 'Потоки данных' }]);
    const names = useWorkflowStore
      .getState()
      .boards.filter((b) => b.kind === 'file')
      .map((b) => b.name);
    expect(names).toEqual(['Потоки данных']);
    expect(names).not.toContain('board.canvas (live)');
  });

  it('вкладка сломанного борда несёт причину, а не выглядит пустой', () => {
    useWorkflowStore.setState({
      boards: [
        { id: 'x', name: 'ghost', kind: 'file', sourceId: 'bbb', sourceError: 'файл недоступен' },
      ],
      activeBoardId: 'x',
    });
    const { container, cleanup } = mount(<TabBar />);
    // Причина обязана быть В РАЗМЕТКЕ: молчащая вкладка читается как «борд пуст».
    expect(container.textContent).toContain('ghost');
    expect(container.textContent).toContain('файл недоступен');
    cleanup();
  });
});
```

Здесь используются `mount`, `TabBar`, `BoardMeta` и `useWorkflowStore`, уже объявленные в
шапке этого файла — новых импортов не требуется. `beforeEach` файла подставляет свой набор
бордов, поэтому тест переопределяет `boards` через `setState` явно.

- [ ] **Step 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- src/components/TabBar.test.tsx`
Expected: FAIL на «вкладка сломанного борда несёт причину» — `TabBar` сейчас не рисует
`sourceError`. Первый тест блока к этому моменту проходит (задача 5 уже влита) и служит
защёлкой от возврата единого имени `board.canvas (live)`.

- [ ] **Step 3: Не предлагать запись там, где её нет, и адресовать её borderId**

В `src/components/KanbanBoard.tsx` найти вызов около строки 130 и заменить его на:

```ts
      const store = useWorkflowStore.getState();
      const active = store.boards.find((b) => b.id === store.activeBoardId);
      // Предлагать перетаскивание на производном борде — обещать сохранение,
      // которого не будет: следующая пересборка перезапишет файл целиком.
      // Полагаться на 400 от сервера мало: к моменту ответа карточка уже уехала.
      if (active?.kind === 'file' && !active.writable) return;
      const res = await fetch('/api/feedback/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // boardId обязателен: без него сервер не знает, чей fb.mjs звать, и
        // правка ушла бы в чужую полосу.
        body: JSON.stringify({ id, status, boardId: active?.sourceId ?? null }),
      });
```

Если `useWorkflowStore` в этом файле ещё не импортирован — добавить
`import { useWorkflowStore } from '../store/useWorkflowStore';`.

- [ ] **Step 4: Показать вкладке её состояние**

В `src/components/TabBar.tsx` заменить строку со значком файла

```tsx
            {b.kind === 'file' && <FileText size={12} className="text-secondary shrink-0" />}
```

на

```tsx
            {b.kind === 'file' && (
              <FileText
                size={12}
                className="text-secondary shrink-0"
                aria-label={
                  b.writable
                    ? 'живой борд: правки уходят в fb.mjs'
                    : 'живой борд из файла: правки не сохраняются'
                }
              />
            )}
            {b.kind === 'file' && b.sourceError && (
              // Причина в разметке, а не только в консоли: молчащая вкладка
              // читается как «борд пуст», а он не прочитан.
              <span className="text-red-500 shrink-0 text-[10px]" title={b.sourceError}>
                ⚠ {b.sourceError}
              </span>
            )}
```

Класс `text-red-500` взят потому, что семантического токена ошибки в проекте нет:
`NodeSidebar.tsx:197` пользуется тем же. Заводить новый токен эта задача не должна.

- [ ] **Step 5: Прогнать весь сьют**

Run: `npm test`
Expected: PASS, падений нет.

- [ ] **Step 6: Проверить живьём обе полосы**

Поднять дев-сервер с двумя бордами:
```bash
SOVERN_BOARDS="C:/telo/Efforts/Ongoing/mc_hub/feedback;C:/telo/Efforts/Ongoing/NAUTILUS/docs/plates/observatory" npm run dev
```
Снять и записать в отчёт:
```bash
curl -s -X POST http://localhost:1420/api/feedback/status \
  -H 'Content-Type: application/json' \
  -d '{"id":"fb_000000000000","status":"done","boardId":"<id производного борда из /api/boards>"}'
```
Expected: HTTP 400 и текст про то, что борд производный и рядом нет `scripts/fb.mjs`.
Открыть `http://localhost:1420` и глазами убедиться: вкладок столько же, сколько бордов
в `/api/boards`, имена читаемые, переключение между ними показывает РАЗНОЕ содержимое.

- [ ] **Step 7: Коммит**

```bash
git add src/components/KanbanBoard.tsx src/components/TabBar.tsx src/components/TabBar.test.tsx
git commit -m "feat(ui): вкладка на живой борд с именем из борда; запись статуса адресуется boardId"
```

---

## Что этот план НЕ делает

- Кнопку импорта `.canvas` в UI.
- Запись правок с живого борда обратно в файл.
- Рекурсивный обход каталогов.
- Наблюдение за файлами через watcher вместо поллинга.
- Шаринг бордов и multi-window.
