import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import { ArtifactNode } from './ArtifactNode';
import type { ArtifactNode as ArtifactNodeType } from '../../types';
import { useThemeStore } from '../../store/useThemeStore';

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

describe('ArtifactNode', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'dark', resolved: 'dark' });
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

    cleanup();
  });
});
