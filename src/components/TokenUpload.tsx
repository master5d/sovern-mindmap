import { useRef, useState } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import { applyCustomTokens, resetCustomTokens, hasCustomTokens } from '../theme/customTokens';

const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export function TokenUpload({ notify }: { notify: (msg: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(hasCustomTokens());

  const applyText = (text: string) => {
    try {
      const { overrides, warnings } = applyCustomTokens(text);
      setActive(true);
      notify(
        `tokens applied: ${Object.keys(overrides).length}` +
          (warnings.length ? `, skipped ${warnings.length}` : ''),
      );
      if (warnings.length) console.warn('[tokens] skipped:', warnings);
    } catch (err) {
      notify(`⚠ tokens rejected: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const pick = async () => {
    if (isTauri()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Design Tokens', extensions: ['json'] }],
      });
      if (typeof path === 'string') applyText(await readTextFile(path));
    } else {
      inputRef.current?.click();
    }
  };

  const reset = () => {
    resetCustomTokens();
    setActive(false);
    notify('tokens reset to default');
  };

  return (
    <div className="flex space-x-1.5 px-2 border-r border-edge">
      <button
        onClick={pick}
        title="Upload design tokens (W3C JSON)"
        className="p-2.5 text-secondary hover:text-accent relative"
      >
        <Palette size={18} />
        {active && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />}
      </button>
      {active && (
        <button onClick={reset} title="Reset to default theme" className="p-2.5 text-secondary hover:text-primary">
          <RotateCcw size={18} />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) applyText(await f.text());
          e.target.value = '';
        }}
      />
    </div>
  );
}
