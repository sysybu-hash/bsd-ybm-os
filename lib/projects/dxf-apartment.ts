import { layerKind, profileFor, type CadKind } from "@/lib/projects/building/cad-layers";
import {
  entitiesWithin,
  flattenDxf,
  type DxfDrawing,
  type DxfPiece,
  type DxfRecord,
  type Pt,
} from "@/lib/projects/dxf-drawing";
import { decodeShxHebrew } from "@/lib/projects/floorplan-dwf";

/**
 * One apartment lifted out of a multi-unit DXF.
 *
 * Israeli sales drawings do not write "דירה 14" as a sentence. This office
 * (the Weinberg / Gottlieb set) drops a block named App_Nom on each flat and
 * stores the number in an attribute tagged Nom. The flat is whatever geometry
 * sits closer to that mark than to any other mark, out to 18 m — past that
 * the next wing begins, and a label must not swallow it.
 */

const NOM_BLOCK = /^app_nom$/i;
const NOM_TAG = /^nom$/i;
/** How far from its own number a flat is allowed to reach. */
const REACH_M = 18;
const ROOM_WORD = /שינה|הורים|מטבח|סלון|מרפס|ממ["״']?ד|רחצ|שירות|מקלחת|אמבט|פינת|אוכל|מבוא/u;

export type ApartmentMark = { number: number; x: number; y: number };

export type ApartmentRoom = { text: string; x: number; y: number };

export type ApartmentOpening = { name: string; x: number; y: number };

export type ApartmentLine = { x1: number; y1: number; x2: number; y2: number; wall: boolean };

export type ApartmentExtract = {
  number: number;
  /** Metres per drawing unit, from the DXF header. */
  unitsM: number;
  mark: { x: number; y: number };
  /** Drawing units, axis-aligned, around the walls that belong to this flat. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  widthM: number;
  depthM: number;
  rooms: ApartmentRoom[];
  openings: ApartmentOpening[];
  lines: ApartmentLine[];
  /** Every apartment number the same model space carries, so the next one is a parameter. */
  numbersInFile: number[];
  counts: { walls: number; lines: number; rooms: number; openings: number };
};

const field = (r: DxfRecord, code: number, fallback = ""): string => {
  const i = r.codes.indexOf(code);
  return i < 0 ? fallback : (r.values[i] ?? fallback);
};
const fieldNum = (r: DxfRecord, code: number, fallback = 0): number => {
  const n = Number.parseFloat(field(r, code, ""));
  return Number.isFinite(n) ? n : fallback;
};

/** Apartment numbers placed in model space, one per App_Nom insert. */
export function apartmentMarks(drawing: DxfDrawing): ApartmentMark[] {
  const marks: ApartmentMark[] = [];
  for (const e of drawing.entities) {
    if (e.type !== "INSERT" || !NOM_BLOCK.test(field(e, 2))) continue;
    const attrib = (e.children ?? []).find((c) => c.type === "ATTRIB" && NOM_TAG.test(field(c, 2)));
    const n = Number(attrib ? field(attrib, 1).trim() : "");
    if (!Number.isInteger(n) || n <= 0 || n > 9999) continue;
    marks.push({ number: n, x: fieldNum(e, 10), y: fieldNum(e, 20) });
  }
  return marks;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** The mark a point belongs to: the nearest one, or null past the reach. */
function ownerOf(point: Pt, marks: ApartmentMark[], reach: number): ApartmentMark | null {
  let best: ApartmentMark | null = null;
  let bestD = reach;
  for (const mark of marks) {
    const d = dist(point, mark);
    if (d < bestD) {
      best = mark;
      bestD = d;
    }
  }
  return best;
}

function pointsOf(piece: DxfPiece): Pt[] {
  const pts: Pt[] = [];
  if (piece.pts) pts.push(...piece.pts);
  if (piece.rings) for (const ring of piece.rings) pts.push(...ring);
  if (piece.at) pts.push(piece.at);
  return pts;
}

function centroid(piece: DxfPiece): Pt | null {
  const pts = pointsOf(piece);
  if (pts.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * Latin-keyed Hebrew (an SHX font) back into letters, when that is what the
 * string is. Real Hebrew is left as it was written. A dimension stays a number.
 */
function shownText(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || /[א-ת]/.test(text)) return text;
  if (!/[a-z]/.test(text) || !/^[\x20-\x7e]+$/.test(text)) return text;
  const letters = [...text].filter((ch) => /[a-z]/.test(ch));
  if (letters.length < 2) return text;
  const mapped = letters.filter((ch) => decodeShxHebrew(ch) !== ch).length;
  const decoded = decodeShxHebrew(text);
  return mapped / letters.length >= 0.6 && /[א-ת]/.test(decoded) ? decoded : text;
}

const isWall = (kind: CadKind | null) => kind === "wall-ext" || kind === "wall-int";

const OPENING = /door|window|delet|דלת|חלון|dr\d|ממ/i;
/** A bath, a toilet or a sink, by the block the office uses. */
const SANITARY_INSERT = /bath|sherotim|kiyor|kvisa|wc\d*|sink|wash|toilet|אמבט|כיור|אסלה/i;

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The block a piece was drawn from: the insert itself, or a line inside one. */
function fixtureName(piece: DxfPiece): string {
  if (piece.insert && (SANITARY_INSERT.test(piece.insert) || /san|A-SN/i.test(piece.layer))) return piece.insert;
  return piece.path.find((name) => SANITARY_INSERT.test(name)) ?? "";
}

/**
 * The flat whose App_Nom attribute is `number`, as geometry in drawing units
 * and as the room names printed inside it. Null when the drawing has no such mark.
 */
export function extractApartment(drawing: DxfDrawing, number: number): ApartmentExtract | null {
  const marks = apartmentMarks(drawing);
  const mine = marks.filter((mark) => mark.number === number);
  if (mine.length === 0) return null;
  const mark = mine[0]!;
  const unitsM = drawing.headerUnitsM && drawing.headerUnitsM > 0 ? drawing.headerUnitsM : 0.01;
  const reach = REACH_M / unitsM;
  const profile = profileFor(drawing.layers.keys());
  const pieces = flattenDxf(
    drawing,
    entitiesWithin(drawing, { centre: mark, width: reach * 2.4, height: reach * 2.4 }),
  );

  const lines: ApartmentLine[] = [];
  const rooms: ApartmentRoom[] = [];
  const openings: ApartmentOpening[] = [];
  const seenRooms = new Set<string>();
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (p: Pt) => {
    if (ownerOf(p, marks, reach)?.number !== number) return;
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  };

  for (const piece of pieces) {
    if (piece.dimension) continue;
    const kind = layerKind(profile, piece.layer);
    if (kind === "dimension") continue;
    const at = centroid(piece);
    if (!at || ownerOf(at, marks, reach)?.number !== number) continue;

    if (piece.insert && OPENING.test(piece.insert)) {
      openings.push({ name: piece.insert, x: piece.at?.x ?? at.x, y: piece.at?.y ?? at.y });
    }
    if (piece.text) {
      const text = shownText(piece.text);
      if (ROOM_WORD.test(text)) {
        const key = `${text}@${Math.round(at.x)},${Math.round(at.y)}`;
        if (!seenRooms.has(key)) {
          seenRooms.add(key);
          rooms.push({ text, x: piece.at?.x ?? at.x, y: piece.at?.y ?? at.y });
        }
      }
    }
    if (piece.strokes) continue;
    const wall = isWall(kind);
    const pushSeg = (a: Pt, b: Pt) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return;
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, wall });
      if (wall) {
        grow(a);
        grow(b);
      }
    };
    const pts = piece.pts ?? [];
    for (let i = 0; i + 1 < pts.length; i++) pushSeg(pts[i]!, pts[i + 1]!);
    for (const ring of piece.rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i++) pushSeg(ring[i]!, ring[i + 1]!);
    }
  }

  // The bathroom sits on the flat's outer wall, but the next flat's number is
  // drawn inside it, so a nearest-number split hands the bath and the toilet
  // to the neighbour and the sheet stops mid-room. A fixture against this
  // flat's own wall stays with this flat. A "מטבח" written in that room is
  // the bath: the caller marked it, and a real kitchen is the one by the sink.
  const attach = 2.4 / unitsM;
  const hop = 6 / unitsM;
  const cap = 6.5 / unitsM;
  const wallSegs = lines.filter((line) => line.wall);
  const nearWall = (p: Pt) => wallSegs.reduce((best, line) => Math.min(best, distToSeg(p, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 })), Infinity);
  const fixtures: Array<{ x: number; y: number; name: string; bath: boolean; toilet: boolean }> = [];
  for (const piece of pieces) {
    if (!piece.insert) continue;
    const name = fixtureName(piece);
    if (!name) continue;
    const at = piece.at ?? centroid(piece);
    if (!at) continue;
    fixtures.push({
      x: at.x,
      y: at.y,
      name,
      bath: /bath|אמבט/i.test(name),
      toilet: /sherotim|wc|toilet|אסלה/i.test(name),
    });
  }
  const kept: typeof fixtures = [];
  const waiting = [...fixtures];
  for (const fixture of waiting) {
    if (nearWall({ x: fixture.x, y: fixture.y }) <= attach) kept.push(fixture);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const fixture of waiting) {
      if (kept.includes(fixture)) continue;
      const fromWall = nearWall({ x: fixture.x, y: fixture.y });
      if (fromWall > cap) continue;
      if (kept.some((have) => Math.hypot(have.x - fixture.x, have.y - fixture.y) <= hop)) {
        kept.push(fixture);
        grew = true;
      }
    }
  }
  const taken = new Set(pieces.filter((piece) => {
    const at = centroid(piece);
    return at != null && ownerOf(at, marks, reach)?.number === number;
  }));
  const byFixture = (p: Pt) => kept.reduce((best, fixture) => Math.min(best, Math.hypot(p.x - fixture.x, p.y - fixture.y)), Infinity);
  for (const piece of pieces) {
    if (taken.has(piece) || piece.dimension || piece.strokes) continue;
    const kind = layerKind(profile, piece.layer);
    if (kind === "dimension") continue;
    const at = centroid(piece);
    if (!at || byFixture(at) > 2 / unitsM) continue;
    taken.add(piece);
    if (piece.text) {
      const text = shownText(piece.text);
      const asBath = /מטבח/.test(text) && kept.some((fixture) => (fixture.bath || fixture.toilet) && Math.hypot(fixture.x - at.x, fixture.y - at.y) <= 3 / unitsM);
      const label = asBath ? "אמבטיה" : text;
      if ((ROOM_WORD.test(label) || label === "אמבטיה") && !/מטבח/.test(label)) {
        const key = `${label}@${Math.round(at.x)},${Math.round(at.y)}`;
        if (!seenRooms.has(key)) {
          seenRooms.add(key);
          rooms.push({ text: label, x: piece.at?.x ?? at.x, y: piece.at?.y ?? at.y });
        }
      }
    }
    const wall = isWall(kind);
    const pts = piece.pts ?? [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, wall });
    }
  }
  for (const fixture of kept) {
    const label = fixture.bath ? "אמבטיה" : fixture.toilet ? "שירותים" : "";
    if (!label) continue;
    const key = `${label}@${Math.round(fixture.x / 80)}`;
    if (seenRooms.has(key)) continue;
    seenRooms.add(key);
    rooms.push({ text: label, x: fixture.x, y: fixture.y });
  }

  // The wall box is not the frame. A stair, a door swing or a sill runs past
  // the last wall endpoint, and clipping there is what cut the bottom off the
  // sheet. Local segments are short; a line longer than this is a site line
  // that happens to pass through the flat, and it must not set the frame.
  const local = 8 / unitsM;
  const enclose = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const line of lines) {
    if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) > local) continue;
    enclose(line.x1, line.y1);
    enclose(line.x2, line.y2);
  }
  for (const room of rooms) enclose(room.x, room.y);
  for (const opening of openings) enclose(opening.x, opening.y);

  if (!Number.isFinite(x0)) {
    x0 = mark.x - reach * 0.25;
    y0 = mark.y - reach * 0.25;
    x1 = mark.x + reach * 0.25;
    y1 = mark.y + reach * 0.25;
  }
  const pad = 0.4 / unitsM;
  const bounds = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  const numbersInFile = [...new Set(marks.map((m) => m.number))].sort((a, b) => a - b);
  return {
    number,
    unitsM,
    mark: { x: mark.x, y: mark.y },
    bounds,
    widthM: (bounds.x1 - bounds.x0) * unitsM,
    depthM: (bounds.y1 - bounds.y0) * unitsM,
    rooms,
    openings,
    lines,
    numbersInFile,
    counts: {
      walls: lines.filter((line) => line.wall).length,
      lines: lines.length,
      rooms: rooms.length,
      openings: openings.length,
    },
  };
}

