import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import { EvidenceMarkPanel } from './EvidenceMarkPanel';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

const node = (id: string, mark?: string) => ({ id, data: mark ? { mark } : {} }) as any;
const edge = (id: string, mark?: string) => ({ id, data: mark ? { mark } : undefined }) as any;

describe('EvidenceMarkPanel', () => {
  let handle: ReturnType<typeof mount> | null = null;
  afterEach(() => { handle?.cleanup(); handle = null; });

  it('легенда перечисляет марки в порядке шкалы, а не в порядке появления', () => {
    // 'open' встречается в графе первым, но должен напечататься ПОСЛЕ 'measured'.
    handle = mount(
      <EvidenceMarkPanel
        nodes={[node('a', 'open'), node('b', 'measured')]}
        edges={[]}
        threshold="open"
        showRefuted={false}
        onThresholdChange={() => {}}
        onShowRefutedChange={() => {}}
      />,
    );
    const text = handle.container.textContent ?? '';
    expect(text.indexOf('measured')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('measured')).toBeLessThan(text.indexOf('open'));
  });

  it('легенда несёт марки рёбер, а не только узлов', () => {
    handle = mount(
      <EvidenceMarkPanel
        nodes={[node('a')]}
        edges={[edge('e', 'refuted')]}
        threshold="open"
        showRefuted
        onThresholdChange={() => {}}
        onShowRefutedChange={() => {}}
      />,
    );
    expect(handle.container.textContent).toContain('refuted');
  });

  it('клик по ступени порога зовёт onThresholdChange с её id', () => {
    const onThresholdChange = vi.fn();
    handle = mount(
      <EvidenceMarkPanel
        nodes={[node('a', 'measured')]}
        edges={[]}
        threshold="open"
        showRefuted={false}
        onThresholdChange={onThresholdChange}
        onShowRefutedChange={() => {}}
      />,
    );
    const btn = handle.container.querySelector('button[title="declared"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(onThresholdChange).toHaveBeenCalledWith('declared');
  });

  it('переключатель refuted отражает состояние и зовёт onShowRefutedChange', () => {
    const onShowRefutedChange = vi.fn();
    handle = mount(
      <EvidenceMarkPanel
        nodes={[node('a', 'refuted')]}
        edges={[]}
        threshold="open"
        showRefuted={false}
        onThresholdChange={() => {}}
        onShowRefutedChange={onShowRefutedChange}
      />,
    );
    const checkbox = handle.container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    act(() => checkbox.click());
    expect(onShowRefutedChange).toHaveBeenCalledWith(true);
  });
});
