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
