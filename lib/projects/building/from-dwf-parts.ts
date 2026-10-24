import { stageHouse } from "@/lib/projects/scene3d/house-staging";
import { insidePolygon } from "@/lib/projects/building/assemble";
import type { Primitive } from "@/lib/projects/building/model";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import type { Mask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { flatFromDwfFloor } from "@/lib/projects/dwf-flat";
import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfTerrace } from "@/lib/projects/dwf-terrace";
import { levelMarks } from "@/lib/projects/floor-split";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { buildFlatScene } from "@/lib/projects/scene3d/build-scene";
import { apartmentFinish, roomKindOf, stagedPlants } from "@/lib/projects/building/flat-finish";
import { splitStrip } from "@/lib/projects/sheet-split";
import { houseKnob } from "@/lib/projects/building/house-knobs";
import { createLogger } from "@/lib/logger";

const log = createLogger("from-dwf-parts");

/**
 * The pieces buildingFromDwf is assembled from: laying one floor sheet on
 * another, what the elevations say of the railings and the top, and the
 * apartments' insides brought over from the flat engine.
 */
export type ReadFloor = {
  sheet: DwfGeometry;
  floor: DwfFloor;
  level: number;
  units: number[];
  roof: boolean;
  walls: PlanWalls;
  /** The building on this sheet: its rooms and walls, holes filled, the largest part. */
  footprint: Mask;
  /** The footprint is what the walls close, not the rooms read: it may take in a fence. */
  walled?: boolean;
  /**
   * A private house's storey read again with its houses marked (houseUnitMarks),
   * for its furniture only. Marked in the structural read, the reader took
   * the corner rooms for terraces: their walls went, and a bed and a kitchen
   * stood out in the open (Gottlieb A, pilot of 10/10/2026).
   */
  furnish?: { floor: DwfFloor; units: number[] };
};

/**
 * The shift that lays one floor's walls on another's: coarse to fine over a
 * 50, 10 and 2 cm grid, the most wall on wall. The score is the share of the
 * floor's walls, in 10 cm cells, that land within a cell of the other's.
 */
export function register(ref: ReadFloor, other: ReadFloor): { x: number; y: number; score: number } {
  const cm = ref.floor.cm;
  const cellsOf = (f: ReadFloor, cell: number) => {
    const step = Math.round(cell / cm);
    const set = new Set<number>();
    const pts: Array<[number, number]> = [];
    const { cols, data } = f.walls.mask;
    for (let i = 0; i < data.length; i++) {
      if (!data[i]) continue;
      const x = Math.floor((i % cols) / step);
      const y = Math.floor(Math.floor(i / cols) / step);
      const k = y * 100_000 + x;
      if (!set.has(k)) {
        set.add(k);
        pts.push([x, y]);
      }
    }
    return { set, pts };
  };
  const centre = (f: ReadFloor) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    const { cols, data } = f.footprint;
    for (let i = 0; i < data.length; i++) {
      if (!data[i]) continue;
      sx += i % cols;
      sy += Math.floor(i / cols);
      n++;
    }
    return n ? { x: (sx / n) * (cm / 100), y: (sy / n) * (cm / 100) } : { x: 0, y: 0 };
  };
  const a = centre(ref);
  const b = centre(other);
  let best = { x: a.x - b.x, y: a.y - b.y };
  for (const [cell, reach] of [[50, 16], [10, 0.8], [2, 0.14]] as const) {
    const r = cellsOf(ref, cell);
    const o = cellsOf(other, cell);
    const m = cell / 100;
    const span = Math.round(reach / m);
    let top = -1;
    let found = best;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const sx = Math.round(best.x / m) + dx;
        const sy = Math.round(best.y / m) + dy;
        let score = 0;
        for (const [x, y] of o.pts) if (r.set.has((y + sy) * 100_000 + (x + sx))) score++;
        if (score > top) {
          top = score;
          found = { x: sx * m, y: sy * m };
        }
      }
    }
    best = found;
  }
  const r = cellsOf(ref, 10);
  const o = cellsOf(other, 10);
  const sx = Math.round(best.x / 0.1);
  const sy = Math.round(best.y / 0.1);
  let hit = 0;
  for (const [x, y] of o.pts) {
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = r.set.has((y + sy + dy) * 100_000 + (x + sx + dx));
    if (near) hit++;
  }
  return { ...best, score: o.pts.length ? hit / o.pts.length : 0 };
}

/**
 * Whether the elevations draw the terraces' railings as bars: a railing of
 * balusters is hundreds of vertical strokes a metre long, a glass one none.
 */
export function railingOfBars(strip: DwfGeometry): boolean {
  let bars = 0;
  for (const s of splitStrip(strip)) {
    if (s.kind !== "elevation") continue;
    for (const l of sheetGeometry(strip, s.box).segments) {
      const h = Math.abs(l.y2 - l.y1) / DWF_FLOOR_UNITS_PER_METRE;
      if (Math.abs(l.x2 - l.x1) < 0.01 * DWF_FLOOR_UNITS_PER_METRE && h > 0.85 && h < 1.2) bars++;
    }
  }
  return bars > 400;
}

