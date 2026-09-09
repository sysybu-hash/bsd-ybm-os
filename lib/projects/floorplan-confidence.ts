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
 * than nothing.
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
}): ConfidenceReport {
  const hard: string[] = [];
  const soft: string[] = [];
  const tier = input.tier ?? "cad";

  // The area is the target the scale was locked against; missing it by a lot
  // means no scale reproduced the sheet.
  const areaPct = Math.abs(input.areaError) * 100;
  if (areaPct > 8) hard.push(`שגיאת שטח ${areaPct.toFixed(1)}% — קנה המידה לא משחזר את התוכנית`);
  else if (areaPct > 4) soft.push(`שגיאת שטח ${areaPct.toFixed(1)}%`);

  if (input.wallCount < 8) {
    hard.push(`רק ${input.wallCount} קירות זוהו — לא מספיק לדירה`);
  }

  // A bed checks the scale from outside the area, which is the only other thing
  // the lock has to go on.
  const beds = input.furniture.filter((piece) => piece.kind === "bed");
  if (beds.length > 0) {
    const lengths = beds
      .map((bed) => Math.max(bed.widthCm, bed.depthCm))
      .sort((a, b) => a - b);
    const median = lengths[lengths.length >> 1]!;
    if (median < BED_CM.min || median > BED_CM.max) {
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
    if (bathrooms === 0 && merged === 0) soft.push("לא זוהה חדר רחצה");
    if (merged > 0) {
      soft.push(`${merged} חדרים לא הופרדו זה מזה (מיטה וכלי סניטרי באותו חלל)`);
    }
  }

  if (input.fidelity && input.fidelity.total > 0) {
    const missing = input.fidelity.total - input.fidelity.present;
    const share = missing / input.fidelity.total;
    if (share > 0.2) {
      hard.push(
        `${missing} מתוך ${input.fidelity.total} פריטי ריהוט חסרים בתמונה`,
      );
    } else {
      soft.push(...fidelityFailures(input.fidelity));
    }
  }

  if (input.coolTint != null && input.coolTint > TINT_LIMIT) {
    hard.push(`צבע קידוד נשאר ב-${(input.coolTint * 100).toFixed(1)}% מהתמונה`);
  }

  if (
    input.printedTerraces != null &&
    input.foundTerraces != null &&
    input.foundTerraces < input.printedTerraces
  ) {
    soft.push(
      `${input.foundTerraces} מתוך ${input.printedTerraces} מרפסות זוהו`,
    );
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
