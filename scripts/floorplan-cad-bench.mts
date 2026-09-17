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
 */
import fs from "node:fs";
import path from "node:path";
import { buildFlatFromPdf } from "@/lib/projects/floorplan-build";
import { flatExtentFromSheet } from "@/lib/projects/floorplan-render-flat";
import { segmentRooms } from "@/lib/projects/floorplan-segment";
import { extractFloorplanVectorGeometry } from "@/lib/projects/floorplan-vector";

const dir = process.env.FLOORPLAN_BENCH_DIR ?? "תוכניות לביצוע הדמיות";
const truth = JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-truth.json", "utf8"));
const out: Record<string, unknown> = {};
for (const plan of truth.plans) {
  const file = path.join(dir, plan.file);
  if (!fs.existsSync(file)) { out[plan.file] = "missing"; continue; }
  const pdf = fs.readFileSync(file);
  const terraces = (plan.terraces ?? []).filter((t: any) => t.levelM === plan.levelM).reduce((s: number, t: any) => s + t.m2, 0);
  try {
    const extent = await flatExtentFromSheet(pdf);
    const flat = await buildFlatFromPdf(pdf, plan.grossM2 + terraces, { extent: extent ?? undefined });
    if (!flat) { out[plan.file] = { flat: null }; continue; }
    const geo = await extractFloorplanVectorGeometry(pdf);
    const rooms = segmentRooms({ bodies: flat.bodies, openings: flat.openings, floor: flat.floor, furniture: flat.furniture, terraces: flat.terraces, bounds: flat.bounds, unitsPerMetre: flat.unitsPerMetre, segments: geo?.segments });
    out[plan.file] = {
      upm: Number(flat.unitsPerMetre.toFixed(2)),
      bodies: flat.bodies.length,
      furniture: flat.furniture.length,
      openings: flat.openings.length,
      rooms: rooms.length,
      roomKinds: rooms.map((r: any) => r.kind).sort(),
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
