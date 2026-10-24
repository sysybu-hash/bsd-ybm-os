import { decodeShxHebrew } from "@/lib/projects/floorplan-dwf";

/**
 * A DXF drawing read whole: its layers, text styles, blocks, model space and
 * layouts, and every drawable piece with its block references expanded.
 *
 * `dxf-parser` reads the entities a sales sheet needs and nothing else: no
 * HATCH, no nested blocks, no legacy code pages. An architect's drawing is
 * mostly those — walls are solid hatches, a door is a block in a block, and a
 * pre-2007 DXF from an Israeli office is ANSI_1255 with its labels typed in
 * an SHX font on Latin keys. This reader is written against the group codes.
 */

export type Pt = { x: number; y: number };
/** An affine map, x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export type DxfRecord = { type: string; codes: number[]; values: string[]; children?: DxfRecord[] };
export type DxfLayer = { name: string; colour: number; off: boolean; frozen: boolean; weightMm?: number };
export type DxfBlock = { name: string; base: Pt; entities: DxfRecord[] };
/** A layout tab's viewport, as the model-space window it shows. */
export type DxfViewport = { centre: Pt; width: number; height: number; paperWidth: number; paperHeight: number };
export type DxfLayout = { name: string; viewports: DxfViewport[] };

export type DxfDrawing = {
  version: string;
  codepage: string;
  /** $INSUNITS as metres per drawing unit; offices leave it wrong often enough that callers check it. */
  headerUnitsM?: number;
  layers: Map<string, DxfLayer>;
  styles: Map<string, { font: string; bigFont: string }>;
  blocks: Map<string, DxfBlock>;
  /** Model space only. */
  entities: DxfRecord[];
  layouts: DxfLayout[];
};

/** A drawable piece in world coordinates. `path` is the block names it sits in, outermost first. */
export type DxfPiece = {
  type: string;
  layer: string;
  path: string[];
  /** 0xRRGGBB. */
  colour: number;
  weightMm: number;
  pts?: Pt[];
  closed?: boolean;
  /** A circular arc, world radians counter-clockwise from `start` to `end`. */
  arc?: { c: Pt; r: number; start: number; end: number };
  circle?: { c: Pt; r: number };
  rings?: Pt[][];
  pattern?: string;
  solid?: boolean;
  /** A pattern hatch's strokes as a plotter draws them: its lines, dashes and dots clipped to its rings. */
  strokes?: Array<[Pt, Pt]>;
  text?: string;
  at?: Pt;
  height?: number;
  rotation?: number;
  insert?: string;
  m?: Matrix;
  rot?: number;
  mirrored?: boolean;
  attribs?: Array<{ tag: string; text: string }>;
  dimension?: boolean;
};

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
export const apply = (m: Matrix, p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
export const compose = (m1: Matrix, m2: Matrix): Matrix => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f,
});
const translate = (x: number, y: number): Matrix => ({ ...IDENTITY, e: x, f: y });
const rotate = (r: number): Matrix => ({ a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 0, f: 0 });
const scale = (sx: number, sy: number): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
/** A 2D entity's object coordinates with its extrusion pointing down: x runs the other way. */
const FLIP_X: Matrix = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const UNITS_M: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

/**
 * DXF bytes as text. Before AutoCAD 2007 (AC1021) a DXF is in its
 * $DWGCODEPAGE, ANSI_1255 for a Hebrew office; from then on UTF-8.
 */
export function decodeDxfBytes(bytes: Uint8Array): string {
  const head = Buffer.from(bytes.subarray(0, 64 * 1024)).toString("latin1");
  const version = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(head)?.[1] ?? "";
  const codepage = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(head)?.[1] ?? "";
  if (version >= "AC1021" || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  const ansi = /ANSI_(\d+)/i.exec(codepage)?.[1];
  try {
    return new TextDecoder(ansi ? `windows-${ansi}` : "windows-1252").decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("latin1");
  }
}

const UNICODE_ESCAPE = /\\U\+([0-9A-Fa-f]{4})/g;

/** Every record of the file: a `0` code and the pairs up to the next one. */
function records(text: string): DxfRecord[] {
  const out: DxfRecord[] = [];
  let current: DxfRecord | null = null;
  let at = 0;
  const n = text.length;
  const line = (): string | null => {
    if (at >= n) return null;
    let end = text.indexOf("\n", at);
    if (end < 0) end = n;
    const s = text.charCodeAt(end - 1) === 13 ? text.slice(at, end - 1) : text.slice(at, end);
    at = end + 1;
    return s;
  };
  for (;;) {
    const codeLine = line();
    if (codeLine == null) break;
    const code = Number.parseInt(codeLine.trim(), 10);
    if (Number.isNaN(code)) continue;
    let value = line();
    if (value == null) break;
    if (value.includes("\\U+")) value = value.replace(UNICODE_ESCAPE, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));
    if (code === 0) {
      current = { type: value.trim(), codes: [], values: [] };
      out.push(current);
    } else if (current) {
      current.codes.push(code);
      current.values.push(code < 10 || (code >= 1000 && code < 1010) ? value : value.trim());
    }
  }
  return out;
}

