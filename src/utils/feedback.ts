// Общая палитра/семантика feedback-тикетов mc_hub (kanban / matrix / timeline).
// Все цвета — CSS-переменные из src/theme/tokens.css: смена темы и загруженные
// design-токены перекрашивают вью без правок кода.

/** color + альфа без hex-конкатенации — работает и с var(--…). pct: 0..100. */
export const alpha = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Акцент слоя/области; незнакомый layer падает на infra-серый. */
export const layerColor = (layer: string) => `var(--layer-${layer}, var(--layer-infra))`;

export const AREA_COLORS: Record<string, string> = {
  lms: 'var(--layer-lms)', blog: 'var(--layer-blog)', hub: 'var(--layer-hub)',
  mentor: 'var(--layer-mentor)', workers: 'var(--layer-workers)',
  course: 'var(--layer-course)', infra: 'var(--layer-infra)',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  bug: '🐛', feature: '✨', ux: '🎨', question: '❓', idea: '💡',
};

export const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--status-idle)', pending: 'var(--status-pending)',
  active: 'var(--status-active)', done: 'var(--status-done)',
  blocked: 'var(--status-blocked)',
};

// Priority Matrix quadrant — те же пороги, что в /triage skill
export const quadrant = (impact = 5, urgency = 5) => {
  if (impact >= 6 && urgency >= 6) return { label: 'Do First', color: 'var(--q-dofirst)' };
  if (impact >= 6) return { label: 'Schedule', color: 'var(--q-schedule)' };
  if (urgency >= 6) return { label: 'Quick', color: 'var(--q-quick)' };
  return { label: 'Backlog', color: 'var(--q-backlog)' };
};

/** Заголовок без category-emoji-префикса (он рендерится отдельно). */
export const stripEmoji = (label: string) => String(label).replace(/^[🐛✨🎨❓💡📌📂]\s*/u, '');
