# Reading Mode / Neuro-Inclusive Preset (Slice 14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single **Reading Mode** toggle that swaps in a dyslexia/low-vision-friendly font (Atkinson Hyperlegible), opens up text spacing, calms the canvas grid, and stops decorative motion — orthogonal to dark/light, persisted.

**Architecture:** Mirror the theme mechanism — a `reading` boolean in `useThemeStore` (persisted) drives a `data-reading` attribute on `<html>` (set in `initTheme` alongside `data-theme`); a vendored woff2 + `reading.css` restyle on `[data-reading='on']`; a toolbar `ReadingToggle`.

**Tech Stack:** React 19 + TS, Zustand (+ persist), CSS variables, vendored woff2, lucide-react, Vitest 4 + jsdom (React-19 `act` harness). No new dependencies.

## Global Constraints

- No new runtime/npm dependency; the font is **vendored woff2** (no CDN at runtime).
- Reading Mode is **orthogonal** to `data-theme` and design tokens — it does NOT re-color the palette (font / spacing / grid-opacity / motion only).
- `data-reading` is applied the same way as `data-theme` (in `initTheme`); persisted via the theme store's `partialize`.
- Component tests use the React-19 `act` + `react-dom/client` harness already in the suite — no `@testing-library`.
- `--grid-opacity` is consumed by `.react-flow__background { opacity: var(--grid-opacity) }` (`index.css`), so lowering it genuinely calms the dot grid. Defaults: dark `0.3`, light `0.6`.
- Run tests with `npm test`; single file `npx vitest run <path>`; Windows worker-pool error → retry `--pool=threads`. CSS/font wiring is verified by `npm run build` (Vite resolves the `@font-face` url()).
- Comments in english–russian mix. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Spec:** `docs/superpowers/specs/2026-06-24-reading-mode-design.md`

---

### Task 1: `reading` state + `data-reading` plumbing

**Files:**
- Modify: `src/store/useThemeStore.ts`
- Test: `src/store/useThemeStore.test.ts`

**Interfaces:**
- Produces: `useThemeStore` gains `reading: boolean` and `setReading: (on: boolean) => void`; `initTheme` sets `data-reading` on `<html>`.

- [ ] **Step 1: Extend the existing tests (failing)**

In `src/store/useThemeStore.test.ts`, add a new describe block (after the existing `initTheme` block):

```ts
describe('reading mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-reading');
    useThemeStore.setState({ mode: 'system', resolved: 'dark', reading: false });
  });

  it('defaults to off and toggles via setReading', () => {
    expect(useThemeStore.getState().reading).toBe(false);
    useThemeStore.getState().setReading(true);
    expect(useThemeStore.getState().reading).toBe(true);
    useThemeStore.getState().setReading(false);
    expect(useThemeStore.getState().reading).toBe(false);
  });

  it('initTheme applies data-reading and reacts to setReading', () => {
    initTheme();
    expect(document.documentElement.getAttribute('data-reading')).toBe('off');
    useThemeStore.getState().setReading(true);
    expect(document.documentElement.getAttribute('data-reading')).toBe('on');
    useThemeStore.getState().setReading(false);
    expect(document.documentElement.getAttribute('data-reading')).toBe('off');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/useThemeStore.test.ts`
Expected: FAIL — `setReading` is not a function / `reading` is undefined.

- [ ] **Step 3: Implement the store changes**

In `src/store/useThemeStore.ts`:

(a) Extend the `ThemeState` interface (add two members):
```ts
interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  reading: boolean;
  setMode: (mode: ThemeMode) => void;
  setReading: (on: boolean) => void;
  syncSystem: () => void;
}
```

(b) In the `create(...)` initializer, add the state + action and extend `partialize`:
```ts
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: resolveTheme('system', systemDark()),
      reading: false,
      setMode: (mode) => set({ mode, resolved: resolveTheme(mode, systemDark()) }),
      setReading: (on) => set({ reading: on }),
      syncSystem: () => set({ resolved: resolveTheme(get().mode, systemDark()) }),
    }),
    { name: 'sovern-theme', partialize: (s) => ({ mode: s.mode, reading: s.reading }) },
  ),
);
```

