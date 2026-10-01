import { floorPrimitives, insidePolygon, parapet, slab, inset, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, BuildingModel, Primitive } from "@/lib/projects/building/model";
import { findOpenings, type Footprint } from "@/lib/projects/building/plan-openings";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask, traceOutline } from "@/lib/projects/building/raster";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import { paintFacades, readElevations, windowHeights } from "@/lib/projects/building/facade-materials";
import { furnishedFlats, railing, railingOfBars, register, topLevel, type ReadFloor } from "@/lib/projects/building/from-dwf-parts";
import { faceTheWeather, readFloorSheet } from "@/lib/projects/building/from-dwf-sheet";
export { sheetLevel } from "@/lib/projects/building/from-dwf-sheet";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { splitStrip } from "@/lib/projects/sheet-split";

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

/** A storey as the booklet needs it: plain data, kept between a job's steps. */
export type BuildingFloorMeta = {
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
  /** The floor sheet's size, in page units: its frame, shifted by `shift`, is the plan's. */
  sheetWidth: number;
  sheetHeight: number;
};

export type DwfBuildingFloor = BuildingFloorMeta & {
  /** The floor's sheet, in its own frame: shift it by `shift` (in metres) to land in the building's. */
  sheet: DwfGeometry;
};

export type DwfBuilding = {
  model: BuildingModel;
  floors: DwfBuildingFloor[];
  /** Which hatch the elevations draw each material in, and how many walls took one. */
  facade: { painted: number; key: Partial<Record<string, BuildingMaterial>> };
  /** The window its elevations draw, and how many windows it was measured on (0: the standard). */
  window: { sill: number; head: number; measured: number };
};

/** The level most often marked on a sheet, to the centimetre: its own floor's. */

/**
 * The middle of the building as its elevations measure it: across the
 * storeys above the ground. A ground floor drawn on its site plan takes in
 * fences and ramps the elevations leave off, and a roof's stair head is not
 * the building's width.
 */
