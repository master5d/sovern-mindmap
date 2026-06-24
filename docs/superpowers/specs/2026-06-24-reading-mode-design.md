# Slice 14 — Reading Mode (Neuro-Inclusive Preset) — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Epic:** [Ayoa-Inspired Sovereign Canvas](../epics/2026-06-24-ayoa-inspired-sovereign-canvas-epic.md) — Phase 1, slice 14.

## Goal

A single **Reading Mode** toggle that makes the whole app calmer and more legible —
a dyslexia/low-vision-friendly font, roomier text, a softer canvas, and no
decorative motion. For the operator's neurodivergent audience and the
clarity-first ethos; composes with dark/light and design tokens.

## Decisions (locked in brainstorming)

- **Shape:** one bundled **Reading Mode** toggle (not granular knobs, not font-only).
- **Font:** **Atkinson Hyperlegible** (Braille Institute, SIL OFL) — maximal letter
  distinction, clean, broadly legible. Vendored as **woff2** (no CDN at runtime).
- **Mechanism:** an orthogonal `data-reading` attribute on `<html>`, set the same
  way as `data-theme`, restyled by CSS variables — composes with any theme.

## Architecture

Mirrors the existing theme mechanism (`data-theme` + CSS vars + persisted store).

### `useThemeStore` (extend)

```ts
interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  reading: boolean;            // NEW
  setMode: (mode: ThemeMode) => void;
  setReading: (on: boolean) => void;  // NEW
  syncSystem: () => void;
}
```
- Default `reading: false`. `setReading: (on) => set({ reading: on })`.
- Persist it: `partialize: (s) => ({ mode: s.mode, reading: s.reading })`.
- **`initTheme`** applies BOTH attributes on every state change:
  ```ts
  const apply = (s: ThemeState) => {
    document.documentElement.setAttribute('data-theme', s.resolved);
    document.documentElement.setAttribute('data-reading', s.reading ? 'on' : 'off');
  };
  useThemeStore.subscribe(apply);
  useThemeStore.getState().syncSystem();
  apply(useThemeStore.getState());
  ```
  (the `matchMedia` listener block is unchanged).

### Vendored font

- `src/assets/fonts/atkinson-hyperlegible-latin-400-normal.woff2` (Regular) and
  `…-700-normal.woff2` (Bold), plus `src/assets/fonts/OFL.txt` (the SIL Open Font
  License). Sourced at setup time from the Fontsource package files
  (`cdn.jsdelivr.net/npm/@fontsource/atkinson-hyperlegible/files/…` and
  `/LICENSE`) and **committed** — no runtime CDN, no npm dependency.

### `src/theme/reading.css` (new), `@import`ed by `index.css` after `tokens.css`

- Two `@font-face` declarations (400/700) pointing at the vendored woff2
  (`font-display: swap`); Vite bundles the assets.
- A `[data-reading='on']` block (composes on top of either `data-theme`):
  - `body { font-family: var(--font-reading); line-height: 1.7; letter-spacing: 0.012em; }`
    where `--font-reading: 'Atkinson Hyperlegible', ui-sans-serif, system-ui, sans-serif`.
  - calmer canvas: lower `--grid-opacity` (dark `0.3 → 0.15`, light `0.6 → 0.3`).
  - motion off: `[data-reading='on'] *, [data-reading='on'] *::before, [data-reading='on'] *::after { animation: none !important; transition: none !important; }`.
- An always-on a11y baseline (independent of the toggle):
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; } }`.

Reading Mode does **not** re-color the palette — that stays the theme/design-tokens
job. "Calm" = font + spacing + motion + softer grid.

### `ReadingToggle` (`src/components/ReadingToggle.tsx`)

A toolbar button (lucide `BookOpen`) mounted beside `ThemeSwitcher`. Reads
`reading` from the store, toggles via `setReading(!reading)`, reflects state
(`aria-pressed`, active styling, `title` "Reading mode").

## Data flow

```
ReadingToggle click → setReading(on) → store persists {mode, reading}
  → initTheme subscribe → document.documentElement[data-reading] = 'on'/'off'
  → reading.css restyles (font / spacing / grid / motion) on top of data-theme
```
Persisted → survives reload; orthogonal to dark/light.

## Font / canvas note

The font applies app-wide, including React Flow node labels. When the woff2
loads, React Flow re-measures node box sizes, but **positions are held in state**
(the layout algorithm does not re-run) — labels may wrap slightly differently;
node positions do not move. Accepted.

## Error / edge handling

- Font fails to load → `font-display: swap` + the `ui-sans-serif` fallback keeps
  text readable; spacing/motion changes still apply.
- `data-reading` defaults to `'off'` (attribute always present after `initTheme`).
- jsdom has no `matchMedia` — unchanged from today (theme already handles this).

## Testing

- **Store** (`useThemeStore.test.ts`, extend): `setReading(true)` then `false`
  flips `reading`; default `reading === false`; `partialize` output includes
  `reading` (persistence shape).
- **`initTheme`** (extend the existing test): after `initTheme()`,
  `document.documentElement.getAttribute('data-reading')` is `'off'` by default;
  `setReading(true)` → `'on'`; `setReading(false)` → `'off'`. (Mirrors the existing
  `data-theme` assertions.)
- **`ReadingToggle`** (React-19 `act` harness, no `@testing-library`): renders a
  button; clicking toggles the store's `reading` (assert via `useThemeStore.getState().reading`);
  `aria-pressed` reflects state.
- CSS/font rendering is not unit-tested (jsdom has no font metrics) → covered by
  the **live smoke**: font visibly swaps, spacing opens up, animations stop, grid
  calms, and the setting persists across a reload.

## Files

- **Create:** `src/theme/reading.css`
- **Create:** `src/assets/fonts/atkinson-hyperlegible-latin-400-normal.woff2`, `…-700-normal.woff2`, `OFL.txt`
- **Create:** `src/components/ReadingToggle.tsx` + `src/components/ReadingToggle.test.tsx`
- **Modify:** `src/store/useThemeStore.ts` — `reading` state, `setReading`, persist, `initTheme` applies `data-reading`
- **Modify:** `src/store/useThemeStore.test.ts` — reading + `data-reading` assertions
- **Modify:** `src/index.css` — `@import './theme/reading.css';` after the tokens import
- **Modify:** `src/App.tsx` — mount `<ReadingToggle />` next to `<ThemeSwitcher />`

## Global constraints

- No new runtime/npm dependency; the font is vendored woff2 (sovereign, no CDN).
- Orthogonal to `data-theme` and design tokens (no palette re-color here).
- Component tests use the React-19 `act` + `react-dom/client` harness; no `@testing-library`.
- MindMap/Diagram canvas geometry unchanged (only label box re-measure on font load).
- Comments in english–russian mix per project convention.