/** A railing along a box's long side: a glass pane, or balusters every 12 cm under a rail. */
export function railing(edge: { centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }, bars: boolean, tag: string): Primitive[] {
  if (!bars) return [{ type: "box", centre: edge.centre, size: edge.size, material: "glass", tag }];
  const along = edge.size.x >= edge.size.z ? "x" : "z";
  const len = along === "x" ? edge.size.x : edge.size.z;
  const bottom = edge.centre.y - edge.size.y / 2;
  const top = edge.centre.y + edge.size.y / 2;
  const out: Primitive[] = [];
  const rail = along === "x" ? { x: len, y: 0.05, z: 0.05 } : { x: 0.05, y: 0.05, z: len };
  out.push({ type: "box", centre: { x: edge.centre.x, y: top - 0.025, z: edge.centre.z }, size: rail, material: "metal", tag });
  const n = Math.max(1, Math.round(len / 0.12));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    const at = along === "x" ? { x: edge.centre.x + t, z: edge.centre.z } : { x: edge.centre.x, z: edge.centre.z + t };
    out.push({ type: "box", centre: { x: at.x, y: (bottom + top - 0.05) / 2, z: at.z }, size: { x: 0.02, y: top - 0.05 - bottom, z: 0.02 }, material: "metal", tag });
  }
  return out;
}

/** The building's top: the highest floor-scale level any section or elevation marks. */
export function topLevel(strip: DwfGeometry): number | null {
  let top: number | null = null;
  for (const s of splitStrip(strip)) {
    if (s.kind !== "section" && s.kind !== "elevation") continue;
    for (const mark of levelMarks(sheetGeometry(strip, s.box).texts)) {
      if (Math.abs(mark.value) > 200) continue;
      if (top == null || mark.value > top) top = mark.value;
    }
  }
  return top;
}

/**
 * The apartments' insides — each room's floor finish and the furniture the
 * sheet draws — as the flat engine builds them for a flat's own render, moved
 * from the flat's frame to the building's.
 */
export function furnishedFlats(
  f: ReadFloor,
  terraces: DwfTerrace[],
  shift: { x: number; y: number },
  tag: string,
  /** The storey's outline, in the building's frame: nothing is furnished outside it. */
  within?: Array<[number, number]>,
  /** Filled with the rooms furnished, in the building's frame: where a house's interior views stand. */
  rooms?: Array<{ kind: string; name: string; areaM2: number; x: number; z: number; w: number; d: number }>,
  /** The haredi switch: single beds, a kitchen's one drawn sink double (sinks.ts). */
  haredi?: boolean,
): Primitive[] {
  const out: Primitive[] = [];
  const source = f.furnish ?? { floor: f.floor, units: f.units };
  const inside = (x: number, z: number) => !within || insidePolygon(within, x, z);
  const WALL = 0.2;
  const box = within?.length
    ? {
        x0: Math.min(...within.map(([x]) => x)) + WALL,
        x1: Math.max(...within.map(([x]) => x)) - WALL,
        z0: Math.min(...within.map(([, z]) => z)) + WALL,
        z1: Math.max(...within.map(([, z]) => z)) - WALL,
      }
    : null;
  for (const unit of source.units) {
    const built = flatFromDwfFloor(source.floor, f.sheet, unit, terraces, undefined, { drawnOnly: f.furnish != null });
    if (!built) continue;
    const scene = buildFlatScene(built.flat, built.rooms, haredi ? { haredi: true } : undefined);
    if (houseKnob("DBG_UNIT")) log.info("unit rooms", { tag, unit, rooms: scene.rooms.map((r) => `${r.kind}:${r.areaM2.toFixed(1)}@x${(r.bounds.x + shift.x).toFixed(1)}-${(r.bounds.x + r.bounds.w + shift.x).toFixed(1)},z${(r.bounds.z + shift.y).toFixed(1)}-${(r.bounds.z + r.bounds.d + shift.y).toFixed(1)}`).join(" ") });
    const centre = scene.pageCentre;
    if (!centre) continue;
    const ox = centre.x / scene.unitsPerMetre + shift.x;
    const oz = centre.y / scene.unitsPerMetre + shift.y;
    for (const r of scene.rooms) rooms?.push({ kind: r.kind, name: r.name, areaM2: r.areaM2, x: r.bounds.x + ox, z: r.bounds.z + oz, w: r.bounds.w, d: r.bounds.d });
    // A house's storey is furnished as its sheet draws it: no plants or rugs the sheet does not draw.
    for (const p of f.furnish ? [] : stagedPlants(scene)) {
      if (!inside(p.at.x + ox, p.at.z + oz)) continue;
      out.push({ type: "plant", at: { x: p.at.x + ox, y: f.level + p.at.y, z: p.at.z + oz }, height: p.height, spread: p.spread, tag: `${tag}:inside:plant` });
    }
    // A house's storey dressed by fixed rules where its sheet leaves it bare (house-staging.ts).
    const staged = f.furnish ? stageHouse(scene) : null;
    for (const pl of staged?.plants ?? []) {
      if (!inside(pl.x + ox, pl.z + oz)) continue;
      out.push({ type: "plant", at: { x: pl.x + ox, y: f.level, z: pl.z + oz }, height: pl.height, spread: pl.spread, tag: `${tag}:inside:plant` });
    }
    const kindOf = roomKindOf(scene);
    for (const mesh of [...scene.meshes, ...(staged?.boxes ?? [])]) {
      if (mesh.kind !== "furniture" && mesh.kind !== "floor" && mesh.kind !== "prop") continue;
      if (f.furnish && mesh.kind === "prop" && !mesh.sourceId.startsWith("prop:house-")) continue;
      const finish = apartmentFinish(mesh, kindOf);
      if (!finish) continue;
      // A rug a hair above the floor's finish, the finish a hair above the slab.
      const lift = mesh.kind === "floor" ? 0.012 : mesh.kind === "prop" ? 0.014 : 0;
      if (!inside(mesh.centre.x + ox, mesh.centre.z + oz)) continue;
      // A floor's finish stops inside the outer walls: run on to the facade it
      // showed as an oak line across the plaster between the storeys.
      let [cx, cz, sx, sz] = [mesh.centre.x + ox, mesh.centre.z + oz, mesh.size.x, mesh.size.z];
      if (mesh.kind === "floor" && box) {
        const [x0, x1] = [Math.max(cx - sx / 2, box.x0), Math.min(cx + sx / 2, box.x1)];
        const [z0, z1] = [Math.max(cz - sz / 2, box.z0), Math.min(cz + sz / 2, box.z1)];
        if (x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
        [cx, cz, sx, sz] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0];
      }
      out.push({
        type: "box",
        centre: { x: cx, y: f.level + mesh.centre.y + lift, z: cz },
        size: { ...mesh.size, x: sx, z: sz },
        material: finish.material,
        tag: `${tag}:inside:${mesh.kind === "floor" ? "finish" : "furniture"}`,
        ...(finish.round ? { round: finish.round } : {}),
      });
    }
  }
  return f.furnish && within && !houseKnob("NO_MIRROR") ? mirroredFinishes(mirroredOnly(out, within), within) : out;
}

