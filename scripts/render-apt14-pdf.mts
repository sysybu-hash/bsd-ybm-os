import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const { DXF_PAGE_UNITS_PER_METRE } = await import("@/lib/projects/floorplan-dxf");
const { extractFloorplanVectorGeometry } = await import("@/lib/projects/floorplan-vector");
const { buildFlatFromGeometry } = await import("@/lib/projects/floorplan-build");
const { segmentRooms } = await import("@/lib/projects/floorplan-segment");
const { FLOORPLAN_VIZ_PRESETS } = await import("@/lib/projects/floorplan-viz-styles");
const { sceneStyleFor } = await import("@/lib/projects/scene3d/style");
const { buildFlatScene } = await import("@/lib/projects/scene3d/build-scene");
const { mergeSpanRows } = await import("@/lib/projects/scene3d/floors");
const { FLOOR_T_M } = await import("@/lib/projects/scene3d/standards");
const { dollhouseView } = await import("@/lib/projects/building/flat-model");
const { photographWithCycles } = await import("@/lib/projects/scene3d/blender-cycles");

const file = process.argv.find((arg) => arg.toLowerCase().endsWith(".pdf")) || "C:\\Users\\User\\Downloads\\קומה שלישית 29.10.26.pdf טסט.pdf";
const pdf = readFileSync(file);
const geometry = await extractFloorplanVectorGeometry(pdf);
if (!geometry) {
  console.log(JSON.stringify({ ok: false, stage: "geometry" }));
  process.exit(1);
}
const flat = await buildFlatFromGeometry(geometry, 0, {
  unitsPerMetreHint: DXF_PAGE_UNITS_PER_METRE,
  unitsFromDrawing: true,
});
if (!flat) {
  console.log(JSON.stringify({ ok: false, stage: "measure", segments: geometry.segments.length, walls: geometry.walls.length }));
  process.exit(2);
}
const rooms = segmentRooms({
  bodies: flat.bodies,
  openings: flat.openings,
  floor: flat.floor,
  furniture: flat.furniture,
  terraces: flat.terraces,
  bounds: flat.bounds,
  unitsPerMetre: flat.unitsPerMetre,
  segments: geometry.segments,
  openingMarks: geometry.openingMarks,
  page: { width: geometry.pageWidth, height: geometry.pageHeight },
});
const furniture: Record<string, number> = {};
for (const piece of flat.furniture) furniture[piece.kind] = (furniture[piece.kind] ?? 0) + 1;
console.log(JSON.stringify({
  segments: geometry.segments.length,
  curves: geometry.curves.length,
  wallSegs: geometry.walls.length,
  unitsPerMetre: flat.unitsPerMetre,
  floorM2: Math.round(flat.floorM2 * 10) / 10,
  bodies: flat.bodies.length,
  openings: flat.openings.length,
  terraces: flat.terraces.length,
  furniture,
  rooms: rooms.map((room) => ({ name: room.name, kind: room.kind, areaM2: Math.round(room.areaM2 * 10) / 10 })),
}));
if (process.argv.includes("--stats")) process.exit(0);

const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic);
const scene = buildFlatScene(flat, rooms, { rules: style.rules, wallHeightM: 2.7 });
const laid = scene.meshes.filter((mesh) => mesh.kind === "floor").reduce((sum, mesh) => sum + mesh.size.x * mesh.size.z, 0);
if (scene.pageCentre && laid < flat.floorM2 * 0.72) {
  const upm = scene.unitsPerMetre;
  const centre = scene.pageCentre;
  for (const rect of mergeSpanRows(flat.floor)) {
    const x = (rect.x + rect.w / 2 - centre.x) / upm;
    const z = (rect.y + rect.h / 2 - centre.y) / upm;
    const onFloor = scene.meshes.some((mesh) => mesh.kind === "floor" && Math.abs(mesh.centre.x - x) < mesh.size.x / 2 && Math.abs(mesh.centre.z - z) < mesh.size.z / 2);
    if (onFloor) continue;
    scene.meshes.push({
      kind: "floor",
      material: "floorWood",
      centre: { x, y: -FLOOR_T_M / 2, z },
      size: { x: rect.w / upm, y: FLOOR_T_M, z: rect.h / upm },
      sourceId: "floor:measured",
    });
  }
}
const view = dollhouseView(scene);
const shot = await photographWithCycles(scene, style, {
  width: 1280,
  height: 800,
  position: view.payload.camera.position,
  target: view.payload.camera.target,
  up: view.payload.camera.up ?? { x: 0, y: 0, z: -1 },
  fovDeg: 32,
  cutAboveM: 1.45,
  sunAzimuthDeg: 35,
  sunElevationDeg: 55,
  samples: 48,
  deadlineMs: Date.now() + 20 * 60 * 1000,
});
if (!shot) {
  console.log(JSON.stringify({ ok: false, stage: "cycles", meshes: scene.meshes.length }));
  process.exit(4);
}
const out = path.resolve("out/apt14-pdf-1280x800.jpg");
mkdirSync(path.dirname(out), { recursive: true });
const bytes = Buffer.from(shot.base64, "base64");
writeFileSync(out, bytes);
console.log(JSON.stringify({ ok: true, path: out, bytes: bytes.length, ms: shot.ms, meshes: scene.meshes.length }));
