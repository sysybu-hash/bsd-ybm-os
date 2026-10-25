import { askDrawing, boxCentre } from "@/lib/projects/building/house-ai";
import { answerKey, type AnswerMemo } from "@/lib/projects/building/house-store";
import type { HouseSiteLevelKey, HouseSiteLevels } from "@/lib/projects/building/house-yard";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";

/**
 * The level marks of an elevation whose lettering is drawn, not written.
 *
 * A CAD font (SHX) arrives as strokes: the sheet has the mark's triangle and
 * the digits' lines but no text to read. The vision model reads each value
 * and where it stands; the sheet says whether it is so. Every value is laid
 * on the nearest level triangle drawn — the triangle's tip is the level, to
 * the hundredth of a millimetre — and the marks together must climb the page
 * at the drawing's scale, every one on the same line within 5 cm. A value
 * whose triangle is not there, or that is off that line, is dropped; fewer
 * than three left and the elevation is read as before, without marks.
 */
export type LevelKind = "floor" | "opening" | "roof" | "top" | "ground" | "parking" | "street" | "fence" | "other";
const KINDS: LevelKind[] = ["floor", "opening", "roof", "top", "ground", "parking", "street", "fence", "other"];

export type LevelReading = { text: string; at: { x: number; y: number }; kind: LevelKind };

export type LevelMark = { x: number; y: number; rel: number; abs: number | null; kind: LevelKind; text: string };

export type ElevationLevels = {
  ok: boolean;
  /** Why the reading was not used, when it was not. */
  why?: string;
  marks: LevelMark[];
  /** The absolute level of ±0.00, where the marks print one. */
  datum: number | null;
  /** Where ±0.00 runs on the page, and page units a metre, as the marks fit them. */
  zeroY: number;
  scale: number;
  rejected: Array<{ text: string; why: string }>;
};

export type Side = "north" | "south" | "east" | "west";

/** A level triangle drawn on a sheet: its tip, and how wide it is. */
export type LevelSymbol = { x: number; y: number; width: number };

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN;
};

/**
 * Every level triangle on a sheet: two strokes falling 18–38° from the ends
 * of a level line to a common tip under its middle.
 */
export function levelSymbols(g: DwfGeometry, upm = DWF_FLOOR_UNITS_PER_METRE): LevelSymbol[] {
  const tol = 0.012 * upm;
  type Leg = { tipX: number; tipY: number; topX: number; topY: number };
  const legs: Leg[] = [];
  for (const s of g.segments) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.08 * upm || len > 0.8 * upm) continue;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angle < 18 || angle > 38) continue;
    // The tip is the lower end: page y grows down.
    legs.push(s.y1 > s.y2 ? { tipX: s.x1, tipY: s.y1, topX: s.x2, topY: s.y2 } : { tipX: s.x2, tipY: s.y2, topX: s.x1, topY: s.y1 });
  }
  const flats = g.segments.filter((s) => Math.abs(s.y2 - s.y1) < tol && Math.abs(s.x2 - s.x1) > 0.1 * upm);
  const out: LevelSymbol[] = [];
  const rights = new Map<number, Leg[]>();
  for (const leg of legs) {
    if (leg.topX <= leg.tipX) continue;
    const key = Math.round(leg.tipY / tol);
    rights.set(key, [...(rights.get(key) ?? []), leg]);
  }
  for (const a of legs) {
    if (a.topX >= a.tipX) continue;
    const key = Math.round(a.tipY / tol);
    for (const b of [key - 1, key, key + 1].flatMap((k) => rights.get(k) ?? [])) {
      if (Math.abs(b.tipY - a.tipY) > tol || Math.abs(b.tipX - a.tipX) > tol || Math.abs(b.topY - a.topY) > tol) continue;
      const left = a.tipX - a.topX;
      const right = b.topX - b.tipX;
      if (Math.abs(left - right) > 0.25 * Math.max(left, right)) continue;
      const topY = (a.topY + b.topY) / 2;
      const lidded = flats.some((f) => Math.abs((f.y1 + f.y2) / 2 - topY) < tol && Math.min(f.x1, f.x2) <= a.topX + tol * 4 && Math.max(f.x1, f.x2) >= b.topX - tol * 4);
      if (!lidded) continue;
      out.push({ x: (a.tipX + b.tipX) / 2, y: (a.tipY + b.tipY) / 2, width: b.topX - a.topX });
    }
  }
  // A triangle drawn twice is one.
  return out.filter((s, k) => !out.slice(0, k).some((t) => Math.hypot(t.x - s.x, t.y - s.y) < tol));
}

