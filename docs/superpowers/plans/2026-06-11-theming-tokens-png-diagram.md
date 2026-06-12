# Theming + Design Tokens + PNG Export + Diagram View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light/system theme switching, W3C design-token upload, full-graph PNG export, and a fifth "diagram" view (tree + swimlanes + presentation mode) to sovern-mindmap.

**Architecture:** A semantic CSS-custom-property layer (`src/theme/tokens.css`) carries all colors; Tailwind v4 `@theme inline` exposes them as utilities; a zustand theme store toggles `data-theme` on `<html>`; uploaded W3C tokens override the same variables via an injected `<style>`. Diagram view reuses the React Flow canvas with two new pure layout functions. PNG export uses `html-to-image` with the official React Flow fit-to-content recipe.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Tailwind CSS v4, @xyflow/react 12, dagre, Zustand 5 (+persist), html-to-image (new), vitest (new, dev).

**Spec:** `docs/superpowers/specs/2026-06-11-theming-export-diagram-design.md`

**Working directory for all commands:** `C:\telo\Efforts\On\MindMapping\sovern-mindmap`

---

## File Structure Overview

| File | Action | Responsibility |
|---|---|---|
| `vitest.config.ts` | Create | Test runner config (jsdom) |
| `src/theme/tokens.css` | Create | All semantic CSS variables, dark + light blocks |
| `src/index.css` | Rewrite | Tailwind import + `@theme inline` mapping + base styles |
| `src/App.css` | Delete | Unused Tauri template leftover (not imported anywhere) |
| `src/store/useThemeStore.ts` | Create | mode (dark/light/system) → resolved theme, persistence, `data-theme` side effect |
| `src/store/useThemeStore.test.ts` | Create | resolveTheme + initTheme tests |
| `src/components/ThemeSwitcher.tsx` | Create | Sun/Moon/Monitor segmented control |
| `src/utils/feedback.ts` | Modify | Colors → CSS vars, `alpha()` helper, `layerColor()` |
| `src/utils/feedback.test.ts` | Create | alpha() tests |
| `src/components/nodes/SOVERNNode.tsx` | Modify | Semantic classes, layer/status colors via vars |
| `src/components/NodeSidebar.tsx` | Modify | Semantic classes |
| `src/components/KanbanBoard.tsx` | Modify | Semantic classes, deduplicate palette (import from feedback.ts) |
| `src/components/MatrixView.tsx` | Modify | Semantic classes, quadrant vars |
| `src/components/TimelineView.tsx` | Modify | Semantic classes |
| `src/theme/designTokens.ts` | Create | W3C Design Tokens JSON → CSS-var overrides (pure) |
| `src/theme/designTokens.test.ts` | Create | Parser tests |
| `src/theme/customTokens.ts` | Create | Apply/persist/reset/init of overrides (DOM + localStorage) |
| `src/components/TokenUpload.tsx` | Create | Palette button, file picker (Tauri/browser), reset |
| `src/utils/layout.ts` | Modify | Fresh dagre graph per call; `getTreeLayout`, `getLaneLayout` |
| `src/utils/layout.test.ts` | Create | Tree/lane layout tests |
| `src/components/nodes/LaneNode.tsx` | Create | Swimlane background node |
| `src/store/useWorkflowStore.ts` | Modify | `'diagram'` ViewMode, `diagramLayout`, `presentationMode` |
| `src/utils/exportPng.ts` | Create | Canvas + DOM-view PNG export, Tauri/browser save |
| `src/utils/persistence.ts` | Modify | Exclude lane nodes from .canvas save |
| `src/App.tsx` | Modify | ThemeSwitcher, TokenUpload, Export button, diagram view button + sub-toolbar, presentation mode, toast |
| `src/main.tsx` | Modify | `initTheme()`, `initCustomTokens()` |
| `package.json` | Modify | `test` script, deps |

---

### Task 1: Test Infrastructure (vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install dev dependencies**

Run: `npm install -D vitest jsdom`
Expected: both added to `devDependencies`, exit 0.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 3: Add test script**

In `package.json` `"scripts"`, after `"preview": "vite preview",` add:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: exit 0 with "No test files found" (passWithNoTests).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Theme Variable Layer

**Files:**
- Create: `src/theme/tokens.css`
- Rewrite: `src/index.css`
- Delete: `src/App.css` (Tauri template leftover; not imported by any file — verify with grep before removing)

- [ ] **Step 1: Create `src/theme/tokens.css`** (complete file)

```css
/* Семантические переменные темы. dark = текущие cyberpunk-значения
   (визуальный no-op для тёмной темы). Загруженные design-токены
   (customTokens.ts) переопределяют эти же переменные поверх обеих тем. */

:root,
[data-theme='dark'] {
  color-scheme: dark;

  --bg-canvas: #020617;
  --bg-surface: #0f172a;
  --bg-surface-2: #020617;
  --bg-hover: #1e293b;
  --border: #1e293b;
  --border-strong: #334155;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #2563eb;
  --grid-dots: #1e293b;
  --lane-bg: rgba(148, 163, 184, 0.05);

  --status-idle: #64748b;
  --status-pending: #eab308;
  --status-active: #3b82f6;
  --status-done: #22c55e;
  --status-blocked: #ef4444;

  --q-dofirst: #ef4444;
  --q-schedule: #3b82f6;
  --q-quick: #eab308;
  --q-backlog: #64748b;

  --layer-human: #ef4444;
  --layer-boss: #a855f7;
  --layer-skills: #3b82f6;
  --layer-coding: #22c55e;
  --layer-gateway: #eab308;
  --layer-memory: #ec4899;
  --layer-tools: #06b6d4;
  --layer-observability: #f97316;
  --layer-hosting: #6366f1;
  --layer-projects: #f43f5e;
  --layer-lms: #10b981;
  --layer-blog: #8b5cf6;
  --layer-hub: #0ea5e9;
  --layer-mentor: #d946ef;
  --layer-workers: #f59e0b;
  --layer-course: #84cc16;
  --layer-infra: #64748b;
}

/* Чистая профессиональная светлая тема: те же hue, плотность 600-700
   для контраста на белом; неон/glow остаются только в dark. */
[data-theme='light'] {
  color-scheme: light;

  --bg-canvas: #f8fafc;
  --bg-surface: #ffffff;
  --bg-surface-2: #f1f5f9;
  --bg-hover: #e2e8f0;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --accent: #2563eb;
  --grid-dots: #cbd5e1;
  --lane-bg: rgba(15, 23, 42, 0.03);

  --status-idle: #64748b;
  --status-pending: #ca8a04;
  --status-active: #2563eb;
  --status-done: #16a34a;
  --status-blocked: #dc2626;

  --q-dofirst: #dc2626;
  --q-schedule: #2563eb;
  --q-quick: #ca8a04;
  --q-backlog: #64748b;

  --layer-human: #dc2626;
  --layer-boss: #9333ea;
  --layer-skills: #2563eb;
  --layer-coding: #16a34a;
  --layer-gateway: #ca8a04;
  --layer-memory: #db2777;
  --layer-tools: #0891b2;
  --layer-observability: #ea580c;
  --layer-hosting: #4f46e5;
  --layer-projects: #e11d48;
  --layer-lms: #059669;
  --layer-blog: #7c3aed;
  --layer-hub: #0284c7;
  --layer-mentor: #c026d3;
  --layer-workers: #d97706;
  --layer-course: #65a30d;
  --layer-infra: #64748b;
}
```

