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
