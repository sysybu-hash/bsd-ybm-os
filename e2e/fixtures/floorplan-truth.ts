import fs from "node:fs";
import path from "node:path";
import type { PrintedUnitTruth } from "@/lib/projects/floorplan-booklet-rooms";

/**
 * What the ten survey sheets actually print, counted by hand.
 *
 * Test data only. Production used to look flats up in this table by unit
 * number, which made the pipeline look right on exactly the sheets it was tuned
 * on and told a new customer's flat nothing. The app now reads the program off
 * the sheet; the tests hand this in where they need a known answer.
 */
type KnownSheet = {
  file?: string;
  grossM2?: number;
  levelM?: number;
  bedrooms?: number;
  mmd?: number;
  bathrooms?: number;
  terraces?: Array<{ m2: number; levelM?: number }>;
};

const sheets: KnownSheet[] = (
  JSON.parse(fs.readFileSync(path.join(__dirname, "floorplan-truth.json"), "utf8")) as {
    plans?: KnownSheet[];
  }
).plans ?? [];

function toTruth(plan: KnownSheet): PrintedUnitTruth {
  return {
    grossM2: plan.grossM2 ?? 0,
    bedrooms: plan.bedrooms ?? 0,
    mmd: plan.mmd ?? 0,
    bathrooms: plan.bathrooms ?? 0,
    ...(typeof plan.levelM === "number" ? { levelM: plan.levelM } : {}),
    terraces: (plan.terraces ?? []).map((row) => ({
      m2: row.m2,
      ...(typeof row.levelM === "number" ? { levelM: row.levelM } : {}),
    })),
  };
}

/**
 * The hand count for a unit. The unit label wins: 19 and 23 both print 57 m²,
 * 18 and 22 both print 59.01, and matching on area alone cross-wires them.
 */
export function knownSheetTruth(unitLabel?: string, grossM2?: number): PrintedUnitTruth | undefined {
  const digits = unitLabel?.match(/(?:דירה\s*)?(\d{1,4})\b/u)?.[1];
  const unitRe = digits ? new RegExp(`דירה\\s*${digits}(?!\\d)`, "u") : null;
  const plans = sheets.filter(
    (plan) => plan.grossM2 != null && plan.bedrooms != null && plan.bathrooms != null,
  );
  if (unitRe) {
    const hit = plans.find((plan) => unitRe.test(plan.file ?? ""));
    if (hit) return toTruth(hit);
  }
  if (grossM2 == null) return undefined;
  const areaHits = plans.filter((plan) => Math.abs((plan.grossM2 ?? 0) - grossM2) < 0.05);
  return areaHits.length === 1 ? toTruth(areaHits[0]!) : undefined;
}
