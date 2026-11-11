// A measured house's views, re-drawn from its saved model.json + state.json — no DXF read, no paid call.
// For working on the free renderer's look: seconds a view, not minutes a booklet.
// npx tsx --env-file=.env.local --conditions=react-server scripts/_view-one.mts <measured-model-dir> <out-dir> <view ids e.g. hero,corner-front,room-living> [widthPx]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { asCutPlan } from "@/lib/projects/building/cut-model";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";

delete process.env.ALLOW_PAID_AI;
const [dir, out, idsArg, widthArg] = process.argv.slice(2);
if (!dir || !out || !idsArg) {
  console.error("usage: _view-one.mts <model-dir> <out-dir> <ids> [widthPx]");
  process.exit(2);
}
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
const wanted = idsArg.split(",");
const views0 = dwfBuildingViews(
  { floors: state.floors, model: { extent: model.extent, primitives: model.primitives } },
  undefined,
  {},
  { house: false, public: true, ...(model.street ? { street: model.street } : {}), ...(model.plot ? { plot: model.plot } : {}) },
);
console.log("all views:", views0.map((v) => v.id).join(","));
const views = views0.filter((v) => wanted.includes(v.id));
if (views.length !== wanted.length) {
  console.error(`views found: ${views.map((v) => v.id).join(", ")}`);
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const payloadOf = (v: (typeof views)[number]) => {
  const p = { ...v.payload, ...(process.env.OVERRIDE ? JSON.parse(process.env.OVERRIDE) : {}), ...(process.env.TRACE ? { pathTrace: { samples: Number(process.env.TRACE) } } : {}), model: { ...model, primitives: model.primitives } };
  // CAMEXTRA: fields merged into the view's own camera (a vertical section on an elevation, as the sheet cuts it)
  if (process.env.CAMEXTRA) p.camera = { ...p.camera, ...JSON.parse(process.env.CAMEXTRA) };
  // DOLLY: the camera moved back along its line of sight by this factor (1.25 = a quarter further): a zoom out that keeps the angle
  if (process.env.DOLLY) { const k = Number(process.env.DOLLY), c = p.camera as { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
    p.camera = { ...p.camera, position: { x: c.target.x + (c.position.x - c.target.x) * k, y: c.target.y + (c.position.y - c.target.y) * k, z: c.target.z + (c.position.z - c.target.z) * k } }; }
  // A house's plan is cut in the geometry, as the booklet draws it.
  return p.camera.cutAboveM != null ? asCutPlan(p) : p;
};
const frames = await renderBuildingFrames(
  views.map(payloadOf),
  { outputWidthPx: widthArg ? Number(widthArg) : undefined },
);
views.forEach((v, i) => writeFileSync(path.join(out, `${v.id}.jpg`), frames[i]!));
console.log(`${views.map((v) => v.id).join(", ")} → ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