/** The extract as a plan drawing: walls heavy, other lines light, room names where they stand. */
export function apartmentSvg(plan: ApartmentExtract): string {
  const { bounds } = plan;
  const w = Math.max(bounds.x1 - bounds.x0, 1);
  const h = Math.max(bounds.y1 - bounds.y0, 1);
  const pad = Math.max(w, h) * 0.03;
  const sx = (x: number) => x - bounds.x0 + pad;
  const sy = (y: number) => bounds.y1 - y + pad;
  const esc = (value: string) =>
    value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
  const clipped = plan.lines
    .map((line) => clipLine(line, bounds))
    .filter((line): line is ApartmentLine => line != null);
  const body = clipped
    .map((line) => {
      const stroke = line.wall ? "#1c1915" : "#8a8175";
      const width = line.wall ? Math.max(w, h) * 0.004 : Math.max(w, h) * 0.0015;
      return `<line x1="${sx(line.x1).toFixed(1)}" y1="${sy(line.y1).toFixed(1)}" x2="${sx(line.x2).toFixed(1)}" y2="${sy(line.y2).toFixed(1)}" stroke="${stroke}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>`;
    })
    .join("");
  const labels = plan.rooms
    .map((room) => {
      const size = Math.max(w, h) * 0.028;
      return `<text x="${sx(room.x).toFixed(1)}" y="${sy(room.y).toFixed(1)}" font-family="Arial,sans-serif" font-size="${size.toFixed(1)}" fill="#3d342c" text-anchor="middle" direction="rtl">${esc(room.text)}</text>`;
    })
    .join("");
  const widthPx = 1400;
  const heightPx = Math.max(200, Math.round((widthPx * (h + pad * 2)) / (w + pad * 2)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${(w + pad * 2).toFixed(1)} ${(h + pad * 2).toFixed(1)}"><rect width="100%" height="100%" fill="#f7f3ec"/>${body}${labels}</svg>`;
}

/** Cohen–Sutherland clip of a segment to the flat's box. A line that misses the box is dropped. */
function clipLine(line: ApartmentLine, box: ApartmentExtract["bounds"]): ApartmentLine | null {
  const LEFT = 1;
  const RIGHT = 2;
  const BOTTOM = 4;
  const TOP = 8;
  const code = (x: number, y: number) =>
    (x < box.x0 ? LEFT : 0) | (x > box.x1 ? RIGHT : 0) | (y < box.y0 ? BOTTOM : 0) | (y > box.y1 ? TOP : 0);
  let x1 = line.x1;
  let y1 = line.y1;
  let x2 = line.x2;
  let y2 = line.y2;
  let c1 = code(x1, y1);
  let c2 = code(x2, y2);
  for (let i = 0; i < 8; i++) {
    if ((c1 | c2) === 0) return { ...line, x1, y1, x2, y2 };
    if ((c1 & c2) !== 0) return null;
    const c = c1 || c2;
    let x = 0;
    let y = 0;
    if (c & TOP) {
      x = x1 + ((x2 - x1) * (box.y1 - y1)) / (y2 - y1);
      y = box.y1;
    } else if (c & BOTTOM) {
      x = x1 + ((x2 - x1) * (box.y0 - y1)) / (y2 - y1);
      y = box.y0;
    } else if (c & RIGHT) {
      y = y1 + ((y2 - y1) * (box.x1 - x1)) / (x2 - x1);
      x = box.x1;
    } else {
      y = y1 + ((y2 - y1) * (box.x0 - x1)) / (x2 - x1);
      x = box.x0;
    }
    if (c === c1) {
      x1 = x;
      y1 = y;
      c1 = code(x1, y1);
    } else {
      x2 = x;
      y2 = y;
      c2 = code(x2, y2);
    }
  }
  return { ...line, x1, y1, x2, y2 };
}