- [ ] **Step 2: Rewrite `src/index.css`** (complete file)

`@theme inline` makes utilities reference the vars at runtime (required — values change per `data-theme`). Opacity modifiers (`bg-surface/80`) work: Tailwind v4 generates `color-mix()`.

```css
@import 'tailwindcss';
@import './theme/tokens.css';

@theme inline {
  --color-canvas: var(--bg-canvas);
  --color-surface: var(--bg-surface);
  --color-surface-2: var(--bg-surface-2);
  --color-hover: var(--bg-hover);
  --color-edge: var(--border);
  --color-edge-strong: var(--border-strong);
  --color-primary: var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-muted: var(--text-muted);
  --color-accent: var(--accent);
}

html,
body {
  background-color: var(--bg-canvas);
  margin: 0;
  padding: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

#root {
  width: 100%;
  height: 100%;
  display: block;
  position: relative;
}

.react-flow {
  background-color: var(--bg-canvas);
}

.react-flow__background {
  opacity: 0.3;
}
```

Note: `color-scheme` now lives in tokens.css per theme; the `!important` flags from the old file are dropped deliberately (they predate the current stable layout).

- [ ] **Step 3: Delete unused `src/App.css`**

Run: `git grep -n "App.css" -- src` → Expected: no matches (it is not imported).
Then: `git rm src/App.css`

- [ ] **Step 4: Verify build + visual**

Run: `npm run build` → Expected: exit 0.
Run: `npm run dev`, open the app → Expected: identical dark look (no visual change yet).
In DevTools console: `document.documentElement.setAttribute('data-theme','light')` → page/canvas background turns light (components still dark-styled — refactored in Tasks 5-6; that's expected).

- [ ] **Step 5: Commit**

```bash
git add src/theme/tokens.css src/index.css
git rm --cached src/App.css 2>$null; git add -u
git commit -m "feat(theme): semantic CSS variable layer with dark/light themes"
```

---

### Task 3: Theme Store (dark / light / system)

**Files:**
- Create: `src/store/useThemeStore.ts`
- Test: `src/store/useThemeStore.test.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/store/useThemeStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTheme, useThemeStore, initTheme } from './useThemeStore';

describe('resolveTheme', () => {
  it('explicit modes ignore system', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('system follows systemDark flag', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('initTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies resolved theme to <html> and reacts to setMode', () => {
    // jsdom не имеет matchMedia → systemDark() даёт true → dark
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    useThemeStore.getState().setMode('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    useThemeStore.getState().setMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists mode only', () => {
    initTheme();
    useThemeStore.getState().setMode('light');
    const saved = JSON.parse(localStorage.getItem('sovern-theme')!);
    expect(saved.state).toEqual({ mode: 'light' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/useThemeStore.test.ts`
Expected: FAIL — cannot resolve `./useThemeStore`.

- [ ] **Step 3: Implement `src/store/useThemeStore.ts`** (complete file)

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const resolveTheme = (mode: ThemeMode, systemDark: boolean): ResolvedTheme =>
  mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

const systemDark = (): boolean =>
  typeof window === 'undefined' || !window.matchMedia
    ? true // matchMedia недоступен → dark (исторический дефолт приложения)
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  syncSystem: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: resolveTheme('system', systemDark()),
      setMode: (mode) => set({ mode, resolved: resolveTheme(mode, systemDark()) }),
      syncSystem: () => set({ resolved: resolveTheme(get().mode, systemDark()) }),
    }),
    { name: 'sovern-theme', partialize: (s) => ({ mode: s.mode }) },
  ),
);

/** Вешает тему на <html> и слушает смену системной. Вызывать один раз из main.tsx. */
export function initTheme() {
  const apply = (resolved: ResolvedTheme) =>
    document.documentElement.setAttribute('data-theme', resolved);

  useThemeStore.subscribe((s) => apply(s.resolved));
  // resolved мог устареть после rehydrate из localStorage — пересчитать
  useThemeStore.getState().syncSystem();
  apply(useThemeStore.getState().resolved);

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => useThemeStore.getState().syncSystem());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/useThemeStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `src/main.tsx`**

After `import "./index.css";` add:

```ts
import { initTheme } from "./store/useThemeStore";

initTheme();
```

- [ ] **Step 6: Verify build**

Run: `npm run build` → Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/store/useThemeStore.ts src/store/useThemeStore.test.ts src/main.tsx
git commit -m "feat(theme): theme store with dark/light/system modes and persistence"
```

---

### Task 4: ThemeSwitcher UI + ReactFlow colorMode

**Files:**
- Create: `src/components/ThemeSwitcher.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ThemeSwitcher.tsx`** (complete file)

```tsx
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../store/useThemeStore';

const MODES: { mode: ThemeMode; Icon: typeof Sun; label: string }[] = [
  { mode: 'light', Icon: Sun, label: 'Light' },
  { mode: 'dark', Icon: Moon, label: 'Dark' },
  { mode: 'system', Icon: Monitor, label: 'System' },
];

