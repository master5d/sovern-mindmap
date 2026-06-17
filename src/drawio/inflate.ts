import { DrawioParseError } from './errors';

/** Inflate raw-deflate bytes to a string using the native DecompressionStream. */
async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Response(ds.readable).text();
}

/**
 * Unwrap a .drawio file to its <mxGraphModel> XML string.
 * Handles both uncompressed ("Edit Diagram") payloads and the default
 * base64(deflateRaw(encodeURIComponent(model))) form. Uses the FIRST <diagram> page.
 */
export async function extractMxGraphModel(fileText: string): Promise<string> {
  const doc = new DOMParser().parseFromString(fileText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new DrawioParseError('file is not valid XML');
  }
  const diagram = doc.querySelector('diagram');
  if (!diagram) throw new DrawioParseError('no <diagram> element found');

  // Uncompressed: the model is a child element.
  const inlineModel = diagram.querySelector('mxGraphModel');
  if (inlineModel) {
    return new XMLSerializer().serializeToString(inlineModel);
  }

  // Compressed: text content is base64(deflateRaw(encodeURIComponent(model))).
  const b64 = (diagram.textContent || '').trim();
  if (!b64) throw new DrawioParseError('empty <diagram> payload');
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const inflated = await inflateRaw(bytes);
    let xml: string;
    try {
      xml = decodeURIComponent(inflated);
    } catch {
      xml = inflated; // a few exporters don't URL-encode
    }
    if (!xml.includes('<mxGraphModel')) {
      throw new DrawioParseError('decompressed payload has no <mxGraphModel>');
    }
    return xml;
  } catch (err) {
    if (err instanceof DrawioParseError) throw err;
    throw new DrawioParseError('failed to decompress diagram payload');
  }
}
