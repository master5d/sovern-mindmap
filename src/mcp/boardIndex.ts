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
  /** Размер файла в байтах. Часть ключа версии борда: клиент помнит
   *  «применено» по паре (mtime, size) — тем же ключом, которым здесь
   *  кэшируется разбор. Один mtime не различил бы файл, восстановленный с
   *  сохранённым таймстемпом, но другим содержимым. */
  size: number;
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
  /** Размер файла на момент разбора — второй компонент ключа кэша. Один
   *  только mtime совпадёт у файла, восстановленного из бэкапа/git checkout
   *  с сохранённым таймстемпом: тогда кэш отдал бы заголовок от ПРОШЛОГО
   *  содержимого. Пара (mtime, size) закрывает частый случай, но не все:
   *  подмена с тем же mtime И тем же размером неотличима от несовпавшего
   *  кэша — это ГРАНИЦА метода, а не баг, и она осталась непроверяемой этим
   *  кэшем в принципе (см. тест «то же mtime и тот же размер»). */
  size: number;
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
    // «Можно писать» подразумевает, что борд СУЩЕСТВУЕТ и прочитался: писать
    // в путь с error (файл недоступен/не читается/не Canvas) предлагать
    // нельзя, даже если рядом honestly лежит scripts/fb.mjs. Поэтому writable
    // считается true только в самом конце, после всех проверок отказа —
    // ниже он либо возвращается как false вместе с error, либо
    // переопределяется пробой fbCliFor на успешной ветке.
    const canWrite = fbCliFor(path) !== null;

    let stat: { mtimeMs: number; size: number };
    try {
      stat = statSync(path);
    } catch (e) {
      return { id, name: fallback, path, writable: false, mtime: 0, size: 0, error: `файл недоступен: ${(e as Error).message}` };
    }
    const { mtimeMs: mtime, size } = stat;

    // Разбор ради имени кэшируется по (path, mtime, size): иначе «клиент не
    // тянет файлы целиком» превратилось бы в «их целиком тянет сервер на
    // каждый тик». Только mtime было бы недостаточно — см. комментарий у
    // CacheEntry.size.
    const hit = nameCache.get(path);
    if (hit && hit.mtime === mtime && hit.size === size) {
      // Запись из кэша, включая error: если файл был битым в прошлый раз и
      // с тех пор не менялся (mtime и size те же) — он всё ещё битый, а не
      // «внезапно прочитался».
      return {
        id,
        name: hit.name,
        path,
        writable: hit.error ? false : canWrite,
        mtime,
        size,
        ...(hit.error ? { error: hit.error } : {}),
      };
    }

    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (e) {
      return { id, name: fallback, path, writable: false, mtime, size, error: `файл не читается: ${(e as Error).message}` };
    }
    const { name, error } = titleFrom(text, fallback);
    nameCache.set(path, { mtime, size, name, error });
    return { id, name, path, writable: error ? false : canWrite, mtime, size, ...(error ? { error } : {}) };
  });
}
