import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import { ArtifactNode } from './ArtifactNode';
import type { ArtifactNode as ArtifactNodeType } from '../../types';
import { useThemeStore } from '../../store/useThemeStore';
import { useWorkflowStore } from '../../store/useWorkflowStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, cleanup: () => { act(() => root.unmount()); container.remove(); } };
}

function makeProps(data: Partial<ArtifactNodeType['data']>): NodeProps<ArtifactNodeType> {
  return {
    id: 'artifact-1',
    type: 'artifact',
    data: {
      artifactId: 'a1',
      code: 'const App = () => <div>hi</div>;',
      status: 'pending',
      ...data,
    },
    selected: false,
    dragging: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 600,
    height: 400,
  } as unknown as NodeProps<ArtifactNodeType>;
}

/** Seed the workflow store with the node under test so patchNodeStatus has a target. */
function seedStore(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  useWorkflowStore.setState({
    nodes: [
      {
        id: 'artifact-1',
        type: 'artifact',
        position: { x: 0, y: 0 },
        data: { artifactId: 'a1', code: '', status },
      },
    ] as any,
  });
}

function storeStatus(): string | undefined {
  return (useWorkflowStore.getState().nodes[0]?.data as any)?.status;
}

function findButton(container: HTMLElement, re: RegExp): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    re.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
}

describe('ArtifactNode', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', resolved: 'dark' });
    seedStore('pending');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('srcDoc includes the desops tokens stylesheet and the current theme', () => {
    const { container, cleanup } = mount(<ArtifactNode {...makeProps({})} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.srcdoc).toContain('/desops/tokens.css');
    expect(iframe.srcdoc).toContain('data-theme="dark"');
    cleanup();
  });

  it('header renders the artifact name and variant group', () => {
    const { container, cleanup } = mount(
      <ArtifactNode {...makeProps({ name: 'Hero Card', variantGroup: 'hero-variants' })} />,
    );
    expect(container.textContent).toContain('Hero Card');
    expect(container.textContent).toContain('hero-variants');
    cleanup();
  });

  it('hides review buttons once the artifact is approved', () => {
    const { container, cleanup } = mount(<ArtifactNode {...makeProps({ status: 'approved' })} />);
    expect(container.querySelector('button')).toBeNull();
    cleanup();
  });

  it('clicking Approve POSTs a decision to /api/artifacts/decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const { container, cleanup } = mount(
      <ArtifactNode {...makeProps({ name: 'Hero Card', variantGroup: 'hero-variants', status: 'pending' })} />,
    );
    const approveButton = Array.from(container.querySelectorAll('button')).find((b) =>
      /approve/i.test(b.textContent ?? ''),
    ) as HTMLButtonElement;
    expect(approveButton).toBeTruthy();

    await act(async () => {
      approveButton.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/artifacts/decision',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ artifactId: 'a1', decision: 'approved', name: 'Hero Card', variant_group: 'hero-variants' });
    expect(storeStatus()).toBe('approved');

    cleanup();
  });

  it('review buttons carry nodrag nopan so React Flow does not arm a drag', () => {
    const { container, cleanup } = mount(<ArtifactNode {...makeProps({ status: 'pending' })} />);
    const approveButton = findButton(container, /approve/i);
    const rejectButton = findButton(container, /reject/i);
    expect(approveButton.className).toContain('nodrag');
    expect(approveButton.className).toContain('nopan');
    expect(rejectButton.className).toContain('nodrag');
    expect(rejectButton.className).toContain('nopan');
    cleanup();
  });

  it('keeps status pending and buttons usable when the decision endpoint returns an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ ok: false }) });
    vi.stubGlobal('fetch', fetchMock);

    const { container, cleanup } = mount(<ArtifactNode {...makeProps({ status: 'pending' })} />);
    const approveButton = findButton(container, /approve/i);

    await act(async () => {
      approveButton.click();
      await Promise.resolve();
    });

    // server recorded nothing → node must NOT be marked approved
    expect(storeStatus()).toBe('pending');
    // buttons still present and re-enabled for retry
    const retryButton = findButton(container, /approve/i);
    expect(retryButton).toBeTruthy();
    expect(retryButton.disabled).toBe(false);
    // error state surfaced in the header
    expect(container.textContent?.toLowerCase()).toContain('failed');

    cleanup();
  });

  it('handles a network rejection without marking the node and without unhandled rejection', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { container, cleanup } = mount(<ArtifactNode {...makeProps({ status: 'pending' })} />);
    const rejectButton = findButton(container, /reject/i);

    await act(async () => {
      rejectButton.click();
      await Promise.resolve();
    });

    expect(storeStatus()).toBe('pending');
    const retryButton = findButton(container, /reject/i);
    expect(retryButton).toBeTruthy();
    expect(retryButton.disabled).toBe(false);
    expect(container.textContent?.toLowerCase()).toContain('failed');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    cleanup();
  });

  it('approve with projectDir calls ONLY /export (single ledger write)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ ok: true, path: 'C:/telo/p/design/drafts/v.tsx' }) } as any;
    }));

    const { container, cleanup } = mount(
      <ArtifactNode {...makeProps({ status: 'pending', projectDir: 'C:/telo/p' } as any)} />,
    );
    const approveButton = findButton(container, /approve/i);

    await act(async () => {
      approveButton.click();
      await Promise.resolve();
    });

    expect(calls).toEqual(['/api/artifacts/export']);
    expect(storeStatus()).toBe('approved');

    cleanup();
  });

  it('approve with projectDir falls back to /decision when export fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).endsWith('/export')) return { ok: false, status: 500 } as any;
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }));

    const { container, cleanup } = mount(
      <ArtifactNode {...makeProps({ status: 'pending', projectDir: 'C:/telo/p' } as any)} />,
    );
    const approveButton = findButton(container, /approve/i);

    await act(async () => {
      approveButton.click();
      await Promise.resolve();
    });

    expect(calls).toEqual(['/api/artifacts/export', '/api/artifacts/decision']);
    expect(storeStatus()).toBe('approved');

    cleanup();
  });

  it('approve WITHOUT projectDir posts /decision only (unchanged)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }));

    const { container, cleanup } = mount(<ArtifactNode {...makeProps({ status: 'pending' })} />);
    const approveButton = findButton(container, /approve/i);

    await act(async () => {
      approveButton.click();
      await Promise.resolve();
    });

    expect(calls).toEqual(['/api/artifacts/decision']);
    expect(storeStatus()).toBe('approved');

    cleanup();
  });
});