export function ThemeSwitcher() {
  const { mode, setMode } = useThemeStore();
  return (
    <div className="flex space-x-1.5 px-2 border-r border-edge">
      {MODES.map(({ mode: m, Icon, label }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          title={label}
          className={`p-2.5 rounded-xl ${
            mode === m ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `src/App.tsx`**

a) Add imports:

```tsx
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useThemeStore } from './store/useThemeStore';
```

b) Inside `Flow()`, read resolved theme:

```tsx
const resolved = useThemeStore((s) => s.resolved);
```

c) On the `<ReactFlow>` element replace `colorMode="dark"` with:

```tsx
colorMode={resolved}
```

d) Replace `<Background color="#1e293b" ...>` with (SVG `fill` can't take `var()` as an attribute, so use the resolved ternary):

```tsx
<Background color={resolved === 'dark' ? '#1e293b' : '#cbd5e1'} variant={'dots' as any} gap={20} size={2} />
```

e) In the bottom toolbar, insert `<ThemeSwitcher />` as the **first** child of the toolbar div (before the view-buttons group).

- [ ] **Step 3: Verify visually**

Run: `npm run dev` → toolbar shows Sun/Moon/Monitor; clicking Sun switches page background light + React Flow controls to light mode; Monitor follows the OS setting; reload preserves the choice.

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeSwitcher.tsx src/App.tsx
git commit -m "feat(theme): three-state theme switcher in toolbar"
```

---

### Task 5: Palette Helpers (`feedback.ts` → CSS vars + `alpha()`)

The codebase concatenates hex alpha suffixes (`q.color + '18'`). That breaks with `var(--…)` values, so all alpha usage moves to a `color-mix()` helper.

**Files:**
- Modify: `src/utils/feedback.ts` (rewrite)
- Test: `src/utils/feedback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/feedback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { alpha, layerColor, quadrant, AREA_COLORS, STATUS_COLORS } from './feedback';

describe('alpha', () => {
  it('wraps any color (incl. css vars) in color-mix', () => {
    expect(alpha('#ef4444', 9)).toBe('color-mix(in srgb, #ef4444 9%, transparent)');
    expect(alpha('var(--status-active)', 25)).toBe(
      'color-mix(in srgb, var(--status-active) 25%, transparent)',
    );
  });
});

describe('palette is var-based', () => {
  it('layerColor builds var with infra fallback', () => {
    expect(layerColor('lms')).toBe('var(--layer-lms, var(--layer-infra))');
  });
  it('AREA_COLORS / STATUS_COLORS are css vars', () => {
    expect(AREA_COLORS.lms).toBe('var(--layer-lms)');
    expect(STATUS_COLORS.active).toBe('var(--status-active)');
  });
  it('quadrant returns css-var colors with same thresholds', () => {
    expect(quadrant(7, 7)).toEqual({ label: 'Do First', color: 'var(--q-dofirst)' });
    expect(quadrant(7, 3)).toEqual({ label: 'Schedule', color: 'var(--q-schedule)' });
    expect(quadrant(3, 7)).toEqual({ label: 'Quick', color: 'var(--q-quick)' });
    expect(quadrant(3, 3)).toEqual({ label: 'Backlog', color: 'var(--q-backlog)' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/feedback.test.ts`
Expected: FAIL — `alpha` / `layerColor` not exported.

- [ ] **Step 3: Rewrite `src/utils/feedback.ts`** (complete file)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/feedback.test.ts`
Expected: PASS. (`npm run build` will fail until Task 6 updates the consumers — that's why Tasks 5+6 land in one commit at the end of Task 6.)

- [ ] **Step 5: No commit yet** — continue straight to Task 6 (consumers must compile).

---

### Task 6: Semantic Refactor of All Components

**Files:**
- Modify: `src/App.tsx`, `src/components/nodes/SOVERNNode.tsx`, `src/components/NodeSidebar.tsx`, `src/components/KanbanBoard.tsx`, `src/components/MatrixView.tsx`, `src/components/TimelineView.tsx`

**Class mapping table** — apply to every `className` in the six files:

| Old | New |
|---|---|
| `bg-[#020617]` | `bg-canvas` |
| `bg-slate-900` (incl. `/30 /50 /80 /90 /95`) | `bg-surface` (keep the same `/NN`) |
| `bg-slate-950` (incl. `/50 /90`) | `bg-surface-2` (keep `/NN`) |
| `bg-slate-800`, `hover:bg-slate-800` | `bg-hover`, `hover:bg-hover` |
| `border-slate-800` (incl. `/60`), `border-slate-800/40` | `border-edge` (keep `/NN`) |
| `border-slate-700` (incl. `/70`), `border-slate-600` | `border-edge-strong` (keep `/NN`) |
| `hover:border-slate-700/600/500` | `hover:border-edge-strong` |
| `text-white`, `text-slate-100`, `text-slate-200` | `text-primary` |
| `text-slate-300`, `text-slate-400` | `text-secondary` |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-muted` |
| `placeholder:text-slate-600` | `placeholder:text-muted` |
| `bg-blue-600` | `bg-accent` |
| `hover:bg-blue-500` | `hover:bg-accent/90` |
| `border-blue-500`, `focus:border-blue-500` | `border-accent`, `focus:border-accent` |
| `ring-blue-500/20` | `ring-accent/20` |
| `text-blue-500` (brand span, $ icon) | `text-accent` |
| `accent-blue-500` (range inputs) | `accent-[var(--accent)]` |
| `hover:text-white` | `hover:text-primary` |
| `shadow-blue-500/20` | `shadow-accent/20` |
| `hover:shadow-black/40` | *(drop the color — keep `hover:shadow-lg`)* |

**Exceptions (do NOT map):**
- `text-white` **inside accent/colored-filled buttons** stays `text-white` (e.g. Save Node button, active view buttons) — dark text-primary on blue is unreadable in light theme.
- Decorative identity colors stay: VIEW_BUTTONS active colors (`bg-blue-600/purple-600/orange-600/emerald-600 text-white`), `animate-ping` pulse, `text-yellow-400`/`fill-yellow-400/20` token icon, `text-orange-400/500`, `text-purple-400/500`, `text-green-500`, `text-red-500/hover:bg-red-500/10` (sidebar trash), `bg-green-500`/`bg-orange-500` sync dot in header.

- [ ] **Step 1: Refactor `src/App.tsx`**

Apply the table. Plus these specific edits:

a) Canvas wrapper (line ~106): `backgroundColor: '#020617'` → `backgroundColor: 'var(--bg-canvas)'`.
b) Controls (line ~119): `className="bg-slate-900/80 border-slate-800 fill-slate-100"` → `className="bg-surface/80 border-edge fill-[var(--text-primary)]"`.
c) Sync button (line ~162): `bg-slate-800 text-slate-400 hover:bg-white hover:text-slate-950` → `bg-hover text-secondary hover:bg-primary hover:text-canvas` (inverted hover via semantic vars).

- [ ] **Step 2: Refactor `src/components/nodes/SOVERNNode.tsx`**

a) **Delete** the local `layerColors` map (lines 5-24). Import instead:

```tsx
import { layerColor } from '../../utils/feedback';
```

b) Replace `const accentColor = layerColors[data.layer] || '#64748b';` with:

```tsx
const accentColor = layerColor(data.layer);
```

c) Card div: `bg-slate-900` → `bg-surface`; `border-slate-800 hover:border-slate-700` → `border-edge hover:border-edge-strong`; `ring-blue-500/20 border-blue-500` → `ring-accent/20 border-accent`.
d) Severity strip fallback stays as-is (`data.color` is a hex from the canvas file — leave untouched).
e) Status dot — replace the class-based color block with var-driven inline style:

```tsx
<div
  className={`w-2.5 h-2.5 rounded-full shadow-lg ${data.status === 'active' ? 'animate-pulse' : ''}`}
  style={{ backgroundColor: `var(--status-${data.status}, var(--status-idle))` }}
  title={`Status: ${data.status}`}
/>
```

f) Handles: `!bg-slate-700 border-2 border-slate-900` → `!bg-edge-strong border-2 border-surface` (both occurrences).
g) Meta rows: `text-slate-400 bg-slate-950/50 border-slate-800` → `text-secondary bg-surface-2/50 border-edge`; `text-slate-200` → `text-primary`; title `text-slate-100` → `text-primary`; agent row `border-slate-800` → `border-edge`.
h) Keep `text-yellow-400`, `text-orange-400`, `text-purple-400` accent icons (exceptions list).

- [ ] **Step 3: Refactor `src/components/NodeSidebar.tsx`**

Apply the table throughout (panel, inputs, selects, labels, footer). Specifics: panel `bg-slate-900/95` → `bg-surface/95`; all inputs `bg-slate-950 border-slate-800 text-white focus:border-blue-500` → `bg-surface-2 border-edge text-primary focus:border-accent`; `$` prefix `text-slate-600` → `text-muted`; severity value fallback `'#e2e8f0'` → `'var(--text-primary)'`; mono id `text-slate-600` → `text-muted`; range inputs `accent-blue-500` → `accent-[var(--accent)]`; Save button keeps `text-white` (exception).

- [ ] **Step 4: Refactor `src/components/KanbanBoard.tsx`**

a) **Delete** local duplicates `AREA_COLORS`, `CATEGORY_EMOJI`, `quadrant` (lines 16-31). Import:

```tsx
import { AREA_COLORS, CATEGORY_EMOJI, quadrant, alpha, stripEmoji } from '../utils/feedback';
```

b) `COLUMNS` accents → vars:

```tsx
const COLUMNS: { status: NodeStatus; title: string; accent: string; Icon: typeof Inbox }[] = [
  { status: 'idle', title: 'Triage', accent: 'var(--status-idle)', Icon: Inbox },
  { status: 'pending', title: 'Pending', accent: 'var(--status-pending)', Icon: Clock3 },
  { status: 'active', title: 'Active', accent: 'var(--status-active)', Icon: PlayCircle },
  { status: 'done', title: 'Done', accent: 'var(--status-done)', Icon: CheckCircle2 },
  { status: 'blocked', title: 'Blocked', accent: 'var(--status-blocked)', Icon: Ban },
];
```

c) Replace all string-concat alpha with `alpha()` (hex suffix → percent: `'15'`→8, `'18'`→9, `'30'`→19, `'40'`→25):
   - card area chip style → `{ color: AREA_COLORS[area] || 'var(--text-secondary)', borderColor: alpha(AREA_COLORS[area] || 'var(--text-secondary)', 25), backgroundColor: alpha(AREA_COLORS[area] || 'var(--text-secondary)', 8) }`
   - quadrant chip → `{ color: q.color, backgroundColor: alpha(q.color, 9) }`
   - area filter active style → `{ backgroundColor: alpha(AREA_COLORS[a] || 'var(--layer-infra)', 19), borderColor: AREA_COLORS[a] || 'var(--layer-infra)', color: AREA_COLORS[a] }`
   - column count badge → `{ color: accent, backgroundColor: alpha(accent, 9) }`
d) Card label cleanup: replace the inline `String(node.data.label).replace(/^[🐛✨🎨❓💡]\s*/u, '')` with `stripEmoji(node.data.label)` (now imported).
e) Severity strip fallback `'#334155'` → `'var(--border-strong)'`.
f) Apply the class table to the rest (root `bg-[#020617]` → `bg-canvas`, search input, columns, toast, drag-over `border-blue-500/60 bg-blue-500/5` → `border-accent/60 bg-accent/5`, selected card ring, `text-slate-700` empty label → `text-muted`).

- [ ] **Step 5: Refactor `src/components/MatrixView.tsx`**

a) Import `alpha` (extend the existing feedback.ts import).
b) `QUADRANTS` colors → vars:

```tsx
const QUADRANTS = [
  { label: 'Schedule', sub: 'high impact · low urgency', color: 'var(--q-schedule)', col: 1, row: 1 },
  { label: 'Do First', sub: 'high impact · high urgency', color: 'var(--q-dofirst)', col: 2, row: 1 },
  { label: 'Backlog', sub: 'low impact · low urgency', color: 'var(--q-backlog)', col: 1, row: 2 },
  { label: 'Quick Wins', sub: 'low impact · high urgency', color: 'var(--q-quick)', col: 2, row: 2 },
];
```

c) Alpha-concat replacements: quadrant bg `q.color + '08'` → `alpha(q.color, 3)`; quadrant title `q.color + 'cc'` → `alpha(q.color, 80)`; expander chip `q.color + '18'` → `alpha(q.color, 9)`.
d) Chip: area dot fallback `'#94a3b8'` → `'var(--text-secondary)'`; severity strip fallback `'#334155'` → `'var(--border-strong)'`; classes per table (`bg-slate-900/90` → `bg-surface/90`, `border-slate-700/70 hover:border-slate-500` → `border-edge-strong/70 hover:border-edge-strong`, `text-slate-200` → `text-primary`).
e) Root + axes + expanded cell per table (`bg-[#020617]` → `bg-canvas`, `bg-slate-950/90` → `bg-surface-2/90`, `border-slate-700/60` → `border-edge-strong/60`, axis `text-slate-600` → `text-muted`).

- [ ] **Step 6: Refactor `src/components/TimelineView.tsx`**

a) Import `alpha` (extend existing import).
b) Lane label style → `{ color: AREA_COLORS[area] || 'var(--text-secondary)', backgroundColor: alpha(AREA_COLORS[area] || 'var(--text-secondary)', 8) }`.
c) Status dot fallback `'#64748b'` → `'var(--status-idle)'`; severity strip fallback `'#334155'` → `'var(--border-strong)'`.
d) Classes per table (roots `bg-[#020617]` → `bg-canvas`, card `bg-slate-900/90 border-slate-700/70` → `bg-surface/90 border-edge-strong/70`, grid `border-slate-800/40` → `border-edge/40`, date labels `text-slate-600` → `text-muted`, empty state `text-slate-600` → `text-muted`).