const str = (r: DxfRecord, code: number, fallback = ""): string => {
  const i = r.codes.indexOf(code);
  return i < 0 ? fallback : r.values[i]!;
};
const num = (r: DxfRecord, code: number, fallback = 0): number => {
  const i = r.codes.indexOf(code);
  if (i < 0) return fallback;
  const v = Number.parseFloat(r.values[i]!);
  return Number.isFinite(v) ? v : fallback;
};
const has = (r: DxfRecord, code: number) => r.codes.includes(code);

/** POLYLINE's VERTEXes and INSERT's ATTRIBs, taken in as the entity's children. */
function gather(recs: DxfRecord[]): DxfRecord[] {
  const out: DxfRecord[] = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!;
    if (r.type === "POLYLINE" || (r.type === "INSERT" && num(r, 66) === 1)) {
      const children: DxfRecord[] = [];
      while (i + 1 < recs.length && recs[i + 1]!.type !== "SEQEND" && (recs[i + 1]!.type === "VERTEX" || recs[i + 1]!.type === "ATTRIB")) {
        children.push(recs[++i]!);
      }
      if (recs[i + 1]?.type === "SEQEND") i++;
      out.push({ ...r, children });
    } else if (r.type !== "SEQEND") out.push(r);
  }
  return out;
}

/** Parse DXF text (or bytes) into a drawing. Returns null for anything that is not one. */
export function readDxfDrawing(input: string | Uint8Array): DxfDrawing | null {
  const text = typeof input === "string" ? input : decodeDxfBytes(input);
  if (!text.includes("SECTION")) return null;
  const recs = records(text);
  const drawing: DxfDrawing = { version: "", codepage: "", layers: new Map(), styles: new Map(), blocks: new Map(), entities: [], layouts: [] };
  const paperOwners = new Map<string, DxfRecord[]>();
  let section = "";
  let block: { rec: DxfRecord; entities: DxfRecord[] } | null = null;
  const layoutRecs: DxfRecord[] = [];
  const blockOwner = new Map<string, string>();

  for (const r of recs) {
    if (r.type === "SECTION") {
      section = str(r, 2);
      if (section === "HEADER") {
        for (let i = 0; i < r.codes.length; i++) {
          if (r.codes[i] !== 9) continue;
          const name = r.values[i];
          const value = r.values[i + 1] ?? "";
          if (name === "$ACADVER") drawing.version = value;
          else if (name === "$DWGCODEPAGE") drawing.codepage = value;
          else if (name === "$INSUNITS") drawing.headerUnitsM = UNITS_M[Number.parseInt(value, 10)];
        }
      }
      continue;
    }
    if (r.type === "ENDSEC") {
      section = "";
      continue;
    }
    if (section === "TABLES") {
      if (r.type === "LAYER") {
        const colour = num(r, 62, 7);
        const weight = num(r, 370, -3);
        drawing.layers.set(str(r, 2), {
          name: str(r, 2),
          colour: has(r, 420) ? 0x1000000 | (num(r, 420) & 0xffffff) : Math.abs(colour),
          off: colour < 0,
          frozen: (num(r, 70) & 1) === 1,
          weightMm: weight >= 0 ? weight / 100 : undefined,
        });
      } else if (r.type === "STYLE") drawing.styles.set(str(r, 2), { font: str(r, 3), bigFont: str(r, 4) });
      continue;
    }
    if (section === "BLOCKS") {
      if (r.type === "BLOCK") {
        block = { rec: r, entities: [] };
        blockOwner.set(str(r, 2), str(r, 330));
      } else if (r.type === "ENDBLK") {
        if (block) {
          const name = str(block.rec, 2);
          drawing.blocks.set(name, { name, base: { x: num(block.rec, 10), y: num(block.rec, 20) }, entities: gather(block.entities) });
        }
        block = null;
      } else if (block) block.entities.push(r);
      continue;
    }
    if (section === "ENTITIES") {
      if (num(r, 67) === 1) {
        const owner = str(r, 330);
        if (!paperOwners.has(owner)) paperOwners.set(owner, []);
        paperOwners.get(owner)!.push(r);
      } else drawing.entities.push(r);
      continue;
    }
    if (section === "OBJECTS" && r.type === "LAYOUT") layoutRecs.push(r);
  }
  drawing.entities = gather(drawing.entities);
  // A drawing whose every layer is "off" is one its sheets switch on per viewport (or a writer that
  // signs every colour): the flag says nothing about what prints, so it is dropped.
  const layers = [...drawing.layers.values()];
  if (layers.filter((l) => l.off).length > layers.length / 2) for (const l of layers) l.off = false;

  // A layout's paper space is its block record: the first layout's entities sit in ENTITIES, the rest in *Paper_Space<n> blocks.
  for (const [name, owner] of blockOwner) {
    if (!/^\*Paper_Space/i.test(name)) continue;
    const entities = drawing.blocks.get(name)?.entities ?? [];
    paperOwners.set(owner, [...(paperOwners.get(owner) ?? []), ...entities]);
  }
  for (const lay of layoutRecs) {
    const marker = lay.values.indexOf("AcDbLayout");
    if (marker < 0) continue;
    // The record opens with its plot settings, whose own code 1 is the page setup's name.
    const owner = lay.values[lay.codes.indexOf(330, marker)] ?? "";
    const name = lay.values[lay.codes.indexOf(1, marker)] ?? "";
    if (!name || /^model$/i.test(name)) continue;
    const viewports = (paperOwners.get(owner) ?? []).filter((e) => e.type === "VIEWPORT" && num(e, 69, 2) !== 1).flatMap((v) => {
      const paperWidth = num(v, 40);
      const paperHeight = num(v, 41);
      const height = num(v, 45);
      if (!(paperWidth > 0 && paperHeight > 0 && height > 0)) return [];
      const centre = { x: num(v, 17) + num(v, 12), y: num(v, 27) + num(v, 22) };
      return [{ centre, height, width: (height * paperWidth) / paperHeight, paperWidth, paperHeight }];
    });
    drawing.layouts.push({ name, viewports });
  }
  return drawing;
}

