# Slice 7 — Learn HTML export (bake the step-through into a self-contained file)

**Date:** 2026-06-17
**Status:** Approved (brainstorming)
**Scope:** sovern-mindmap only. This is **Part 1** of the LMS-embed bridge: it produces the
self-contained interactive walkthrough file. **Part 2** (drop the file into
`mc_hub/LMS/tochka-sborki/web/public/` and `<iframe>` it into a course unit) is a thin,
manual follow-up done later in the course repo — out of scope here.

## Goal

Export the current diagram's **Learn-mode walkthrough** (cumulative step reveal + per-step
narration + prev/next) as a single self-contained `.html` file that anyone can open or embed
in an `<iframe>` — no app, no server. This is the missing step (3) of the authoring loop:
*build a diagram in the app → export a walkthrough HTML → drop it into the course*. Because
the file is self-contained, it keeps working in the course forever even if the app goes away.

## Why this design

- **Reuses the two finished halves:** Learn mode (slice 3 — `selectLearnOrder`,
  `selectLearnStepText`, the `learnStep` reveal) and HTML export (slice 5 — `captureCanvasSvg`,
  `saveFile`, the pure-template pattern).
- **Approach: N cumulative SVG frames.** Drive the real Learn mode through steps 1..N,
  capturing the live DOM at each step (so the look is 1:1 with the app), and embed the N
  frames in a frame-switcher shell. Chosen over a hand-rolled mini-renderer (drift, lots of
  code) and over a single-SVG + per-id JS hiding (fragile foreignObject targeting).
- **Hybrid background:** frames are captured with a **transparent** background; the shell
  paints a **neutral mid-tone stage** behind them, so the embedded figure reads well on both
  a light and a dark course page (no theme toggle needed).

## Architecture

```
Export Learn HTML button (canvas views only)
  → exportLearnHtml(nodes, edges, { notify })            // exportLearnHtml.ts — orchestrator
       ├ enterLearnMode(); force dark theme; await frame
       ├ { order, total } = selectLearnOrder({nodes,edges})
       ├ fixed viewport = computeExportViewport(allNodes)  // same bounds every frame
       ├ for k in 1..total:
       │     setState({ learnStep: k }); await frame
       │     svg_k  = captureCanvasSvg(allNodes, { transparent: true })   // captureCanvasSvg.ts
       │     note_k = selectLearnStepText({nodes,edges}, k).text
       ├ exitLearnMode(); restore theme + learnStep
       ├ buildLearnHtml({ frames: [{svg,note}], title })  // learnHtmlTemplate.ts (PURE)
       └ saveFile(html, '<slug>.html', 'text/html')       // saveFile.ts (slice 5)
```

Everything lives in `src/export/`; the only outside touch is one toolbar button.

## Components

### `src/export/captureCanvasSvg.ts` — add a transparent option
Extend the existing signature to `captureCanvasSvg(nodes, opts?: { transparent?: boolean })`.
When `opts.transparent` is set, call `toSvg` with `backgroundColor: undefined` (transparent)
instead of the `--bg-canvas` colour. Passing **all** nodes keeps the fit-to-content viewport
fixed across steps; the live DOM (driven by Learn mode) is what differs per step, so only the
revealed nodes appear in each frame, spatially aligned. Backward compatible — the slice-5
`exportHtml` call is unaffected.

### `src/export/learnHtmlTemplate.ts` — `buildLearnHtml({ frames, title }): string` (PURE)
`frames: { svg: string; note: string }[]`, `title: string`. Returns a complete
`<!doctype html>` document:
- **Hybrid stage:** a neutral mid-tone background (a soft light-neutral gradient, e.g.
  `linear-gradient(160deg,#e2e8f0,#cbd5e1)`) on `#stage`; the dark, neon-accented frames sit
  on it and read on both light and dark host pages. The exact colour is a single tunable
  constant.
- Each frame is a `<figure class="frame">` containing the (transparent) SVG and a
  `<figcaption class="note">` with the step's narration; the first frame is visible, the rest
  carry `hidden`.
