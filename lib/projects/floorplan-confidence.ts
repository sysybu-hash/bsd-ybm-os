import type { FidelityReport } from "@/lib/projects/floorplan-fidelity";
import { fidelityFailures } from "@/lib/projects/floorplan-fidelity";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { TINT_LIMIT } from "@/lib/projects/floorplan-tint";

/**
 * Whether this run is fit to sell.
 *
 * The pipeline is about to be pointed at whatever file someone uploads, and
 * every threshold in it was tuned on one sheet. The difference between a tool
 * and a product is that a product knows when it has failed: a flat it could not
 * read has to be flagged, not quietly rendered and invoiced at 200₪.
 *
 * Hard checks stop the booklet. Soft ones are printed and shipped, because they
 * describe a result that is worth less than a perfect one and still worth more
 * than nothing. Where a check lands was set on the ten reference sheets
 * (`npm run floorplan:bench`), not by taste: a limit that fails a sheet whose
 * rooms are right is measuring the instrument, not the flat.
 *
 * The tier is stated rather than implied. A booklet grown from a scan has no
 * geometric guarantee behind it and must not be sold as though it had.
 */
export type ConfidenceTier = "cad" | "raster";

export type ConfidenceReport = {
  tier: ConfidenceTier;
  /** Nothing here means it can go out. */
  hard: string[];
  soft: string[];
  ok: boolean;
};

/** A single bed is 200 cm. Well outside this and the scale is not a scale. */
const BED_CM = { min: 170, max: 235 };

/**
 * Area error, in percent, past which a plate is noted (soft) or refused (hard).
 * On the reference sheets a correct CAD plate lands anywhere within ±3.8%
 * (דירה 21, every room right), so a 1% limit refused sheets that were fine.
 * A raster estimate keeps the looser limits it always had.
 */
const AREA_ERROR_PCT = {
  cad: { soft: 2, hard: 5 },
  raster: { soft: 4, hard: 8 },
} as const;

/**
 * Share of drawn furniture that may go unseen before the frame is refused.
 * The block detector misses up to 17.6% of the blocks when it compares a plate
 * with itself (דירה 14: 6 of 34), so "any block missing" can never pass.
 */
const FIDELITY_MISSING_HARD = 0.2;