/** A printed level — "+5.07", "-0.70", "±0.00=160.70", "158.63" — as metres from ±0.00 and above the sea. */
export function parseLevelText(text: string): { rel: number | null; abs: number | null } | null {
  const t = text.replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/,/g, ".");
  const both = /^([+\-±])?(\d{1,2}\.\d{2})=(\d{3}\.\d{1,2})$/.exec(t);
  if (both) return { rel: (both[1] === "-" ? -1 : 1) * Number(both[2]), abs: Number(both[3]) };
  const rel = /^([+\-±])(\d{1,2}\.\d{2})$/.exec(t);
  if (rel) return { rel: (rel[1] === "-" ? -1 : 1) * Number(rel[2]), abs: null };
  const abs = /^(\d{3}\.\d{1,2})$/.exec(t);
  if (abs) return { rel: null, abs: Number(abs[1]) };
  return null;
}

/** The marks a vision model read, checked against the triangles the sheet draws. */
export function verifyLevelReading(g: DwfGeometry, reading: LevelReading[], upm = DWF_FLOOR_UNITS_PER_METRE): ElevationLevels {
  const rejected: Array<{ text: string; why: string }> = [];
  const parsed: Array<LevelReading & { rel: number | null; abs: number | null }> = [];
  for (const r of reading) {
    const p = parseLevelText(r.text);
    if (!p) rejected.push({ text: r.text, why: "not a level" });
    else parsed.push({ ...r, ...p });
  }
  // ±0.00's absolute level: what every mark that prints both says it is.
  const offsets = parsed.filter((p) => p.rel != null && p.abs != null).map((p) => p.abs! - p.rel!);
  const datum = offsets.length ? Math.round(median(offsets) * 100) / 100 : null;
  const placed: Array<LevelReading & { rel: number; abs: number | null }> = [];
  for (const p of parsed) {
    if (p.rel != null && p.abs != null && datum != null && Math.abs(p.abs - p.rel - datum) > 0.015) rejected.push({ text: p.text, why: `its two values put ±0.00 at ${(p.abs - p.rel).toFixed(2)}, the sheet's is ${datum.toFixed(2)}` });
    else if (p.rel != null) placed.push({ ...p, rel: p.rel, abs: p.abs });
    else if (datum != null) placed.push({ ...p, rel: Math.round((p.abs! - datum) * 100) / 100, abs: p.abs });
    else rejected.push({ text: p.text, why: "absolute only, and no mark prints ±0.00's level" });
  }
  // The triangles near where each value was read. At the sheet's 1:100 each
  // (value, triangle) votes for where ±0.00 runs; the line most values have a
  // triangle on, within 5 cm, is the drawing's.
  const symbols = levelSymbols(g, upm);
  const tol = 0.05 * upm;
  const near = placed.map((p) =>
    symbols
      .map((s, k) => ({ k, d: Math.hypot(s.x - p.at.x, s.y - s.width * 0.15 - p.at.y), zero: s.y + upm * p.rel }))
      .filter(({ k }) => Math.abs(symbols[k]!.x - p.at.x) <= 1.0 * upm && Math.abs(symbols[k]!.y - symbols[k]!.width * 0.15 - p.at.y) <= 0.6 * upm),
  );
  let vote = NaN;
  let best = 0;
  for (const z of near.flat().map((c) => c.zero)) {
    const n = near.filter((cs) => cs.some((c) => Math.abs(c.zero - z) <= tol)).length;
    if (n > best) [vote, best] = [z, n];
  }
  // Each value on its own triangle on that line, the nearest to where it was read.
  const pairs = near.flatMap((cs, i) => cs.filter((c) => Math.abs(c.zero - vote) <= tol).map((c) => ({ i, ...c }))).sort((a, b) => a.d - b.d);
  const takenMark = new Set<number>();
  const takenSymbol = new Set<number>();
  let marks: LevelMark[] = [];
  for (const { i, k } of pairs) {
    if (takenMark.has(i) || takenSymbol.has(k)) continue;
    takenMark.add(i);
    takenSymbol.add(k);
    const p = placed[i]!;
    marks.push({ x: symbols[k]!.x, y: symbols[k]!.y, rel: p.rel, abs: p.abs, kind: p.kind, text: p.text });
  }
  placed.forEach((p, i) => {
    if (takenMark.has(i)) return;
    rejected.push({ text: p.text, why: near[i]!.length ? "no level triangle at its height near where it was read" : "no level triangle drawn where it was read" });
  });

  const fit = (ms: LevelMark[]) => {
    const n = ms.length;
    const mx = ms.reduce((s, m) => s + m.rel, 0) / n;
    const my = ms.reduce((s, m) => s + m.y, 0) / n;
    const sxx = ms.reduce((s, m) => s + (m.rel - mx) ** 2, 0);
    const sxy = ms.reduce((s, m) => s + (m.rel - mx) * (m.y - my), 0);
    const slope = sxx > 0 ? sxy / sxx : 0;
    return { zeroY: my - slope * mx, scale: -slope };
  };
  let line = { zeroY: 0, scale: 0 };
  while (marks.length >= 3) {
    line = fit(marks);
    const off = marks.map((m) => Math.abs(m.y - (line.zeroY - line.scale * m.rel)));
    const worst = off.indexOf(Math.max(...off));
    if (off[worst]! <= 0.05 * upm) break;
    rejected.push({ text: marks[worst]!.text, why: `${(off[worst]! / upm).toFixed(2)} m off the line the other marks make` });
    marks = marks.filter((_, k) => k !== worst);
  }
  const base = { marks, datum, zeroY: line.zeroY, scale: line.scale, rejected };
  if (marks.length < 3) return { ...base, ok: false, why: `${marks.length} marks stand where they were read; three are needed` };
  const span = Math.max(...marks.map((m) => m.rel)) - Math.min(...marks.map((m) => m.rel));
  if (span < 1) return { ...base, ok: false, why: "the marks span under a metre" };
  if (Math.abs(line.scale / upm - 1) > 0.03) return { ...base, ok: false, why: `the marks climb at 1:${((100 * upm) / line.scale).toFixed(0)}, not the sheet's 1:100` };
  return { ...base, ok: true };
}

