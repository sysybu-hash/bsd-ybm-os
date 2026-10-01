import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import { elevationFrame } from "@/lib/projects/building/elevation-frame";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { textLines } from "@/lib/projects/floor-split";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { splitStrip } from "@/lib/projects/sheet-split";

/**
 * The facade in the materials its elevations call for.
 *
 * An elevation names its materials in words — "אבן כהה", "אבן גוון 2",
 * "גוון טיח 1" — each written inside the part it names, and draws each part in
 * its own hatch: stone in courses with the joints between stones, or courses
 * alone, or nothing. So the hatch round each name says which hatch is which
 * material on this set, and every wall of the facade, laid onto its
 * elevation, takes the material its hatch is.
 */
type Hatch = "bond" | "courses" | "plain";
export type Face = { title: string; normal: { x: number; z: number }; /** +1 where the page's right is the model's +x or +z. */ sign: 1 | -1; alongX: boolean };

const FACES: Face[] = [
  { title: "חזית דרומית", normal: { x: 0, z: 1 }, sign: 1, alongX: true },
  { title: "חזית צפונית", normal: { x: 0, z: -1 }, sign: -1, alongX: true },
  { title: "חזית מזרחית", normal: { x: 1, z: 0 }, sign: -1, alongX: false },
  { title: "חזית מערבית", normal: { x: -1, z: 0 }, sign: 1, alongX: false },
];

const MATERIAL_WORDS: Array<[RegExp, BuildingMaterial]> = [
  [/אבן\s*כהה/, "stoneDeep"],
  [/אבן\s*(גוון|בהיר)/, "stone"],
  [/טיח/, "render"],
];

export type Sheet = { g: DwfGeometry; zeroY: number; centreX: number; hor: Array<[number, number, number]>; ver: Array<[number, number, number]> };

/** The hatch round a point of a sheet: joints between stones, courses only, or none. */
function hatchAt(sheet: Sheet, x: number, y: number): Hatch {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const hx = 0.6 * upm;
  const hy = 0.45 * upm;
  let courses = 0;
  let joints = 0;
  for (const [at, a, b] of sheet.hor) if (Math.abs(at - y) <= hy && b >= x - hx && a <= x + hx) courses++;
  for (const [at, a, b] of sheet.ver) if (Math.abs(at - x) <= hx && b >= y - hy && a <= y + hy) joints++;
  if (joints >= 6 && courses >= 3) return "bond";
  if (courses >= 3) return "courses";
  return "plain";
}

export function paintFacades(prims: Primitive[], floors: Array<{ id: string; outline: Outline }>, strip: DwfGeometry, centre: { x: number; z: number }): { painted: number; key: Partial<Record<Hatch, BuildingMaterial>> } {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const drawn = splitStrip(strip);
  const sheets = new Map<Face, Sheet>();
  const votes = new Map<Hatch, Map<BuildingMaterial, number>>();
  for (const face of FACES) {
    const found = drawn.find((d) => d.kind === "elevation" && (d.title ?? "").includes(face.title));
    if (!found) continue;
    const g = sheetGeometry(strip, found.box);
    const frame = elevationFrame(g);
    if (!frame) continue;
    const short = 0.6 * upm;
    const sheet: Sheet = {
      g,
      zeroY: frame.zeroY,
      centreX: frame.centreX,
      hor: g.segments.filter((s) => Math.abs(s.y2 - s.y1) < 0.01 * upm && Math.abs(s.x2 - s.x1) > 0.15 * upm).map((s) => [(s.y1 + s.y2) / 2, Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]),
      ver: g.segments
        .filter((s) => Math.abs(s.x2 - s.x1) < 0.01 * upm && Math.abs(s.y2 - s.y1) > 0.03 * upm && Math.abs(s.y2 - s.y1) < short)
        .map((s) => [(s.x1 + s.x2) / 2, Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]),
    };
    sheets.set(face, sheet);
    // Each name votes for the hatch it is written in.
    for (const line of textLines(g.texts)) {
      const word = MATERIAL_WORDS.find(([re]) => re.test(line.text));
      if (!word) continue;
      const hatch = hatchAt(sheet, line.x, line.y);
      const tally = votes.get(hatch) ?? new Map<BuildingMaterial, number>();
      tally.set(word[1], (tally.get(word[1]) ?? 0) + 1);
      votes.set(hatch, tally);
    }
  }
  const key: Partial<Record<Hatch, BuildingMaterial>> = {};
  for (const [hatch, tally] of votes) {
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    if (best) key[hatch] = best[0];
  }
  if (Object.keys(key).length === 0) return { painted: 0, key };

  const outlineOf = new Map(floors.map((f) => [f.id, f.outline]));
  let painted = 0;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i]!;
    if (p.type !== "box" || p.material !== "stone") continue;
    const tag = p.tag ?? "";
    if (/:(surround|sill)$/.test(tag)) continue;
    const outline = outlineOf.get(tag.split(":")[0]!);
    if (!outline) continue;
    // Which face it is on: the side of it the outline is not.
    const alongX = p.size.x >= p.size.z;
    const t = (alongX ? p.size.z : p.size.x) / 2 + 0.25;
    const face = FACES.find((f) => f.alongX === alongX && !insidePolygon(outline, p.centre.x + f.normal.x * t, p.centre.z + f.normal.z * t) && insidePolygon(outline, p.centre.x - f.normal.x * t, p.centre.z - f.normal.z * t));
    const sheet = face ? sheets.get(face) : undefined;
    if (!face || !sheet) continue;
    // Laid on its elevation: across by the building's middle, up by ±0.00.
    const along = alongX ? p.centre.x - centre.x : p.centre.z - centre.z;
    const span = (alongX ? p.size.x : p.size.z) / 2;
    const counts = new Map<Hatch, number>();
    for (const du of [-0.3, 0, 0.3]) {
      for (const dv of [-0.25, 0.25]) {
        const x = sheet.centreX + face.sign * (along + du * span * 2) * upm;
        const y = sheet.zeroY - (p.centre.y + dv * p.size.y) * upm;
        const h = hatchAt(sheet, x, y);
        counts.set(h, (counts.get(h) ?? 0) + 1);
      }
    }
    const hatch = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
    const material = key[hatch];
    if (material && material !== p.material) {
      prims[i] = { ...p, material };
      painted++;
    }
  }
  return { painted, key };
}