- [ ] **Step 7: Verify**

Run: `npm test` → PASS (feedback + theme tests).
Run: `npm run build` → exit 0.
Run: `npm run dev` → check **both themes** (switcher) in **all 4 views**: dark looks identical to before; light is clean white/slate with readable chips, quadrants, lanes, sidebar.

- [ ] **Step 8: Commit**

```bash
git add src/utils/feedback.ts src/utils/feedback.test.ts src/App.tsx src/components
git commit -m "feat(theme): semantic color refactor — all components themeable via CSS vars"
```

---

### Task 7: W3C Design Tokens Parser

**Files:**
- Create: `src/theme/designTokens.ts`
- Test: `src/theme/designTokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/theme/designTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDesignTokens } from './designTokens';

describe('parseDesignTokens', () => {
  it('maps known flat paths', () => {
    const r = parseDesignTokens({
      color: {
        background: { $value: '#101010', $type: 'color' },
        accent: { $value: '#ff00aa' },
      },
    });
    expect(r.overrides).toEqual({ '--bg-canvas': '#101010', '--accent': '#ff00aa' });
    expect(r.warnings).toEqual([]);
  });

  it('maps nested text group and normalizes case/slashes', () => {
    const r = parseDesignTokens({
      Color: { Text: { Primary: { $value: '#111111' } } },
    });
    expect(r.overrides['--text-primary']).toBe('#111111');
  });

  it('maps layer.* and status.* with and without color. prefix', () => {
    const r = parseDesignTokens({
      layer: { boss: { $value: '#aa00ff' } },
      color: { status: { blocked: { $value: '#cc0000' } } },
    });
    expect(r.overrides['--layer-boss']).toBe('#aa00ff');
    expect(r.overrides['--status-blocked']).toBe('#cc0000');
  });

  it('resolves aliases and guards cycles', () => {
    const r = parseDesignTokens({
      base: { red: { $value: '#ef4444' } },
      color: { accent: { $value: '{base.red}' } },
      a: { $value: '{b}' },
      b: { $value: '{a}' },
    });
    expect(r.overrides['--accent']).toBe('#ef4444');
    expect(r.overrides).not.toHaveProperty('--a');
  });

  it('skips non-color $type, unmapped paths, invalid colors — with warnings', () => {
    const r = parseDesignTokens({
      color: {
        accent: { $value: '16px', $type: 'dimension' },
        surface: { $value: 'not-a-color' },
      },
      spacing: { md: { $value: '#ffffff' } },
    });
    expect(r.overrides).toEqual({});
    expect(r.warnings).toHaveLength(3);
  });

  it('rejects css-injection attempts in color values', () => {
    const r = parseDesignTokens({
      color: { accent: { $value: 'rgb(0,0,0)}body{background:url(//evil)' } },
    });
    expect(r.overrides).toEqual({});
    expect(r.warnings).toHaveLength(1);
  });

  it('handles non-object input gracefully', () => {
    expect(parseDesignTokens(null).overrides).toEqual({});
    expect(parseDesignTokens([1, 2]).overrides).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/theme/designTokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/theme/designTokens.ts`** (complete file)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/theme/designTokens.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme/designTokens.ts src/theme/designTokens.test.ts
