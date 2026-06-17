import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { generateDiagram } from '../ai/generateDiagram';

export function AiPromptBar({ notify }: { notify: (msg: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    let failed = false;
    try {
      await generateDiagram(text, { onError: (m) => { failed = true; notify(`⚠ diagram: ${m}`); } });
    } finally {
      setBusy(false);
    }
    if (!failed) setPrompt(''); // keep the user's text if generation failed
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur-md p-2 border border-edge rounded-2xl shadow-2xl w-[min(560px,80vw)]">
      <Sparkles size={16} className="text-accent ml-1 shrink-0" />
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
        placeholder="Describe a diagram…  (e.g. onboarding flow)"
        className="nodrag flex-1 bg-transparent text-sm text-primary placeholder:text-muted outline-none"
      />
      <button
        onClick={run}
        disabled={busy}
        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Generate
      </button>
    </div>
  );
}
