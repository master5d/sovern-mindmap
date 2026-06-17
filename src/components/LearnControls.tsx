import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useWorkflowStore, selectLearnStepText } from '../store/useWorkflowStore';

export function LearnControls() {
  const { nodes, edges, learnStep, learnNext, learnPrev, exitLearnMode } = useWorkflowStore();
  const { text, total } = selectLearnStepText({ nodes, edges }, learnStep);

  // Keyboard: →/Space = next, ← = prev, Esc = exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); learnNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); learnPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); exitLearnMode(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [learnNext, learnPrev, exitLearnMode]);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[640px] w-[min(640px,90vw)] bg-surface/95 backdrop-blur-md p-4 border border-edge rounded-2xl shadow-2xl">
      <div className="flex items-center gap-4">
        <button
          onClick={learnPrev}
          disabled={learnStep <= 1}
          title="Prev"
          className="p-2.5 rounded-xl text-secondary hover:bg-hover disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          {/* note rendered as a text child — never HTML — so untrusted text cannot inject */}
          <p className="text-sm text-primary leading-snug">{text}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted">
            Шаг {Math.min(learnStep, total)} / {total}
          </p>
        </div>

        <button
          onClick={learnNext}
          disabled={learnStep >= total}
          title="Next"
          className="p-2.5 rounded-xl text-secondary hover:bg-hover disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
        <button onClick={exitLearnMode} title="Exit learn mode" className="p-2.5 rounded-xl text-secondary hover:text-primary">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