git commit -m "feat(tokens): W3C design tokens parser with alias resolution and injection-safe validation"
```

---

### Task 8: Custom Tokens Apply/Persist + Upload UI + Toast

**Files:**
- Create: `src/theme/customTokens.ts`
- Create: `src/components/TokenUpload.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Create `src/theme/customTokens.ts`** (complete file)

```ts
import { parseDesignTokens, TokenParseResult } from './designTokens';

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
  // значения провалидированы COLOR_RE в парсере, ключи — из фиксированной карты
  const css = `:root{${entries.map(([k, v]) => `${k}:${v}`).join(';')}}`;
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
```

- [ ] **Step 2: Create `src/components/TokenUpload.tsx`** (complete file)

```tsx
import { useRef, useState } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { applyCustomTokens, resetCustomTokens, hasCustomTokens } from '../theme/customTokens';

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export function TokenUpload({ notify }: { notify: (msg: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(hasCustomTokens());

  const applyText = (text: string) => {
    try {
      const { overrides, warnings } = applyCustomTokens(text);
      setActive(true);
      notify(
        `tokens applied: ${Object.keys(overrides).length}` +
          (warnings.length ? `, skipped ${warnings.length}` : ''),
      );
      if (warnings.length) console.warn('[tokens] skipped:', warnings);
    } catch (err) {
      notify(`⚠ tokens rejected: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const pick = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Design Tokens', extensions: ['json'] }],
      });
      if (typeof path === 'string') applyText(await readTextFile(path));
    } else {
      inputRef.current?.click();
    }
  };

  const reset = () => {
    resetCustomTokens();
    setActive(false);
    notify('tokens reset to default');
  };

  return (
    <div className="flex space-x-1.5 px-2 border-r border-edge">
      <button
        onClick={pick}
        title="Upload design tokens (W3C JSON)"
        className="p-2.5 text-secondary hover:text-accent relative"
      >
        <Palette size={18} />
        {active && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />}
      </button>
      {active && (
        <button onClick={reset} title="Reset to default theme" className="p-2.5 text-secondary hover:text-primary">
          <RotateCcw size={18} />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) applyText(await f.text());
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Toast + wiring in `src/App.tsx`**

a) Add imports: `import { useState } from 'react'` (extend existing react import), `import { TokenUpload } from './components/TokenUpload';`
b) Inside `Flow()` add notify state:

```tsx
const [notice, setNotice] = useState<string | null>(null);
const noticeTimer = useRef<number | undefined>(undefined);
const notify = (msg: string) => {
  setNotice(msg);
  window.clearTimeout(noticeTimer.current);
  noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
};
```

c) In the toolbar, insert `<TokenUpload notify={notify} />` right after `<ThemeSwitcher />`.
d) Render the toast just before the closing tag of the root div (after `{selectedNodeId && <NodeSidebar />}`):

```tsx
{notice && (
  <div className="absolute bottom-24 right-6 z-30 bg-surface border border-edge text-primary text-xs px-4 py-2.5 rounded-xl shadow-2xl">
    {notice}
  </div>
)}
```

- [ ] **Step 4: Init on startup in `src/main.tsx`**

After `initTheme();` add:

```ts
import { initCustomTokens } from "./theme/customTokens";

initCustomTokens();
```

(Keep imports at the top of the file with the others; the calls stay in order: `initTheme()` then `initCustomTokens()`.)

- [ ] **Step 5: Verify**

Run: `npm run build` → exit 0. Run: `npm run dev`.
Create `C:\telo\Efforts\On\MindMapping\_reference\test-tokens.json`:

```json
{
  "color": {
    "background": { "$value": "#1a1025", "$type": "color" },
    "surface": { "$value": "#241636" },
    "accent": { "$value": "{base.purple}" }
  },
  "base": { "purple": { "$value": "#a855f7" } },
  "layer": { "boss": { "$value": "#ff6b00" } }
}
```

Upload via Palette button → background turns deep purple, boss nodes orange, toast shows "tokens applied: 4". Reload → tokens still applied. Reset → back to theme defaults. Upload a non-JSON file → "⚠ tokens rejected: …", nothing changes.

- [ ] **Step 6: Commit**

```bash
git add src/theme/customTokens.ts src/components/TokenUpload.tsx src/App.tsx src/main.tsx
git commit -m "feat(tokens): design token upload with persistence, reset and toast feedback"
```

---

### Task 9: Diagram Layouts (tree + lanes)

**Files:**
- Modify: `src/utils/layout.ts`
- Test: `src/utils/layout.test.ts`

- [ ] **Step 1: Fix dagre graph reuse in `getLayoutedElements`**

The module-level `dagreGraph` singleton accumulates stale nodes/edges across calls — harmless with one layout, a real bug once tree/lane layouts run against changing node sets. In `src/utils/layout.ts` delete the two module-level lines:

```ts
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
```

and create the graph inside `getLayoutedElements` (first lines of the function):

```ts
export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === 'LR';
  // ... остальное без изменений
```