export function assessFloorplanRun(input: {
  tier?: ConfidenceTier;
  /** floorM2 / printedAreaM2 - 1, as buildFlatFromPdf reports it. */
  areaError: number;
  unitsPerMetre: number;
  wallCount: number;
  furniture: FurniturePiece[];
  rooms: SegmentedRoom[];
  fidelity?: FidelityReport;
  coolTint?: number;
  /** How many terraces the sheet prints an area for, when that is known. */
  printedTerraces?: number;
  foundTerraces?: number;
  /**
   * What the auditor disqualified the frame for, if anything.
   *
   * These are the defects that make a still unusable however good the geometry
   * behind it — a screen or a double bed in a haredi still, a mirrored or
   * turned plan. The gate was letting a frame through that the grader had
   * already scored 108 for carrying a screen, because it was only looking at
   * its own measurements.
   */
  auditHardFailures?: string[];
}): ConfidenceReport {
  const hard: string[] = [];
  const soft: string[] = [];
  const tier = input.tier ?? "cad";

  if (!Number.isFinite(input.unitsPerMetre) || input.unitsPerMetre <= 0) {
    hard.push("קנה המידה אינו תקין — אי אפשר לאמת מידות");
  }
  if (!Number.isFinite(input.areaError)) {
    hard.push("שגיאת השטח אינה ניתנת לחישוב — אין לאשר מידות");
  }

  // The area is the target the scale was locked against; missing it by a lot
  // means no scale reproduced the sheet.
  const areaPct = Math.abs(input.areaError) * 100;
  const areaLimit = AREA_ERROR_PCT[tier];
  if (areaPct > areaLimit.hard) {
    hard.push(`שגיאת שטח ${areaPct.toFixed(1)}% — קנה המידה לא משחזר את התוכנית`);
  } else if (areaPct > areaLimit.soft) {
    soft.push(`שגיאת שטח ${areaPct.toFixed(1)}%`);
  }

  if (!Number.isFinite(input.wallCount) || input.wallCount < 0) {
    hard.push("מספר הקירות שחושב אינו תקין");
  } else if (input.wallCount < 8) {
    hard.push(`רק ${input.wallCount} קירות זוהו — לא מספיק לדירה`);
  }

  // A bed checks the scale from outside the area, which is the only other thing
  // the lock has to go on.
  const beds = input.furniture.filter((piece) => piece.kind === "bed");
  if (beds.length > 0) {
    if (beds.some((bed) => !Number.isFinite(bed.widthCm) || !Number.isFinite(bed.depthCm))) {
      hard.push("מידות מיטה לא תקינות — קנה המידה לא ניתן לאימות");
    }
    const lengths = beds
      .map((bed) => Math.max(bed.widthCm, bed.depthCm))
      .sort((a, b) => a - b);
    const median = lengths[lengths.length >> 1]!;
    if (Number.isFinite(median) && (median < BED_CM.min || median > BED_CM.max)) {
      hard.push(
        `מיטה יוצאת ${median.toFixed(0)} ס"מ — קנה המידה שגוי (מיטת יחיד היא 200)`,
      );
    }
  }

  const bedrooms = input.rooms.filter(
    (room) => room.kind === "bedroom" || room.kind === "mmd",
  ).length;
  const bathrooms = input.rooms.filter((room) => room.kind === "bathroom").length;
  const merged = input.rooms.filter((room) => room.mergedKinds).length;
  if (input.rooms.length === 0) hard.push("לא זוהו חדרים כלל");
  else {
    if (bedrooms === 0) hard.push("לא זוהה אף חדר שינה");
    if (bathrooms === 0 && merged === 0) hard.push("לא זוהה חדר רחצה");
    if (merged > 0) {
      hard.push(`${merged} חדרים לא הופרדו זה מזה (מיטה וכלי סניטרי באותו חלל)`);
    }
  }

  if (!input.fidelity && input.furniture.length > 0) {
    hard.push("לא נמדדה נאמנות הריהוט בתמונה");
  } else if (input.fidelity) {
    if (
      !Number.isFinite(input.fidelity.total) ||
      !Number.isFinite(input.fidelity.present) ||
      input.fidelity.total < 0 ||
      input.fidelity.present < 0 ||
      input.fidelity.present > input.fidelity.total
    ) {
      hard.push("מדידת נאמנות הריהוט אינה תקינה");
    } else if (input.fidelity.total === 0 && input.furniture.length > 0) {
      hard.push("לא ניתן לאמת את שימור הריהוט בתמונה");
    } else if (input.fidelity.total > 0) {
      const missing = input.fidelity.total - input.fidelity.present;
      if (missing / input.fidelity.total > FIDELITY_MISSING_HARD) {
        hard.push(`${missing} מתוך ${input.fidelity.total} פריטי ריהוט חסרים בתמונה`);
      } else {
        soft.push(...fidelityFailures(input.fidelity));
      }
    }
  }

  for (const failure of input.auditHardFailures ?? []) {
    hard.push(failure);
  }

  if (input.coolTint != null) {
    if (!Number.isFinite(input.coolTint) || input.coolTint < 0 || input.coolTint > 1) {
      hard.push("מדידת צבע הקידוד אינה תקינה");
    } else if (input.coolTint > TINT_LIMIT) {
      hard.push(`צבע קידוד נשאר ב-${(input.coolTint * 100).toFixed(1)}% מהתמונה`);
    }
  }

  // A terrace count is a note, not a verdict: the printed count includes areas
  // on other levels (דירה 21 prints one terrace and has none on its floor), and
  // whether the flat's balconies are all there is decided against the sheet's
  // programme in measuredPlateMatchesSheet.
  if (input.printedTerraces != null && input.foundTerraces != null) {
    if (
      !Number.isFinite(input.printedTerraces) ||
      !Number.isFinite(input.foundTerraces) ||
      input.printedTerraces < 0 ||
      input.foundTerraces < 0
    ) {
      hard.push("ספירת המרפסות אינה תקינה");
    } else if (input.foundTerraces !== input.printedTerraces) {
      soft.push(`${input.foundTerraces} מתוך ${input.printedTerraces} מרפסות זוהו`);
    }
  }

  if (tier === "raster") {
    soft.push("התוכנית אינה CAD וקטורי — הגיאומטריה משוערת ואינה מדודה");
  }

  return { tier, hard, soft, ok: hard.length === 0 };
}

/** The report as one block of Hebrew, for a console or a log. */
export function describeConfidence(report: ConfidenceReport): string {
  const lines: string[] = [];
  lines.push(
    report.ok
      ? `✓ ניתן להפיק חוברת (${report.tier === "cad" ? "נמדד מ-CAD" : "משוער מרסטר"})`
      : "✗ לא ניתן להפיק חוברת",
  );
  for (const line of report.hard) lines.push(`   חוסם: ${line}`);
  for (const line of report.soft) lines.push(`   הערה: ${line}`);
  return lines.join("\n");
}
