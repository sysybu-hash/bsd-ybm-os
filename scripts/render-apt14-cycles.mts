import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const { geometryFromDxf } = await import("@/lib/projects/floorplan-dxf");
const { cropGeometryToUnit, unitInterior } = await import("@/lib/projects/dxf-unit-crop");
const { renderFlatFromGeometry } = await import("@/lib/projects/floorplan-render-flat");
const { FLOORPLAN_VIZ_PRESETS } = await import("@/lib/projects/floorplan-viz-styles");
const { sceneStyleFor } = await import("@/lib/projects/scene3d/style");
const { buildFlatScene } = await import("@/lib/projects/scene3d/build-scene");
const { dollhouseView } = await import("@/lib/projects/building/flat-model");
const { photographWithCycles } = await import("@/lib/projects/scene3d/blender-cycles");
const { FLOOR_T_M, WALL_HEIGHT_M } = await import("@/lib/projects/scene3d/standards");

const file = "מערכת הדמיות/ויינברג/קבצים/מכר סופי 29.10.26.dxf";
const geometry = await geometryFromDxf(readFileSync(file));
if (!geometry) {
  console.log(JSON.stringify({ ok: false, stage: "geometry" }));
  process.exit(1);
}
const cropped = cropGeometryToUnit(geometry, 14);
const marks = cropped?.unitMarks?.map((item) => item.number) ?? [];
if (!cropped || marks.some((number) => number !== 14)) {
  console.log(JSON.stringify({ ok: false, stage: "crop", marks }));
  process.exit(1);
}

const rendered = await renderFlatFromGeometry(cropped, {
  targetAreaM2: 0,
  unitsPerMetreHint: cropped.unitsPerMetre,
  unitsFromDrawing: true,
  label: "14",
});
if (!rendered) {
  console.log(JSON.stringify({ ok: false, stage: "measure" }));
  process.exit(2);
}