- [ ] **Step 2: Write the failing test**

Create `src/utils/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { getTreeLayout, getLaneLayout, LANE_HEIGHT } from './layout';

const n = (id: string, layer: string): Node => ({
  id, type: 'sovern', position: { x: 0, y: 0 }, data: { label: id, layer },
});
const e = (s: string, t: string): Edge => ({ id: `${s}-${t}`, source: s, target: t });

describe('getTreeLayout', () => {
  it('locks nodes and places parent above child', () => {
    const { nodes } = getTreeLayout([n('root', 'human'), n('child', 'boss')], [e('root', 'child')]);
    const root = nodes.find((x) => x.id === 'root')!;
    const child = nodes.find((x) => x.id === 'child')!;
    expect(root.draggable).toBe(false);
    expect(child.draggable).toBe(false);
    expect(root.position.y).toBeLessThan(child.position.y);
  });
});

describe('getLaneLayout', () => {
  const graph = [n('a', 'boss'), n('b', 'coding'), n('c', 'coding'), n('d', 'tools')];
  const edges = [e('a', 'b'), e('b', 'c'), e('a', 'd')];

  it('creates one lane node per distinct layer, in first-appearance order', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const lanes = nodes.filter((x) => x.type === 'lane');
    expect(lanes.map((x) => x.id)).toEqual(['lane_boss', 'lane_coding', 'lane_tools']);
    expect(lanes.map((x) => x.position.y)).toEqual([0, LANE_HEIGHT, LANE_HEIGHT * 2]);
  });

  it('keeps content nodes inside their lane row', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const c = nodes.find((x) => x.id === 'c')!;
    expect(c.position.y).toBeGreaterThanOrEqual(LANE_HEIGHT);
    expect(c.position.y).toBeLessThan(LANE_HEIGHT * 2);
  });

  it('orders dependencies left-to-right', () => {
    const { nodes } = getLaneLayout(graph, edges);
    const x = (id: string) => nodes.find((nn) => nn.id === id)!.position.x;
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
  });

  it('separates same-lane same-rank collisions horizontally', () => {
    // b и c в одном layer и одном dagre-ранге (оба дети a)
    const g = [n('a', 'boss'), n('b', 'coding'), n('c', 'coding')];
    const ed = [e('a', 'b'), e('a', 'c')];
    const { nodes } = getLaneLayout(g, ed);
    const xs = nodes.filter((x) => x.type !== 'lane' && (x.data as any).layer === 'coding')
      .map((x) => x.position.x).sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(280);
  });

  it('ignores pre-existing lane nodes in input', () => {
    const withLane = [...graph, { id: 'lane_boss', type: 'lane', position: { x: 0, y: 0 }, data: { label: 'boss' } } as Node];
    const { nodes } = getLaneLayout(withLane, edges);
    expect(nodes.filter((x) => x.id === 'lane_boss')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/utils/layout.test.ts`
Expected: FAIL — `getTreeLayout` / `getLaneLayout` not exported.

- [ ] **Step 4: Implement layouts — append to `src/utils/layout.ts`**

```ts
export const LANE_HEIGHT = 180;
const LANE_LABEL_W = 140;
const NODE_GAP_X = 280;

/** Diagram view · Tree: строгий org-chart — dagre TB, ноды залочены. */
export const getTreeLayout = (nodes: Node[], edges: Edge[]) => {
  const content = nodes.filter((n) => n.type !== 'lane');
  const { nodes: laid } = getLayoutedElements(content, edges, 'TB');
  return { nodes: laid.map((n) => ({ ...n, draggable: false })), edges };
};

/** Diagram view · Lanes: swimlane на layer; x — dagre-ранг (LR) по зависимостям. */
export const getLaneLayout = (nodes: Node[], edges: Edge[]) => {
  const content = nodes.filter((n) => n.type !== 'lane');
  const { nodes: lr } = getLayoutedElements(content, edges, 'LR');
  const xById = new Map(lr.map((n) => [n.id, n.position.x]));

  const laneOrder: string[] = [];
  content.forEach((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    if (!laneOrder.includes(layer)) laneOrder.push(layer);
  });

  const laid = content.map((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    const row = laneOrder.indexOf(layer);
    return {
      ...n,
      draggable: false,
      targetPosition: 'left' as const,
      sourcePosition: 'right' as const,
      position: {
        x: LANE_LABEL_W + (xById.get(n.id) ?? 0),
        y: row * LANE_HEIGHT + (LANE_HEIGHT - 110) / 2,
      },
    };
  });

  // внутри lane разводим ноды одного dagre-ранга (иначе наложатся)
  const byLane = new Map<string, typeof laid>();
  laid.forEach((n) => {
    const layer = String((n.data as any)?.layer ?? 'infra');
    (byLane.get(layer) ?? byLane.set(layer, []).get(layer)!).push(n);
  });
  byLane.forEach((arr) => {
    arr.sort((a, b) => a.position.x - b.position.x);
    let minNext = -Infinity;
    arr.forEach((n) => {
      if (n.position.x < minNext) n.position.x = minNext;
      minNext = n.position.x + NODE_GAP_X;
    });
  });

  const maxX = Math.max(...laid.map((n) => n.position.x + (n.measured?.width ?? 260)), 600);
  const lanes: Node[] = laneOrder.map((layer, row) => ({
    id: `lane_${layer}`,
    type: 'lane',
    position: { x: 0, y: row * LANE_HEIGHT },
    data: { label: layer },
    draggable: false,
    selectable: false,
    zIndex: -1,
    style: { width: maxX + 80, height: LANE_HEIGHT },
  }));

  return { nodes: [...lanes, ...laid], edges };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/layout.test.ts`
Expected: PASS (6 tests). Also run full suite: `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/utils/layout.ts src/utils/layout.test.ts
git commit -m "feat(diagram): tree and swimlane layout engines + fresh dagre graph per call"
```

---

### Task 10: Diagram View Wiring (store + LaneNode + UI + presentation mode)

**Files:**
- Create: `src/components/nodes/LaneNode.tsx`
- Modify: `src/store/useWorkflowStore.ts`, `src/App.tsx`, `src/utils/persistence.ts`

- [ ] **Step 1: Create `src/components/nodes/LaneNode.tsx`** (complete file)

```tsx
import { NodeProps } from '@xyflow/react';

/** Фон swimlane в diagram view. Размер приходит через node.style на обёртку. */
export const LaneNode = ({ data }: NodeProps<any>) => (
  <div
    className="w-full h-full rounded-2xl border border-edge/60 relative pointer-events-none"
    style={{ backgroundColor: 'var(--lane-bg)' }}
  >
    <span
      className="absolute top-3 left-4 text-[10px] font-black uppercase tracking-[0.25em]"
      style={{ color: `var(--layer-${data.label}, var(--text-muted))` }}
    >
      {data.label}
    </span>
  </div>
);
```

- [ ] **Step 2: Extend `src/store/useWorkflowStore.ts`**

