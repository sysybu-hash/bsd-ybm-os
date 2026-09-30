import { readDwfFloor } from "@/lib/projects/dwf-floor";
import { flatFromDwfFloor, type DwfFlat } from "@/lib/projects/dwf-flat";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import { levelMarks } from "@/lib/projects/floor-split";
import { geometryFromW2d, geometryFromDwf, sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
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

type FloorSheet = { sheet: DwfGeometry; units: number[]; levelM: number };

export function readDwfStrip(bytes: Buffer): DwfGeometry | null {
  return geometryFromW2d(bytes) ?? geometryFromDwf(bytes);
}

function floorSheets(strip: DwfGeometry): FloorSheet[] {
  return splitStrip(strip)
    .filter((s) => s.kind === "floor" && s.units.length > 0)
    .map((s) => {
      const sheet = sheetGeometry(strip, s.box);
      const marks = levelMarks(sheet.texts)
        .map((l) => l.value)
        .sort((a, b) => a - b);
      return { sheet, units: s.units, levelM: marks[marks.length >> 1] ?? 0 };
    })
    .sort((a, b) => a.levelM - b.levelM);
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
    units: unitMarks(chosen.sheet.texts),
  });
  const built = flatFromDwfFloor(floor, chosen.sheet, unit, readDwfTerraces(floor, chosen.sheet));
  return built ? { ...built, sheet: chosen.sheet } : null;
}