const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic);
const scene = buildFlatScene(rendered.flat, rendered.rooms, { rules: style.rules });
if (scene.meshes.length === 0) {
  console.log(JSON.stringify({ ok: false, stage: "scene", rooms: rendered.rooms.length, walls: rendered.flat.bodies.length }));
  process.exit(3);
}
const interior = unitInterior(geometry, 14);
const centre = scene.pageCentre;
if (interior && centre) {
  type Rect = { x: number; y: number; w: number; h: number };
  const cell = interior.floor.length > 1 ? interior.floor[1]!.y - interior.floor[0]!.y : 1;
  const rects: Rect[] = [];
  let active: Rect[] = [];
  for (const row of interior.floor) {
    const next: Rect[] = [];
    const used = new Set<number>();
    for (const [a, b] of row.spans) {
      const hit = active.findIndex((rect, index) => !used.has(index) && Math.abs(rect.x - a) < 0.5 && Math.abs(rect.x + rect.w - b) < 0.5 && Math.abs(rect.y + rect.h - row.y) < cell * 0.6);
      if (hit >= 0) {
        used.add(hit);
        const rect = active[hit]!;
        next.push({ x: rect.x, y: rect.y, w: rect.w, h: row.y + cell - rect.y });
      } else next.push({ x: a, y: row.y, w: b - a, h: cell });
    }
    for (let index = 0; index < active.length; index++) if (!used.has(index)) rects.push(active[index]!);
    active = next;
  }
  rects.push(...active);
  const upm = scene.unitsPerMetre;
  const pageOf = (x: number, z: number) => ({ x: x * upm + centre.x, y: z * upm + centre.y });
  const onFloor = (x: number, z: number) => {
    const page = pageOf(x, z);
    return rects.some((rect) => page.x >= rect.x && page.x <= rect.x + rect.w && page.y >= rect.y && page.y <= rect.y + rect.h);
  };
  const kept = scene.meshes.filter((mesh) => mesh.kind !== "floor" && mesh.kind !== "wall" && mesh.kind !== "wallHead" && mesh.kind !== "wallSill" && mesh.kind !== "wallCap" && mesh.kind !== "skirting" && (mesh.kind !== "furniture" && mesh.kind !== "prop" || onFloor(mesh.centre.x, mesh.centre.z)));
  const place = (x: number, y: number, w: number, h: number, y0: number, y1: number, kind: "floor" | "wall", material: "floorWood" | "wall") => {
    kept.push({
      kind,
      material,
      centre: { x: (x + w / 2 - centre.x) / upm, y: (y0 + y1) / 2, z: (y + h / 2 - centre.y) / upm },
      size: { x: w / upm, y: y1 - y0, z: h / upm },
      sourceId: kind === "floor" ? "floor:interior" : "wall:interior",
    });
  };
  for (const rect of rects) place(rect.x, rect.y, rect.w, rect.h, -FLOOR_T_M, 0, "floor", "floorWood");
  for (const wall of interior.walls) {
    if (wall.to - wall.from < upm * 0.2) continue;
    const half = wall.thickness / 2;
    if (wall.orientation === "h") place(wall.from, wall.centre - half, wall.to - wall.from, wall.thickness, 0, WALL_HEIGHT_M, "wall", "wall");
    else place(wall.centre - half, wall.from, wall.thickness, wall.to - wall.from, 0, WALL_HEIGHT_M, "wall", "wall");
  }
  scene.meshes = kept;
  console.log(JSON.stringify({ interiorM2: Math.round(interior.areaM2 * 10) / 10, floorRects: rects.length, walls: interior.walls.length }));
}
const view = dollhouseView(scene);
let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (const mesh of scene.meshes) {
  minX = Math.min(minX, mesh.centre.x - mesh.size.x / 2);
  minY = Math.min(minY, mesh.centre.y - mesh.size.y / 2);
  minZ = Math.min(minZ, mesh.centre.z - mesh.size.z / 2);
  maxX = Math.max(maxX, mesh.centre.x + mesh.size.x / 2);
  maxY = Math.max(maxY, mesh.centre.y + mesh.size.y / 2);
  maxZ = Math.max(maxZ, mesh.centre.z + mesh.size.z / 2);
}
const byKind: Record<string, { n: number; area: number }> = {};
for (const mesh of scene.meshes) {
  const row = byKind[mesh.kind] ?? { n: 0, area: 0 };
  row.n += 1;
  row.area += mesh.size.x * mesh.size.z;
  byKind[mesh.kind] = row;
}
const floors = scene.meshes.filter((mesh) => mesh.kind === "floor" || mesh.kind === "wall").map((mesh) => ({
  kind: mesh.kind,
  material: mesh.material,
  area: Math.round(mesh.size.x * mesh.size.z * 100) / 100,
  size: [Math.round(mesh.size.x * 100) / 100, Math.round(mesh.size.y * 100) / 100, Math.round(mesh.size.z * 100) / 100],
}));
console.log(JSON.stringify({
  extent: scene.extent,
  camera: view.payload.camera,
  bounds: { minX, minY, minZ, maxX, maxY, maxZ },
  byKind,
  floors: floors.sort((a, b) => b.area - a.area).slice(0, 24),
}));
if (process.argv.includes("--stats")) process.exit(0);
const shot = await photographWithCycles(scene, style, {
  width: 800,
  height: 500,
  position: view.payload.camera.position,
  target: view.payload.camera.target,
  up: view.payload.camera.up ?? { x: 0, y: 0, z: -1 },
  fovDeg: view.payload.camera.fovDeg,
  sunAzimuthDeg: view.payload.sun.azimuthDeg,
  sunElevationDeg: 75,
  samples: 32,
  deadlineMs: Date.now() + 20 * 60 * 1000,
});
if (!shot) {
  console.log(JSON.stringify({ ok: false, stage: "cycles", meshes: scene.meshes.length, rooms: rendered.rooms.length, walls: rendered.flat.bodies.length }));
  process.exit(4);
}

const out = path.resolve("out/apt14-800x500.jpg");
mkdirSync(path.dirname(out), { recursive: true });
const bytes = Buffer.from(shot.base64, "base64");
writeFileSync(out, bytes);
console.log(JSON.stringify({
  ok: true,
  path: out,
  bytes: bytes.length,
  widthPx: shot.widthPx,
  heightPx: shot.heightPx,
  ms: shot.ms,
  rooms: rendered.rooms.length,
  walls: rendered.flat.bodies.length,
  openings: rendered.flat.openings.length,
  meshes: scene.meshes.length,
  marks,
}));
