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
