import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import type { Mask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { flatFromDwfFloor } from "@/lib/projects/dwf-flat";
import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfTerrace } from "@/lib/projects/dwf-terrace";
import { levelMarks } from "@/lib/projects/floor-split";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { buildFlatScene } from "@/lib/projects/scene3d/build-scene";
import type { MaterialId } from "@/lib/projects/scene3d/types";
import { splitStrip } from "@/lib/projects/sheet-split";

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

/** The flat engine's materials, as the building's. */
const MATERIAL: Partial<Record<MaterialId, BuildingMaterial>> = {
  floorWood: "floorWood",
  floorTile: "floorStone",
  floorStone: "floorStone",
  glass: "glass",
  joinery: "timber",
  metal: "metal",
  linen: "linen",
  upholstery: "upholstery",
  timber: "timber",
  worktop: "worktop",
  ceramic: "ceramic",
  steel: "metal",
  neutral: "plaster",
};

/**
 * The apartments' insides — each room's floor finish and the furniture the
 * sheet draws — as the flat engine builds them for a flat's own render, moved
 * from the flat's frame to the building's.
 */
export function furnishedFlats(f: ReadFloor, terraces: DwfTerrace[], shift: { x: number; y: number }, tag: string): Primitive[] {
  const out: Primitive[] = [];
  for (const unit of f.units) {
    const built = flatFromDwfFloor(f.floor, f.sheet, unit, terraces);
    if (!built) continue;
    const scene = buildFlatScene(built.flat, built.rooms);
    const centre = scene.pageCentre;
    if (!centre) continue;
    const ox = centre.x / scene.unitsPerMetre + shift.x;
    const oz = centre.y / scene.unitsPerMetre + shift.y;
    for (const mesh of scene.meshes) {
      if (mesh.kind !== "furniture" && mesh.kind !== "floor") continue;
      const material = MATERIAL[mesh.material];
      if (!material) continue;
      out.push({
        type: "box",
        centre: { x: mesh.centre.x + ox, y: f.level + mesh.centre.y + (mesh.kind === "floor" ? 0.012 : 0), z: mesh.centre.z + oz },
        size: mesh.size,
        material,
        tag: `${tag}:inside:${mesh.kind === "floor" ? "finish" : "furniture"}`,
      });
    }
  }
  return out;
}
