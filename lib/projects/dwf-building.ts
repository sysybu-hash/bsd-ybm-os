import { printedRooms, readDwfFloor, type DwfFloor } from "@/lib/projects/dwf-floor";
import { flatFromDwfFloor, type DwfFlat } from "@/lib/projects/dwf-flat";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import { levelMarks } from "@/lib/projects/floor-split";
import { geometryFromW2d, geometryFromDwf, sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { splitStrip, unitMarks } from "@/lib/projects/sheet-split";

/**
 * A permit strip read as a building: which apartments it draws, and any one
 * of them as the flat the render pipeline builds from.
 *
 * The browser uploads the strip's W2D stream alone — the DWF around it is
 * mostly fonts, three times its size, and over what an upload may carry — so
 * this reads either: a whole DWF, or the stream.
 *
 * Floor plans on an Israeli permit set are drawn at 1:100, and the page units
 * are points: the scale is that, not a figure read off the sheet.
 */
export const DWF_FLOOR_UNITS_PER_METRE = (72 / 25.4) * 10;

export type DwfBuildingUnit = {
  unit: number;
  /** A duplex is drawn on two floor sheets; "upper" is the higher one. */
  level: "lower" | "upper" | null;
  /** The floor's level as the sheet marks it, metres. */
  levelM: number;
};

type UnitMark = { unit: number; x: number; y: number };
type FloorSheet = { sheet: DwfGeometry; units: number[]; marks: UnitMark[]; levelM: number };

export function readDwfStrip(bytes: Buffer): DwfGeometry | null {
  return geometryFromW2d(bytes) ?? geometryFromDwf(bytes);
}

function medianLevel(sheet: DwfGeometry): number {
  const marks = levelMarks(sheet.texts)
    .map((l) => l.value)
    .sort((a, b) => a - b);
  return marks[marks.length >> 1] ?? 0;
}

export function floorSheets(strip: DwfGeometry): FloorSheet[] {
  const sheets = splitStrip(strip);
  const permit = sheets
    .filter((s) => s.kind === "floor" && s.units.length > 0)
    .map((s) => {
      const sheet = sheetGeometry(strip, s.box);
      return { sheet, units: s.units, marks: unitMarks(sheet.texts), levelM: medianLevel(sheet) };
    });
  const found = permit.length > 0 ? permit : houseSheets(strip, sheets);
  return found.sort((a, b) => a.levelM - b.levelM);
}

function roomSizes(texts: DwfGeometry["texts"]): Array<{ x: number; y: number; areaM2: number }> {
  return printedRooms(texts).map((t) => ({ x: t.x, y: t.y, areaM2: t.w * t.h }));
}

/**
 * A private house's floor plan: one drawing, no apartment numbers, its room
 * names drawn in outline rather than set as text. A pair of semi-detached
 * houses is drawn mirrored about their party wall, so each house prints the
 * same room sizes. Each house is marked at its largest printed room — the
 * living room — and numbered from the right, as a Hebrew sheet reads.
 */
function houseSheets(strip: DwfGeometry, sheets: ReturnType<typeof splitStrip>): FloorSheet[] {
  const out: FloorSheet[] = [];
  for (const s of sheets) {
    if (s.kind !== "other" && s.kind !== "floor") continue;
    const sheet = sheetGeometry(strip, s.box);
    const marks = houseUnitMarks(sheet);
    if (!marks.length) continue;
    out.push({ sheet, units: marks.map((m) => m.unit), marks, levelM: medianLevel(sheet) });
  }
  return out;
}

/** A house plan's houses, each marked at its largest printed room and numbered from the right (houseSheets); none where it prints fewer than two sizes. */
export function houseUnitMarks(sheet: DwfGeometry): Array<{ unit: number; x: number; y: number }> {
  const sized = roomSizes(sheet.texts);
  if (sized.length < 2) return [];
  const largest = Math.max(...sized.map((t) => t.areaM2));
  const apart = DWF_FLOOR_UNITS_PER_METRE * 3;
  const living: Array<{ x: number; y: number }> = [];
  for (const t of sized.filter((t) => Math.abs(t.areaM2 - largest) < 0.01)) {
    if (living.every((o) => Math.hypot(o.x - t.x, o.y - t.y) >= apart)) living.push(t);
  }
  return living.sort((a, b) => b.x - a.x).map((t, k) => ({ unit: k + 1, x: t.x, y: t.y }));
}

/** Every apartment the strip draws, a duplex once for each of its floors. */
export function listDwfUnits(strip: DwfGeometry): DwfBuildingUnit[] {
  const sheets = floorSheets(strip);
  const out: DwfBuildingUnit[] = [];
  const seen = new Map<number, number>();
  for (const s of sheets) {
    for (const unit of s.units) {
      const count = (seen.get(unit) ?? 0) + 1;
      seen.set(unit, count);
      out.push({ unit, level: count > 1 ? "upper" : null, levelM: s.levelM });
    }
  }
  // The first of a duplex's two is its lower floor.
  for (const u of out) if (u.level === null && (seen.get(u.unit) ?? 0) > 1) u.level = "lower";
  return out.sort((a, b) => a.unit - b.unit || (a.level === "upper" ? 1 : 0) - (b.level === "upper" ? 1 : 0));
}

/** One apartment, on the floor sheet that carries it. */
export function dwfFlatForUnit(
  strip: DwfGeometry,
  unit: number,
  level: "lower" | "upper" | null = null,
): (DwfFlat & { sheet: DwfGeometry }) | null {
  const candidates = floorSheets(strip).filter((s) => s.units.includes(unit));
  const chosen = level === "upper" ? candidates[1] : candidates[0];
  if (!chosen) return null;
  const floor = readDwfFloor(chosen.sheet, {
    unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE,
    units: chosen.marks,
  });
  const built = flatFromDwfFloor(floor, chosen.sheet, unit, readDwfTerraces(floor, chosen.sheet));
  return built ? { ...built, sheet: chosen.sheet } : null;
}

/**
 * Several apartments, each floor sheet read once for all of its own: reading a
 * floor is the slow part, seconds a sheet, and a floor carries four flats.
 * `onFlat` is awaited before the next floor is read, so a caller with a time
 * budget can stop between floors by answering false. `roomKinds`, where
 * given, says what the rooms of a floor whose sheet names none are, by room id.
 */
export async function forEachDwfFlat(
  strip: DwfGeometry,
  wanted: Array<{ unit: number; level: "lower" | "upper" | null }>,
  onFlat: (unit: { unit: number; level: "lower" | "upper" | null }, flat: (DwfFlat & { sheet: DwfGeometry }) | null) => Promise<boolean | void>,
  options?: { roomKinds?: (sheet: DwfGeometry, floor: DwfFloor) => Promise<ReadonlyMap<number, FloorplanRoomKind> | null> },
): Promise<void> {
  const sheets = floorSheets(strip);
  const seen = new Map<number, number>();
  const plan = sheets.map((s) => ({
    s,
    units: s.units.map((unit) => {
      const count = (seen.get(unit) ?? 0) + 1;
      seen.set(unit, count);
      return { unit, nth: count };
    }),
  }));
  const levelOf = (unit: number, nth: number): "lower" | "upper" | null => ((seen.get(unit) ?? 0) > 1 ? (nth > 1 ? "upper" : "lower") : null);
  for (const { s, units } of plan) {
    const here = units.filter(({ unit, nth }) => wanted.some((w) => w.unit === unit && w.level === levelOf(unit, nth)));
    if (here.length === 0) continue;
    const floor = readDwfFloor(s.sheet, { unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, units: s.marks });
    const terraces = readDwfTerraces(floor, s.sheet);
    const read = new Set<number>();
    if (options?.roomKinds && floor.rooms.every((r) => r.names.length === 0)) {
      const kinds = await options.roomKinds(s.sheet, floor).catch(() => null);
      for (const [id, kind] of kinds ?? []) {
        const room = floor.rooms.find((r) => r.id === id);
        if (!room || room.kind != null) continue;
        room.kind = kind;
        read.add(id);
      }
    }
    let go = true;
    for (const { unit, nth } of here) {
      const built = flatFromDwfFloor(floor, s.sheet, unit, terraces, read);
      const answer = await onFlat({ unit, level: levelOf(unit, nth) }, built ? { ...built, sheet: s.sheet } : null);
      if (answer === false) go = false;
    }
    if (!go) return;
  }
}

/**
 * A private house's rooms the flat reader left to no house — a bathroom
 * behind the kitchen whose door it did not see (Gottlieb C's ground floor) —
 * given to the house whose mark is nearest, where they lie among the
 * houses' own rooms: within the box round them, and no bigger than a room.
 */
export function adoptOrphanRooms(floor: DwfFloor, marks: Array<{ unit: number; x: number; y: number }>): void {
  if (!marks.length) return;
  const owned = new Set(floor.apartments.flatMap((a) => a.rooms));
  const px = floor.cm / 100;
  const centre = new Map<number, { x: number; y: number; n: number }>();
  for (let k = 0; k < floor.room.length; k++) {
    const id = floor.room[k]!;
    if (id < 0) continue;
    const c = centre.get(id) ?? { x: 0, y: 0, n: 0 };
    c.x += (k % floor.cols) * px;
    c.y += Math.floor(k / floor.cols) * px;
    c.n++;
    centre.set(id, c);
  }
  const at = (id: number) => {
    const c = centre.get(id);
    return c ? { x: c.x / c.n, y: c.y / c.n } : null;
  };
  // The box round the houses' own rooms, pixel by pixel.
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let k = 0; k < floor.room.length; k++) {
    if (!owned.has(floor.room[k]!)) continue;
    const [x, y] = [(k % floor.cols) * px, Math.floor(k / floor.cols) * px];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return;
  for (const room of floor.rooms) {
    if (owned.has(room.id) || room.areaM2 < 1 || room.areaM2 > 20) continue;
    const c = at(room.id);
    if (!c || c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
    const mark = marks.reduce((best, m) => (Math.hypot(m.x / DWF_FLOOR_UNITS_PER_METRE - c.x, m.y / DWF_FLOOR_UNITS_PER_METRE - c.y) < Math.hypot(best.x / DWF_FLOOR_UNITS_PER_METRE - c.x, best.y / DWF_FLOOR_UNITS_PER_METRE - c.y) ? m : best));
    floor.apartments.find((a) => a.unit === mark.unit)?.rooms.push(room.id);
  }
}
