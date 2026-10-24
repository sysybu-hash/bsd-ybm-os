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
    ...cutFills(strip, box),
    arcs: strip.arcs
      .filter((a) => a.cx >= box.x && a.cx <= box.x + box.width && a.cy >= box.y && a.cy <= box.y + box.height)
      .map((a) => ({ ...a, cx: a.cx - box.x, cy: a.cy - box.y })),
    // The drawing's colours where they draw this part: a DXF's floors carry
    // them, and a DWF's facades laid on the same strip do not — drawn from
    // the floors' colours alone, Gottlieb A's facade sheets came out blank
    // but for their building lines' names (13/10/2026).
    ...(() => {
      if (!strip.display) return {};
      const display = {
        lines: strip.display.lines
          .filter((l) => Math.min(l.x1, l.x2) >= box.x && Math.max(l.x1, l.x2) <= box.x + box.width && Math.min(l.y1, l.y2) >= box.y && Math.max(l.y1, l.y2) <= box.y + box.height)
          .map((l) => ({ ...l, x1: l.x1 - box.x, y1: l.y1 - box.y, x2: l.x2 - box.x, y2: l.y2 - box.y })),
        fills: strip.display.fills
          .filter((f) => f.pts.every(([x, y]) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height))
          .map((f) => ({ ...f, pts: f.pts.map(([x, y]) => [x - box.x, y - box.y] as [number, number]) })),
        ...(strip.display.texts
          ? {
              texts: strip.display.texts
                .filter((t) => t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height)
                .map((t) => ({ ...t, x: t.x - box.x, y: t.y - box.y })),
            }
          : {}),
      };
      return display.lines.length >= 0.5 * segments.length ? { display } : {};
    })(),
    // Only where the part holds the CAD walls' fills: a DWF sheet stacked beside them has none.
    ...(strip.wallPen != null && strip.fillPens?.some((p, i) => p === strip.wallPen && strip.fills[i]!.every(([x, y]) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)) ? { wallPen: strip.wallPen } : {}),
    ...(strip.doorsDrawn ? { doorsDrawn: strip.doorsDrawn.filter((s) => Math.min(s.x1, s.x2) >= box.x && Math.max(s.x1, s.x2) <= box.x + box.width && Math.min(s.y1, s.y2) >= box.y && Math.max(s.y1, s.y2) <= box.y + box.height).map((s) => ({ x1: s.x1 - box.x, y1: s.y1 - box.y, x2: s.x2 - box.x, y2: s.y2 - box.y })) } : {}),
    ...(strip.stairLines ? { stairLines: strip.stairLines.filter((s) => Math.min(s.x1, s.x2) >= box.x && Math.max(s.x1, s.x2) <= box.x + box.width && Math.min(s.y1, s.y2) >= box.y && Math.max(s.y1, s.y2) <= box.y + box.height).map((s) => ({ x1: s.x1 - box.x, y1: s.y1 - box.y, x2: s.x2 - box.x, y2: s.y2 - box.y })) } : {}),
    ...(strip.walkLines ? { walkLines: strip.walkLines.filter((s) => Math.min(s.x1, s.x2) >= box.x && Math.max(s.x1, s.x2) <= box.x + box.width && Math.min(s.y1, s.y2) >= box.y && Math.max(s.y1, s.y2) <= box.y + box.height).map((s) => ({ x1: s.x1 - box.x, y1: s.y1 - box.y, x2: s.x2 - box.x, y2: s.y2 - box.y })) } : {}),
    ...(strip.plotDrawn ? { plotDrawn: { x0: strip.plotDrawn.x0 - box.x, y0: strip.plotDrawn.y0 - box.y, x1: strip.plotDrawn.x1 - box.x, y1: strip.plotDrawn.y1 - box.y } } : {}),
    ...(strip.parkingDrawn ? { parkingDrawn: strip.parkingDrawn.filter((p) => p.x + p.w / 2 >= box.x && p.x + p.w / 2 <= box.x + box.width && p.y + p.h / 2 >= box.y && p.y + p.h / 2 <= box.y + box.height).map((p) => ({ ...p, x: p.x - box.x, y: p.y - box.y })) } : {}),
    ...(strip.wallLines ? { wallLines: strip.wallLines.filter((s) => Math.min(s.x1, s.x2) >= box.x && Math.max(s.x1, s.x2) <= box.x + box.width && Math.min(s.y1, s.y2) >= box.y && Math.max(s.y1, s.y2) <= box.y + box.height).map((s) => ({ x1: s.x1 - box.x, y1: s.y1 - box.y, x2: s.x2 - box.x, y2: s.y2 - box.y })) } : {}),
    ...(strip.windowsDrawn
      ? {
          windowsDrawn: strip.windowsDrawn
            .filter((p) => p.x + p.w / 2 >= box.x && p.x + p.w / 2 <= box.x + box.width && p.y + p.h / 2 >= box.y && p.y + p.h / 2 <= box.y + box.height)
            .map((p) => ({ ...p, x: p.x - box.x, y: p.y - box.y })),
        }
      : {}),
    ...(strip.roomsDrawn
      ? {
          roomsDrawn: strip.roomsDrawn
            .filter((r) => r.x >= box.x && r.x <= box.x + box.width && r.y >= box.y && r.y <= box.y + box.height)
            .map((r) => ({ ...r, x: r.x - box.x, y: r.y - box.y })),
        }
      : {}),
    ...(strip.zones
      ? {
          zones: strip.zones
            .filter((z) => z.ring.some(([x, y]) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height))
            .map((z) => ({ ...z, ring: z.ring.map(([x, y]) => [x - box.x, y - box.y] as [number, number]) })),
        }
      : {}),
    ...(strip.furniture
      ? {
          furniture: strip.furniture
            .filter((p) => p.x + p.w / 2 >= box.x && p.x + p.w / 2 <= box.x + box.width && p.y + p.h / 2 >= box.y && p.y + p.h / 2 <= box.y + box.height)
            .map((p) => ({ ...p, x: p.x - box.x, y: p.y - box.y })),
        }
      : {}),
  };
}

