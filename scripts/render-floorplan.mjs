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

if (!pdfPath || !Number.isFinite(grossArea)) {
  console.error("usage: --pdf <sheet.pdf> --area <m2> [--terraces <m2>] [--uncut <sheet.pdf>] [--out <dir>] [--attempts 3]");
  process.exit(2);
}

const { extractFloorplanVectorGeometry, wallBoundingBox } = await import("../lib/projects/floorplan-vector.ts");
const { hatchedWallExtent } = await import("../lib/projects/floorplan-solid.ts");
const { buildFlatFromPdf } = await import("../lib/projects/floorplan-build.ts");
const { buildPlacementPrompt } = await import("../lib/projects/floorplan-materials.ts");
const { auditFloorplanStill, gradeFloorplanStill } = await import("../lib/projects/floorplan-viz-audit.ts");
const { pickBestFinish } = await import("../lib/projects/floorplan-finish.ts");
const { parseFloorplanLayout } = await import("../lib/projects/floorplan-layout.ts");
const { stampFloorplanStill } = await import("../lib/projects/floorplan-viz-stamp.ts");
const { getGeminiApiKey } = await import("../lib/gemini-api-key.ts");
const { getFloorplanVizModelChain } = await import("../lib/gemini-model.ts");
const { GoogleGenAI } = await import("@google/genai");

const name = path.parse(pdfPath).name.trim();
const cutBytes = fs.readFileSync(pdfPath);
const uncutBytes = fs.readFileSync(uncutPath);

const cut = await extractFloorplanVectorGeometry(Buffer.from(cutBytes));
if (!cut) {
  console.error(`${name}: no vector geometry — this sheet is a scan, not a CAD export`);
  process.exit(1);
}
const sheet = wallBoundingBox(cut);
const extent = hatchedWallExtent(cut.segments, sheet, 53) ?? sheet;

const flat = await buildFlatFromPdf(Buffer.from(uncutBytes), grossArea + terraces, { extent });
if (!flat) {
  console.error(`${name}: refused — no scale reproduces ${(grossArea + terraces).toFixed(2)} m²`);
  process.exit(1);
}
const counts = flat.furniture.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
console.log(
  `${name}: ${flat.unitsPerMetre} units/m | ${flat.bodies.length} walls | ${flat.openings.length} openings | ` +
    `${flat.floorM2.toFixed(1)} m² (${(flat.areaError * 100).toFixed(1)}%) | ${JSON.stringify(counts)}`,
);

const geometry = await sharp(Buffer.from(flat.svg), { density: 200 })
  .flatten({ background: "#fff" })
  .jpeg({ quality: 94 })
  .toBuffer();
fs.mkdirSync(outDir, { recursive: true });
const geometryPath = path.join(outDir, `${name} — גיאומטריה.jpg`);
fs.writeFileSync(geometryPath, geometry);

const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const plan = { base64: uncutBytes.toString("base64"), mimeType: "application/pdf" };
const layout = parseFloorplanLayout({ rooms: [], islandStoolCount: 0 });
const prompt = buildPlacementPrompt();

const render = async () => {
  for (const model of getFloorplanVizModelChain()) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: geometry.toString("base64") } }],
          },
        ],
        config: { responseModalities: ["IMAGE"] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part) return { mimeType: "image/jpeg", base64: part.inlineData.data };
    } catch {
      // Try the next model in the chain.
    }
  }
  return null;
};

const grade = async (image) => {
  const audit = await auditFloorplanStill(image, plan);
  if (!audit) return null;
  const verdict = gradeFloorplanStill(audit, layout, { haredi: true });
  console.log(`   attempt: score ${verdict.score}${verdict.failures.length ? " — " + verdict.failures.join("; ") : ""}`);
  return { score: verdict.score, failures: verdict.failures };
};

const best = await pickBestFinish(attempts, render, grade, { label: name });
if (!best) {
  console.error(`${name}: no finish came back`);
  process.exit(1);
}

const stamped = await stampFloorplanStill(best.image, { unitLabel: name.replace(/^דירה\s*/u, ""), areaM2: grossArea });
const stillPath = path.join(outDir, `${name} — הדמיה.jpg`);
fs.writeFileSync(stillPath, Buffer.from(stamped.base64, "base64"));

console.log(`${name}: score ${best.score} after ${best.attempts} finish(es)${best.stoppedEarly ? " (stopped early)" : ""}`);
if (best.failures.length) console.log(`   remaining: ${best.failures.join("; ")}`);
console.log(`   geometry -> ${geometryPath}`);
console.log(`   still    -> ${stillPath}`);
