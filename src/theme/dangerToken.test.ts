import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Заслон семантического токена отказа.
 *
 * Почему сканируем ФАЙЛЫ, а не проверяем поведение: `text-danger` — это класс,
 * который Tailwind генерирует из объявления в `@theme inline`. Убери оттуда
 * строку — и класс просто перестанет существовать: сборка пройдёт, все тесты
 * останутся зелёными, а текст ошибки в интерфейсе молча потеряет цвет. Ровно
 * этот отказ и надо ловить, поэтому проверяем цепочку целиком: класс -> токен
 * темы -> значение в ОБЕИХ темах.
 *
 * Заведён 2026-09-01 вместе с самим токеном: до него цвет отказа писался сырым
 * `text-red-500`, а общепроектное послабление гейта жило в
 * `design/lint-allowlist.json` (файл удалён).
 */
const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('семантический токен отказа', () => {
  it('класс text-danger порождается: --color-danger объявлен в @theme', () => {
    const css = read('../index.css');
    const theme = css.match(/@theme inline \{([\s\S]*?)\}/);
    expect(theme, 'блок @theme inline не найден — форма index.css изменилась').toBeTruthy();
    expect(theme![1]).toMatch(/--color-danger:\s*var\(--danger\)\s*;/);
  });

  it('--danger определён В ОБЕИХ темах, а не только в тёмной', () => {
    // Токен, объявленный в одной теме, даёт невидимый текст в другой.
    const css = read('./tokens.css');
    const dark = css.match(/:root,\s*\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);
    const light = css.match(/\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);
    expect(dark, 'блок тёмной темы не найден').toBeTruthy();
    expect(light, 'блок светлой темы не найден').toBeTruthy();
    expect(dark![1]).toMatch(/--danger:\s*#[0-9a-f]{6};/i);
    expect(light![1]).toMatch(/--danger:\s*#[0-9a-f]{6};/i);
  });

  it('значение совпадает с уже существующим красным проекта, а не заведено вторым', () => {
    // Два разных красных рядом читались бы как два разных смысла.
    const css = read('./tokens.css');
    const dark = css.match(/:root,\s*\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/)![1];
    const light = css.match(/\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/)![1];
    const val = (block: string, name: string) =>
      block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1].toLowerCase();
    expect(val(dark, 'danger')).toBe(val(dark, 'status-blocked'));
    expect(val(light, 'danger')).toBe(val(light, 'status-blocked'));
  });

  it('сырой tailwind-красный не вернулся в разметку', () => {
    // Гейт DesOps это тоже ловит, но он живёт вне репозитория и на pre-commit;
    // здесь заслон принадлежит самому проекту и работает в обычном прогоне.
    // Область — только TabBar: он принадлежит этой работе. У NodeSidebar.tsx
    // остаётся сырой red И сырой green ещё до токена; это ПРЕ-СУЩЕСТВУЮЩИЙ долг,
    // и втягивать его сюда значило бы либо изобрести второй токен без владельца,
    // либо поставить подавление в чужую строку. Назван владельцу отдельно.
    const src = read('../components/TabBar.tsx');
    const raw = src.split('\n').filter((l) => /\bred-\d{3}\b/.test(l) && !l.includes('nosemgrep'));
    expect(raw, 'TabBar.tsx: сырой red вместо токена').toEqual([]);
  });

  it('послабление гейта снято вместе с долгом', () => {
    // Файл легализовал сырой red во ВСЁМ проекте; после появления токена он
    // не нужен, и его возвращение означало бы, что долг вернулся.
    let exists = true;
    try {
      read('../../design/lint-allowlist.json');
    } catch {
      exists = false;
    }
    expect(exists, 'design/lint-allowlist.json вернулся — послабление снова действует').toBe(false);
  });
});
