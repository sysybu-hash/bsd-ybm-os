/**
 * The drawing out of a permit strip (DWF), cut out in the browser.
 *
 * A DWF is a zip: the drawing is one W2D stream, and the rest — most of the
 * file — is the fonts it was plotted with. The strip this was built on is
 * 65 MB and its drawing 9 MB, and an upload may carry 25 MB, so only the
 * stream is sent. The zip is read here the way lib/projects/floorplan-zip.ts
 * reads it on the server, with the browser's own inflater: no library.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export const DWF_STREAM_MIME = "model/vnd.dwf";

export function isDwfFileName(name: string): boolean {
  return /\.dwf$/i.test(name);
}

type StreamEntry = { name: string; method: number; start: number; compressed: number };

/** Where the drawing stream sits in the package, and how it is packed. */
export function findW2dEntry(bytes: Uint8Array): StreamEntry | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  // A DWF opens with "(DWF V06.00)" before its zip; offsets count from the zip.
  const shift = eocd - cdSize - cdOffset;
  const decoder = new TextDecoder();
  let best: StreamEntry | null = null;
  let p = eocd - cdSize;
  for (let n = 0; n < count; n++) {
    if (p < 0 || view.getUint32(p, true) !== CENTRAL) return best;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true) + shift;
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.w2d$/i.test(name) || view.getUint32(local, true) !== LOCAL) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    // A strip plotted on several sheets carries several; the drawing is the biggest.
    if (!best || compressed > best.compressed) best = { name, method, start, compressed };
  }
  return best;
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The strip's drawing as a file to upload, named after the strip. Null when
 * the file is not a DWF, or packs its drawing in a way this cannot read.
 */
export async function extractW2dFromDwf(file: File): Promise<File | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entry = findW2dEntry(bytes);
  if (!entry) return null;
  const data = bytes.subarray(entry.start, entry.start + entry.compressed);
  let stream: Uint8Array<ArrayBuffer>;
  if (entry.method === 0) stream = data.slice();
  else if (entry.method === 8) stream = await inflateRaw(data);
  else return null;
  if (new TextDecoder("latin1").decode(stream.subarray(0, 4)) !== "(W2D") return null;
  const base = file.name.replace(/\.[^.]+$/u, "") || "plan";
  return new File([stream], `${base}.w2d`, { type: DWF_STREAM_MIME });
}
