/** Geometry-only render + side-by-side against the plan. No model calls. */
import fs from "node:fs";
import sharp from "sharp";
const { extractFloorplanVectorGeometry, wallBoundingBox } = await import("../lib/projects/floorplan-vector.ts");
const { hatchedWallExtent } = await import("../lib/projects/floorplan-solid.ts");
const { buildFlatFromPdf } = await import("../lib/projects/floorplan-build.ts");

const SP = process.argv[2];
const tag = process.argv[3] ?? "geo";
const dir = "תוכניות לביצוע הדמיות";
const cut = fs.readFileSync(`${dir}/דירה 14 .pdf`);
const uncut = fs.readFileSync(`${dir}/דירה 14 מקור.pdf`);
const g = await extractFloorplanVectorGeometry(Buffer.from(cut));
const extent = hatchedWallExtent(g.segments, wallBoundingBox(g), 54);
const b = await buildFlatFromPdf(Buffer.from(uncut), 111.29, { extent, width: 1400 });
console.log(`upm ${b.unitsPerMetre} | walls ${b.bodies.length} | openings ${b.openings.length} | ${b.floorM2.toFixed(1)} m2 (${(b.areaError*100).toFixed(1)}%)`);
const counts = {};
for (const f of b.furniture) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
console.log("furniture", JSON.stringify(counts));

const png = await sharp(Buffer.from(b.svg)).png().toBuffer();
const H = 1500;
const [A, B] = await Promise.all([
  sharp(`${SP}/plan-crop.jpg`).resize({ height: H }).flatten({ background: "#fff" }).toBuffer({ resolveWithObject: true }),
  sharp(png).resize({ height: H }).flatten({ background: "#fff" }).toBuffer({ resolveWithObject: true }),
]);
await sharp({ create: { width: A.info.width + B.info.width + 30, height: H, channels: 3, background: "#ffffff" } })
  .composite([{ input: A.data, left: 0, top: 0 }, { input: B.data, left: A.info.width + 30, top: 0 }])
  .jpeg({ quality: 92 }).toFile(`${SP}/${tag}.jpg`);
console.log("wrote", `${SP}/${tag}.jpg`);
