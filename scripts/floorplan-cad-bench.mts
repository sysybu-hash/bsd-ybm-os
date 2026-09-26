#!/usr/bin/env npx tsx
/**
 * What the measured CAD route makes of the reference sheets.
 *
 *   npm run floorplan:bench -- out.json          # write a snapshot
 *   npm run floorplan:bench -- out.json base.json # and compare against one
 *
 * The geometry reader is tuned sheet by sheet, and a constant moved for one
 * drawing style quietly changes every other: adapting the wall detector to a
 * plotted CAD sheet cost two rooms on דירה 17 and every balcony on the batch,
 * which no unit test noticed. This prints the scale, the wall bodies and the
 * segmented rooms per sheet so a change can be answered with a diff.
 *
 * The sheets are not in the repo. Point the script at them with
 * FLOORPLAN_BENCH_DIR, or keep them in "תוכניות לביצוע הדמיות".
 *
 * Each sheet also carries the confidence verdict the geometry-only plate would
 * get, so a change to an acceptance threshold is answered per sheet too.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildFlatFromPdf } from "@/lib/projects/floorplan-build";
import { assessFloorplanRun } from "@/lib/projects/floorplan-confidence";
import { measureBlockFidelity } from "@/lib/projects/floorplan-fidelity";
import { flatExtentFromSheet } from "@/lib/projects/floorplan-render-flat";
import { segmentRooms } from "@/lib/projects/floorplan-segment";
import { extractFloorplanVectorGeometry } from "@/lib/projects/floorplan-vector";

const dir = process.env.FLOORPLAN_BENCH_DIR ?? "תוכניות לביצוע הדמיות";
type TruthTerrace = { levelM: number; m2: number };
type TruthPlan = {
  file: string;
  grossM2: number;
  levelM: number;
  bedrooms: number;
  mmd: number;
  bathrooms: number;
  terraces?: TruthTerrace[];
};
const truth = JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-truth.json", "utf8")) as { plans: TruthPlan[] };
const out: Record<string, unknown> = {};
const filter = process.env.FLOORPLAN_BENCH_FILTER;
for (const plan of truth.plans.filter((row) => !filter || row.file.includes(filter))) {
  const file = path.join(dir, plan.file);
  if (!fs.existsSync(file)) { out[plan.file] = "missing"; continue; }
  const pdf = fs.readFileSync(file);
  const onLevel = (plan.terraces ?? []).filter((t) => t.levelM === plan.levelM);
  const terraces = onLevel.reduce((sum, t) => sum + t.m2, 0);
  try {
    const extent = await flatExtentFromSheet(pdf);
    const flat = await buildFlatFromPdf(pdf, plan.grossM2 + terraces, { extent: extent ?? undefined });
    if (!flat) { out[plan.file] = { flat: null }; continue; }
    const geo = await extractFloorplanVectorGeometry(pdf);
    const rooms = segmentRooms({ bodies: flat.bodies, openings: flat.openings, floor: flat.floor, furniture: flat.furniture, terraces: flat.terraces, bounds: flat.bounds, unitsPerMetre: flat.unitsPerMetre, segments: geo?.segments, colouredDoorways: flat.colouredDoorways, shelterMarks: flat.shelterMarks });
    const count = (kind: string) => rooms.filter((room) => room.kind === kind).length;
    const expectedTerraces = onLevel.length;
    const actual = {
      bedrooms: count("bedroom"),
      mmd: count("mmd"),
      bathrooms: count("bathroom"),
      balconies: count("balcony"),
    };
    const expected = {
      bedrooms: plan.bedrooms,
      mmd: plan.mmd,
      bathrooms: plan.bathrooms,
      balconies: expectedTerraces,
    };
    const mismatches = Object.keys(expected).filter(
      (key) => actual[key as keyof typeof actual] !== expected[key as keyof typeof expected],
    );
    // The geometry-only plate, graded the way renderFlatFromGeometry grades it.
    const plate = await sharp(Buffer.from(flat.svg), { density: 200 })
      .flatten({ background: "#f4efe6" })
      .jpeg({ quality: 94 })
      .toBuffer();
    const fidelity = await measureBlockFidelity({
      geometry: plate,
      still: plate,
      furniture: flat.furniture,
      bounds: flat.bounds,
    });
    const confidence = assessFloorplanRun({
      areaError: flat.areaError,
      unitsPerMetre: flat.unitsPerMetre,
      wallCount: flat.bodies.length,
      furniture: flat.furniture,
      rooms,
      fidelity,
      coolTint: 0,
      foundTerraces: flat.terraces.length,
      printedTerraces: flat.printedTerraceCount,
      auditHardFailures: [],
    });
    out[plan.file] = {
      areaErrorPct: Number((flat.areaError * 100).toFixed(2)),
      fidelity: { present: fidelity.present, total: fidelity.total },
      confidenceOk: confidence.ok,
      // What measuredPlateQualityFailure would decide with the sheet's true
      // programme: the measured plate ships only if both hold.
      route: confidence.ok && mismatches.length === 0 ? "measured" : "raster",
      hard: confidence.hard,
      soft: confidence.soft,
      upm: Number(flat.unitsPerMetre.toFixed(2)),
      bodies: flat.bodies.length,
      furniture: flat.furniture.length,
      printedTerraceCount: flat.printedTerraceCount,
      terraceMaskCount: flat.terraces.length,
      openings: flat.openings.length,
      rooms: rooms.length,
      roomKinds: rooms.map((r) => r.kind).sort(),
      actual,
      expected,
      mismatches,
      roomAreas: rooms.map((room) => ({ kind: room.kind, areaM2: room.areaM2, bedCount: room.bedCount })),
    };
  } catch (err: unknown) {
    out[plan.file] = { error: err instanceof Error ? err.message : String(err) };
  }
}
const target = process.argv[2] ?? "floorplan-cad-bench.json";
fs.writeFileSync(target, JSON.stringify(out, null, 1));
console.log(`wrote ${target}`);

const basePath = process.argv[3];
if (basePath && fs.existsSync(basePath)) {
  const base = JSON.parse(fs.readFileSync(basePath, "utf8")) as Record<string, any>;
  let changed = 0;
  for (const [file, before] of Object.entries(base)) {
    const after = out[file] as any;
    if (!before || !after || typeof before !== "object" || typeof after !== "object") continue;
    const same =
      before.upm === after.upm &&
      JSON.stringify(before.roomKinds) === JSON.stringify(after.roomKinds);
    if (!same) {
      changed += 1;
      console.log(`CHANGED ${file}: upm ${before.upm} -> ${after.upm}, rooms ${before.rooms} -> ${after.rooms}`);
      console.log(`  before ${JSON.stringify(before.roomKinds)}`);
      console.log(`  after  ${JSON.stringify(after.roomKinds)}`);
    }
  }
  console.log(changed === 0 ? "no sheet changed" : `${changed} sheet(s) changed`);
}
