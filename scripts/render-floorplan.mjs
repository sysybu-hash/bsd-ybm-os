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

const { extractFloorplanVectorGeometry, wallBoundingBox } = await import("../lib/projects/floorplan-vector.ts");
const { hatchedWallExtent } = await import("../lib/projects/floorplan-solid.ts");
const { buildFlatFromPdf } = await import("../lib/projects/floorplan-build.ts");
const { buildPlacementPrompt, RECOLOUR_PROMPT } = await import("../lib/projects/floorplan-materials.ts");
const { auditFloorplanStill, gradeFloorplanStill } = await import("../lib/projects/floorplan-viz-audit.ts");
const { pickBestFinish } = await import("../lib/projects/floorplan-finish.ts");
const { coolTintFraction, TINT_LIMIT } = await import("../lib/projects/floorplan-tint.ts");
const { measureBlockFidelity, fidelityFailures } = await import("../lib/projects/floorplan-fidelity.ts");
const { segmentRooms, roomsForLayout } = await import("../lib/projects/floorplan-segment.ts");
const { assessFloorplanRun, describeConfidence } = await import("../lib/projects/floorplan-confidence.ts");
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

/** One image call against the model chain, given a prompt and a source frame. */
const pass = async (text, image) => {
  for (const model of getFloorplanVizModelChain()) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ text }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }],
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

// Placement, then recolour. The geometry render tints each block roughly the
// material it becomes so the model can tell a bed from a bath without decoding
// a legend, and the sanitary blocks have to be a cool aqua to be separable from
// bed linen at all — at two parts in 255 apart the beds came back as bathtubs.
// That tint then survives into the finish and the bath and basins come out
// mint, so the second pass takes it back out. Asked to do both at once the
// model does neither reliably; asked only to restate the coded objects in real
// materials and change nothing else, it does that well.
const render = async () => {
  const placed = await pass(prompt, {
    mimeType: "image/jpeg",
    base64: geometry.toString("base64"),
  });
  if (!placed) return null;
  return (await pass(RECOLOUR_PROMPT, placed)) ?? placed;
};

const grade = async (image) => {
  const audit = await auditFloorplanStill(image, plan);
  if (!audit) return null;
  // The geometry's own bed count, not a reading of the sheet. The still is made
  // from that render, so it is a fact about the input image.
  const verdict = gradeFloorplanStill(audit, layout, {
    haredi: true,
    drawn: { beds: flat.furniture.filter((p) => p.kind === "bed").length },
  });
  // Measured, not asked. The auditor counts objects and a mint bathroom has the
  // right number of everything — one frame scored 0 with both bathrooms bright
  // green, which is unusable and would have shipped.
  const tint = await coolTintFraction(image);
  // Measured against the render it was made from, block by block. The auditor
  // counts objects, and a frame that turned the living-room suite into a length
  // of wall has the right number of everything — one such scored 0.
  const fidelity = await measureBlockFidelity({
    geometry,
    still: Buffer.from(image.base64, "base64"),
    furniture: flat.furniture,
    bounds: flat.bounds,
  });
  const failures = [...verdict.failures, ...fidelityFailures(fidelity)];
  let score = verdict.score + (fidelity.total - fidelity.present);
  if (tint > TINT_LIMIT) {
    failures.push(`coding tint left in ${(tint * 100).toFixed(1)}% of the frame`);
    score += 100;
  } else {
    // Below the limit it still breaks ties. Two frames with the same failures
    // are not equally good if one of them has a faintly green chair in it, and
    // ranking them the same let the tinted one win on arrival order.
    score += tint * 10;
  }
  console.log(`   attempt: score ${score}${failures.length ? " — " + failures.join("; ") : ""}`);
  return { score, failures, hardFailures: verdict.hardFailures };
};

const best = await pickBestFinish(attempts, render, grade, { label: name, goodEnough });
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

// Whether this run is fit to sell. The booklet reads the verdict rather than
// trusting that a still on disk means the flat was read correctly.
const rooms = segmentRooms({
  bodies: flat.bodies,
  openings: flat.openings,
  floor: flat.floor,
  furniture: flat.furniture,
  terraces: flat.terraces,
  bounds: flat.bounds,
  unitsPerMetre: flat.unitsPerMetre,
  segments: cut.segments,
});
const finalFidelity = await measureBlockFidelity({
  geometry,
  still: Buffer.from(stamped.base64, "base64"),
  furniture: flat.furniture,
  bounds: flat.bounds,
});
const confidence = assessFloorplanRun({
  areaError: flat.areaError,
  unitsPerMetre: flat.unitsPerMetre,
  wallCount: flat.bodies.length,
  furniture: flat.furniture,
  rooms,
  fidelity: finalFidelity,
  coolTint: await coolTintFraction({ base64: stamped.base64 }),
  foundTerraces: flat.terraces.length,
  auditHardFailures: best.hardFailures,
});
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
      rooms: roomsForLayout(rooms),
      islandStoolCount: flat.furniture.filter((p) => p.kind === "seat").length,
    },
    null,
    2,
  ),
);
console.log(`   report   -> ${reportPath}`);
console.log(describeConfidence(confidence));
if (!confidence.ok) process.exitCode = 3;