function cutFills(
  strip: DwfGeometry,
  box: { x: number; y: number; width: number; height: number },
): Pick<DwfGeometry, "fills" | "fillPens"> {
  const fills: DwfGeometry["fills"] = [];
  const pens: number[] = [];
  strip.fills.forEach((tri, k) => {
    if (!tri.every(([vx, vy]) => vx >= box.x && vx <= box.x + box.width && vy >= box.y && vy <= box.y + box.height)) return;
    fills.push(tri.map(([vx, vy]) => [vx - box.x, vy - box.y] as [number, number]));
    pens.push(strip.fillPens?.[k] ?? 0);
  });
  return strip.fillPens ? { fills, fillPens: pens } : { fills };
}

/** A text the sheet carries as text, placed on the page. */
export type PlacedText = { x: number; y: number; text: string; height: number };

/**
 * The sheet's solid fills, as triangles. A permit set fills its walls solid —
 * poché, not the diagonal hatch a sales sheet draws — so on a DWF the walls
 * are these, drawn outright.
 */
export type DwfGeometry = FloorplanVectorGeometry & {
  /**
   * A sheet that is one floor drawn whole (a DXF read whole, dxf-house.ts): the strip cut keeps it one drawing however wide its courtyards run. A strip of
   * stacked floors carries each such floor's box here (house-strip.ts); sheet-split.ts takes them as given and cuts only what lies outside them.
   */
  singleSheet?: boolean;
  forcedSheets?: Array<{ x: number; y: number; width: number; height: number; kind: "floor" | "roof"; level?: number }>;
  texts: PlacedText[];
  fills: Array<Array<[number, number]>>;
  /** Each fill's pen, as `stroke` is a segment's: walls poché in one, a lawn in another. */
  fillPens?: number[];
  /**
   * Circular arcs as drawn — centre, radius and the swept angles (radians,
   * counter-clockwise from +x in page space with y down, as drawn). A door is
   * one of these about its hinge, and the hinge is what closes it.
   */
  arcs: DwfArc[];
  /**
   * The furniture the drawing names itself, from a DXF's blocks (dxf-house.ts):
   * page units, the box each block stands in. Where present, it is the
   * furniture — no reading of its lines and hatches is guessed over it.
   */
  furniture?: DrawnPiece[];
  /**
   * The ground's finishes the drawing names itself, from a CAD file's hatches
   * by their pattern and layer (cad-layers.ts): page units, each a ring. Where
   * present they are the yard's lawn and paving — its dots and herringbone
   * strokes are not read for them (Gottlieb, 13/10/2026: "the DXF details
   * everything — why is it not read as it is?").
   */
  zones?: DrawnZone[];
  /**
   * The walls the drawing names itself: a CAD file's wall fills, already
   * kept to the walls (labels, worktops and furniture taken off). Where set,
   * the walls are these fills as drawn — none of the strip readers' closing,
   * stub, stair or room-shaping rules are run over them.
   */
  wallPen?: number;
  /** A CAD file's wall-layer lines, page units: partitions drawn as two lines, no fill between. */
  wallLines?: Array<{ x1: number; y1: number; x2: number; y2: number; inner?: boolean }>;
  /** A CAD file's doors, page units: each one's opening, hinge to far jamb — where a room ends. */
  doorsDrawn?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** A CAD file's stairs-layer lines, page units: its treads and landings, and nothing else read as a stair. */
  stairLines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /**
   * A CAD file's lines drawn over its stairs on the overhead layer, page units:
   * the walk line from the first tread to the arrow at the top, the arrow's
   * head, and the break line where the plan's cut crosses a flight.
   */
  walkLines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  /** A CAD file's plot: its boundary's box, page units. */
  plotDrawn?: { x0: number; y0: number; x1: number; y1: number };
  /** A CAD file's parking blocks, page units: each bay's box. */
  parkingDrawn?: Array<{ x: number; y: number; w: number; h: number }>;
  /** The windows the drawing names itself, from a CAD file's window blocks: page units, each its box in the wall and which way it runs. */
  windowsDrawn?: DrawnWindow[];
  /**
   * The rooms a CAD file labels, page units: each name where it is written and the "W*L" under it.
   * Read off the file's own texts (dxf-house.ts) — a mirrored home's block texts land astray on the page.
   */
  roomsDrawn?: Array<{ x: number; y: number; name: string | null; dims: string | null }>;
  /**
   * The drawing as the architect coloured it, for showing beside a render:
   * a DXF's lines and fills in their own colours (RGB), page units. The
   * readers never look at it — it is the sheet's picture, not its geometry.
   * Its `texts` are lettering shown and not read: a facade's level marks,
   * written above their triangles, where the readers take a mark at its line.
   */
  display?: {
    lines: Array<{ x1: number; y1: number; x2: number; y2: number; rgb: number; w: number }>;
    fills: Array<{ pts: Array<[number, number]>; rgb: number }>;
    texts?: PlacedText[];
  };
};

