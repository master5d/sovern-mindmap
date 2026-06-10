// Общая палитра/семантика feedback-тикетов mc_hub (kanban / matrix / timeline).
export const AREA_COLORS: Record<string, string> = {
  lms: '#10b981', blog: '#8b5cf6', hub: '#0ea5e9', mentor: '#d946ef',
  workers: '#f59e0b', course: '#84cc16', infra: '#64748b',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  bug: '🐛', feature: '✨', ux: '🎨', question: '❓', idea: '💡',
};

export const STATUS_COLORS: Record<string, string> = {
  idle: '#64748b', pending: '#eab308', active: '#3b82f6', done: '#22c55e', blocked: '#ef4444',
};

// Priority Matrix quadrant — те же пороги, что в /triage skill
export const quadrant = (impact = 5, urgency = 5) => {
  if (impact >= 6 && urgency >= 6) return { label: 'Do First', color: '#ef4444' };
  if (impact >= 6) return { label: 'Schedule', color: '#3b82f6' };
  if (urgency >= 6) return { label: 'Quick', color: '#eab308' };
  return { label: 'Backlog', color: '#64748b' };
};

/** Заголовок без category-emoji-префикса (он рендерится отдельно). */
export const stripEmoji = (label: string) => String(label).replace(/^[🐛✨🎨❓💡📌📂]\s*/u, '');