(c) Replace `initTheme` so `apply` sets BOTH attributes from full state:
```ts
export function initTheme() {
  const apply = (s: ThemeState) => {
    document.documentElement.setAttribute('data-theme', s.resolved);
    document.documentElement.setAttribute('data-reading', s.reading ? 'on' : 'off');
  };

  useThemeStore.subscribe(apply);
  // resolved мог устареть после rehydrate из localStorage — пересчитать
  useThemeStore.getState().syncSystem();
  apply(useThemeStore.getState());

  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => useThemeStore.getState().syncSystem());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/store/useThemeStore.test.ts`
Expected: PASS (existing theme tests + the 2 new reading tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/useThemeStore.ts src/store/useThemeStore.test.ts
git commit -m "feat: reading-mode state + data-reading attribute in the theme store"
```

---

### Task 2: Vendored font + `reading.css`

**Files:**
- Create: `src/assets/fonts/OpenDyslexic-Regular.woff2`, `OpenDyslexic-Bold.woff2`, `src/assets/fonts/OFL.txt`
- Create: `src/theme/reading.css`
- Modify: `src/index.css` (add the `@import`)

**Interfaces:**
- Consumes: the `data-reading` attribute (Task 1); the `--grid-opacity` variable (`tokens.css`/`index.css`).
- Produces: the visual restyle on `[data-reading='on']`; the `OpenDyslexic` `@font-face`.

- [ ] **Step 1: Download the vendored font + license**

OpenDyslexic ships **Latin + Cyrillic** (verified) — required for the bilingual RU/EN content. Source = the official `antijingoist/opendyslexic` repo's compiled woff2.

Run (PowerShell, from repo root):
```powershell
New-Item -ItemType Directory -Force src/assets/fonts | Out-Null
$base = 'https://cdn.jsdelivr.net/gh/antijingoist/opendyslexic/compiled'
Invoke-WebRequest "$base/OpenDyslexic-Regular.woff2" -OutFile src/assets/fonts/OpenDyslexic-Regular.woff2
Invoke-WebRequest "$base/OpenDyslexic-Bold.woff2"    -OutFile src/assets/fonts/OpenDyslexic-Bold.woff2
Invoke-WebRequest "https://cdn.jsdelivr.net/gh/antijingoist/opendyslexic/OFL.txt" -OutFile src/assets/fonts/OFL.txt
Get-ChildItem src/assets/fonts | Select-Object Name, Length
```
Expected: three files; `OpenDyslexic-Regular.woff2` ~115 KB, `OpenDyslexic-Bold.woff2` non-empty, `OFL.txt` non-empty.

- [ ] **Step 2: Create `src/theme/reading.css`**

```css
/* Reading Mode (neuro-inclusive preset) — orthogonal to data-theme.
   Vendored OpenDyslexic (SIL OFL, Latin+Cyrillic); see assets/fonts/OFL.txt.
   No runtime CDN. */

@font-face {
  font-family: 'OpenDyslexic';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/OpenDyslexic-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'OpenDyslexic';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../assets/fonts/OpenDyslexic-Bold.woff2') format('woff2');
}

/* Calmer dot grid (cf. .react-flow__background opacity: var(--grid-opacity)).
   1-attr selector ties with [data-theme='light']; the 2-attr rule below wins for light. */
[data-reading='on'] {
  --font-reading: 'OpenDyslexic', ui-sans-serif, system-ui, sans-serif;
  --grid-opacity: 0.15;
}
[data-reading='on'][data-theme='light'] {
  --grid-opacity: 0.3;
}

[data-reading='on'] body {
  font-family: var(--font-reading);
  line-height: 1.7;
  letter-spacing: 0.012em;
}

/* Plain mode: stop decorative motion. */
[data-reading='on'] *,
[data-reading='on'] *::before,
[data-reading='on'] *::after {
  animation: none !important;
  transition: none !important;
}

/* Always-on a11y baseline, independent of the toggle. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 3: Import it from `index.css`**

In `src/index.css`, add the import immediately after the tokens import (line 2):
```css
@import 'tailwindcss';
@import './theme/tokens.css';
@import './theme/reading.css';
```

- [ ] **Step 4: Verify the build resolves the font + CSS**

Run: `npm run build`
Expected: build succeeds (Vite resolves both `@font-face` `url()`s and emits the woff2 to `dist/assets`). No "Could not resolve" errors.

- [ ] **Step 5: Commit**

```bash
git add src/assets/fonts src/theme/reading.css src/index.css
git commit -m "feat: vendored Atkinson Hyperlegible + reading.css restyle on data-reading"
```

---

### Task 3: `ReadingToggle` button + mount

**Files:**
- Create: `src/components/ReadingToggle.tsx`
- Test: `src/components/ReadingToggle.test.tsx`
- Modify: `src/App.tsx` (mount next to `<ThemeSwitcher />`)

**Interfaces:**
- Consumes: `useThemeStore` `reading` + `setReading` (Task 1).
- Produces: `ReadingToggle()` component.

- [ ] **Step 1: Write the failing test**

Create `src/components/ReadingToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { ReadingToggle } from './ReadingToggle';
import { useThemeStore } from '../store/useThemeStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

beforeEach(() => {
  useThemeStore.setState({ reading: false });
});

describe('ReadingToggle', () => {
  it('renders a button reflecting the off state', () => {
    const { container, cleanup } = mount(<ReadingToggle />);
    const btn = container.querySelector('button')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    cleanup();
  });

  it('clicking toggles reading in the store and reflects aria-pressed', () => {
    const { container, cleanup } = mount(<ReadingToggle />);
    const btn = container.querySelector('button')!;
    act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useThemeStore.getState().reading).toBe(true);
    expect(container.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    act(() => { container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(useThemeStore.getState().reading).toBe(false);
    cleanup();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ReadingToggle.test.tsx`
Expected: FAIL — cannot resolve `./ReadingToggle`.

- [ ] **Step 3: Implement `src/components/ReadingToggle.tsx`**

```tsx
import { BookOpen } from 'lucide-react';
import { useThemeStore } from '../store/useThemeStore';

/** Toggles Reading Mode (neuro-inclusive preset) — orthogonal to dark/light. */
export function ReadingToggle() {
  const reading = useThemeStore((s) => s.reading);
  const setReading = useThemeStore((s) => s.setReading);

  return (
    <button
      type="button"
      aria-pressed={reading}
      title="Reading mode (calm typography)"
      onClick={() => setReading(!reading)}
      className={`p-2.5 rounded-xl transition-colors ${
        reading ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'
      }`}
    >
      <BookOpen size={18} />
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ReadingToggle.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it next to the theme switcher in `App.tsx`**

In `src/App.tsx`:

(a) Add the import after the `ThemeSwitcher` import (~line 16):
```tsx
import { ReadingToggle } from './components/ReadingToggle';
```

(b) In the toolbar, find the line:
```tsx
            <ThemeSwitcher />
```
and add `ReadingToggle` immediately after it:
```tsx
            <ThemeSwitcher />
            <ReadingToggle />
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: PASS — full suite (existing + Task 1/3 additions), no failures.

- [ ] **Step 7: Commit**

```bash
git add src/components/ReadingToggle.tsx src/components/ReadingToggle.test.tsx src/App.tsx
git commit -m "feat: ReadingToggle button mounted by the theme switcher"
```

---

## Manual verification (after Task 3, at finishing)

Live smoke in `npm run dev` (pin `--port 1420 --strictPort` — Vite drifts off 5173 because eStateHub squats it):
1. Click the **Reading Mode** (book) toolbar button → the UI font visibly changes to OpenDyslexic (weighted letter bottoms), text spacing opens up, the canvas dot grid softens, and the header's pinging/spinning animations stop.
2. **Cyrillic check:** Russian node labels (the mc_hub board has many) render in OpenDyslexic too — not a fallback font. (OpenDyslexic ships Latin+Cyrillic.)
3. It works on BOTH dark and light (toggle the theme — Reading Mode persists across the switch).
4. Reload the page → Reading Mode is still on (persisted).
5. Toggle off → everything returns to the default font/spacing/motion.

---

## Notes for the implementer

- The font applies app-wide including canvas node labels; React Flow re-measures node box sizes on font load but does NOT re-run layout — node positions are unchanged (labels may wrap slightly differently). This is expected.
- `reading.css` must be `@import`ed AFTER `tokens.css` so its `--grid-opacity` overrides win on equal specificity.
- Do not add an npm font dependency — the woff2 are downloaded once and committed (vendored). The font is **OpenDyslexic** (Latin+Cyrillic), not Atkinson (Latin-only).
- Reuse the `mount` test helper pattern from `ShapePicker.test.tsx`; no `@testing-library`.
