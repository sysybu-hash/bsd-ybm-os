#!/usr/bin/env node
/**
 * The booklet, from the geometry that produced the still.
 *
 *   npm run floorplan:booklet -- --plan "תוכניות לביצוע הדמיות/דירה 14 .pdf"
 *
 * The room table used to come from a vision pass stored in the database, and
 * it disagreed with the picture beside it — three terraces printed as one,
 * because pruneHallucinatedPlanRooms collapses them into named slots and keeps
 * only the ones OCR happened to see. It comes from the same segmentation the
 * still was rendered from now, so every figure in the booklet agrees with the
 * image.
 *
 * Calls buildFloorplanVizPdfHtml and the Chromium renderer directly. The old
 * runner went through the HTTP route, which needs a signed-in session and so a
 * live database — and that database being down stopped a delivery mid-flight.
 * Nothing here touches Prisma.
 *
 * It reads the run's own verdict first and refuses when the pipeline said the
 * flat could not be read.
 */
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const planPath = args.get("plan");
const outDir = args.get("out") ?? path.join(path.dirname(planPath ?? "."), "מוכן");
const force = args.has("force");
if (!planPath) {
  console.error(
    'usage: --plan "path/to/דירה 14 .pdf" [--out dir] [--force]',
  );
  process.exit(2);
}

const name = path.parse(planPath).name.trim();
const stillPath = path.join(outDir, `${name} — הדמיה.jpg`);
const reportPath = path.join(outDir, `${name} — בדיקה.json`);
for (const required of [stillPath, reportPath]) {
  if (!fs.existsSync(required)) {
    console.error(`missing ${required} — run floorplan:render first`);
    process.exit(2);
  }
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (!report.confidence?.ok && !force) {
  console.error(`${name}: הריצה לא עברה את בדיקת האיכות — לא נבנית חוברת`);
  for (const line of report.confidence?.hard ?? []) console.error(`   חוסם: ${line}`);
  console.error("   (--force כדי לבנות בכל זאת)");
  process.exit(3);
}

const { buildFloorplanVizPdfHtml } = await import(
  "../lib/projects/floorplan-viz-pdf-html.ts"
);
const { renderHtmlPdfChromium } = await import(
  "../lib/pdf/render-html-pdf-chromium.ts"
);
const { parseFloorplanLayout } = await import(
  "../lib/projects/floorplan-layout.ts"
);
const { extractPdfDimensionStrings } = await import(
  "../lib/projects/floorplan-vector.ts"
);

// The sheet, rasterised for the comparison pages.
const planBytes = fs.readFileSync(planPath);
const { extractPdfPageRaster } = await import(
  "../lib/projects/floorplan-vector.ts"
);
let planJpeg = null;
const embedded = await extractPdfPageRaster(planBytes);
if (embedded) {
  planJpeg = Buffer.from(embedded, "base64");
} else {
  // A true vector sheet carries no image to lift, so it is drawn from its own
  // geometry instead — the same wall diagram the pipeline works from.
  const { buildVectorWallJpeg } = await import(
    "../lib/projects/floorplan-vector.ts"
  );
  const drawn = await buildVectorWallJpeg(planBytes);
  if (drawn) planJpeg = Buffer.from(drawn.base64, "base64");
}

const layout = parseFloorplanLayout({
  title: name,
  unitLabel: name.replace(/^דירה\s*/u, ""),
  grossAreaM2: report.grossAreaM2,
  rooms: report.rooms ?? [],
  islandStoolCount: report.islandStoolCount ?? 0,
  dimensionStrings: await extractPdfDimensionStrings(planBytes),
  notes: [
    ...(report.confidence?.soft ?? []),
    report.confidence?.tier === "raster"
      ? "הגיאומטריה משוערת מסריקה"
      : "הגיאומטריה נמדדה מקובץ ה-CAD",
  ],
  requiresReview: (report.confidence?.soft?.length ?? 0) > 0,
});

const still = fs.readFileSync(stillPath);
const images = [
  {
    id: "overview",
    viewId: "overview",
    labelHe: "מבט על",
    mimeType: "image/jpeg",
    base64: still.toString("base64"),
  },
];

const html = buildFloorplanVizPdfHtml(layout, images, {
  projectName: name,
  planImage: planJpeg
    ? { mimeType: "image/jpeg", base64: planJpeg.toString("base64") }
    : undefined,
});
const pdf = await renderHtmlPdfChromium(html, {
  margin: { top: "12mm", right: "22mm", bottom: "18mm", left: "16mm" },
  waitForImages: true,
  timeoutMs: 120_000,
  footer: "הופק על ידי מערכת BSD-YBM",
});

const out = path.join(outDir, `${name} — חוברת.pdf`);
fs.writeFileSync(out, pdf);
console.log(
  `${name}: חוברת -> ${out} (${(pdf.byteLength / 1024).toFixed(0)} KB, ${layout.rooms.length} חללים)`,
);