/** The elevations of a strip, each laid out for reading: where ±0.00 runs, the building's middle, its strokes. */
export function readElevations(strip: DwfGeometry): Map<string, { face: Face; sheet: Sheet }> {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const drawn = splitStrip(strip);
  const out = new Map<string, { face: Face; sheet: Sheet }>();
  for (const face of FACES) {
    const found = drawn.find((d) => d.kind === "elevation" && (d.title ?? "").includes(face.title));
    if (!found) continue;
    const g = sheetGeometry(strip, found.box);
    const frame = elevationFrame(g);
    if (!frame) continue;
    out.set(face.title, {
      face,
      sheet: {
        g,
        zeroY: frame.zeroY,
        centreX: frame.centreX,
        hor: g.segments.filter((s) => Math.abs(s.y2 - s.y1) < 0.01 * upm && Math.abs(s.x2 - s.x1) > 0.15 * upm).map((s) => [(s.y1 + s.y2) / 2, Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]),
        ver: [],
      },
    });
  }
  return out;
}

/**
 * A window's sill and head, as its elevation draws them, above its floor.
 *
 * A window is drawn as a frame exactly its own width, and the stone courses
 * stop at its sides: so the horizontal strokes lying wholly within its width
 * are its frame, the lowest its sill and the highest its head. `at` is the
 * opening in the building's frame; `outward` the way its face looks.
 */
export function windowHeights(
  elevations: Map<string, { face: Face; sheet: Sheet }>,
  at: { orientation: "h" | "v"; x: number; y: number; w: number; h: number; outward: 1 | -1 },
  level: number,
  storey: number,
  centre: { x: number; z: number },
): { sill: number; head: number } | null {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const title = at.orientation === "h" ? (at.outward > 0 ? "חזית דרומית" : "חזית צפונית") : at.outward > 0 ? "חזית מזרחית" : "חזית מערבית";
  const e = elevations.get(title);
  if (!e) return null;
  const { face, sheet } = e;
  const a0 = at.orientation === "h" ? at.x - centre.x : at.y - centre.z;
  const a1 = at.orientation === "h" ? at.x + at.w - centre.x : at.y + at.h - centre.z;
  const p0 = sheet.centreX + face.sign * a0 * upm;
  const p1 = sheet.centreX + face.sign * a1 * upm;
  const left = Math.min(p0, p1);
  const right = Math.max(p0, p1);
  const slack = 0.25 * upm;
  const top = sheet.zeroY - (level + storey) * upm;
  const bottom = sheet.zeroY - level * upm;
  const ys = sheet.hor
    .filter(([y, a, b]) => y > top && y < bottom && a >= left - slack && b <= right + slack && b - a >= 0.6 * (right - left))
    .map(([y]) => y);
  if (ys.length < 2) return null;
  const sill = (sheet.zeroY - Math.max(...ys)) / upm - level;
  const head = (sheet.zeroY - Math.min(...ys)) / upm - level;
  if (head - sill < 0.5 || sill < -0.1 || head > storey + 0.1) return null;
  return { sill: Math.max(0, sill), head };
}