/** AutoCAD's colour index as 0xRRGGBB: the seven named pens, the 240 hue wheel and the six greys. Pen 7 prints black. */
export function aciColour(index: number): number {
  const named = [0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0x000000, 0x808080, 0xc0c0c0];
  if (index >= 0 && index < 10) return named[index]!;
  const greys = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff];
  if (index >= 250 && index <= 255) return greys[index - 250]!;
  if (index < 10 || index > 249) return 0;
  const hue = (Math.floor(index / 10) - 1) * 15;
  const step = index % 10;
  const value = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][step]!;
  const pale = step % 2 === 1;
  const h = hue / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  const mix = (c: number) => Math.round(255 * value * (pale ? 0.5 + c / 2 : c));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** An arc's points, `start` to `end` in radians counter-clockwise, at most 0.15 rad apart. */
export function arcPoints(c: Pt, r: number, start: number, end: number): Pt[] {
  let e = end;
  while (e <= start) e += Math.PI * 2;
  const steps = Math.max(6, Math.ceil((e - start) / 0.15));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + ((e - start) * i) / steps;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** A polyline vertex's bulge as the arc's points from `a` to `b`, endpoints excluded. */
function bulgePoints(a: Pt, b: Pt, bulge: number): Pt[] {
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (!bulge || chord === 0) return [];
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(theta / 2));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const off = r * Math.cos(theta / 2);
  const nx = -(b.y - a.y) / chord;
  const ny = (b.x - a.x) / chord;
  const c = { x: mid.x + nx * off, y: mid.y + ny * off };
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / 0.15));
  const out: Pt[] = [];
  for (let i = 1; i < steps; i++) {
    const t = a0 + (theta * i) / steps;
    out.push({ x: c.x + Math.abs(r) * Math.cos(t), y: c.y + Math.abs(r) * Math.sin(t) });
  }
  return out;
}

const SHX_HEBREW = /heb|miry|gil|sivan|techno|moran|michal|oron/i;

