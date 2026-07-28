import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realpathDeepest, resolveContained } from './pathContainment';

describe('realpathDeepest', () => {
  it('разворачивает существующий префикс и доклеивает несуществующий хвост', () => {
    // /root -> /real, запрошен /root/a/b, где b ещё не создан
    const fake = (p: string) => (p === join('X:', 'root') ? join('Y:', 'real') : p);
    const got = realpathDeepest(join('X:', 'root', 'a', 'b'), fake, (p) => p === join('X:', 'root'));
    expect(got).toBe(join('Y:', 'real', 'a', 'b'));
  });

  it('возвращает путь как есть, если ничего из цепочки не существует', () => {
    const got = realpathDeepest(join('X:', 'nope', 'deep'), (p) => p, () => false);
    expect(got).toBe(resolve(join('X:', 'nope', 'deep')));
  });
});

describe('resolveContained', () => {
  const ROOT = join('C:', 'telo');

  it('пропускает путь внутри корня', () => {
    const r = resolveContained(join(ROOT, 'proj', 'design', 'drafts', 'x.tsx'), ROOT, (p) => p, () => true);
    expect(r.ok).toBe(true);
  });

  it('не пропускает путь вне корня', () => {
    const r = resolveContained(join('D:', 'elsewhere', 'x.tsx'), ROOT, (p) => p, () => true);
    expect(r.ok).toBe(false);
  });

  it('не путает корень с однокоренным соседом (telo vs telo-backup)', () => {
    const r = resolveContained(join('C:', 'telo-backup', 'x.tsx'), ROOT, (p) => p, () => true);
    expect(r.ok).toBe(false);
  });

  it('сам корень не считается «внутри» — писать в него самого нечего', () => {
    const r = resolveContained(ROOT, ROOT, (p) => p, () => true);
    expect(r.ok).toBe(false);
  });

  it('регистр пути не влияет (Windows)', () => {
    const r = resolveContained(join('c:', 'TELO', 'proj', 'x.tsx'), ROOT, (p) => p, () => true);
    expect(r.ok).toBe(true);
  });

  it('ЛОВИТ побег через симлинк — лексической проверке он не виден', () => {
    // Путь ЛЕКСИЧЕСКИ внутри корня, но реально ведёт наружу.
    const inside = join(ROOT, 'proj', 'design', 'drafts', 'x.tsx');
    const fakeReal = (p: string) =>
      p.toLowerCase().startsWith(join(ROOT, 'proj', 'design', 'drafts').toLowerCase())
        ? p.replace(/^.*drafts/i, join('C:', 'Windows', 'System32'))
        : p;
    const lexical = inside.toLowerCase().startsWith((ROOT + sep).toLowerCase());
    expect(lexical).toBe(true);                     // старая проверка бы пропустила
    const r = resolveContained(inside, ROOT, fakeReal, () => true);
    expect(r.ok).toBe(false);                       // новая — нет
  });

  it('на настоящем симлинке ведёт себя так же (если ОС даёт его создать)', () => {
    const base = mkdtempSync(join(tmpdir(), 'contain-'));
    const root = join(base, 'root');
    const outside = join(base, 'outside');
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'marker.txt'), 'x');
    const link = join(root, 'escape');
    try {
      symlinkSync(outside, link, 'junction');
    } catch {
      return;                                        // нет прав на симлинки — тест не применим
    }
    const target = join(link, 'marker.txt');
    expect(resolveContained(target, root).ok).toBe(false);
  });
});