export function buildingCentre(floors: Array<{ level: number; roof: boolean; outline: Outline }>): { x: number; z: number } {
  const above = floors.filter((f) => !f.roof && f.level > 1);
  const use = above.length ? above : floors;
  const xs = use.flatMap((f) => f.outline.map(([x]) => x));
  const zs = use.flatMap((f) => f.outline.map(([, z]) => z));
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

/** Rooms that are the outside let in: unnamed, no flat's, under 15 m², touching the world across a closed gap. */

/** A closed-gap pixel at a recess's mouth: it closes nothing that is the building's. */

/** What a floor's walls close, gaps to 1.5 m (or `reach` px a side) bridged: its largest part, holes filled. */

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
  const gaps = floors.slice(1).map((f, i) => f.level - floors[i]!.level).filter((h) => h > 2 && h < 6).sort((a, b) => a - b);
  const storey = gaps[gaps.length >> 1] ?? DWF_BUILDING_STANDARDS.storey;
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

  // Every floor's outline first: the building's middle is where its
  // elevations are laid from, and the windows are measured on them.
  const outlines = floors.map((f) => {
    const shift = shifts.get(f)!;
    const m = f.floor.cm / 100;
    return traceOutline(f.footprint).map(([x, y]) => [x * m + shift.x, y * m + shift.y] as [number, number]);
  });
  const centre = buildingCentre(floors.map((f, i) => ({ level: f.level, roof: f.roof, outline: outlines[i]! })));
  const elevations = readElevations(strip);

  // The building's own window, for the windows its elevations do not show
  // clearly: the median sill and head of those they do — not a standard's.
  const measured: Array<{ sill: number; head: number }> = [];
  floors.forEach((f, i) => {
    const shift = shifts.get(f)!;
    const next = floors[i + 1];
    const height = next ? next.level - f.level : storey;
    for (const o of findOpenings(f.walls, { mask: f.footprint, cm: f.floor.cm })) {
      if (!o.exterior || !o.outward) continue;
      const drawnAt = windowHeights(elevations, { ...o, x: o.x + shift.x, y: o.y + shift.y, outward: o.outward }, f.level, height, centre);
      if (drawnAt && drawnAt.sill > 0.2) measured.push(drawnAt);
    }
  });
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!;
  const typicalWindow =
    measured.length >= 5
      ? { sill: mid(measured.map((w) => w.sill)), head: mid(measured.map((w) => w.head)), surround: 0 }
      : DWF_BUILDING_STANDARDS.window;

  const prims: Primitive[] = [];
  const out: DwfBuildingFloor[] = [];
  floors.forEach((f, i) => {
    const shift = shifts.get(f)!;
    const next = floors[i + 1];
    // The top storey is as tall as the storeys under it. The sections' highest
    // mark is the top only when nothing stands on the roof: here it was the
    // stair head's, +36, and the top floor came out 6.5 m tall.
    const height = next ? next.level - f.level : top != null && top > f.level + 1.5 ? Math.min(top - f.level, storey) : storey;
    const id = `floor-${i}`;
    const m = f.floor.cm / 100;
    const outline: Outline = outlines[i]!;
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
      const placed = { ...o, x: o.x + shift.x, y: o.y + shift.y };
      if (!o.exterior || !o.outward) return placed;
      // Its sill and head as its elevation draws them.
      const drawnAt = windowHeights(elevations, { ...placed, outward: o.outward }, f.level, height, centre);
      const moved = drawnAt ? { ...placed, sill: drawnAt.sill, head: drawnAt.head } : placed;
      // Half a metre out from its middle: a terrace there makes it a door onto it.
      const cx = moved.x + moved.w / 2;
      const cy = moved.y + moved.h / 2;
      const out = (o.orientation === "h" ? moved.h : moved.w) / 2 + 0.5;
      const px = o.orientation === "v" ? cx + o.outward * out : cx;
      const py = o.orientation === "h" ? cy + o.outward * out : cy;
      return onTerrace(px, py) ? { ...moved, full: true } : moved;
    });
    const spec: FloorSpec = { id, level: f.level, height, outline, window: typicalWindow, facade: "stone", interior: "plaster" };
    prims.push(...faceTheWeather(floorPrimitives(moved, openings, spec), outline, spec.facade));
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
    out.push({ id, level: f.level, height, units: f.units, shift: { x: shift.x, y: shift.y }, outline, roof: f.roof, registration: shift.score, sheet: f.sheet, sheetWidth: f.sheet.pageWidth, sheetHeight: f.sheet.pageHeight });
  });

  // The roof over the highest storey (not over a stair head standing on it).
  const storeys = out.filter((f) => !f.roof);
  const last = storeys[storeys.length - 1]!;
  const roofLevel = last.level + last.height;
  prims.push(slab(inset(last.outline, 0.06), roofLevel, 0.35, "slab", "roof:slab"));
  prims.push(...parapet(last.outline, roofLevel, roofLevel + DWF_BUILDING_STANDARDS.parapet, 0.25, "stone", "roof:parapet"));
  const headroom = out.filter((f) => f.roof);
  for (const h of headroom) prims.push(slab(inset(h.outline, 0.06), h.level + h.height, 0.3, "slab", "roof:slab"));

  // Where a storey steps back from the one under it, that one's top is open:
  // a roof, walked on as a terrace, with a railing on its open edges — bars
  // where the elevations draw bars. Without it the floor below stood
  // unroofed wherever the floor above was smaller.
  for (let i = 0; i < storeys.length - 1; i++) {
    const below = storeys[i]!;
    const above = storeys[i + 1]!;
    const top = below.level + below.height;
    prims.push(slab(inset(below.outline, 0.06), top - 0.03, 0.3, "paving", `roof:${below.id}`));
    const under = (x: number, z: number) => [0.5, -0.5].some((d) => insidePolygon(above.outline, x + d, z) || insidePolygon(above.outline, x, z + d));
    for (const edge of parapet(below.outline, top, top + DWF_BUILDING_STANDARDS.railing, 0.04, "metal", `roof:${below.id}:railing`)) {
      if (edge.type !== "box" || under(edge.centre.x, edge.centre.z)) continue;
      prims.push(...railing(edge, bars, `roof:${below.id}:railing`));
    }
  }

  // The facade in the materials the elevations name, laid on by hatch.
  const facade = paintFacades(prims, out, strip, centre);

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
    facade,
    window: { sill: typicalWindow.sill, head: typicalWindow.head, measured: measured.length },
  };
}
