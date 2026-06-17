# Learn HTML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current diagram's Learn-mode walkthrough (cumulative reveal + per-step narration + prev/next) as one self-contained interactive `.html` for embedding in the course LMS.

**Architecture:** Drive the live Learn mode through steps 1..N, capturing each step's DOM as a transparent SVG frame (reusing slice-3 selectors + slice-5 `captureCanvasSvg`), then embed the N frames in a pure frame-switcher shell with a neutral hybrid background. Saved via the shared `saveFile`.

**Tech Stack:** TypeScript, @xyflow/react 12, `html-to-image` (existing dep), Zustand store + theme store, vitest (jsdom). Run tests with `npx vitest run --pool=threads <path>`; fall back to plain `npx vitest run <path>` if it stalls.

**Spec:** `docs/superpowers/specs/2026-06-17-learn-html-export-design.md`
**Branch:** `feature/learn-html-export` (created; spec committed there).

## Reused from earlier slices
- `src/store/useWorkflowStore.ts` — `enterLearnMode`/`exitLearnMode`, `learnMode`/`learnStep`, and the exported pure selectors `selectLearnOrder({nodes,edges})` → `{ order, total }` and `selectLearnStepText({nodes,edges}, step)` → `{ text, currentId, total }` (slice 3).
- `src/store/useThemeStore.ts` — `setMode(mode)` / `.mode` (drives `data-theme` + React Flow colorMode).
- `src/export/captureCanvasSvg.ts` — `captureCanvasSvg(nodes)` → inline SVG (slice 5; extended here).
- `src/export/saveFile.ts` — `saveFile(content, name, mime)` (slice 5).

## File map
- `src/export/learnHtmlTemplate.ts` — pure `buildLearnHtml`. (Task 1)
- `src/export/captureCanvasSvg.ts` + `src/export/exportLearnHtml.ts` — transparent capture option + orchestrator. (Task 2)
- `src/App.tsx` — Export Learn HTML button. (Task 3)

---

## Task 1: `buildLearnHtml` — the pure frame-switcher template

**Files:**
- Create: `src/export/learnHtmlTemplate.ts`, `src/export/learnHtmlTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

`src/export/learnHtmlTemplate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLearnHtml } from './learnHtmlTemplate';

const build = () =>
  buildLearnHtml({
    frames: [
      { svg: '<svg id="F1"></svg>', note: 'First step.' },
      { svg: '<svg id="F2"></svg>', note: 'Second step.' },
    ],
    title: 'Walkthrough',
  });

