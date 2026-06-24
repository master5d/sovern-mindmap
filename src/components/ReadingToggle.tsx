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