/** A window a CAD block names: its box on the page (its width along the wall, the wall's depth across) and the axis it runs along. */
export type DrawnWindow = { x: number; y: number; w: number; h: number; runs: "x" | "y" };

/** A ground finish a CAD hatch names, and its outline on the page. */
export type DrawnZone = { kind: "lawn" | "paving" | "planting"; ring: Array<[number, number]> };

/** A piece a CAD block names: its kind as the furniture readers name it, and its box on the page. */
export type DrawnPiece = { x: number; y: number; w: number; h: number; kind: "bed" | "storage" | "table" | "seat" | "counter" | "sink" | "hob" | "fixture" | "desk"; fixture?: "bath" | "shower" | "toilet" | "basin" | "washer" };

export type DwfArc = { cx: number; cy: number; r: number; start: number; end: number };

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

  // The pen colour, as the index into the drawing's palette or as RGB. A
  // permit set draws each kind of thing in its own colour — walls, dimension
  // chains, furniture — and the colour is how they are told apart.
  let colour = 0;
  const raw: Array<[number, number, number, number, number, boolean, number]> = [];
  const push = (x1: number, y1: number, x2: number, y2: number, curve = false) => {
    if (visible) raw.push([x1, y1, x2, y2, lineWeight, curve, colour]);
  };
  const rawTexts: Array<[number, number, string, number]> = [];
  const rawFills: Array<Array<[number, number]>> = [];
  const rawFillPens: number[] = [];
  const rawArcs: Array<[number, number, number, number, number]> = [];

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
    if (visible && a === b && end !== 65536) rawArcs.push([cx, cy, a, start, end]);
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
          // A strip of filled triangles: a solid fill.
          const [k, j] = count(i);
          const [p, j2] = points(j, k, c === 0x74);
          i = j2;
          if (visible) {
            for (let t = 0; t + 2 < p.length; t++) {
              rawFills.push([p[t]!, p[t + 1]!, p[t + 2]!]);
              rawFillPens.push(colour);
            }
          }
          break;
        }
        case 0x07:
        case 0x67:
        case 0x11:
        case 0x71: {
          // Gouraud polytriangle / polyline: a gradient hatch, each vertex
          // followed by its colour. A floor's tile shading, never a wall —
          // walked for the pen position and drawn as nothing.
          const wide = c === 0x67 || c === 0x71;
          const [k, j] = count(i);
          i = j;
          for (let m = 0; m < k; m++) {
            x += wide ? d.readInt32LE(i) : d.readInt16LE(i);
            y += wide ? d.readInt32LE(i + 4) : d.readInt16LE(i + 2);
            i += (wide ? 8 : 4) + 4;
          }
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
          // The complex form carries its overscore and underscore counts, the
          // text's four corners and a closing byte after the string. The
          // corners are points like any other, each moving the pen on from
          // the last: skipped, every text after drifts a line's height.
          i = c === 0x18 ? points(j2 + 2, 4, true)[1] + 1 : j2;
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
          // RGBA, stored B, G, R, A.
          colour = 0x1000000 | (d[i + 2]! << 16) | (d[i + 1]! << 8) | d[i]!;
          i += 4;
          break;
        case 0x63:
          colour = d[i]!;
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
  for (const [x1, y1, x2, y2, weight, curve, pen] of raw) {
    const s: VectorSegment = {
      x1: px(x1),
      y1: py(y1),
      x2: px(x2),
      y2: py(y2),
      lineWidth: Math.max(0.5, weight * k),
      stroke: pen,
    };
    (curve ? curves : segments).push(s);
  }
  for (const [tx, ty, text, h] of rawTexts) texts.push({ x: px(tx), y: py(ty), text, height: h * k });
  const fills = rawFills.map((tri) => tri.map(([vx, vy]) => [px(vx), py(vy)] as [number, number]));
  // y is flipped onto the page, so an angle measured up from +x runs down.
  const arcs: DwfArc[] = rawArcs.map(([cx, cy, r, start, end]) => {
    const s0 = (start / 65536) * Math.PI * 2;
    let e0 = (end / 65536) * Math.PI * 2;
    if (e0 <= s0) e0 += Math.PI * 2;
    return { cx: px(cx), cy: py(cy), r: r * k, start: -e0, end: -s0 };
  });
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
    fills,
    fillPens: rawFillPens,
    arcs,
  };
}