/**
 * An elevation's marks without reading its lettering: the levels the
 * project's sections give (`known`, metres from ±0.00) laid on the sheet's own
 * triangles. At the sheet's 1:100 each triangle and level votes for where
 * ±0.00 runs; the line the most levels have a triangle on, within 2 cm, is
 * the drawing's — at least three of them, spanning a metre or more, or null.
 */
export function knownLevels(g: DwfGeometry, known: number[], upm = DWF_FLOOR_UNITS_PER_METRE): ElevationLevels | null {
  const symbols = levelSymbols(g, upm);
  const tol = 0.02 * upm;
  let best: { zero: number; hits: Array<{ rel: number; s: LevelSymbol }> } = { zero: NaN, hits: [] };
  for (const s of symbols) {
    for (const rel of known) {
      const zero = s.y + rel * upm;
      const hits = known.flatMap((r) => {
        const at = symbols.filter((t) => Math.abs(t.y - (zero - r * upm)) <= tol).sort((p, q) => Math.abs(p.y - (zero - r * upm)) - Math.abs(q.y - (zero - r * upm)));
        return at.length ? [{ rel: r, s: at[0]! }] : [];
      });
      if (hits.length > best.hits.length) best = { zero, hits };
    }
  }
  const rels = best.hits.map((h) => h.rel);
  if (best.hits.length < 3 || Math.max(...rels) - Math.min(...rels) < 1) return null;
  const top = Math.max(...rels);
  const marks: LevelMark[] = best.hits.map(({ rel, s }) => ({ x: s.x, y: s.y, rel, abs: null, kind: rel === top ? "roof" : "floor", text: `${rel < 0 ? "-" : "+"}${Math.abs(rel).toFixed(2)}` }));
  return { ok: true, marks, datum: null, zeroY: best.zero, scale: upm, rejected: [] };
}

