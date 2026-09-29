import { readZipEntries } from "@/lib/projects/floorplan-zip";
import {
  wallsFromSegments,
  type FloorplanVectorGeometry,
  type VectorSegment,
} from "@/lib/projects/floorplan-vector";

/**
 * One drawing cut out of the strip, in its own page coordinates, with its
 * walls found — what buildFlatFromGeometry takes.
 */
export function sheetGeometry(
  strip: DwfGeometry,
  box: { x: number; y: number; width: number; height: number },
): DwfGeometry {
  const inBox = (s: VectorSegment) =>
    Math.min(s.x1, s.x2) >= box.x &&
    Math.max(s.x1, s.x2) <= box.x + box.width &&
    Math.min(s.y1, s.y2) >= box.y &&
    Math.max(s.y1, s.y2) <= box.y + box.height;
  const shift = (s: VectorSegment): VectorSegment => ({
    ...s,
    x1: s.x1 - box.x,
    y1: s.y1 - box.y,
    x2: s.x2 - box.x,
    y2: s.y2 - box.y,
  });
  const segments = strip.segments.filter(inBox).map(shift);
  const page = { width: box.width, height: box.height };
  return {
    pageWidth: box.width,
    pageHeight: box.height,
    segments,
    curves: strip.curves.filter(inBox).map(shift),
    walls: wallsFromSegments(segments, page),
    texts: strip.texts
      .filter((t) => t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height)
      .map((t) => ({ ...t, x: t.x - box.x, y: t.y - box.y })),
  };
}

/** A text the sheet carries as text, placed on the page. */
export type PlacedText = { x: number; y: number; text: string; height: number };

export type DwfGeometry = FloorplanVectorGeometry & { texts: PlacedText[] };

/** Page units are PDF points, so every threshold tuned on the sales sheets means the same. */
const POINTS_PER_MM = 72 / 25.4;

/**
 * A DWF 6 package: its W2D stream, read as the sheet's geometry.
 *
 * A building permit set arrives as one of these — the whole accordion sheet
 * (the "גרמושקה") of floors, elevations, sections and site in one 10 m strip.
 * The graphics are Autodesk's binary WHIP stream; there is no open reader for
 * it in this product's reach, so this is one, written against the stream
 * itself. It reads every opcode AutoCAD 2024 wrote on the reference set.
 */
export function geometryFromDwf(buf: Buffer): DwfGeometry | null {
  const entries = readZipEntries(buf);
  const stream = entries.find((entry) => entry.name.toLowerCase().endsWith(".w2d"));
  if (!stream) return null;
  return geometryFromW2d(stream.read());
}

/** The Hebrew a CAD SHX font draws from the Latin key it is typed on. */
const HEBREW_KEYS: Record<string, string> = {
  t: "א", c: "ב", d: "ג", s: "ד", v: "ה", u: "ו", z: "ז", j: "ח", y: "ט", h: "י",
  l: "ך", f: "כ", k: "ל", o: "ם", n: "מ", i: "ן", b: "נ", x: "ס", g: "ע", ";": "ף",
  p: "פ", ".": "ץ", m: "צ", e: "ק", r: "ר", a: "ש", ",": "ת", "/": ".",
};

/**
 * Text set in a Hebrew SHX font, back into Hebrew.
 *
 * The font draws Hebrew glyphs for Latin keys, so the stream holds what was
 * typed on a Hebrew keyboard with the layout switched off: "ra," is רשת. The
 * order is already the reading order.
 */
export function decodeShxHebrew(text: string): string {
  return [...text].map((ch) => HEBREW_KEYS[ch] ?? ch).join("");
}

const HEBREW_SHX = /heb|miry|gil|sivan|moran|michal|oron/i;