- Bottom bar: `◀` Prev / "Шаг X / N" counter / Next `▶`. Inline vanilla JS advances the active
  frame index, toggling `hidden` and updating the counter, plus a light pan/zoom on the active
  frame and `→`/`Space`/`←` keyboard. Prev disabled at 1, Next at N.
- `title` and every `note` are **HTML-escaped** by the template. **No external resources.**

### `src/export/exportLearnHtml.ts` — `exportLearnHtml(nodes, edges, deps): Promise<void>`
Drives the live Learn mode to capture each step (same family as slice-5's theme double-capture).
Forces the **dark** theme for a consistent neon look, captures N transparent frames + their
narration, builds the HTML, saves it. A `try/finally` **always restores** the original theme
mode, `learnMode`, and `learnStep`, even on failure. `settle()` awaits two `requestAnimationFrame`s
after each state change (reused idiom). `deps = { notify? }`; toasts success / `⚠ export: …`.
File name: `sovern-learn-<YYYY-MM-DD>.html`.

### `src/App.tsx`
A new **Export Learn HTML** toolbar button (lucide `Presentation`), rendered only in canvas
views, with its own busy flag, next to the other export buttons. Calls
`exportLearnHtml(nodes.filter(n => n.type !== 'lane'), edges, { notify })`. Works on any
diagram — without `mm:step` the order falls back to Learn mode's BFS.

## Security

- Frame SVGs come from `html-to-image` serialising the live DOM → text is entity-escaped; a
  malicious label cannot break out of the SVG.
- **Narration `note` is user/AI text** and is **HTML-escaped** before going into `<figcaption>`
  (in live Learn mode it is a React text child; the baked file must escape it explicitly).
- `title` is HTML-escaped. The inline `<script>` interpolates **no** user/graph data — only the
  pre-serialised frame SVGs and escaped notes/title sit in markup positions.

## Error handling / edge cases

| Case | Behaviour |
|---|---|
| Empty canvas | Button disabled (no nodes) |
| Single node | One frame, one step |
| No `mm:step` anywhere | Learn mode's BFS order; frames in graph order |
| Many nodes/steps | More frames → larger file; fine for course-sized diagrams |
| Capture throws mid-loop | `try/finally` restores theme + learnMode + learnStep; `⚠ export` toast |
| Re-entrancy (double click) | Button disabled while an export is in flight |

## Testing

Unit (vitest, `npx vitest run --pool=threads`; fall back to plain `npx vitest run` if it stalls):
- `buildLearnHtml` (the pure core):
  - returns a complete document (`<!doctype html>`, `<html`, ends `</html>`).
  - embeds **all** N frame SVGs (pass sentinel svgs `__F1__`/`__F2__`; assert both appear) and
    each frame's narration.
  - contains the prev/next controls, a step counter, and a `<script>`.
  - **escapes a malicious note and title**: a note `"<img src=x onerror=alert(1)>"` yields
    `&lt;img` and no raw `<img`; same for `title`.
  - self-contained guard: no `src="http"` / `href="http"`.
  - includes the hybrid stage background.

`captureCanvasSvg` (transparent option) + `exportLearnHtml` touch the DOM, `html-to-image`,
and the store — verified by typecheck + build + the manual smoke (same treatment as the other
export orchestrators). The slice-5 `exportHtml` regression is covered by build + its manual smoke.

Manual smoke (after merge): build a small step-annotated diagram (e.g. via the AI prompt asking
for a numbered walkthrough), click **Export Learn HTML**, open the file, step through with
prev/next and the keyboard, confirm the narration matches each step, the cumulative reveal works,
and the background reads well on both a white and a dark page (drop the file in an `<iframe>` on
each).

## Files

- Modify: `src/export/captureCanvasSvg.ts` (transparent option), `src/App.tsx` (button + busy state).
- Create: `src/export/learnHtmlTemplate.ts` (+ `learnHtmlTemplate.test.ts`),
  `src/export/exportLearnHtml.ts`.