/** A text's string as printed: MTEXT's format codes gone, %% codes as their symbols, an SHX-Hebrew label decoded off its Latin keys. */
export function cleanDxfText(raw: string, type: string, font: string): string {
  let t = raw
    .replace(/\\P/g, " / ")
    .replace(/\\p[^;]*;/g, "")
    .replace(/\{\\f[^;]*;|\\[ACHWQTfFLlOoKk][^;\\{}]*;?|[{}]/g, "")
    .replace(/%%[pP]/g, "±")
    .replace(/%%[cC]/g, "⌀")
    .replace(/%%[dD]/g, "°")
    .trim();
  // The Israeli keyboard's W key is the geresh: "בז'" is typed "cz w".
  if (type !== "MTEXT" && SHX_HEBREW.test(font) && /[a-z]/.test(t) && /^[\x20-\x7e]*$/.test(t)) t = decodeShxHebrew(t).replace(/w/g, "'");
  return t;
}

/** An entity's first point, by which a sheet's window decides what is on it. */
export function anchorOf(r: DxfRecord): Pt | null {
  if (r.type === "HATCH") {
    const i = r.codes.indexOf(91);
    const j = i < 0 ? -1 : r.codes.indexOf(10, i);
    return j < 0 ? null : { x: Number(r.values[j]), y: Number(r.values[j + 1]) };
  }
  if (r.type === "POLYLINE") {
    const v = r.children?.[0];
    return v ? { x: num(v, 10), y: num(v, 20) } : null;
  }
  return has(r, 10) ? { x: num(r, 10), y: num(r, 20) } : null;
}

type Ctx = { m: Matrix; layer?: string; colour?: number; weightMm?: number; path: string[]; depth: number };

/** HATCH boundary paths as rings, in object coordinates. */
function hatchRings(r: DxfRecord): Pt[][] {
  const { codes, values } = r;
  const rings: Pt[][] = [];
  let i = codes.indexOf(91);
  if (i < 0) return rings;
  const paths = Number(values[i]);
  i++;
  const n = codes.length;
  const at = (code: number) => {
    while (i < n && codes[i] !== code) i++;
    return i < n ? Number(values[i++]) : NaN;
  };
  for (let p = 0; p < paths && i < n; p++) {
    const flag = at(92);
    const pts: Pt[] = [];
    if (flag & 2) {
      const bulged = at(72);
      at(73);
      const count = at(93);
      const verts: Array<{ p: Pt; bulge: number }> = [];
      for (let k = 0; k < count; k++) {
        const x = at(10);
        const y = at(20);
        let bulge = 0;
        if (bulged && codes[i] === 42) bulge = Number(values[i++]);
        verts.push({ p: { x, y }, bulge });
      }
      verts.forEach((v, k) => {
        pts.push(v.p);
        const next = verts[(k + 1) % verts.length];
        if (next && v.bulge) pts.push(...bulgePoints(v.p, next.p, v.bulge));
      });
    } else {
      const edges = at(93);
      for (let k = 0; k < edges; k++) {
        const kind = at(72);
        if (kind === 1) {
          const a = { x: at(10), y: at(20) };
          const b = { x: at(11), y: at(21) };
          pts.push(a, b);
        } else if (kind === 2) {
          const c = { x: at(10), y: at(20) };
          const rad = at(40);
          const s = (at(50) * Math.PI) / 180;
          const e = (at(51) * Math.PI) / 180;
          const ccw = at(73) !== 0;
          // A clockwise edge stores its angles measured clockwise: it runs from −start down to −end.
          const arc = ccw ? arcPoints(c, rad, s, e) : arcPoints(c, rad, -e, -s).reverse();
          pts.push(...arc);
        } else if (kind === 3) {
          const c = { x: at(10), y: at(20) };
          const major = { x: at(11), y: at(21) };
          const ratio = at(40);
          const s = (at(50) * Math.PI) / 180;
          let e = (at(51) * Math.PI) / 180;
          const ccw = at(73) !== 0;
          if (e <= s) e += Math.PI * 2;
          const len = Math.hypot(major.x, major.y);
          const rot = Math.atan2(major.y, major.x);
          const steps = Math.max(6, Math.ceil((e - s) / 0.15));
          for (let q = 0; q <= steps; q++) {
            const t = s + ((e - s) * q) / steps;
            const lx = len * Math.cos(t);
            const ly = len * ratio * Math.sin(ccw ? t : -t);
            pts.push({ x: c.x + lx * Math.cos(rot) - ly * Math.sin(rot), y: c.y + lx * Math.sin(rot) + ly * Math.cos(rot) });
          }
        } else if (kind === 4) {
          at(94);
          const rational = at(73);
          at(74);
          const knots = at(95);
          const controls = at(96);
          for (let q = 0; q < knots; q++) at(40);
          for (let q = 0; q < controls; q++) {
            pts.push({ x: at(10), y: at(20) });
            if (rational && codes[i] === 42) i++;
          }
        }
      }
    }
    // A boundary's source objects: skipped, they repeat what the path draws.
    if (codes[i] === 97) {
      const sources = Number(values[i++]);
      for (let k = 0; k < sources && codes[i] === 330; k++) i++;
    }
    if (pts.length > 2) rings.push(pts);
  }
  return rings;
}

type PatternLine = { angle: number; base: Pt; offset: Pt; dashes: number[] };

/** A pattern hatch's line families, already scaled and turned as the DXF stores them. */
function hatchPattern(r: DxfRecord): PatternLine[] {
  const { codes, values } = r;
  const start = codes.lastIndexOf(78);
  if (start < 0) return [];
  const count = Number(values[start]);
  const out: PatternLine[] = [];
  let i = start + 1;
  for (let k = 0; k < count && i < codes.length; k++) {
    if (codes[i] !== 53) break;
    const angle = (Number(values[i]) * Math.PI) / 180;
    const base = { x: Number(values[i + 1]), y: Number(values[i + 2]) };
    const offset = { x: Number(values[i + 3]), y: Number(values[i + 4]) };
    const n = Number(values[i + 5]);
    i += 6;
    const dashes: number[] = [];
    for (let d = 0; d < n && codes[i] === 49; d++) dashes.push(Number(values[i++]));
    out.push({ angle, base, offset, dashes });
  }
  return out;
}

/** The most strokes one hatch may expand to: a lawn of a few hundred square metres stays whole, a mis-scaled pattern does not hang the reader. */
const MAX_HATCH_STROKES = 250_000;

/** A pattern's strokes inside rings (even-odd), in the rings' own coordinates. */
export function patternStrokes(rings: Pt[][], lines: PatternLine[]): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  const all = rings.flat();
  if (!all.length) return out;
  for (const line of lines) {
    const u = { x: Math.cos(line.angle), y: Math.sin(line.angle) };
    const n = { x: -u.y, y: u.x };
    const spacing = line.offset.x * n.x + line.offset.y * n.y;
    if (!(Math.abs(spacing) > 1e-9)) continue;
    const across = all.map((p) => (p.x - line.base.x) * n.x + (p.y - line.base.y) * n.y);
    const k0 = Math.ceil(Math.min(...across) / spacing - 1e-9);
    const k1 = Math.floor(Math.max(...across) / spacing + 1e-9);
    const [lo, hi] = k0 <= k1 ? [k0, k1] : [k1, k0];
    if (hi - lo > 20_000) continue;
    const period = line.dashes.reduce((s, d) => s + Math.abs(d), 0);
    for (let k = lo; k <= hi; k++) {
      const o = { x: line.base.x + line.offset.x * k, y: line.base.y + line.offset.y * k };
      // Where this line crosses the rings, as distances along it from `o`.
      const ts: number[] = [];
      for (const ring of rings) {
        for (let e = 0; e < ring.length; e++) {
          const a = ring[e]!;
          const b = ring[(e + 1) % ring.length]!;
          const da = (a.x - o.x) * n.x + (a.y - o.y) * n.y;
          const db = (b.x - o.x) * n.x + (b.y - o.y) * n.y;
          if ((da > 0) === (db > 0) || da === db) continue;
          const f = da / (da - db);
          ts.push((a.x + (b.x - a.x) * f - o.x) * u.x + (a.y + (b.y - a.y) * f - o.y) * u.y);
        }
      }
      ts.sort((p, q) => p - q);
      for (let s = 0; s + 1 < ts.length; s += 2) {
        const t0 = ts[s]!;
        const t1 = ts[s + 1]!;
        const at = (t: number): Pt => ({ x: o.x + u.x * t, y: o.y + u.y * t });
        if (!line.dashes.length || period <= 1e-9) {
          out.push([at(t0), at(t1)]);
          continue;
        }
        // Each row's dashes run from its own origin, which the offset has already slid along the line.
        const dot = period * 0.01;
        let t = t0 - (((t0 % period) + period) % period);
        dashes: while (t < t1) {
          for (const d of line.dashes) {
            if (d > 0) {
              const a = Math.max(t, t0);
              const b = Math.min(t + d, t1);
              if (b > a) out.push([at(a), at(b)]);
            } else if (d === 0 && t >= t0 && t <= t1) out.push([at(t), at(t + dot)]);
            t += Math.abs(d);
            if (t >= t1 || out.length >= MAX_HATCH_STROKES) break dashes;
          }
        }
      }
      if (out.length >= MAX_HATCH_STROKES) return out;
    }
  }
  return out;
}

