import { floorPrimitives, insidePolygon, parapet, slab, inset, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { findOpenings, type Footprint } from "@/lib/projects/building/plan-openings";
import { bandsOf, type PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask, label, traceOutline } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { readDwfFloor } from "@/lib/projects/dwf-floor";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import { furnishedFlats, railing, railingOfBars, register, topLevel, type ReadFloor } from "@/lib/projects/building/from-dwf-parts";
import { levelMarks } from "@/lib/projects/floor-split";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { splitStrip, unitMarks } from "@/lib/projects/sheet-split";

/**
 * A building stood up from its permit strip (DWF), with nothing written down
 * for it by hand.
 *
 * Everything מרכז פסג"ה needed spelled out — which sheet is which floor, how
 * the sheets register, the levels, the outlines — a DWF strip carries: each
 * floor sheet is found and read by the permit reader into walls, the gaps it
 * closed and the rooms; its level is the level most often marked on it (a
 * floor's rooms are all marked, the terrace below it once or twice); its
 * outline is its rooms and walls together; and the sheets are laid on one
 * another by their walls, the stair and lift core standing in the same place
 * on every floor. The top is the highest level the sections mark.
 *
 * What a plan does not draw is taken from standards and said so: a window's
 * sill at 90 cm and head at 2.20 m, a door onto a terrace glazed from the
 * floor, stone outside and plaster within, a terrace's railing 1.05 m high —
 * of bars where the elevations draw bars, of glass where they do not — and a
 * parapet a metre high on the roof.
 */
export const DWF_BUILDING_STANDARDS = {
  window: { sill: 0.9, head: 2.2, surround: 0 },
  railing: 1.05,
  parapet: 1.0,
  /** Floor to floor where a sheet has no floor above it and the sections mark no top. */
  storey: 3.0,
} as const;

export type DwfBuildingFloor = {
  id: string;
  level: number;
  height: number;
  units: number[];
  /** Metres to add to this sheet's own coordinates to land in the building's frame. */
  shift: { x: number; y: number };
  outline: Outline;
  /** Whether it is the roof's small structure (a stair head, an attic) rather than a storey. */
  roof: boolean;
  /** Of this sheet's walls, the share that lands on the neighbour's it was laid on (1 for the typical floor). */
  registration: number;
  /** The floor's sheet, in its own frame: shift it by `shift` (in metres) to land in the building's. */
  sheet: DwfGeometry;
};

export type DwfBuilding = { model: BuildingModel; floors: DwfBuildingFloor[] };

/** The level most often marked on a sheet, to the centimetre: its own floor's. */
export function sheetLevel(sheet: DwfGeometry): number | null {
  const counts = new Map<number, number>();
  for (const mark of levelMarks(sheet.texts)) {
    // Absolute heights (the survey's 923.20) are not a floor's.
    if (Math.abs(mark.value) > 200) continue;
    const v = Math.round(mark.value * 100) / 100;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? best[0] : null;
}

function readFloorSheet(strip: DwfGeometry, box: { x: number; y: number; width: number; height: number }, units: number[], roof: boolean): ReadFloor | null {
  const sheet = sheetGeometry(strip, box);
  const level = sheetLevel(sheet);
  if (level == null) return null;
  const floor = readDwfFloor(sheet, { unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, units: unitMarks(sheet.texts) });
  const { cols, rows, cm } = floor;
  const mask = emptyMask(cols, rows);
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = floor.wall[i] === 1 ? 1 : 0;
  const walls: PlanWalls = { box: { x: 0, y: 0, width: sheet.pageWidth, height: sheet.pageHeight }, unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, cm, mask, bands: bandsOf(mask, cm) };
  // The building: every pixel of a room or a wall the reader closed.
  const inside = emptyMask(cols, rows);
  for (let i = 0; i < inside.data.length; i++) {
    const r = floor.room[i]!;
    inside.data[i] = floor.wall[i] || (r !== 0 && r !== floor.outside) ? 1 : 0;
  }
  const parts = label(inside, 1);
  let biggest = 0;
  for (let id = 1; id < parts.sizes.length; id++) if (parts.sizes[id]! > parts.sizes[biggest]!) biggest = id;
  const footprint = emptyMask(cols, rows);
  for (let i = 0; i < footprint.data.length; i++) footprint.data[i] = parts.ids[i] === biggest ? 1 : 0;
  // Holes: a courtyard or a light well stays open only if it reaches the edge.
  const holes = label(footprint, 0);
  for (let i = 0; i < footprint.data.length; i++) if (!footprint.data[i] && !holes.touchesEdge[holes.ids[i]!]) footprint.data[i] = 1;
  return { sheet, floor, level, units, roof, walls, footprint };
}

export function buildingFromDwf(strip: DwfGeometry, options?: { name?: string }): DwfBuilding {
  const read: ReadFloor[] = [];
  for (const s of splitStrip(strip)) {
    if (s.kind !== "floor" && s.kind !== "roof") continue;
    const f = readFloorSheet(strip, s.box, s.units, s.kind === "roof");
    if (f) read.push(f);
  }
  read.sort((a, b) => a.level - b.level);
  // One sheet a level: where two claim it, the one with more wall.
  const byLevel = new Map<number, ReadFloor>();
  const wallCount = (f: ReadFloor) => f.walls.mask.data.reduce((n, v) => n + v, 0);
  for (const f of read) {
    const have = byLevel.get(f.level);
    if (!have || wallCount(f) > wallCount(have)) byLevel.set(f.level, f);
  }
  // A sheet whose walls the reader cannot see — drawn as double lines, with
  // no hatch, as a roof plan's stair head often is — is left out rather than
  // stood up as a guess.
  const most = Math.max(0, ...[...byLevel.values()].map(wallCount));
  const floors = [...byLevel.values()].filter((f) => wallCount(f) >= most * 0.02).sort((a, b) => a.level - b.level);
  if (floors.length === 0) throw new Error("no floor sheet with a level mark");
  // The frame: the typical floor, the storey whose sheet names the most flats.
  const ref = [...floors].sort((a, b) => b.units.length - a.units.length || wallCount(b) - wallCount(a))[0]!;
  const top = topLevel(strip);
  const bars = railingOfBars(strip);

  // Each floor laid on its neighbour nearer the typical one, outwards from it:
  // an attic or a duplex's upper floor shares little with the typical floor
  // and most of its walls with the floor it stands on.
  const shifts = new Map<ReadFloor, { x: number; y: number; score: number }>([[ref, { x: 0, y: 0, score: 1 }]]);
  const refAt = floors.indexOf(ref);
  for (const dir of [1, -1]) {
    for (let i = refAt + dir; i >= 0 && i < floors.length; i += dir) {
      const f = floors[i]!;
      const neighbour = floors[i - dir]!;
      const base = shifts.get(neighbour)!;
      const step = register(neighbour, f);
      shifts.set(f, { x: base.x + step.x, y: base.y + step.y, score: step.score });
    }
  }

  const prims: Primitive[] = [];
  const out: DwfBuildingFloor[] = [];
  floors.forEach((f, i) => {
    const shift = shifts.get(f)!;
    const next = floors[i + 1];
    const height = next ? next.level - f.level : top != null && top > f.level + 1.5 ? top - f.level : DWF_BUILDING_STANDARDS.storey;
    const id = `floor-${i}`;
    const m = f.floor.cm / 100;
    const localOutline: Outline = traceOutline(f.footprint).map(([x, y]) => [x * m, y * m]);
    const outline: Outline = localOutline.map(([x, y]) => [x + shift.x, y + shift.y]);
    const moved: PlanWalls = { ...f.walls, bands: f.walls.bands.map((b) => ({ ...b, x: b.x + shift.x, y: b.y + shift.y })) };
    const footprint: Footprint = { mask: f.footprint, cm: f.floor.cm };
    const terraces = readDwfTerraces(f.floor, f.sheet);
    prims.push(...furnishedFlats(f, terraces, shift, id));
    const terraceAt = new Uint8Array(f.floor.cols * f.floor.rows);
    for (const t of terraces) for (const k of t.pixels) terraceAt[k] = 1;
    const onTerrace = (x: number, y: number) => {
      const px = Math.round(((x - shift.x) * 100) / f.floor.cm);
      const py = Math.round(((y - shift.y) * 100) / f.floor.cm);
      return px >= 0 && py >= 0 && px < f.floor.cols && py < f.floor.rows && terraceAt[py * f.floor.cols + px] === 1;
    };
    const openings = findOpenings(f.walls, footprint).map((o) => {
      const moved = { ...o, x: o.x + shift.x, y: o.y + shift.y };
      if (!o.exterior || !o.outward) return moved;
      // Half a metre out from its middle: a terrace there makes it a door onto it.
      const cx = moved.x + moved.w / 2;
      const cy = moved.y + moved.h / 2;
      const out = (o.orientation === "h" ? moved.h : moved.w) / 2 + 0.5;
      const px = o.orientation === "v" ? cx + o.outward * out : cx;
      const py = o.orientation === "h" ? cy + o.outward * out : cy;
      return onTerrace(px, py) ? { ...moved, full: true } : moved;
    });
    const spec: FloorSpec = { id, level: f.level, height, outline, window: DWF_BUILDING_STANDARDS.window, facade: "stone", interior: "plaster" };
    prims.push(...floorPrimitives(moved, openings, spec));
    prims.push(slab(inset(outline, 0.06), f.level - 0.02, 0.3, "slab", `${id}:slab`));
    prims.push(slab(inset(outline, 0.06), f.level, 0.02, "floorStone", `${id}:floor`));

    // Terraces: their floor, and a glass railing on every edge not against the building.
    for (const t of terraces) {
      const tm = emptyMask(f.floor.cols, f.floor.rows);
      for (const k of t.pixels) tm.data[k] = 1;
      const ring: Outline = traceOutline(tm).map(([x, y]) => [x * m + shift.x, y * m + shift.y]);
      if (ring.length < 3) continue;
      prims.push(slab(ring, f.level - 0.04, 0.3, "floorStone", `${id}:terrace`));
      for (const rail of parapet(ring, f.level - 0.04, f.level + DWF_BUILDING_STANDARDS.railing, 0.03, "glass", `${id}:railing`)) {
        if (rail.type !== "box") continue;
        const probe = [rail.centre.x, rail.centre.z] as const;
        // Against the building: a probe 40 cm beyond the edge lands inside it.
        const beyond = [0.4, -0.4].some((d) =>
          rail.size.x > rail.size.z ? insidePolygon(outline, probe[0], probe[1] + d) && !insidePolygon(ring, probe[0], probe[1] + d) : insidePolygon(outline, probe[0] + d, probe[1]) && !insidePolygon(ring, probe[0] + d, probe[1]),
        );
        if (!beyond) prims.push(...railing(rail, bars, `${id}:railing`));
      }
    }
    out.push({ id, level: f.level, height, units: f.units, shift: { x: shift.x, y: shift.y }, outline, roof: f.roof, registration: shift.score, sheet: f.sheet });
  });

  // The roof over the highest storey (not over a stair head standing on it).
  const storeys = out.filter((f) => !f.roof);
  const last = storeys[storeys.length - 1]!;
  const roofLevel = last.level + last.height;
  prims.push(slab(inset(last.outline, 0.06), roofLevel, 0.35, "slab", "roof:slab"));
  prims.push(...parapet(last.outline, roofLevel, roofLevel + DWF_BUILDING_STANDARDS.parapet, 0.25, "stone", "roof:parapet"));
  const headroom = out.filter((f) => f.roof);
  for (const h of headroom) prims.push(slab(inset(h.outline, 0.06), h.level + h.height, 0.3, "slab", "roof:slab"));

  // Ground: paving round the building, at its lowest floor.
  const xs = out.flatMap((f) => f.outline.map(([x]) => x));
  const ys = out.flatMap((f) => f.outline.map(([, y]) => y));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ground = out[0]!.level;
  const pad = 12;
  prims.push(slab([[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]], ground - 0.03, 0.4, "paving", "site:ground"));
  const topM = Math.max(...out.map((f) => f.level + f.height)) + DWF_BUILDING_STANDARDS.parapet;
  return {
    model: {
      name: options?.name ?? "בניין",
      primitives: prims,
      extent: { x: x0 - pad, z: y0 - pad, width: x1 - x0 + 2 * pad, depth: y1 - y0 + 2 * pad, yMin: ground - 0.5, yMax: topM },
      north: { x: 0, z: -1 },
    },
    floors: out,
  };
}