describe('buildLearnHtml', () => {
  it('returns a complete HTML document', () => {
    const h = build();
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('<html');
    expect(h.trim().endsWith('</html>')).toBe(true);
  });

  it('embeds every frame SVG and its narration', () => {
    const h = buildLearnHtml({
      frames: [{ svg: '__F1__', note: 'note one' }, { svg: '__F2__', note: 'note two' }],
      title: 'x',
    });
    expect(h).toContain('__F1__');
    expect(h).toContain('__F2__');
    expect(h).toContain('note one');
    expect(h).toContain('note two');
  });

  it('has prev/next controls, a step counter, and a script', () => {
    const h = build();
    expect(h).toContain('id="prev"');
    expect(h).toContain('id="next"');
    expect(h).toMatch(/\/ 2/); // counter total of 2
    expect(h).toContain('<script>');
  });

  it('escapes a malicious note and title', () => {
    const h = buildLearnHtml({
      frames: [{ svg: '<svg/>', note: '<img src=x onerror=alert(1)>' }],
      title: '<b>t</b>',
    });
    expect(h).toContain('&lt;img');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;b&gt;t&lt;/b&gt;');
  });

  it('includes the hybrid stage background and no external resources', () => {
    const h = build();
    expect(h).toContain('linear-gradient');
    expect(h).not.toContain('src="http');
    expect(h).not.toContain('href="http');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --pool=threads src/export/learnHtmlTemplate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the template**

`src/export/learnHtmlTemplate.ts`:

```ts
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/**
 * Build a self-contained interactive walkthrough: N pre-rendered (transparent) SVG frames,
 * shown one at a time with prev/next + per-step narration, on a neutral hybrid background
 * that reads on both light and dark host pages. No external resources; `title` and every
 * `note` are HTML-escaped; no user data is interpolated into the <script>.
 */
export function buildLearnHtml({
  frames,
  title,
}: {
  frames: { svg: string; note: string }[];
  title: string;
}): string {
  const t = escapeHtml(title);
  const total = frames.length;
  const figures = frames
    .map(
      (f, i) =>
        `<figure class="frame${i === 0 ? '' : ' hidden'}"><div class="svgwrap">${f.svg}</div>` +
        `<figcaption class="note">${escapeHtml(f.note)}</figcaption></figure>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${t}</title>
<style>
  html,body { margin:0; height:100%; overflow:hidden; font-family:system-ui,-apple-system,sans-serif; }
  /* hybrid stage: neutral, reads on both light and dark host pages (single tunable constant) */
  #stage { position:fixed; inset:0; display:flex; flex-direction:column; background:linear-gradient(160deg,#e2e8f0,#cbd5e1); }
  #frames { position:relative; flex:1; overflow:hidden; }
  .frame { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:16px; box-sizing:border-box; }
  .frame.hidden { display:none; }
  .svgwrap { transform-origin:center; will-change:transform; max-width:100%; max-height:78%; }
  .svgwrap svg { display:block; max-width:100%; height:auto; }
  .note { margin:0; max-width:680px; text-align:center; font-size:15px; line-height:1.4; color:#0f172a; background:rgba(255,255,255,.7); padding:10px 16px; border-radius:12px; }
  #bar { display:flex; align-items:center; justify-content:center; gap:14px; padding:12px; background:rgba(255,255,255,.55); backdrop-filter:blur(6px); }
  #bar button { cursor:pointer; border:0; border-radius:10px; padding:8px 14px; font-size:14px; background:#334155; color:#fff; }
  #bar button:disabled { opacity:.35; cursor:default; }
  #count { font-weight:700; color:#334155; font-variant-numeric:tabular-nums; }
</style>
</head>
<body>
<div id="stage">
  <div id="frames">${figures}</div>
  <div id="bar">
    <button id="prev" title="Prev">◀</button>
    <span id="count">Шаг 1 / ${total}</span>
    <button id="next" title="Next">▶</button>
  </div>
</div>
<script>
(function(){
  var frames=[].slice.call(document.querySelectorAll('.frame'));
  var total=frames.length, i=0;
  var prev=document.getElementById('prev'), next=document.getElementById('next'), count=document.getElementById('count');
  var x=0,y=0,k=1;
  function active(){ return frames[i] ? frames[i].querySelector('.svgwrap') : null; }
  function applyZoom(){ var w=active(); if(w) w.style.transform='translate('+x+'px,'+y+'px) scale('+k+')'; }
  function resetZoom(){ x=0; y=0; k=1; applyZoom(); }
  function show(n){
    i=Math.max(0,Math.min(total-1,n));
    frames.forEach(function(f,idx){ f.classList.toggle('hidden', idx!==i); });
    count.textContent='Шаг '+(i+1)+' / '+total;
    prev.disabled=i<=0; next.disabled=i>=total-1;
    resetZoom();
  }
  prev.onclick=function(){ show(i-1); };
  next.onclick=function(){ show(i+1); };
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '){ e.preventDefault(); show(i+1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); show(i-1); }
  });
  var fr=document.getElementById('frames');
  fr.addEventListener('wheel',function(e){ e.preventDefault(); var f=e.deltaY<0?1.1:1/1.1; k=Math.min(6,Math.max(0.3,k*f)); applyZoom(); },{passive:false});
  var down=false,px=0,py=0;
  fr.addEventListener('pointerdown',function(e){ down=true; px=e.clientX; py=e.clientY; });
  fr.addEventListener('pointermove',function(e){ if(!down)return; x+=e.clientX-px; y+=e.clientY-py; px=e.clientX; py=e.clientY; applyZoom(); });
  fr.addEventListener('pointerup',function(){ down=false; });
  show(0);
})();
</script>
</body>
</html>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --pool=threads src/export/learnHtmlTemplate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/export/learnHtmlTemplate.ts src/export/learnHtmlTemplate.test.ts
git commit -m "feat(export): pure buildLearnHtml — frame-switcher walkthrough shell (hybrid bg)"
```

---

## Task 2: transparent capture option + `exportLearnHtml` orchestrator

**Files:**
- Modify: `src/export/captureCanvasSvg.ts`
- Create: `src/export/exportLearnHtml.ts`

Both touch the DOM / `html-to-image` / store (no jsdom render), so they're verified by typecheck;
behaviour is covered by the manual smoke. The slice-5 `exportHtml` call site stays backward
compatible.

- [ ] **Step 1: Add the transparent option to `captureCanvasSvg`**

In `src/export/captureCanvasSvg.ts`, change the signature and the `backgroundColor`:

```ts
/** Capture the whole graph as a self-contained inline SVG markup string. */
export async function captureCanvasSvg(nodes: Node[], opts?: { transparent?: boolean }): Promise<string> {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!el || nodes.length === 0) throw new Error('nothing to export');

  const { width, height, viewport } = computeExportViewport(nodes);
  const dataUrl = await toSvg(el, {
    width,
    height,
    backgroundColor: opts?.transparent ? undefined : bgColor(),
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

- [ ] **Step 2: Implement the orchestrator**

`src/export/exportLearnHtml.ts`:

```ts
import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';
import { useWorkflowStore, selectLearnOrder, selectLearnStepText } from '../store/useWorkflowStore';
import { useThemeStore } from '../store/useThemeStore';
import { captureCanvasSvg } from './captureCanvasSvg';
import { buildLearnHtml } from './learnHtmlTemplate';
import { saveFile } from './saveFile';

/** Wait two animation frames so a state change fully re-renders + repaints before capture. */
const settle = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

interface Deps {
  notify?: (message: string) => void;
}

/** Drive Learn mode through every step, capture each as a transparent frame, save one HTML file. */
export async function exportLearnHtml(nodes: Node<SOVERNNodeData>[], edges: Edge[], deps: Deps = {}): Promise<void> {
  const originalMode = useThemeStore.getState().mode;
  const originalLearnMode = useWorkflowStore.getState().learnMode;
  const originalLearnStep = useWorkflowStore.getState().learnStep;
  try {
    useThemeStore.getState().setMode('dark');
    useWorkflowStore.getState().enterLearnMode();
    await settle();

    const { total } = selectLearnOrder({ nodes, edges });
    const frames: { svg: string; note: string }[] = [];
    for (let k = 1; k <= total; k++) {
      useWorkflowStore.setState({ learnStep: k });
      await settle();
      const svg = await captureCanvasSvg(nodes, { transparent: true });
      const note = selectLearnStepText({ nodes, edges }, k).text;
      frames.push({ svg, note });
    }

    const title = `sovern-learn-${new Date().toISOString().slice(0, 10)}`;
    const html = buildLearnHtml({ frames, title });
    await saveFile(html, `${title}.html`, 'text/html');
    deps.notify?.('Learn HTML exported');
  } catch (err) {
    deps.notify?.('⚠ export: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    // Restore the user's prior state regardless of outcome.
    if (!originalLearnMode) useWorkflowStore.getState().exitLearnMode();
    else useWorkflowStore.setState({ learnStep: originalLearnStep });
    if (useThemeStore.getState().mode !== originalMode) useThemeStore.getState().setMode(originalMode);
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/export/captureCanvasSvg.ts src/export/exportLearnHtml.ts
git commit -m "feat(export): exportLearnHtml — per-step transparent capture + state restore"
```

---

## Task 3: Export Learn HTML toolbar button

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the imports**

In `src/App.tsx`, add `Presentation` to the lucide import list, and add below the other export imports:

```tsx
import { exportLearnHtml } from './export/exportLearnHtml';
```

- [ ] **Step 2: Add the busy state + handler**

In `Flow()`, just after the existing `onExportDrawio` handler, add:

```tsx
  const [exportingLearn, setExportingLearn] = useState(false);
  const onExportLearn = async () => {
    if (exportingLearn) return;
    setExportingLearn(true);
    try {
      await exportLearnHtml(nodes.filter((n) => n.type !== 'lane'), edges, { notify });
    } finally {
      setExportingLearn(false);
    }
  };
```

- [ ] **Step 3: Render the button (canvas views only)**

In the toolbar's load/export cluster, immediately after the existing Export .drawio button block
(`{isCanvasView && (<button onClick={onExportDrawio} … <FileDown size={18} /></button>)}`), add:

```tsx
            {isCanvasView && (
              <button onClick={onExportLearn} disabled={exportingLearn} title="Export Learn HTML" className="p-2.5 text-secondary hover:text-accent disabled:opacity-40"><Presentation size={18} /></button>
            )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean typecheck; build succeeds.

- [ ] **Step 5: Full test run**

Run: `npx vitest run --pool=threads`
Expected: all suites PASS (prior 136 + the new buildLearnHtml tests).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(export): Export Learn HTML toolbar button (canvas views)"
```

---

## Manual live smoke (after merge)

Not coded. In the browser dev server, build a small step-annotated diagram (e.g. via the AI prompt
asking for a numbered walkthrough), click **Export Learn HTML**, open the downloaded file, and
verify: prev/next (and `→`/`←`/`Space`) step through frames, the narration matches each step, the
cumulative reveal builds up, and the neutral background reads well — drop the file in an `<iframe>`
on both a white and a dark page. Confirm the live app returns to its prior theme/mode afterward, and
that PNG / HTML / .drawio exports still work.

## Notes for the implementer
- Run tests with `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls.
- `buildLearnHtml` is the only pure/tested piece; the capture option + orchestrator + button are DOM/store-bound and verified by typecheck/build + manual smoke (mirrors the other export orchestrators).
- Never interpolate graph/user data into the `<script>` — only pre-serialised frame SVGs and HTML-escaped notes/title go into markup positions.
- The orchestrator drives the live Learn mode (the canvas visibly steps through during export, like slice-5's theme flip); the `finally` block must always restore theme + learnMode + learnStep.
- The hybrid stage colour is a single CSS constant in `learnHtmlTemplate.ts` — easy to tune later.