/**
 * Every drawable piece of `entities`, block references expanded into world
 * coordinates. A piece on layer 0 inside a block takes the reference's layer,
 * a ByBlock colour the reference's colour, as AutoCAD draws them.
 */
export function flattenDxf(drawing: DxfDrawing, entities: DxfRecord[] = drawing.entities, ctx: Ctx = { m: IDENTITY, path: [], depth: 0 }, out: DxfPiece[] = []): DxfPiece[] {
  for (const e of entities) {
    if (num(e, 60) === 1) continue;
    const own = str(e, 8, "0");
    const layerName = own === "0" && ctx.layer ? ctx.layer : own;
    const layer = drawing.layers.get(layerName);
    if (layer && (layer.off || layer.frozen)) continue;
    const aci = num(e, 62, 256);
    const colour = has(e, 420)
      ? num(e, 420) & 0xffffff
      : aci === 0
        ? (ctx.colour ?? 0)
        : aci === 256
          ? layer && layer.colour & 0x1000000
            ? layer.colour & 0xffffff
            : aciColour(layer?.colour ?? 7)
          : aciColour(aci);
    const lw = num(e, 370, -1);
    const weightMm = lw >= 0 ? lw / 100 : lw === -2 ? (ctx.weightMm ?? 0.25) : (layer?.weightMm ?? 0.25);
    const ocs = num(e, 230, 1) < 0 ? compose(ctx.m, FLIP_X) : ctx.m;
    const base = { type: e.type, layer: layerName, path: ctx.path, colour, weightMm };
    const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    switch (e.type) {
      case "LINE":
        out.push({ ...base, pts: [apply(ctx.m, { x: num(e, 10), y: num(e, 20) }), apply(ctx.m, { x: num(e, 11), y: num(e, 21) })] });
        break;
      case "LWPOLYLINE": {
        const verts: Array<{ p: Pt; bulge: number }> = [];
        for (let i = 0; i < e.codes.length; i++) {
          if (e.codes[i] === 10) verts.push({ p: { x: Number(e.values[i]), y: Number(e.values[i + 1]) }, bulge: 0 });
          else if (e.codes[i] === 42 && verts.length) verts[verts.length - 1]!.bulge = Number(e.values[i]);
        }
        const closed = (num(e, 70) & 1) === 1;
        out.push({ ...base, pts: polylinePoints(verts, closed).map((p) => apply(ocs, p)), closed });
        break;
      }
      case "POLYLINE": {
        const flag = num(e, 70);
        if (flag & (16 | 64)) break;
        const verts = (e.children ?? []).filter((v) => v.type === "VERTEX").map((v) => ({ p: { x: num(v, 10), y: num(v, 20) }, bulge: num(v, 42) }));
        const closed = (flag & 1) === 1;
        out.push({ ...base, pts: polylinePoints(verts, closed).map((p) => apply(flag & 8 ? ctx.m : ocs, p)), closed });
        break;
      }
      case "ARC":
      case "CIRCLE": {
        const c = { x: num(e, 10), y: num(e, 20) };
        const r = num(e, 40);
        if (!(r > 0)) break;
        const full = e.type === "CIRCLE";
        const s = full ? 0 : (num(e, 50) * Math.PI) / 180;
        const en = full ? Math.PI * 2 : (num(e, 51) * Math.PI) / 180;
        const pts = arcPoints(c, r, s, en).map((p) => apply(ocs, p));
        const wc = apply(ocs, c);
        const wr = r * scaleOf(ocs);
        if (full) out.push({ ...base, pts, closed: true, circle: { c: wc, r: wr } });
        else {
          const mirrored = ocs.a * ocs.d - ocs.b * ocs.c < 0;
          const [from, to] = mirrored ? [pts[pts.length - 1]!, pts[0]!] : [pts[0]!, pts[pts.length - 1]!];
          out.push({ ...base, pts, arc: { c: wc, r: wr, start: Math.atan2(from.y - wc.y, from.x - wc.x), end: Math.atan2(to.y - wc.y, to.x - wc.x) } });
        }
        break;
      }
      case "ELLIPSE": {
        const c = { x: num(e, 10), y: num(e, 20) };
        const major = { x: num(e, 11), y: num(e, 21) };
        const ratio = num(e, 40, 1);
        const s = num(e, 41, 0);
        let en = num(e, 42, Math.PI * 2);
        if (en <= s) en += Math.PI * 2;
        const len = Math.hypot(major.x, major.y);
        const rot = Math.atan2(major.y, major.x);
        const steps = Math.max(8, Math.ceil((en - s) / 0.15));
        const pts: Pt[] = [];
        for (let q = 0; q <= steps; q++) {
          const t = s + ((en - s) * q) / steps;
          const lx = len * Math.cos(t);
          const ly = len * ratio * Math.sin(t);
          pts.push(apply(ocs, { x: c.x + lx * Math.cos(rot) - ly * Math.sin(rot), y: c.y + lx * Math.sin(rot) + ly * Math.cos(rot) }));
        }
        out.push({ ...base, pts, closed: en - s >= Math.PI * 2 - 1e-6 });
        break;
      }
      case "SPLINE": {
        const fit: Pt[] = [];
        const control: Pt[] = [];
        for (let i = 0; i < e.codes.length; i++) {
          if (e.codes[i] === 11) fit.push({ x: Number(e.values[i]), y: Number(e.values[i + 1]) });
          else if (e.codes[i] === 10) control.push({ x: Number(e.values[i]), y: Number(e.values[i + 1]) });
        }
        const pts = (fit.length >= 2 ? fit : control).map((p) => apply(ctx.m, p));
        if (pts.length >= 2) out.push({ ...base, pts, closed: (num(e, 70) & 1) === 1 });
        break;
      }
      case "SOLID":
      case "TRACE": {
        const corners = [10, 11, 13, 12].map((code) => apply(ocs, { x: num(e, code), y: num(e, code + 10) }));
        out.push({ ...base, rings: [corners], solid: true, pattern: "SOLID" });
        break;
      }
      case "HATCH": {
        const local = hatchRings(e);
        if (!local.length) break;
        // Some writers leave the solid-fill flag off and name the pattern instead ("SOLID", "SOLID,_O").
        const solid = num(e, 70) === 1 || /^SOLID\b/i.test(str(e, 2));
        const strokes = solid ? undefined : patternStrokes(local, hatchPattern(e)).map(([a, b]) => [apply(ocs, a), apply(ocs, b)] as [Pt, Pt]);
        out.push({ ...base, rings: local.map((ring) => ring.map((p) => apply(ocs, p))), pattern: str(e, 2), solid, strokes });
        break;
      }
      case "TEXT":
      case "ATTRIB":
      case "MTEXT": {
        if (e.type === "ATTRIB" && num(e, 70) & 1) break;
        const style = drawing.styles.get(str(e, 7, "STANDARD")) ?? drawing.styles.get("Standard");
        const raw = e.type === "MTEXT" ? [...e.codes.flatMap((c, i) => (c === 3 ? [e.values[i]!] : [])), str(e, 1)].join("") : str(e, 1);
        const text = cleanDxfText(raw, e.type, `${style?.font ?? ""} ${style?.bigFont ?? ""}`);
        if (!text) break;
        const aligned = e.type !== "MTEXT" && (num(e, 72) !== 0 || num(e, 74) !== 0 || num(e, 73) !== 0) && has(e, 11);
        const p = aligned ? { x: num(e, 11), y: num(e, 21) } : { x: num(e, 10), y: num(e, 20) };
        const rotation = e.type === "MTEXT" && has(e, 11) && !has(e, 50) ? (Math.atan2(num(e, 21), num(e, 11)) * 180) / Math.PI : num(e, 50);
        const m = e.type === "MTEXT" ? ctx.m : ocs;
        out.push({ ...base, text, at: apply(m, p), height: num(e, 40) * scaleOf(m), rotation: rotation + (Math.atan2(m.b, m.a) * 180) / Math.PI });
        break;
      }
      case "DIMENSION": {
        const name = str(e, 2);
        const blk = drawing.blocks.get(name);
        out.push({ ...base, dimension: true, text: str(e, 1) || undefined, at: apply(ctx.m, { x: num(e, 11), y: num(e, 21) }) });
        if (blk && ctx.depth < 8) flattenDxf(drawing, blk.entities, { m: ctx.m, layer: layerName, colour, weightMm, path: [...ctx.path, name], depth: ctx.depth + 1 }, out);
        break;
      }
      case "INSERT": {
        const name = str(e, 2);
        const blk = drawing.blocks.get(name);
        if (!blk || ctx.depth >= 8 || ctx.path.includes(name)) break;
        const sx = num(e, 41, 1) || 1;
        const sy = num(e, 42, 1) || 1;
        const rot = (num(e, 50) * Math.PI) / 180;
        const cols = Math.max(1, num(e, 70, 1));
        const rows = Math.max(1, num(e, 71, 1));
        const ins = { x: num(e, 10), y: num(e, 20) };
        const attribs = (e.children ?? [])
          .filter((a) => a.type === "ATTRIB" && !(num(a, 70) & 1))
          .map((a) => ({ tag: str(a, 2), text: cleanDxfText(str(a, 1), "ATTRIB", "") }));
        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const local = compose(
              translate(ins.x, ins.y),
              compose(rotate(rot), compose(translate(col * num(e, 44), row * num(e, 45)), compose(scale(sx, sy), translate(-blk.base.x, -blk.base.y)))),
            );
            const mm = compose(ocs, local);
            out.push({
              ...base,
              insert: name,
              at: apply(ocs, ins),
              m: mm,
              rot: Math.atan2(mm.b, mm.a),
              mirrored: mm.a * mm.d - mm.b * mm.c < 0,
              attribs,
            });
            flattenDxf(drawing, blk.entities, { m: mm, layer: layerName, colour, weightMm, path: [...ctx.path, name], depth: ctx.depth + 1 }, out);
          }
        }
        if (e.children?.length) flattenDxf(drawing, e.children.filter((a) => a.type === "ATTRIB"), { ...ctx, layer: ctx.layer }, out);
        break;
      }
    }
  }
  return out;
}