a) Import the new layouts (extend existing import):

```ts
import { getClusteredElements, getTreeLayout, getLaneLayout } from '../utils/layout';
```

b) Type changes:

```ts
export type ViewMode = 'mindmap' | 'diagram' | 'matrix' | 'timeline' | 'kanban';
export type DiagramLayout = 'tree' | 'lanes';
```

c) Add to `WorkflowState` interface:

```ts
  diagramLayout: DiagramLayout;
  presentationMode: boolean;
  setDiagramLayout: (layout: DiagramLayout) => void;
  setPresentationMode: (on: boolean) => void;
  applyDiagramLayout: () => void;
```

d) Add state + actions in the store creator:

```ts
  diagramLayout: 'tree',
  presentationMode: false,
  setDiagramLayout: (layout) => {
    set({ diagramLayout: layout });
    get().applyDiagramLayout();
  },
  setPresentationMode: (on) => set({ presentationMode: on }),
  applyDiagramLayout: () => {
    const { nodes, edges, diagramLayout } = get();
    const layoutFn = diagramLayout === 'tree' ? getTreeLayout : getLaneLayout;
    const { nodes: laid } = layoutFn(nodes, edges);
    set({ nodes: laid as any[] });
  },
```

e) Replace `setViewMode` with:

```ts
  setViewMode: (mode) => {
    const prev = get().viewMode;
    // уход из diagram: снять lane-ноды и вернуть draggable
    if (prev === 'diagram' && mode !== 'diagram') {
      set({
        nodes: get().nodes.filter((n) => n.type !== 'lane').map((n) => ({ ...n, draggable: true })),
        presentationMode: false,
      });
    }
    set({ viewMode: mode });
    if (mode === 'mindmap') get().autoLayout();
    if (mode === 'diagram') get().applyDiagramLayout();
    // matrix / timeline / kanban — DOM-вью, canvas-позиции не трогаем
  },
```

Note: `useBoardSync` re-applies the current view's layout via `store.setViewMode(store.viewMode)` after each poll — with this change the diagram layout survives board polling automatically.

f) `autoLayout` must ignore stray lane nodes (defensive):

```ts
  autoLayout: () => {
    const { nodes, edges } = get();
    const content = nodes.filter((n) => n.type !== 'lane');
    const { nodes: layoutedNodes, edges: layoutedEdges } = getClusteredElements(content, edges);
    set({ nodes: layoutedNodes as any[], edges: layoutedEdges });
  },
```

- [ ] **Step 3: Exclude lane nodes from .canvas persistence**

In `src/utils/persistence.ts` `saveToFile`, replace `const canvasData = toJSONCanvas(nodes, edges);` with:

```ts
const canvasData = toJSONCanvas(nodes.filter((n) => n.type !== 'lane'), edges);
```

- [ ] **Step 4: Wire diagram view into `src/App.tsx`**

a) Imports: add `Workflow, ListTree, Rows3, Eye, EyeOff` to the lucide-react import; add `MarkerType` to the `@xyflow/react` import; add `import { LaneNode } from './components/nodes/LaneNode';`. *(If `Workflow`/`ListTree`/`Rows3` are missing from the installed lucide version, substitute `GitBranch`/`GitBranch`/`Layers`.)*

b) `nodeTypes`:

```tsx
const nodeTypes = {
  sovern: SOVERNNode,
  lane: LaneNode,
};
```

c) `VIEW_BUTTONS` — add the diagram entry after mindmap:

```tsx
  { mode: 'diagram', Icon: Workflow, active: 'bg-cyan-600 text-white' },
```

d) In `Flow()` destructure new store fields:

```tsx
const { diagramLayout, setDiagramLayout, presentationMode, setPresentationMode } = useWorkflowStore();
```

e) Canvas-mode helpers + edge styling (above the `return`):

```tsx
const isCanvasView = viewMode === 'mindmap' || viewMode === 'diagram';
const displayEdges = !isCanvasView
  ? []
  : viewMode === 'diagram'
    ? edges.map((e) => ({
        ...e,
        type: 'smoothstep' as const,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      }))
    : edges;
```

f) `<ReactFlow>` props: `edges={displayEdges}` (replaces the old ternary), plus add `nodesDraggable={viewMode !== 'diagram'}`. Wrap `<Controls .../>` as `{!presentationMode && <Controls .../>}`.

g) fitView effect — extend to diagram and re-fit on sub-layout change. Replace the existing `useEffect` (the one gated on `viewMode !== 'mindmap'`) with:

```tsx
useEffect(() => {
  if (viewMode !== 'mindmap' && viewMode !== 'diagram') return; // canvas-вью; остальное DOM
  const t = setTimeout(() => fitView({ padding: 0.15, duration: 350 }), 50);
  return () => clearTimeout(t);
}, [viewMode, diagramLayout, fitView]);
```

Same for the `useBoardSync` change-callback: `if (useWorkflowStore.getState().viewMode === 'mindmap')` → `if (['mindmap', 'diagram'].includes(useWorkflowStore.getState().viewMode))`.

h) Header + toolbar hidden in presentation mode — wrap both top-level overlay divs:

```tsx
{!presentationMode && ( /* существующий Header div */ )}
{!presentationMode && ( /* существующий Toolbar div */ )}
```

i) Diagram sub-toolbar (insert after the main toolbar block):

```tsx
{viewMode === 'diagram' && !presentationMode && (
  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-surface/90 backdrop-blur-md p-2 border border-edge rounded-2xl shadow-2xl flex space-x-1.5">
    <button
      onClick={() => setDiagramLayout('tree')}
      title="Tree layout"
      className={`p-2.5 rounded-xl ${diagramLayout === 'tree' ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'}`}
    >
      <ListTree size={18} />
    </button>
    <button
      onClick={() => setDiagramLayout('lanes')}
      title="Dependency lanes"
      className={`p-2.5 rounded-xl ${diagramLayout === 'lanes' ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'}`}
    >
      <Rows3 size={18} />
    </button>
    <button
      onClick={() => setPresentationMode(true)}
      title="Presentation mode"
      className="p-2.5 rounded-xl text-secondary hover:bg-hover"
    >
      <Eye size={18} />
    </button>
  </div>
)}
{presentationMode && (
  <button
    onClick={() => setPresentationMode(false)}
    title="Exit presentation"
    className="absolute bottom-6 right-6 z-20 p-3 rounded-xl bg-surface/90 border border-edge text-secondary hover:text-primary shadow-2xl"
  >
    <EyeOff size={18} />
  </button>
)}
```

- [ ] **Step 5: Verify**

Run: `npm test` → all green. `npm run build` → exit 0. `npm run dev`:
- 5th view button shows strict top-down tree, nodes not draggable, ortho edges with arrows.
- Lanes toggle: one tinted full-width lane per layer with label, dependencies flow left→right, no node overlaps.
- Eye → header/toolbar/controls disappear, EyeOff floating button returns everything.
- Switching diagram → mindmap → diagram works; kanban/matrix unaffected (no lane ghosts).
- Save canvas while in diagram view → file contains no `lane_*` nodes.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/LaneNode.tsx src/store/useWorkflowStore.ts src/App.tsx src/utils/persistence.ts
git commit -m "feat(diagram): fifth view mode — tree/lanes layouts with presentation mode"
```