/**
 * The elevation with its verified marks written on it, as a sheet whose marks
 * are text writes them, so the elevation's frame and its windows are read as
 * on any other sheet. The lettering is too small to show: the sheet already
 * draws it.
 */
export function withLevelMarks(g: DwfGeometry, levels: ElevationLevels | null): DwfGeometry {
  if (!levels?.ok) return g;
  const texts: PlacedText[] = levels.marks.filter((m) => m.rel >= 0).map((m) => ({ x: m.x, y: m.y, text: `+${m.rel.toFixed(2)}`, height: 0.02 }));
  return { ...g, texts: [...g.texts, ...texts] };
}

/** The drawing's own extent, a little round it. */
export function drawingBox(g: DwfGeometry): { x: number; y: number; width: number; height: number } {
  const xs = g.segments.flatMap((s) => [s.x1, s.x2]);
  const ys = g.segments.flatMap((s) => [s.y1, s.y2]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 0.01 * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
}

const LEVELS_PROMPT = `This picture is one architectural elevation (a facade drawing of a private house in Israel, scale 1:100).
Find EVERY level mark on it. A level mark is a small downward-pointing triangle whose bottom tip touches the line it marks, with its value written just above it: "+5.07", "-0.70", "±0.00=160.70", "+1.00=161.70" (relative=absolute), or an absolute value alone such as "158.63".
For each mark return:
- "text": the value exactly as printed (sign, digits, and "=" with the absolute value when printed),
- "box_2d": [ymin, xmin, ymax, xmax] of its triangle, 0-1000 normalised to the picture,
- "kind": what it marks — "floor" (a storey's finished floor), "opening" (a window or door sill or head), "roof" (roof or parapet top), "top" (anything standing on the roof), "ground" (the plot's ground or garden), "parking" (a parking bay's surface, where a car stands), "street" (the street, sidewalk or bicycle path outside the plot), "fence" (top of a boundary wall, pillar or railing), "other".
Do not invent marks. Numbers without a triangle (dimensions such as 300, 190, 147) are not level marks.
Answer JSON only: {"marks":[{"text":"+5.07","box_2d":[0,0,0,0],"kind":"opening"}]}`;

/** The model's reading of one elevation's marks, verified; null when no model answered. */
export async function readElevationLevels(g: DwfGeometry, upm = DWF_FLOOR_UNITS_PER_METRE, memo?: AnswerMemo): Promise<{ levels: ElevationLevels; reading: LevelReading[]; image: Buffer } | null> {
  const box = drawingBox(g);
  const image = await dwfSheetJpeg(g, box, 3000);
  // The same sheet is read as before: a fresh reading moved the site, and every render with it.
  const key = answerKey(image, LEVELS_PROMPT);
  const kept = (await memo?.get(key)) as Record<string, unknown> | null | undefined;
  const answer = kept ?? (await askDrawing(LEVELS_PROMPT, [image]));
  if (answer && !kept && Array.isArray(answer.marks)) await memo?.put(key, answer);
  if (!answer || !Array.isArray(answer.marks)) return null;
  const reading: LevelReading[] = [];
  for (const raw of answer.marks as Array<Record<string, unknown>>) {
    const at = boxCentre(raw?.box_2d, box);
    if (!at || typeof raw.text !== "string") continue;
    const kind = KINDS.includes(raw.kind as LevelKind) ? (raw.kind as LevelKind) : "other";
    reading.push({ text: raw.text, at, kind });
  }
  return { levels: verifyLevelReading(g, reading, upm), reading, image };
}

/** The way the page's right runs, for a face looking `face`'s way, in the model's frame (north is −z). */
export function pageRight(face: Side): Side {
  return ({ south: "east", north: "west", west: "south", east: "north" } as const)[face];
}

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

export type ReadElevation = { face: Side; g: DwfGeometry; levels: ElevationLevels; left: number; right: number; centreX: number };

/**
 * Whether a mark's tip stands on cut land: the soil's hatch, short strokes
 * woven both ways at 45°, fills the half metre under it. A wall's section is
 * hatched one way only; a landing, or a level written over a parked car, has
 * none.
 */
export function standsOnLand(g: DwfGeometry, at: { x: number; y: number }, upm = DWF_FLOOR_UNITS_PER_METRE): boolean {
  const { rising, falling } = hatchUnder(g, at, upm);
  return Math.min(rising, falling) >= 6;
}

/**
 * Whether a mark's tip stands on a wall's section: hatched under it one way
 * only. A parking bay's mark stands on the bay — the soil's hatch, or over a
 * parked car nothing — never on a wall cut through.
 */
export function onWallSection(g: DwfGeometry, at: { x: number; y: number }, upm = DWF_FLOOR_UNITS_PER_METRE): boolean {
  const { rising, falling } = hatchUnder(g, at, upm);
  return Math.max(rising, falling) >= 6 && Math.min(rising, falling) < 3;
}

/** The 45° strokes in the half metre under a point, each way. */
function hatchUnder(g: DwfGeometry, at: { x: number; y: number }, upm: number): { rising: number; falling: number } {
  let rising = 0;
  let falling = 0;
  for (const s of [...g.segments, ...g.curves]) {
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    if (Math.abs(mx - at.x) > 0.6 * upm || my < at.y + 0.05 * upm || my > at.y + 0.6 * upm) continue;
    const [dx, dy] = [s.x2 - s.x1, s.y2 - s.y1];
    const len = Math.hypot(dx, dy);
    if (len < 0.08 * upm || len > 0.6 * upm) continue;
    const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (Math.abs(angle - 45) >= 8) continue;
    if (dx * dy < 0) rising++;
    else falling++;
  }
  return { rising, falling };
}

/**
 * The plot's levels on its west and east, from the elevations' verified marks.
 *
 * The outermost ground mark off each end of a front or back elevation is
 * that end's side — nearer ones are the bays and steps between; a side
 * elevation's ground marks are its own side. A parking mark stands for the
 * bay on its half. A ground mark whose tip is not on the drawn land is
 * dropped, whatever the model called it, and a parking mark whose tip is on
 * a wall's section — a bay's, over its car, is on none. A field no mark gives is
 * left out, for the caller's own value.
 */
export function siteLevelsFrom(elevations: ReadElevation[], upm = DWF_FLOOR_UNITS_PER_METRE): { levels: Partial<HouseSiteLevels>; marks: Partial<Record<HouseSiteLevelKey, string[]>>; dropped: string[] } {
  const ground: Record<Side, LevelMark[]> = { north: [], south: [], east: [], west: [] };
  const parking: Record<Side, LevelMark[]> = { north: [], south: [], east: [], west: [] };
  const dropped: string[] = [];
  for (const e of elevations) {
    if (!e.levels.ok) continue;
    const right = pageRight(e.face);
    const alongX = e.face === "south" || e.face === "north";
    let [leftEnd, rightEnd]: Array<LevelMark | null> = [null, null];
    for (const m of e.levels.marks) {
      if ((m.kind === "ground" && !standsOnLand(e.g, m, upm)) || (m.kind === "parking" && onWallSection(e.g, m, upm))) {
        dropped.push(`${m.text} (${m.kind}, ${e.face})`);
        continue;
      }
      if (m.kind === "ground" && m.rel > -4 && m.rel < 4) {
        if (!alongX) ground[e.face].push(m);
        else if (m.x < e.left - 0.3 * upm && (!leftEnd || m.x < leftEnd.x)) leftEnd = m;
        else if (m.x > e.right + 0.3 * upm && (!rightEnd || m.x > rightEnd.x)) rightEnd = m;
      }
      if (m.kind === "parking" && m.rel > -3 && m.rel < 3) {
        if (!alongX) parking[e.face].push(m);
        else parking[m.x < e.centreX ? OPPOSITE[right] : right].push(m);
      }
    }
    if (leftEnd) ground[OPPOSITE[right]].push(leftEnd);
    if (rightEnd) ground[right].push(rightEnd);
  }
  const levels: Partial<HouseSiteLevels> = {};
  const marks: Partial<Record<HouseSiteLevelKey, string[]>> = {};
  const set = (key: HouseSiteLevelKey, from: LevelMark[]) => {
    if (!from.length) return;
    levels[key] = Math.round(median(from.map((m) => m.rel)) * 100) / 100;
    marks[key] = from.map((m) => m.text);
  };
  set("west", ground.west);
  set("east", ground.east);
  set("parkingWest", parking.west);
  set("parkingEast", parking.east);
  return { levels, marks, dropped };
}
