import { parseDesignTokens } from './designTokens';
import type { TokenParseResult } from './designTokens';

const STYLE_ID = 'sovern-custom-tokens';
const STORAGE_KEY = 'sovern-custom-tokens';

/**
 * Парсит и применяет W3C-токены поверх активной темы (инжект <style> в head).
 * Бросает SyntaxError (битый JSON) или Error (ноль распознанных токенов) —
 * в этих случаях НИЧЕГО не применяется.
 */
export function applyCustomTokens(jsonText: string): TokenParseResult {
  const result = parseDesignTokens(JSON.parse(jsonText));
  const entries = Object.entries(result.overrides);
  if (entries.length === 0) {
    throw new Error(`no recognized color tokens (${result.warnings.length} skipped)`);
  }
  // значения провалидированы COLOR_RE в парсере, ключи — из фиксированной карты.
  // Перекрываем во всех theme-scope'ах: та же специфичность, что у [data-theme=…]
  // блоков в tokens.css, а этот <style> идёт позже в <head> — значит выигрывает и
  // для dark, и для light, не завися от порядка правил внутри tokens.css.
  const decls = entries.map(([k, v]) => `${k}:${v}`).join(';');
  const css = `:root,[data-theme='dark'],[data-theme='light']{${decls}}`;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
  localStorage.setItem(STORAGE_KEY, jsonText);
  return result;
}

export function resetCustomTokens() {
  document.getElementById(STYLE_ID)?.remove();
  localStorage.removeItem(STORAGE_KEY);
}

export const hasCustomTokens = () => !!localStorage.getItem(STORAGE_KEY);

/** Re-apply сохранённых токенов при старте; битые молча сбрасываются. */
export function initCustomTokens() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    applyCustomTokens(saved);
  } catch {
    resetCustomTokens();
  }
}
