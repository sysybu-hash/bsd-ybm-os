import { inflateRawSync } from "node:zlib";

/** One file in a ZIP package, inflated on demand. */
export type ZipEntry = { name: string; size: number; read: () => Buffer };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * The entries of a ZIP package, read from its central directory.
 *
 * A DWF is a ZIP with a preamble — "(DWF V06.00)" before the first local
 * header — and its recorded offsets do not count the preamble. The shift is
 * recovered from where the central directory actually sits against where the
 * end record says it starts, so both plain ZIPs (DWFx) and DWFs read the same.
 * Stored and deflated entries only: that is all Autodesk writes.
 */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip package");
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const shift = eocd - cdSize - cdOffset;

  const out: ZipEntry[] = [];
  let p = eocd - cdSize;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) throw new Error("zip central directory is damaged");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42) + shift;
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    out.push({
      name,
      size,
      read: () => {
        if (buf.readUInt32LE(local) !== LOCAL) throw new Error(`zip entry ${name} is damaged`);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + compressed);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data);
        throw new Error(`zip entry ${name} uses unsupported method ${method}`);
      },
    });
  }
  return out;
}
