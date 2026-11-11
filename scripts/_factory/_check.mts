// Factory — check views of the truck route (free raster): top, and from each side at a low angle.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/_factory/_check.mts <model dir> <out dir> [x,y,z,tx,ty,tz,fov,name ...]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";

delete process.env.ALLOW_PAID_AI;
const [dir, out, ...extra] = process.argv.slice(2) as [string, string, ...string[]];
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
const base = dwfBuildingViews({ floors: state.floors, model: { extent: model.extent, primitives: model.primitives } }, undefined, {}, { house: false, public: true });
const aerial = base.find((v) => v.id === "aerial-se")!.payload as Record<string, unknown>;
const cams: Array<[string, number[]]> = [
  ["top", [0.01, 190, 0, 0, 0, 0, 42]],
  ["west", [-75, 14, 25, 0, 2, 10, 50]],
  ["south", [10, 14, 75, 8, 3, 15, 50]],
  ["east", [80, 14, -5, 25, 3, -5, 50]],
  ["north", [5, 14, -80, 15, 2, -20, 50]],
  ["sw-close", [-25, 4, 40, 0, 3, 18, 60]],
  ["ne-close", [45, 6, -40, 25, 4, -15, 60]],
];
for (const e of extra) { const v = e.split(","); cams.push([v[7]!, v.slice(0, 7).map(Number)]); }
mkdirSync(out, { recursive: true });
const frames = await renderBuildingFrames(cams.map(([, c]) => ({ ...aerial, camera: { position: { x: c[0]!, y: c[1]!, z: c[2]! }, target: { x: c[3]!, y: c[4]!, z: c[5]! }, fovDeg: c[6]! }, model }) as never), { outputWidthPx: 1400 });
cams.forEach(([n], i) => writeFileSync(path.join(out, `${n}.jpg`), frames[i]!));
console.log(cams.map(([n]) => n).join(", "));
