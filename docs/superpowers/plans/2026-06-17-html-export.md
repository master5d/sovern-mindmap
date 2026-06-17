# Standalone Interactive HTML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current canvas as a single self-contained interactive `.html` (pan/zoom + dark/light toggle) — a shareable artifact, no server needed.

**Architecture:** Capture the live React-Flow viewport as a self-contained SVG via `html-to-image`'s `toSvg` (reusing the PNG export's fit-to-content recipe), capture it twice (light + dark theme), and embed both in a pure HTML-template shell with vanilla pan/zoom + a theme toggle. Shared save + viewport helpers are extracted from `exportPng.ts` (DRY).

**Tech Stack:** TypeScript, @xyflow/react 12, `html-to-image` (already a dep), Zustand theme store, vitest (jsdom env). Run tests with `npx vitest run --pool=threads <path>`; fall back to plain `npx vitest run <path>` if it stalls.

**Spec:** `docs/superpowers/specs/2026-06-17-html-export-design.md`
**Branch:** `feature/html-export` (created; spec committed there).

---

## Verified facts
- `html-to-image` exports both `toPng` and `toSvg` (confirmed). `toSvg` returns a `data:image/svg+xml;charset=utf-8,<urlencoded svg>` URL.
- Theme store `src/store/useThemeStore.ts`: `setMode(mode)` updates `resolved` and a subscriber sets `data-theme` on `<html>`; React Flow's `colorMode` is driven by `resolved`. So flipping `setMode` re-themes the live canvas (needs a frame to settle before capture).
- `exportPng.ts` already has the fit-to-content recipe (`getNodesBounds` + `getViewportForBounds`) and the Tauri/browser save logic — both are extracted and reused here.

## File map
- `src/export/fitViewport.ts` — `computeExportViewport(nodes)` (extracted). (Task 1)
- `src/export/saveFile.ts` — `saveFile(content, name, mime)` (extracted). (Task 1)
- `src/utils/exportPng.ts` — refactored to reuse the two helpers. (Task 1)
- `src/export/htmlTemplate.ts` — `buildInteractiveHtml` (pure). (Task 2)
- `src/export/captureCanvasSvg.ts` + `src/export/exportHtml.ts` — DOM capture + orchestrator. (Task 3)
- `src/App.tsx` — Export HTML button. (Task 4)

---

## Task 1: Extract shared `computeExportViewport` + `saveFile`, refactor PNG export

**Files:**
- Create: `src/export/fitViewport.ts`, `src/export/fitViewport.test.ts`, `src/export/saveFile.ts`
- Modify: `src/utils/exportPng.ts`

- [ ] **Step 1: Write the failing test for the viewport helper**

`src/export/fitViewport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeExportViewport } from './fitViewport';

const node = (id: string, x: number, y: number) => ({
  id, position: { x, y }, width: 100, height: 50, measured: { width: 100, height: 50 }, data: {},
});

describe('computeExportViewport', () => {
  it('returns positive dimensions and a numeric viewport for a set of nodes', () => {
    const r = computeExportViewport([node('a', 0, 0), node('b', 300, 200)] as any);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.pixelRatio).toBeGreaterThan(0);
    expect(typeof r.viewport.x).toBe('number');
    expect(typeof r.viewport.zoom).toBe('number');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/export/fitViewport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the viewport helper**

`src/export/fitViewport.ts`:

```ts
import { getNodesBounds, getViewportForBounds, Node } from '@xyflow/react';

const MAX_DIM = 8192; // px, cap on the larger side of the exported image

/** Fit-to-content size + viewport for exporting the whole graph (shared by PNG/HTML). */
export function computeExportViewport(nodes: Node[]) {
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + 80);
  const height = Math.ceil(bounds.height + 80);
  const pixelRatio = Math.min(2, MAX_DIM / Math.max(width, height));
  const viewport = getViewportForBounds(bounds, width, height, 0.05, 2, 0.04);
  return { width, height, pixelRatio, viewport };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/export/fitViewport.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the save helper**

`src/export/saveFile.ts`:

```ts
const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

/** Save text or bytes to disk: a Tauri save-dialog write, or a browser anchor-download. */
export async function saveFile(content: string | Uint8Array, name: string, mime: string): Promise<void> {
  const ext = name.split('.').pop() || 'bin';
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return;
    if (typeof content === 'string') await writeTextFile(path, content);
    else await writeFile(path, content);
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: Refactor `exportPng.ts` to reuse both helpers**

Replace the entire contents of `src/utils/exportPng.ts` with:

```ts
import { toPng } from 'html-to-image';
import { Node } from '@xyflow/react';
import { computeExportViewport } from '../export/fitViewport';
import { saveFile } from '../export/saveFile';

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

const fileName = (view: string) => `sovern-${view}-${new Date().toISOString().slice(0, 10)}.png`;

const dataUrlToBytes = (dataUrl: string) =>
  Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));

/** mindmap/diagram: whole graph fit-to-content (React Flow recipe). */
export async function exportCanvasPng(nodes: Node[], view: string) {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const { width, height, pixelRatio, viewport } = computeExportViewport(nodes);
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
  await saveFile(dataUrlToBytes(dataUrl), fileName(view), 'image/png');
}

/** kanban/matrix/timeline: snapshot of the view's DOM container. */
export async function exportDomViewPng(view: string) {
  const el = document.querySelector('[data-export-root]') as HTMLElement | null;
  if (!el) throw new Error('view container not found');
  const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: bgColor() });
  await saveFile(dataUrlToBytes(dataUrl), fileName(view), 'image/png');
}
```

- [ ] **Step 7: Typecheck + build (PNG refactor has no unit tests — verify it compiles & bundles)**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/export/fitViewport.ts src/export/fitViewport.test.ts src/export/saveFile.ts src/utils/exportPng.ts
git commit -m "refactor(export): extract computeExportViewport + saveFile; reuse in PNG export"
```

---

## Task 2: `buildInteractiveHtml` — the pure HTML template

**Files:**
- Create: `src/export/htmlTemplate.ts`, `src/export/htmlTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

`src/export/htmlTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildInteractiveHtml } from './htmlTemplate';

const build = (title = 'Diagram') =>
  buildInteractiveHtml({ lightSvg: '<svg id="L"></svg>', darkSvg: '<svg id="D"></svg>', title });

