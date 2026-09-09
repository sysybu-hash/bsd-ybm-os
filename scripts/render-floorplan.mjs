#!/usr/bin/env node
/**
 * Render one apartment from its sales sheet.
 *
 *   npm run floorplan:render -- --pdf "path/to/דירה 14.pdf" --area 111.29 --terraces 20.9
 *
 * Walls, openings, furniture and the outline come from the CAD and are drawn
 * here; the model is asked only for materials and light, and the best of a few
 * finishes is kept on the audit's verdict.
 *
 * --area is the gross area the sheet prints, and it is required. It cannot be
 * read off the sheet — this CAD draws its dimensions and its area as vector
 * outlines, so a page carries six to ten text items and none of them is the
 * area. Nor can the scale be pinned without it: beds and doors alone leave a
 * window of 40 to 63 units per metre and picked 60 on דירה 15 where the answer
 * is 54. The workspace's own layout extraction reads the figure with a vision
 * model, and that is where a batch run should get it.
 *
 * --uncut is optional and worth passing. A sheet cropped to one apartment has
 * its wall faces severed mid-run, which costs about 13 points of wall coverage;
 * given both, the walls are read from the uncut sheet and the flat's extent from
 * the cropped one.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import dotenv from "dotenv";

// Run straight from a shell, so nothing has loaded the workspace env yet and
// lib/env.ts refuses to hand over the Gemini key without it.
dotenv.config({ path: ".env.local" });

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
}
const pdfPath = args.get("pdf");
const grossArea = Number(args.get("area"));
const terraces = Number(args.get("terraces") ?? 0);
const uncutPath = args.get("uncut") ?? pdfPath;
const outDir = args.get("out") ?? path.dirname(pdfPath ?? ".");
const attempts = Number(args.get("attempts") ?? 3);
// The score at which the search stops early. The default trades a few agorot
// against a frame that is good rather than best; a delivery run wants 0, which
// spends every attempt and keeps the highest-scoring of them.
const goodEnough = args.has("good-enough") ? Number(args.get("good-enough")) : undefined;

if (!pdfPath || !Number.isFinite(grossArea)) {
  console.error("usage: --pdf <sheet.pdf> --area <m2> [--terraces <m2>] [--uncut <sheet.pdf>] [--out <dir>] [--attempts 3] [--good-enough 0]");
  process.exit(2);
}

const { renderFlatFromPdf, flatExtentFromSheet } = await import(
  "../lib/projects/floorplan-render-flat.ts"
);
const { roomsForLayout } = await import("../lib/projects/floorplan-segment.ts");
const { describeConfidence } = await import(
  "../lib/projects/floorplan-confidence.ts"
);
const { stampFloorplanStill } = await import(
  "../lib/projects/floorplan-viz-stamp.ts"
);

const name = path.parse(pdfPath).name.trim();
const cutBytes = fs.readFileSync(pdfPath);
const uncutBytes = fs.readFileSync(uncutPath);

const extent = await flatExtentFromSheet(Buffer.from(cutBytes));
if (!extent) {
  console.error(
    `${name}: no vector geometry — this sheet is a scan, not a CAD export`,
  );
  process.exit(1);
}

const rendered = await renderFlatFromPdf(Buffer.from(cutBytes), {
  targetAreaM2: grossArea + terraces,
  extent,
  wallSource: Buffer.from(uncutBytes),
  attempts,
  goodEnough,
  haredi: !args.has("audience") || args.get("audience") === "haredi",
  label: name,
});
if (!rendered) {
  console.error(
    `${name}: refused — no scale reproduces ${(grossArea + terraces).toFixed(2)} m², or no finish came back`,
  );
  process.exit(1);
}

const { flat, rooms, geometry, still, confidence } = rendered;
const counts = flat.furniture.reduce(
  (m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m),
  {},
);
console.log(
  `${name}: ${flat.unitsPerMetre} units/m | ${flat.bodies.length} walls | ${flat.openings.length} openings | ` +
    `${flat.floorM2.toFixed(1)} m² (${(flat.areaError * 100).toFixed(1)}%) | ${JSON.stringify(counts)}`,
);

fs.mkdirSync(outDir, { recursive: true });
const geometryPath = path.join(outDir, `${name} — גיאומטריה.jpg`);
fs.writeFileSync(geometryPath, geometry);

const stamped = await stampFloorplanStill(still, {
  unitLabel: name.replace(/^דירה\s*/u, ""),
  areaM2: grossArea,
});
const stillPath = path.join(outDir, `${name} — הדמיה.jpg`);
fs.writeFileSync(stillPath, Buffer.from(stamped.base64, "base64"));

console.log(
  `${name}: score ${rendered.score.toFixed(2)} after ${rendered.attempts} finish(es)`,
);
if (rendered.failures.length) {
  console.log(`   remaining: ${rendered.failures.join("; ")}`);
}
console.log(`   geometry -> ${geometryPath}`);
console.log(`   still    -> ${stillPath}`);

const reportPath = path.join(outDir, `${name} — בדיקה.json`);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      unitLabel: name,
      grossAreaM2: grossArea,
      unitsPerMetre: flat.unitsPerMetre,
      areaError: flat.areaError,
      confidence,
      rooms: roomsForLayout(rooms, flat.unitsPerMetre),
      islandStoolCount: flat.furniture.filter((p) => p.kind === "seat").length,
    },
    null,
    2,
  ),
);
console.log(`   report   -> ${reportPath}`);
console.log(describeConfidence(confidence));
if (!confidence.ok) process.exitCode = 3;
