// Шкала грейдов достоверности (evidence marks) — мост из NAUTILUS
// core/desops/dataviz (intake #171, `docs/atlas/evidence-marks.md` §1).
//
// ИСТОЧНИК ИСТИНЫ — NAUTILUS `core/desops/dataviz/schema.js` (`EVIDENCE_MARKS`):
// порядок строгости, id и глифы. Копия здесь НЕИЗБЕЖНА — два отдельных
// репозитория, разные сборки — но она ОДНА (не заводить вторую в фильтре/
// легенде/рендере узла/ребра) и названа как копия, а не как источник. Порядок
// в массиве и есть строгость: 0 — самое надёжное; `refuted` — отозванное
// утверждение, а не «слабее остальных» по смыслу, но фильтру порога нужен
// линейный порядок, и канон кладёт его последним же образом, что и в NAUTILUS.
export interface EvidenceMark {
  id: string;
  glyph: string;
  label: string;
}

export const EVIDENCE_MARKS: EvidenceMark[] = [
  { id: 'measured', glyph: '●', label: 'measured' },
  { id: 'reported', glyph: '◐', label: 'reported' },
  { id: 'declared', glyph: '⊙', label: 'declared' },
  { id: 'inferred', glyph: '★', label: 'inferred' },
  { id: 'open', glyph: '✳', label: 'open' },
  { id: 'refuted', glyph: '⊘', label: 'refuted' },
];

export const MARK_IDS = EVIDENCE_MARKS.map((m) => m.id);
const MARK_INDEX = new Map(EVIDENCE_MARKS.map((m, i) => [m.id, i]));
const GLYPH_BY_ID = new Map(EVIDENCE_MARKS.map((m) => [m.id, m.glyph]));

/** Ступени порога «скрыть слабее X» — все, КРОМЕ `refuted`: он не точка
 *  порога (отозвано, а не «слабее»), у него свой отдельный переключатель. */
export const THRESHOLD_MARK_IDS = EVIDENCE_MARKS.filter((m) => m.id !== 'refuted').map((m) => m.id);
/** По умолчанию показано всё, кроме `refuted` — самая слабая НЕ-refuted ступень. */
export const DEFAULT_MARK_THRESHOLD = THRESHOLD_MARK_IDS[THRESHOLD_MARK_IDS.length - 1];

/** Отсутствие марки — законное состояние «не размечено», не точка на шкале.
 *  `undefined`/`null`/чужой репозитории опечатка — все НЕ известная марка. */
export function isKnownMark(value: unknown): value is string {
  return typeof value === 'string' && MARK_INDEX.has(value);
}

/** Индекс строгости: меньше — надёжнее. `undefined` для неизвестного id. */
export function markStrictness(id: string | undefined): number | undefined {
  return id === undefined ? undefined : MARK_INDEX.get(id);
}

export function markGlyph(id: string): string | undefined {
  return GLYPH_BY_ID.get(id);
}

/** Марка → цвет (hex), для узла/ребра/легенды. Значения — `--mark-*` в
 *  `src/theme/tokens.css` (dark/light), которые сами скопированы из
 *  `--plate-mark-*` в NAUTILUS `docs/atlas/atlas-plate.tokens.css`. Компоненты
 *  ссылаются на CSS-переменную, а не на эту таблицу напрямую — она здесь только
 *  затем, чтобы filter/legend знали, какую переменную построить по id. */
export function markColorVar(id: string): string {
  return `var(--mark-${id})`;
}

/** Видимость по порогу «скрыть слабее X» + отдельный переключатель `refuted`.
 *  Не размеченный элемент (нет `mark`, или значение не входит в шкалу) фильтр
 *  НЕ трогает — он не «наблюдение», а отсутствие наблюдения, и обязан остаться
 *  видимым независимо от порога (тот же принцип, что в NAUTILUS render/svg.js).
 *  Уже скрытое чем-то ДРУГИМ (fold/collapse) остаётся скрытым: функция только
 *  ДОБАВЛЯЕТ `hidden`, никогда не снимает чужую причину. */
export function isHiddenByMarkFilter(
  mark: unknown,
  threshold: string,
  showRefuted: boolean,
): boolean {
  if (!isKnownMark(mark)) return false;
  if (mark === 'refuted') return !showRefuted;
  const idx = markStrictness(mark)!;
  const thresholdIdx = markStrictness(threshold) ?? Infinity;
  return idx > thresholdIdx;
}
