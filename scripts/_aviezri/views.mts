/**
 * Aviezri — the render set from the saved model (free: the raster renderer, no paid call). Model frame: plan north = −x,
 * east = −z, west = +z, south = +x (read.mts). The street front (the portal, the sign) faces −x, onto a street at +3.30.
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/_aviezri/views.mts <model dir> <out dir> [widthPx=1600] [only=id,id]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import type { BuildingCamera } from "@/lib/projects/building/render-page";

delete process.env.ALLOW_PAID_AI;
const [dir, out, widthArg, onlyArg] = process.argv.slice(2) as [string, string, string?, string?];
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
const base = dwfBuildingViews({ floors: state.floors, model: { extent: model.extent, primitives: model.primitives } }, undefined, {}, { house: false, public: true });
type V = { id: string; payload: Record<string, unknown> & { camera: BuildingCamera } };
const pick = (id: string) => base.find((v) => v.id === id)!.payload as V["payload"];
const aerial = pick("aerial-se");
const cam = (px: number, py: number, pz: number, tx: number, ty: number, tz: number, fovDeg = 55, shiftY = 0.12): BuildingCamera =>
  ({ ...(aerial.camera as object), position: { x: px, y: py, z: pz }, target: { x: tx, y: ty, z: tz }, fovDeg, shiftY } as BuildingCamera);
const views: V[] = [
  // the street front, from the far kerb of the street at +3.30, eye 1.7 m over it: the portal and the sign in the middle
  { id: "street-front", payload: { ...aerial, camera: cam(-17, 5.0, -15.6, 1, 7.2, -15.6, 58) } },
  // the front and the west face (the hall's 6 + 6 windows) from the street's corner
  { id: "corner-nw", payload: { ...aerial, camera: cam(-16, 5.0, 13, 8, 6.5, -12, 58) } },
  // the front and the east face (the ark's arch) from the street up the hill
  { id: "corner-ne", payload: { ...aerial, camera: cam(-15, 5.0, -44, 10, 6.5, -17, 58) } },
  // the yard side: the C stair, the terrace, the hall's south wall
  { id: "yard-se", payload: { ...aerial, camera: cam(55, 1.7, -40, 22, 5.5, -14, 58) } },
  { id: "aerial-se", payload: pick("aerial-se") },
  { id: "aerial-nw", payload: pick("aerial-nw") },
  // the storeys from above, cut as the plans are (to lay over the sheets)
  { id: "plan-f1", payload: pick("plan-floor-first") },
  { id: "plan-f2", payload: pick("plan-floor-second") },
  // inside (plan cm → model: x = X/100, z = −Y/100): eye 1.55 m over each floor, the room's own downlights, clear glass
  ...[
    // the beit midrash from under the gallery, down the aisle to the ark between its columns
    { id: "in-hall-ark", eye: [1550, 1545], at: [1712, 3043, 2.3], room: [960, 2465, 1445, 3043], floor: 3.3, ceil: 10.73, fov: 70 },
    // back from beside the ark: the bima, the pews, the women's gallery over the hall's back
    { id: "in-hall-gallery", eye: [1590, 2850], at: [1712, 1445, 4.6], room: [960, 2465, 1445, 3043], floor: 3.3, ceil: 10.73, fov: 72 },
    // the women's gallery: from its back, over its parapet to the hall and the ark
    { id: "in-gallery", eye: [1250, 1435], at: [2000, 3043, -1.4], room: [960, 2465, 1415, 1691], floor: 7.04, ceil: 10.73, fov: 72 },
    // the second hall (north-east): its pews, the small bima, the amud and its ark
    { id: "in-second-hall", eye: [1610, 160], at: [1698, 1085, 1.6], room: [1129, 2465, 30, 1395], floor: 3.3, ceil: 6.74, fov: 70 },
    // the third hall in the wing: its pews, bima, amud and ark
    { id: "in-third-hall", eye: [615, 1720], at: [615, 2637, 1.6], room: [300, 930, 1683, 2647], floor: 3.3, ceil: 6.74, fov: 72 },
    // the gallery storey's hall of tables
    { id: "in-tables-hall", eye: [470, 1000], at: [720, 2560, 0.5], room: [300, 930, 700, 2600], floor: 7.04, ceil: 9.74, fov: 72 },
    // the entrance hall with its coat hooks, toward the doors from the porch
    { id: "in-entrance", eye: [900, 1420], at: [300, 1560, 1.2], room: [300, 930, 1150, 1650], floor: 3.3, ceil: 6.74, fov: 72 },
  ].map((r) => ({
    id: r.id,
    payload: {
      ...aerial, width: 2000, height: 1334, exposure: 0.6, ao: true,
      camera: {
        position: { x: r.eye[0]! / 100, y: r.floor + 1.55, z: -r.eye[1]! / 100 }, target: { x: r.at[0]! / 100, y: r.floor + r.at[2]!, z: -r.at[1]! / 100 }, fovDeg: r.fov, interior: true, clearGlass: true,
        room: { x0: r.room[0]! / 100, x1: r.room[1]! / 100, z0: -r.room[3]! / 100, z1: -r.room[2]! / 100, floorY: r.floor, ceilingY: r.ceil },
      } as BuildingCamera,
    } as V["payload"],
  })),
];
const only = onlyArg ? onlyArg.split(",") : null;
const run = views.filter((v) => (only ? only.includes(v.id) : !v.id.startsWith("plan-")));
mkdirSync(out, { recursive: true });
const t0 = Date.now();
for (const v of run) {
  const [frame] = await renderBuildingFrames([{ ...v.payload, model }], { outputWidthPx: widthArg ? Number(widthArg) : 1600 });
  writeFileSync(path.join(out, `${v.id}.jpg`), frame!);
  console.log(`${v.id} → ${out} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
