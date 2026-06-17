import { describe, it, expect } from 'vitest';
import { extractMxGraphModel } from './inflate';
import { DrawioParseError } from './errors';

const MODEL = '<mxGraphModel dx="100"><root><mxCell id="2" value="Hi" vertex="1"/></root></mxGraphModel>';

async function compressToDrawio(modelXml: string): Promise<string> {
  const enc = encodeURIComponent(modelXml);
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(enc));
  w.close();
  const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return `<mxfile><diagram id="a" name="Page-1">${b64}</diagram></mxfile>`;
}

describe('extractMxGraphModel', () => {
  it('passes through an uncompressed Edit-Diagram payload', async () => {
    const file = `<mxfile><diagram>${MODEL}</diagram></mxfile>`;
    const out = await extractMxGraphModel(file);
    expect(out).toContain('<mxGraphModel');
    expect(out).toContain('value="Hi"');
  });

  it('decompresses a deflate-raw + base64 payload', async () => {
    const file = await compressToDrawio(MODEL);
    const out = await extractMxGraphModel(file);
    expect(out).toContain('<mxGraphModel');
    expect(out).toContain('value="Hi"');
  });

  it('throws DrawioParseError when there is no <diagram>', async () => {
    await expect(extractMxGraphModel('<mxfile></mxfile>')).rejects.toBeInstanceOf(DrawioParseError);
  });

  it('throws DrawioParseError on non-XML garbage', async () => {
    await expect(extractMxGraphModel('not xml at all')).rejects.toBeInstanceOf(DrawioParseError);
  });
});
