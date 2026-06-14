import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../store/useThemeStore';

const MODES: { mode: ThemeMode; Icon: typeof Sun; label: string }[] = [
  { mode: 'light', Icon: Sun, label: 'Light' },
  { mode: 'dark', Icon: Moon, label: 'Dark' },
  { mode: 'system', Icon: Monitor, label: 'System' },
];

export function ThemeSwitcher() {
  const { mode, setMode } = useThemeStore();
  return (
    <div className="flex space-x-1.5 px-2 border-r border-edge">
      {MODES.map(({ mode: m, Icon, label }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          title={label}
          className={`p-2.5 rounded-xl ${
            mode === m ? 'bg-accent text-white' : 'text-secondary hover:bg-hover'
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
