// Парсер W3C Design Tokens Format (design-tokens.github.io/community-group/format)
// → overrides для CSS-переменных из tokens.css. Чистая функция, без DOM.

export interface TokenParseResult {
  overrides: Record<string, string>; // '--bg-canvas' → '#0a0a0a'
  warnings: string[];
}

const LAYERS = [
  'human', 'boss', 'skills', 'coding', 'gateway', 'memory', 'tools',
  'observability', 'hosting', 'projects',
  'lms', 'blog', 'hub', 'mentor', 'workers', 'course', 'infra',
];
const STATUSES = ['idle', 'pending', 'active', 'done', 'blocked'];

// нормализованный путь (lowercase, '/'→'.') → CSS-переменная
const FIXED_MAP: Record<string, string> = {
  'color.background': '--bg-canvas',
  'color.canvas': '--bg-canvas',
  'bg.canvas': '--bg-canvas',
  'color.surface': '--bg-surface',
  'color.surface2': '--bg-surface-2',
  'color.surface-secondary': '--bg-surface-2',
  'color.border': '--border',
  'color.border-strong': '--border-strong',
  'color.text': '--text-primary',
  'color.text.primary': '--text-primary',
  'color.text.secondary': '--text-secondary',
  'color.text.muted': '--text-muted',
  'color.accent': '--accent',
  'color.primary': '--accent',
};

// Жёсткая валидация: никаких {};— закрывает CSS-инъекцию через значение токена.
const COLOR_RE =
  /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([^(){};]*\))$/i;

const mapPath = (path: string): string | null => {
  if (FIXED_MAP[path]) return FIXED_MAP[path];
  const m = path.match(/^(?:color\.)?(layer|status)\.([a-z0-9-]+)$/);
  if (m) {
    const [, kind, name] = m;
    if (kind === 'layer' && LAYERS.includes(name)) return `--layer-${name}`;
    if (kind === 'status' && STATUSES.includes(name)) return `--status-${name}`;
  }
  return null;
};

export function parseDesignTokens(json: unknown): TokenParseResult {
  const overrides: Record<string, string> = {};
  const warnings: string[] = [];
  const raw = new Map<string, { value: unknown; type?: string }>();

  // 1. собрать токены (объекты с $value); путь — сегменты через '.'
  const walk = (node: unknown, path: string[]) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if ('$value' in obj) {
      raw.set(path.join('.').toLowerCase().replace(/\//g, '.'), {
        value: obj.$value,
        type: typeof obj.$type === 'string' ? obj.$type.toLowerCase() : undefined,
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue;
      walk(v, [...path, k]);
    }
  };
  walk(json, []);

  // 2. alias-резолвинг "{path.to.token}" с защитой от циклов
  const resolve = (value: unknown, seen: Set<string>): unknown => {
    if (typeof value !== 'string') return value;
    const m = value.match(/^\{(.+)\}$/);
    if (!m) return value;
    const ref = m[1].toLowerCase().replace(/\//g, '.');
    if (seen.has(ref)) return undefined; // цикл
    const target = raw.get(ref);
    if (!target) return undefined;
    seen.add(ref);
    return resolve(target.value, seen);
  };

  for (const [path, token] of raw) {
    const cssVar = mapPath(path);
    if (!cssVar) {
      warnings.push(`skipped: ${path} (unmapped)`);
      continue;
    }
    if (token.type && token.type !== 'color') {
      warnings.push(`skipped: ${path} ($type=${token.type})`);
      continue;
    }
    const resolved = resolve(token.value, new Set());
    if (typeof resolved !== 'string' || !COLOR_RE.test(resolved.trim())) {
      warnings.push(`skipped: ${path} (not a valid color)`);
      continue;
    }
    overrides[cssVar] = resolved.trim();
  }

  return { overrides, warnings };
}
