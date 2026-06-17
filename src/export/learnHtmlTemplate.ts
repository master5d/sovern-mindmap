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