export function geometryFromW2d(d: Buffer): DwfGeometry | null {
  if (!d.subarray(0, 12).toString("latin1").startsWith("(W2D")) return null;
  const n = d.length;
  const header = d.subarray(0, Math.min(n, 4096)).toString("latin1");
  // Logical units to paper millimetres: the PlotInfo matrix's scale.
  const plot = /\(PlotInfo \S+ \S+ mm ([\d.]+) ([\d.]+)[^(]*\(\(([-\d.e]+)/.exec(header);
  const mmPerUnit = plot ? Number(plot[3]) : 1;

  const segments: VectorSegment[] = [];
  const curves: VectorSegment[] = [];
  const texts: PlacedText[] = [];
  let x = 0;
  let y = 0;
  let lineWeight = 0;
  let fontHeight = 0;
  let hebrewFont = false;
  let visible = true;

  const raw: Array<[number, number, number, number, number, boolean]> = [];
  const push = (x1: number, y1: number, x2: number, y2: number, curve = false) => {
    if (visible) raw.push([x1, y1, x2, y2, lineWeight, curve]);
  };
  const rawTexts: Array<[number, number, string, number]> = [];

  const count = (i: number): [number, number] => {
    const c = d[i]!;
    if (c === 0) return [d.readUInt16LE(i + 1) + 256, i + 3];
    return [c, i + 1];
  };
  const points = (i: number, k: number, wide: boolean): [Array<[number, number]>, number] => {
    const out: Array<[number, number]> = [];
    for (let m = 0; m < k; m++) {
      x += wide ? d.readInt32LE(i) : d.readInt16LE(i);
      y += wide ? d.readInt32LE(i + 4) : d.readInt16LE(i + 2);
      i += wide ? 8 : 4;
      out.push([x, y]);
    }
    return [out, i];
  };
  const string = (i: number): [string, number] => {
    const c = d[i]!;
    if (c === 0x27 || c === 0x22) {
      let j = i + 1;
      const out: number[] = [];
      while (j < n && d[j] !== c) {
        if (d[j] === 0x5c) j++;
        out.push(d[j]!);
        j++;
      }
      return [Buffer.from(out).toString("latin1"), j + 1];
    }
    if (c === 0x7b) {
      const k = d.readInt32LE(i + 1);
      return [d.toString("utf16le", i + 5, i + 5 + 2 * k), i + 5 + 2 * k + 1];
    }
    const k = d.readInt32LE(i);
    return [d.toString("latin1", i + 4, i + 4 + k), i + 4 + k];
  };
  const skipAscii = (i: number): number => {
    let depth = 0;
    while (i < n) {
      const c = d[i]!;
      if (c === 0x28) depth++;
      else if (c === 0x29) {
        depth--;
        if (depth === 0) return i + 1;
      } else if (c === 0x27) {
        i++;
        while (i < n && d[i] !== 0x27) i++;
      }
      i++;
    }
    return i;
  };
  /** An arc as chords a quarter turn or less, as a PDF draws one. */
  const arc = (cx: number, cy: number, a: number, b: number, start: number, end: number) => {
    const s0 = (start / 65536) * Math.PI * 2;
    let e0 = (end / 65536) * Math.PI * 2;
    if (e0 <= s0) e0 += Math.PI * 2;
    const pieces = Math.max(1, Math.ceil((e0 - s0) / (Math.PI / 2)));
    for (let k = 0; k < pieces; k++) {
      const t0 = s0 + ((e0 - s0) * k) / pieces;
      const t1 = s0 + ((e0 - s0) * (k + 1)) / pieces;
      push(cx + a * Math.cos(t0), cy + b * Math.sin(t0), cx + a * Math.cos(t1), cy + b * Math.sin(t1), true);
    }
  };
  const polyline = (pts: Array<[number, number]>) => {
    for (let k = 1; k < pts.length; k++) push(pts[k - 1]![0], pts[k - 1]![1], pts[k]![0], pts[k]![1]);
  };

  let i = 0;
  try {
    while (i < n) {
      const c = d[i]!;
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) {
        i++;
        continue;
      }
      if (c === 0x28) {
        i = skipAscii(i);
        continue;
      }
      if (c === 0x7b) {
        i += 5 + d.readInt32LE(i + 1);
        continue;
      }
      i++;
      switch (c) {
        case 0x0c:
        case 0x6c: {
          const [p, j] = points(i, 2, c === 0x6c);
          i = j;
          polyline(p);
          break;
        }
        case 0x10:
        case 0x70: {
          const [k, j] = count(i);
          const [p, j2] = points(j, k, c === 0x70);
          i = j2;
          polyline(p);
          break;
        }
        case 0x14:
        case 0x74: {
          // Filled triangles: solid fills, drawn as their outline is enough here.
          const [k, j] = count(i);
          const [, j2] = points(j, k, c === 0x74);
          i = j2;
          break;
        }
        case 0x12:
        case 0x72: {
          const [p, j] = points(i, 1, c === 0x72);
          const r = c === 0x72 ? d.readUInt32LE(j) : d.readUInt16LE(j);
          i = j + (c === 0x72 ? 4 : 2);
          arc(p[0]![0], p[0]![1], r, r, 0, 65536);
          break;
        }
        case 0x92: {
          const [p, j] = points(i, 1, true);
          const r = d.readUInt32LE(j);
          arc(p[0]![0], p[0]![1], r, r, d.readUInt16LE(j + 4), d.readUInt16LE(j + 6));
          i = j + 8;
          break;
        }
        case 0x65: {
          const [p, j] = points(i, 1, true);
          const a = d.readUInt32LE(j);
          const b = d.readUInt32LE(j + 4);
          arc(p[0]![0], p[0]![1], a, b, d.readUInt16LE(j + 8), d.readUInt16LE(j + 10));
          i = j + 14;
          break;
        }
        case 0x0b:
        case 0x6b: {
          const [contours, j] = count(i);
          i = j;
          const sizes: number[] = [];
          for (let k = 0; k < contours; k++) {
            const [size, j2] = count(i);
            sizes.push(size);
            i = j2;
          }
          for (const size of sizes) {
            const [p, j2] = points(i, size, c === 0x6b);
            i = j2;
            polyline([...p, p[0]!]);
          }
          break;
        }
        case 0x06: {
          const mask = d.readUInt16LE(i);
          i += 2;
          const fields: Array<[number, number]> = [
            [0x2, 1], [0x4, 1], [0x8, 1], [0x10, 1], [0x20, 4], [0x40, 2], [0x80, 2], [0x100, 2], [0x200, 2], [0x400, 4],
          ];
          if (mask & 0x1) {
            const [name, j] = string(i);
            hebrewFont = HEBREW_SHX.test(name);
            i = j;
          }
          for (const [bit, size] of fields) {
            if (!(mask & bit)) continue;
            if (bit === 0x20) fontHeight = d.readInt32LE(i);
            i += size;
          }
          break;
        }
        case 0x78:
        case 0x18: {
          const [p, j] = points(i, 1, true);
          const [text, j2] = string(j);
          // The complex form carries an options byte, the text's four corners
          // and a closing byte after the string.
          i = c === 0x18 ? j2 + 35 : j2;
          if (visible) rawTexts.push([p[0]![0], p[0]![1], hebrewFont ? decodeShxHebrew(text) : text, fontHeight]);
          break;
        }
        case 0x4f:
          x = d.readInt32LE(i);
          y = d.readInt32LE(i + 4);
          i += 8;
          break;
        case 0x17:
          lineWeight = d.readInt32LE(i);
          i += 4;
          break;
        case 0x03:
          i += 4;
          break;
        case 0x63:
          i += 1;
          break;
        case 0x56:
          visible = true;
          break;
        case 0x76:
          visible = false;
          break;
        case 0x46:
        case 0x66:
          break;
        default:
          // An opcode this reader does not know: stop rather than draw noise.
          i = n;
      }
    }
  } catch {
    // A truncated trailer: keep what was read.
  }
  if (raw.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x1, y1, x2, y2] of raw) {
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  const k = mmPerUnit * POINTS_PER_MM;
  const px = (vx: number) => (vx - minX) * k;
  const py = (vy: number) => (maxY - vy) * k;
  for (const [x1, y1, x2, y2, weight, curve] of raw) {
    const s: VectorSegment = { x1: px(x1), y1: py(y1), x2: px(x2), y2: py(y2), lineWidth: Math.max(0.5, weight * k) };
    (curve ? curves : segments).push(s);
  }
  for (const [tx, ty, text, h] of rawTexts) texts.push({ x: px(tx), y: py(ty), text, height: h * k });
  const page = { width: (maxX - minX) * k, height: (maxY - minY) * k };
  return {
    pageWidth: page.width,
    pageHeight: page.height,
    segments,
    curves,
    // A permit set is a dozen drawings on one strip; walls mean something per
    // drawing, and over the whole strip the search takes thirty seconds. They
    // are found once the strip is cut into sheets (see sheetGeometry).
    walls: [],
    texts,
  };
}
