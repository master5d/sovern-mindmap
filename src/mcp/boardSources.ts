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

/** Ключ СРАВНЕНИЯ пути. Отдельно от normalizeBoardPath, потому что тот отвечает
 *  за отображаемый вид, а этот — за тождество: на Windows ФС регистронезависима,
 *  и `C:/Boards/a.canvas` с `c:/BOARDS/A.CANVAS` — один и тот же файл. Тот же
 *  приём, что в pathContainment.ts (isUnder). */
export function boardPathKey(p: string): string {
  return normalizeBoardPath(p).toLowerCase();
}

/** Идентификатор борда — хеш ПУТИ, а не позиция в списке.
 *  Индекс сдвинется при вставке борда в середину, и содержимое вкладок молча
 *  поменяется местами. Хешируем ключ сравнения (регистронезависимый), а не
 *  отображаемый вид — иначе один и тот же файл под разным регистром получит
 *  два разных id. */
export function boardSourceId(p: string): string {
  return createHash('sha1').update(boardPathKey(p)).digest('hex').slice(0, 12);
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
  try {
    return readdirSync(p)
      .filter((f) => f.toLowerCase().endsWith('.canvas'))
      .sort((a, b) => a.localeCompare(b))
      .map((f) => normalizeBoardPath(join(p, f)));
  } catch {
    // Каталог прошёл statSync().isDirectory(), но стал нечитаем между stat и
    // readdir (EACCES, гонка с удалением) — не роняем весь резолв, оставляем
    // элемент ПУТЁМ в списке: о недоступности скажет индекс бордов, а не авария.
    return [normalizeBoardPath(p)];
  }
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
  // Каталоги, развернувшиеся в ноль *.canvas: несуществующий файл остаётся в
  // paths и про него молчание неуместно, а вот пустой каталог бесследно
  // исчезает из paths — асимметрия, которую фиксируем в note.
  const emptyDirs: string[] = [];
  for (const entry of entries) {
    // Несуществующий путь НЕ выбрасывается: про него скажет индекс отдельной
    // записью с причиной. Молча выпавший борд читался бы как «его и не было».
    const entryIsDir = isDirectory(entry);
    const expanded = entryIsDir ? expandDirectory(entry) : [normalizeBoardPath(entry)];
    if (entryIsDir && expanded.length === 0) {
      emptyDirs.push(normalizeBoardPath(entry));
      continue;
    }
    for (const p of expanded) {
      const key = boardPathKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(p);
    }
  }

  if (emptyDirs.length > 0) {
    const emptyNote = `каталог без *.canvas: ${emptyDirs.join(', ')}`;
    note = note ? `${note}; ${emptyNote}` : emptyNote;
  }

  return { paths, note };
}