describe('buildInteractiveHtml', () => {
  it('returns a complete HTML document', () => {
    const h = build();
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('<html');
    expect(h.trim().endsWith('</html>')).toBe(true);
  });

  it('embeds both SVG payloads', () => {
    const h = buildInteractiveHtml({ lightSvg: '__LIGHT_SVG__', darkSvg: '__DARK_SVG__', title: 'x' });
    expect(h).toContain('__LIGHT_SVG__');
    expect(h).toContain('__DARK_SVG__');
  });

  it('has a theme toggle and a pan/zoom script', () => {
    const h = build();
    expect(h).toContain('id="theme"');
    expect(h).toContain('<script>');
    expect(h.toLowerCase()).toContain('wheel');
  });

  it('escapes the title (no HTML injection)', () => {
    const h = build('<img src=x onerror=alert(1)>');
    expect(h).toContain('&lt;img');
    expect(h).not.toContain('<img');
  });

  it('references no external resources (self-contained)', () => {
    const h = build();
    expect(h).not.toContain('src="http');
    expect(h).not.toContain('href="http');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/export/htmlTemplate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the template**

`src/export/htmlTemplate.ts`:

```ts
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/**
 * Build a self-contained interactive HTML document embedding the diagram in two themes.
 * Pan (drag), zoom (wheel/buttons), and a light/dark toggle are inline vanilla JS — no
 * external resources. `lightSvg`/`darkSvg` are pre-serialized SVG markup (already escaped
 * by html-to-image); `title` is HTML-escaped here. No user data reaches the script.
 */
export function buildInteractiveHtml({
  lightSvg,
  darkSvg,
  title,
}: {
  lightSvg: string;
  darkSvg: string;
  title: string;
}): string {
  const t = escapeHtml(title);
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${t}</title>
<style>
  :root { color-scheme: light dark; }
  html,body { margin:0; height:100%; overflow:hidden; font-family:system-ui,-apple-system,sans-serif; color:#0f172a; }
  body { background:#f8fafc; }
  html[data-theme="dark"] body { background:#020617; color:#e2e8f0; }
  #stage { position:fixed; inset:0; overflow:hidden; cursor:grab; }
  #stage:active { cursor:grabbing; }
  #pan { transform-origin:0 0; will-change:transform; }
  #pan svg { display:block; }
  .hidden { display:none !important; }
  #bar { position:fixed; top:12px; left:12px; display:flex; gap:8px; align-items:center;
         background:rgba(127,127,127,.15); backdrop-filter:blur(8px); padding:8px 10px; border-radius:12px; font-size:13px; z-index:10; }
  #bar button { cursor:pointer; border:0; border-radius:8px; padding:6px 10px; font-size:13px; background:rgba(127,127,127,.25); color:inherit; }
  #cap { font-weight:600; opacity:.7; margin-right:4px; }
</style>
</head>
<body>
<div id="bar">
  <span id="cap">${t}</span>
  <button id="theme" title="Toggle theme">🌙</button>
  <button id="zin" title="Zoom in">+</button>
  <button id="zout" title="Zoom out">−</button>
  <button id="fit" title="Fit">Fit</button>
</div>
<div id="stage"><div id="pan">
  <div id="light">${lightSvg}</div>
  <div id="dark" class="hidden">${darkSvg}</div>
</div></div>
<script>
(function(){
  var pan=document.getElementById('pan'), stage=document.getElementById('stage');
  var x=0,y=0,k=1;
  function apply(){ pan.style.transform='translate('+x+'px,'+y+'px) scale('+k+')'; }
  stage.addEventListener('wheel',function(e){ e.preventDefault();
    var r=stage.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    var f=e.deltaY<0?1.1:1/1.1, nk=Math.min(8,Math.max(0.05,k*f));
    x=mx-(mx-x)*(nk/k); y=my-(my-y)*(nk/k); k=nk; apply();
  },{passive:false});
  var down=false,px=0,py=0;
  stage.addEventListener('pointerdown',function(e){ down=true; px=e.clientX; py=e.clientY; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove',function(e){ if(!down)return; x+=e.clientX-px; y+=e.clientY-py; px=e.clientX; py=e.clientY; apply(); });
  stage.addEventListener('pointerup',function(){ down=false; });
  document.getElementById('zin').onclick=function(){ k=Math.min(8,k*1.2); apply(); };
  document.getElementById('zout').onclick=function(){ k=Math.max(0.05,k/1.2); apply(); };
  document.getElementById('fit').onclick=function(){ x=0; y=0; k=1; apply(); };
  var dark=false;
  document.getElementById('theme').onclick=function(){
    dark=!dark;
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
    document.getElementById('light').classList.toggle('hidden', dark);
    document.getElementById('dark').classList.toggle('hidden', !dark);
    this.textContent = dark?'☀':'🌙';
  };
  apply();
})();
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/export/htmlTemplate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/export/htmlTemplate.ts src/export/htmlTemplate.test.ts
git commit -m "feat(export): pure buildInteractiveHtml — self-contained pan/zoom + theme-toggle shell"
```

---

## Task 3: `captureCanvasSvg` + `exportHtml` orchestrator

**Files:**
- Create: `src/export/captureCanvasSvg.ts`, `src/export/exportHtml.ts`

These touch the DOM, `html-to-image`, and the theme store, none of which render in jsdom,
so there are no unit tests here (same as the existing, untested `exportPng.ts`). Verify by
typecheck + build; behaviour is covered by the manual smoke after merge.

- [ ] **Step 1: Implement `captureCanvasSvg`**

`src/export/captureCanvasSvg.ts`:

```ts
import { toSvg } from 'html-to-image';
import { Node } from '@xyflow/react';
import { computeExportViewport } from './fitViewport';

const bgColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas').trim() || '#020617';

/** Capture the whole graph as a self-contained inline SVG markup string. */
export async function captureCanvasSvg(nodes: Node[]): Promise<string> {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const { width, height, viewport } = computeExportViewport(nodes);
  const dataUrl = await toSvg(el, {
    width,
    height,
    backgroundColor: bgColor(),
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  // toSvg → "data:image/svg+xml;charset=utf-8,<urlencoded svg>"; recover the raw markup.
  const comma = dataUrl.indexOf(',');
  return decodeURIComponent(dataUrl.slice(comma + 1));
}
```

- [ ] **Step 2: Implement the `exportHtml` orchestrator**

`src/export/exportHtml.ts`:

```ts
import { Node } from '@xyflow/react';
import { useThemeStore } from '../store/useThemeStore';
import { captureCanvasSvg } from './captureCanvasSvg';
import { buildInteractiveHtml } from './htmlTemplate';
import { saveFile } from './saveFile';

/** Wait two animation frames so a theme switch fully re-renders + repaints before capture. */
const settle = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface Deps {
  notify?: (message: string) => void;
}

/** Capture the canvas in both themes and save one self-contained interactive HTML file. */
export async function exportHtml(nodes: Node[], deps: Deps = {}): Promise<void> {
  const original = useThemeStore.getState().mode;
  try {
    useThemeStore.getState().setMode('light');
    await settle();
    const lightSvg = await captureCanvasSvg(nodes);

    useThemeStore.getState().setMode('dark');
    await settle();
    const darkSvg = await captureCanvasSvg(nodes);

    const title = `sovern-${new Date().toISOString().slice(0, 10)}`;
    const html = buildInteractiveHtml({ lightSvg, darkSvg, title });
    await saveFile(html, `${title}.html`, 'text/html');
    deps.notify?.('HTML exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    // Always restore the user's theme, even if capture failed mid-way.
    if (useThemeStore.getState().mode !== original) useThemeStore.getState().setMode(original);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/export/captureCanvasSvg.ts src/export/exportHtml.ts
git commit -m "feat(export): captureCanvasSvg (toSvg) + exportHtml double-capture orchestrator"
```

---

## Task 4: Export HTML toolbar button

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the imports**

In `src/App.tsx`, add `Code2` to the existing lucide import list, and add below the other util imports:

```tsx
import { exportHtml } from './export/exportHtml';
```

- [ ] **Step 2: Add the busy state + handler**

In `Flow()`, just after the existing `const [exporting, setExporting] = useState(false);` and its `onExport` handler, add:

```tsx
  const [exportingHtml, setExportingHtml] = useState(false);
  const onExportHtml = async () => {
    if (exportingHtml) return;
    setExportingHtml(true);
    try {
      await exportHtml(nodes.filter((n) => n.type !== 'lane'), { notify });
    } finally {
      setExportingHtml(false);
    }
  };
```

- [ ] **Step 3: Render the button (canvas views only)**

In the toolbar's load/export cluster, immediately after the existing Export PNG button
(`<button onClick={onExport} ... ><ImageDown size={18} /></button>`), add:

```tsx
            {isCanvasView && (
              <button onClick={onExportHtml} disabled={exportingHtml} title="Export HTML" className="p-2.5 text-secondary hover:text-accent disabled:opacity-40"><Code2 size={18} /></button>
            )}
```

(`isCanvasView` is already computed in `Flow()` as `viewMode === 'mindmap' || viewMode === 'diagram'`.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 5: Full test run**

Run: `npx vitest run --pool=threads`
Expected: all suites PASS (prior 123 + the new fitViewport + htmlTemplate tests).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(export): Export HTML toolbar button (canvas views)"
```

---

## Manual live smoke (after merge)

Not coded. In the browser dev server, open a diagram and click **Export HTML**. Open the
downloaded `.html` in a fresh browser tab and verify: the diagram renders, drag pans,
wheel zooms, the ☀/🌙 toggle re-themes the diagram, and View-Source shows no external
`http(s)://` resource references. Confirm **PNG export still works** (the refactor didn't
regress it).

## Notes for the implementer
- Run tests with `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls.
- `buildInteractiveHtml` is the only pure/tested piece; capture + orchestrator + button are DOM/library-bound and verified by typecheck/build + manual smoke (mirrors the untested `exportPng.ts`).
- Never interpolate graph/user data into the `<script>` — only the two pre-serialized SVG strings and the HTML-escaped title go into the template, and only into markup positions.
- The theme double-capture briefly flips the live theme; the `finally` block must always restore the original `mode`.
