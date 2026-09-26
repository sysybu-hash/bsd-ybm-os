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
 * A customer-facing measured deliverable must not silently ship mismatches.
 * Warnings remain visible for non-measured estimates, while measured geometry
 * and its furniture inventory must pass the declared acceptance limits.
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

  // CAD measurements use a tighter tolerance than calibrated raster estimates.
  const areaPct = Math.abs(input.areaError) * 100;
  const maxAreaPct = tier === "raster" ? 3 : 1;
  if (areaPct > maxAreaPct) {
    hard.push(
      `שגיאת שטח ${areaPct.toFixed(1)}% — הסף למסלול ${tier === "cad" ? "CAD" : "סריקה מכוילת"} הוא ${maxAreaPct}%`,
    );
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
      if (missing > 0) {
        hard.push(`${missing} מתוך ${input.fidelity.total} פריטי ריהוט חסרים בתמונה`);
        hard.push(...fidelityFailures(input.fidelity));
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

  if (input.printedTerraces != null || input.foundTerraces != null) {
    if (
      !Number.isFinite(input.printedTerraces) ||
      !Number.isFinite(input.foundTerraces) ||
      input.printedTerraces! < 0 ||
      input.foundTerraces! < 0 ||
      input.foundTerraces !== input.printedTerraces
    ) {
      hard.push(
        `${input.foundTerraces ?? "לא נמדדו"} מרפסות זוהו מול ${input.printedTerraces ?? "לא ידוע"} בתוכנית`,
      );
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
