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

  it('пропавший файл — writable === false, даже если рядом лежит scripts/fb.mjs', () => {
    // «Можно писать» подразумевает, что борд существует. Проба fbCliFor
    // смотрит только на файловую систему рядом с путём и не знает, что
    // самого борда нет — это обязана перекрыть readBoardIndex.
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'fb.mjs'), '// cli', 'utf8');
    const ghost = join(dir, 'ghost.canvas');
    const r = readBoardIndex([ghost])[0];
    expect(r.error).toBeTruthy();
    expect(r.writable).toBe(false);
  });

  it('битый JSON рядом с scripts/fb.mjs — тоже writable === false', () => {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts', 'fb.mjs'), '// cli', 'utf8');
    const p = join(dir, 'broken-writable.canvas');
    writeFileSync(p, '{ это не json', 'utf8');
    const r = readBoardIndex([p])[0];
    expect(r.error).toBeTruthy();
    expect(r.writable).toBe(false);
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

  it('та же mtime И тот же размер — кэш побеждает: это ГРАНИЦА метода, а не баг', () => {
    // «Первое» и «Второе» — оба 66 байт в UTF-8 (проверено node -e перед
    // написанием теста). Совпадение и штампа, и размера при разном
    // содержимом — редкий, но реальный случай, который (mtime, size) не
    // ловит по определению. Тест называет эту границу явно, а не молчит.
    const p = join(dir, 'a.canvas');
    writeFileSync(p, board([], { 'desops:title': 'Первое' }), 'utf8');
    const stamp = new Date(Date.now() - 20_000);
    utimesSync(p, stamp, stamp);
    expect(readBoardIndex([p])[0].name).toBe('Первое');

    const b2 = board([], { 'desops:title': 'Второе' });
    expect(Buffer.byteLength(b2, 'utf8')).toBe(66);
    writeFileSync(p, b2, 'utf8');
    utimesSync(p, stamp, stamp);
    // Кэш не видит разницы: и mtime, и size совпали с прошлым разбором.
    expect(readBoardIndex([p])[0].name).toBe('Первое');
  });

  it('та же mtime, но ДРУГОЙ размер — кэш промахивается, имя перечитывается', () => {
    const p = join(dir, 'a.canvas');
    writeFileSync(p, board([], { 'desops:title': 'Первое' }), 'utf8');
    const stamp = new Date(Date.now() - 30_000);
    utimesSync(p, stamp, stamp);
    expect(readBoardIndex([p])[0].name).toBe('Первое');

    // Заведомо другая длина заголовка при том же mtime.
    const longTitle = 'Совсем другой и заметно более длинный заголовок';
    const longer = board([], { 'desops:title': longTitle });
    expect(Buffer.byteLength(longer, 'utf8')).not.toBe(66);
    writeFileSync(p, longer, 'utf8');
    utimesSync(p, stamp, stamp);
    expect(readBoardIndex([p])[0].name).toBe(longTitle);
  });

  it('error в кэше отдаётся при повторном чтении того же битого файла с неизменным mtime', () => {
    // Круг «положить error в кэш» / «достать error из кэша» — если снять
    // возврат error на попадании в кэш, второй читатель того же битого
    // файла молча получит «прочитал пустое» вместо «не смог прочитать».
    const p = join(dir, 'broken-cached.canvas');
    writeFileSync(p, '{ это не json', 'utf8');
    const stamp = new Date(Date.now() - 40_000);
    utimesSync(p, stamp, stamp);

    const first = readBoardIndex([p])[0];
    expect(first.error).toBeTruthy();
    expect(first.name).toBe('broken-cached');

    // Второе чтение того же пути: mtime и size не менялись — ответ идёт из
    // кэша, но error обязан присутствовать оба раза.
    const second = readBoardIndex([p])[0];
    expect(second.error).toBeTruthy();
    expect(second.name).toBe('broken-cached');
  });
});
