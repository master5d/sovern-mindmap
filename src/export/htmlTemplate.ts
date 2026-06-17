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
