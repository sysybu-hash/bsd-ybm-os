/**
 * Lift one apartment out of a sales DXF.
 *
 *   npx tsx scripts/extract-dxf-apartment.mts --dxf "path/file.dxf" --apartment 14 --out "path/dir"
 */
import fs from "node:fs";
import path from "node:path";

import { apartmentSvg, extractApartment } from "../lib/projects/dxf-apartment";
import { readDxfDrawing } from "../lib/projects/dxf-drawing";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, "");
  const value = process.argv[i + 1];
  if (key && value) args.set(key, value);
}
const dxfPath = args.get("dxf");
const apartment = Number(args.get("apartment") ?? "14");
const outDir = args.get("out");
if (!dxfPath || !outDir || !Number.isInteger(apartment)) {
  console.error("usage: --dxf <file.dxf> --apartment <n> --out <dir>");
  process.exit(2);
}

const drawing = readDxfDrawing(fs.readFileSync(dxfPath));
if (!drawing) {
  console.error("not a DXF");
  process.exit(1);
}
const plan = extractApartment(drawing, apartment);
if (!plan) {
  console.error(`apartment ${apartment} has no App_Nom mark in model space`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const summary = {
  number: plan.number,
  units: plan.unitsM === 0.01 ? "cm" : plan.unitsM === 0.001 ? "mm" : `${plan.unitsM} m`,
  mark: plan.mark,
  widthM: Number(plan.widthM.toFixed(2)),
  depthM: Number(plan.depthM.toFixed(2)),
  rooms: plan.rooms.map((room) => room.text),
  openings: [...new Set(plan.openings.map((opening) => opening.name))],
  counts: plan.counts,
  numbersInFile: plan.numbersInFile,
};
fs.writeFileSync(path.join(outDir, "apartment.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "plan.svg"), apartmentSvg(plan));
console.log(JSON.stringify(summary, null, 2));
