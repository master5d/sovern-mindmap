import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

type RealpathFn = (p: string) => string;
type ExistsFn = (p: string) => boolean;

/**
 * Разворачивает симлинки на самом глубоком СУЩЕСТВУЮЩЕМ префиксе пути
 * и доклеивает несуществующий хвост как есть.
 *
 * `realpathSync` на несуществующем пути бросает, а нам надо проверять
 * назначение ДО записи — когда файла (а часто и каталога) ещё нет.
 */
export function realpathDeepest(
  p: string,
  realpathFn: RealpathFn = realpathSync,
  existsFn: ExistsFn = existsSync,
): string {
  const abs = resolve(p);
  const tail: string[] = [];
  let cur = abs;

  for (;;) {
    if (existsFn(cur)) {
      const real = realpathFn(cur);
      return tail.length ? resolve(real, ...tail.reverse()) : real;
    }
    const parent = dirname(cur);
    if (parent === cur) return abs;          // дошли до корня тома, разворачивать нечего
    tail.push(cur.slice(parent.length + 1));
    cur = parent;
  }
}

/** Регистронезависимое сравнение с обязательной границей по разделителю:
 *  `C:\telo-backup` не должен считаться «внутри» `C:\telo`. */
function isUnder(child: string, root: string): boolean {
  const c = child.toLowerCase();
  const r = root.toLowerCase().replace(new RegExp(`\\${sep}+$`), '');
  return c.startsWith(r + sep);
}

/**
 * Проверяет, что путь назначения реально лежит внутри корня — ПОСЛЕ разворота
 * симлинков.
 *
 * Лексической проверки (`resolve()` + `startsWith`) недостаточно: `resolve`
 * симлинки не разворачивает, поэтому `<root>/design/drafts`, подменённый
 * junction-ом, уводит запись куда угодно, оставаясь «внутри» по строке.
 */
export function resolveContained(
  target: string,
  root: string,
  realpathFn: RealpathFn = realpathSync,
  existsFn: ExistsFn = existsSync,
): { ok: true; path: string } | { ok: false; reason: string } {
  const realRoot = realpathDeepest(root, realpathFn, existsFn);
  const realTarget = realpathDeepest(target, realpathFn, existsFn);
  if (!isUnder(realTarget, realRoot)) {
    return { ok: false, reason: `path resolves outside ${realRoot}` };
  }
  return { ok: true, path: realTarget };
}
