import { describe, it, expect, vi } from 'vitest';
import { importDrawio } from './importDrawio';

const MODEL = `<mxfile><diagram><mxGraphModel><root>
  <mxCell id="0"/><mxCell id="1" parent="0"/>
  <mxCell id="2" value="A" style="rounded=1;" vertex="1" parent="1">
    <mxGeometry x="10" y="20" width="120" height="60" as="geometry"/>
  </mxCell>
</root></mxGraphModel></diagram></mxfile>`;

const fileOf = (text: string) => ({ text: async () => text });

describe('importDrawio', () => {
  it('parses a file and appends namespaced nodes with preserved positions', async () => {
    const addGraph = vi.fn();
    await importDrawio(fileOf(MODEL) as any, { addGraph });
    expect(addGraph).toHaveBeenCalledTimes(1);
    const [nodes, edges] = addGraph.mock.calls[0];
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id.startsWith('d-')).toBe(true);     // namespaced
    expect(nodes[0].position).toEqual({ x: 10, y: 20 }); // preserved
    expect(edges).toHaveLength(0);
  });

  it('calls onError and never addGraph on a parse failure', async () => {
    const addGraph = vi.fn();
    const onError = vi.fn();
    await importDrawio(fileOf('garbage') as any, { addGraph, onError });
    expect(addGraph).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
