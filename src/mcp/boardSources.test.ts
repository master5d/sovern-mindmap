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