---

### Task 11: PNG Export

**Files:**
- Create: `src/utils/exportPng.ts`
- Modify: `src/App.tsx`, `src/components/KanbanBoard.tsx`, `src/components/MatrixView.tsx`, `src/components/TimelineView.tsx`, `package.json`

- [ ] **Step 1: Install dependency**

Run: `npm install html-to-image`
Expected: added to `dependencies`, exit 0.

- [ ] **Step 2: Create `src/utils/exportPng.ts`** (complete file)

```ts
import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, Node } from '@xyflow/react';

const MAX_DIM = 8192; // px, кап большей стороны итогового изображения
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

const fileName = (view: string) => `sovern-${view}-${new Date().toISOString().slice(0, 10)}.png`;

async function savePng(dataUrl: string, name: string) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return;
    const base64 = dataUrl.split(',')[1];
    await writeFile(path, Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  } else {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    a.click();
  }
}

/** mindmap/diagram: весь граф fit-to-content (рецепт React Flow). */
export async function exportCanvasPng(nodes: Node[], view: string) {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + 80);
  const height = Math.ceil(bounds.height + 80);
  const pixelRatio = Math.min(2, MAX_DIM / Math.max(width, height));
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0.04);

  const dataUrl = await toPng(el, {
    width,
    height,
    pixelRatio,
    backgroundColor: bgColor(),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  await savePng(dataUrl, fileName(view));
}

/** kanban/matrix/timeline: снимок DOM-контейнера вью. */
export async function exportDomViewPng(view: string) {
  const el = document.querySelector('[data-export-root]') as HTMLElement | null;
  if (!el) throw new Error('view container not found');
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bgColor() });
  await savePng(dataUrl, fileName(view));
}
```

- [ ] **Step 3: Mark DOM-view export roots**

Add the attribute `data-export-root` to the root div of each DOM view:
- `KanbanBoard.tsx`: `<div data-export-root className="absolute inset-0 flex flex-col bg-canvas z-10">`
- `MatrixView.tsx`: both root divs (the empty-state is absent here — only the main `<div data-export-root className="absolute inset-0 flex flex-col bg-canvas z-10 pt-44 pb-8 px-10">`)
- `TimelineView.tsx`: both the empty-state root and the main root div get `data-export-root`.

- [ ] **Step 4: Export button in `src/App.tsx`**

a) Imports: add `ImageDown` to lucide imports *(fallback: `Image`)*; `import { exportCanvasPng, exportDomViewPng } from './utils/exportPng';`
b) In `Flow()`:

```tsx
const [exporting, setExporting] = useState(false);
const onExport = async () => {
  if (exporting) return;
  setExporting(true);
  try {
    if (viewMode === 'mindmap' || viewMode === 'diagram') {
      await exportCanvasPng(nodes, viewMode);
    } else {
      await exportDomViewPng(viewMode);
    }
    notify('PNG exported');
  } catch (err) {
    notify(`⚠ export failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setExporting(false);
  }
};
```

c) In the toolbar's save/load group (next to FolderOpen/Save buttons) add:

```tsx
<button onClick={onExport} disabled={exporting} title="Export PNG" className="p-2.5 text-secondary hover:text-accent disabled:opacity-40">
  <ImageDown size={18} />
</button>
```

- [ ] **Step 5: Verify**

Run: `npm run build` → exit 0. `npm run dev` (browser):
- Mindmap: export downloads `sovern-mindmap-2026-06-11.png`, full graph visible incl. off-screen nodes, themed background.
- Diagram (lanes + presentation): export captures lanes/labels, no UI chrome.
- Kanban/matrix/timeline: export captures the full view.
- Light theme export has light background.

- [ ] **Step 6: Commit**

```bash
git add src/utils/exportPng.ts src/App.tsx src/components package.json package-lock.json
git commit -m "feat(export): full-graph PNG export for canvas views, snapshot for DOM views"
```

---

### Task 12: Docs + Final Verification

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update `README.md`**

a) In "Key Features" §1 header, change "The 4 Views" → "The 5 Views" and add after the Kanban bullet:

```markdown
*   **🧭 Diagram Mode:** Strict org-chart tree or dependency swimlanes (one lane per layer), orthogonal edges with arrows, plus a read-only **presentation mode** for demos and exports.
```

b) In §3 "Sovereign Infrastructure", replace the "Cyberpunk Aesthetics" bullet with:

```markdown
*   **🎨 Theming:** Dark (cyberpunk neon) / Light (clean professional) / System modes with persistence. Upload **W3C Design Tokens JSON** (Figma / Style Dictionary export) to re-skin the entire app — colors live in CSS custom properties.
*   **🖼️ PNG Export:** One click exports the full graph (fit-to-content) in canvas views or a snapshot of Kanban/Matrix/Timeline.
```

c) In Tech Stack, append to the Styling line: `+ CSS Custom Properties theming`; add `**Tests:** [Vitest](https://vitest.dev/)`.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add at the top (keep the file's existing format):

```markdown
## 2026-06-11

- **Theming:** dark / light / system modes, persisted; semantic CSS-variable layer.
- **Design tokens:** upload W3C Design Tokens JSON to override theme colors; reset to default.
- **Diagram view:** fifth mode — tree (org-chart) and dependency swimlanes, presentation mode.
- **PNG export:** full-graph export (canvas views) and view snapshots (DOM views), Tauri + browser.
- vitest test infrastructure; dagre graph no longer reused across layout calls.
```

- [ ] **Step 3: Full verification pass**

```bash
npm test        # all unit tests green
npm run build   # tsc + vite build, exit 0
npm run dev     # manual smoke per checklist below
```

Manual checklist: theme switcher (3 modes, persists across reload) · token upload/reset (persists) · all 5 views in both themes · diagram tree/lanes/presentation · PNG export from every view · board.canvas polling still re-layouts mindmap and diagram correctly · NodeSidebar opens and edits in both themes.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: theming, design tokens, diagram view, PNG export"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** theming (Tasks 2-6), token upload (7-8), PNG export (11), diagram view (9-10), tests (1, 3, 5, 7, 9), docs (12). Out-of-scope items from spec untouched. ✓
- **CSS injection hardening:** token values validated by a `{};`-free regex before being written into the injected `<style>` (Task 7 test covers an exfil attempt). Keys come from a fixed map — user input never becomes a CSS property name.
- **Known judgement calls:** `Background` dot color uses a resolved-theme ternary (SVG fill attr can't take `var()`); named CSS colors (`red`) in token files are rejected by design; lucide icon names may need substitution depending on installed version (noted inline).