/**
 * A pair is drawn mirrored, and so is each room's floor: where the reading
 * split a room in one house only — Gottlieb C's upper bedroom, its wardrobe
 * bay read as a room of its own on the right — the split part falls back to
 * porcelain while its twin is oak. A finish left at that fallback takes the
 * finish its mirror image stands on in the other house.
 */
export function mirroredFinishes(prims: Primitive[], outline: Array<[number, number]>): Primitive[] {
  const xs = outline.map(([x]) => x);
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
  type Box = Extract<Primitive, { type: "box" }>;
  const finishes = prims.filter((p): p is Box => p.type === "box" && (p.tag ?? "").endsWith(":inside:finish"));
  const half = (p: Box) => Math.sign(p.centre.x - axis);
  const covers = (q: Box, x: number, z: number) => Math.abs(q.centre.x - x) < q.size.x / 2 && Math.abs(q.centre.z - z) < q.size.z / 2;
  const named = new Map<Box, Box["material"]>();
  for (const p of finishes) {
    if (p.material !== "floorPorcelain" || Math.abs(p.centre.x - axis) < p.size.x / 2) continue;
    const twin = finishes.find((q) => half(q) === -half(p) && Math.abs(q.centre.y - p.centre.y) < 0.5 && covers(q, 2 * axis - p.centre.x, p.centre.z));
    if (twin && twin.material !== p.material && twin.material !== "terraceTile") named.set(p, twin.material);
  }
  if (!named.size) return prims;
  return prims.map((p) => (p.type === "box" && named.has(p) ? { ...p, material: named.get(p)! } : p));
}

/**
 * A pair of semi-detached houses is drawn mirrored about their party wall: a
 * piece read in one house with no like piece mirrored in the other is a
 * misreading — a stair's break line read as a wardrobe, a tile as a desk —
 * and is left out. Only where the pair is mirrored: most of the pieces have
 * their twin; else every piece stands.
 */
function mirroredOnly(prims: Primitive[], outline: Array<[number, number]>): Primitive[] {
  const xs = outline.map(([x]) => x);
  const axis = (Math.min(...xs) + Math.max(...xs)) / 2;
  const pieces = prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && (p.tag ?? "").endsWith(":inside:furniture"));
  const twin = (p: Extract<Primitive, { type: "box" }>) =>
    pieces.some(
      (q) =>
        q !== p &&
        q.material === p.material &&
        Math.abs(2 * axis - q.centre.x - p.centre.x) < 0.3 &&
        Math.abs(q.centre.z - p.centre.z) < 0.3 &&
        Math.abs(q.size.x - p.size.x) < 0.25 &&
        Math.abs(q.size.z - p.size.z) < 0.25,
    );
  const paired = pieces.filter(twin);
  if (pieces.length < 10 || paired.length < 0.75 * pieces.length) return prims;
  const keep = new Set(paired);
  return prims.filter((p) => p.type !== "box" || !(p.tag ?? "").endsWith(":inside:furniture") || keep.has(p));
}