function polylinePoints(verts: Array<{ p: Pt; bulge: number }>, closed: boolean): Pt[] {
  const pts: Pt[] = [];
  verts.forEach((v, k) => {
    pts.push(v.p);
    const next = verts[k + 1] ?? (closed ? verts[0] : undefined);
    if (next && v.bulge) pts.push(...bulgePoints(v.p, next.p, v.bulge));
  });
  if (closed && verts.length > 2) pts.push(verts[0]!.p);
  return pts;
}

/** The model-space entities whose first point lies in a window, as a sheet's viewport selects them. */
export function entitiesWithin(drawing: DxfDrawing, box: { centre: Pt; width: number; height: number }): DxfRecord[] {
  return drawing.entities.filter((e) => {
    const p = anchorOf(e);
    return p != null && Math.abs(p.x - box.centre.x) <= box.width / 2 && Math.abs(p.y - box.centre.y) <= box.height / 2;
  });
}

/**
 * A fill's rings as triangles, even-odd: cut into horizontal bands at every
 * vertex, each band's inside spans are trapezoids, each two triangles. Any
 * ring a drawing fills — self-touching, with holes, with arcs — comes out as
 * exactly the area it covers.
 */
export function fillTriangles(rings: Pt[][]): Array<[Pt, Pt, Pt]> {
  const edges: Array<[Pt, Pt]> = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (a.y !== b.y) edges.push(a.y < b.y ? [a, b] : [b, a]);
    }
  }
  const ys = [...new Set(edges.flatMap(([a, b]) => [a.y, b.y]))].sort((p, q) => p - q);
  const out: Array<[Pt, Pt, Pt]> = [];
  const xAt = ([a, b]: [Pt, Pt], y: number) => a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k]!;
    const y1 = ys[k + 1]!;
    const mid = (y0 + y1) / 2;
    const live = edges.filter(([a, b]) => a.y <= mid && b.y > mid).sort((p, q) => xAt(p, mid) - xAt(q, mid));
    for (let i = 0; i + 1 < live.length; i += 2) {
      const l = live[i]!;
      const r = live[i + 1]!;
      const p00 = { x: xAt(l, y0), y: y0 };
      const p01 = { x: xAt(r, y0), y: y0 };
      const p10 = { x: xAt(l, y1), y: y1 };
      const p11 = { x: xAt(r, y1), y: y1 };
      if (p01.x - p00.x > 1e-12) out.push([p00, p01, p11]);
      if (p11.x - p10.x > 1e-12 || p01.x - p00.x > 1e-12) out.push([p00, p11, p10]);
    }
  }
  return out;
}
