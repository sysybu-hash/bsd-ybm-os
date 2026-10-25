import { floorPrimitives, insidePolygon, parapet, slab, inset, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, BuildingModel, Primitive } from "@/lib/projects/building/model";
import { cutFramedWindows, findOpenings, houseOpenings, fitDrawnDoors, fitDrawnWindows, markDoors, type PlanLeaf, type PlanOpening, type PlanSwing } from "@/lib/projects/building/plan-openings";
import { PLAN_NORTH, type North } from "@/lib/projects/building/compass";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask, traceOutline } from "@/lib/projects/building/raster";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import { drawnSideFlight, paintFacades, readElevations, windowHeights } from "@/lib/projects/building/facade-materials";
import { laundryScreens } from "@/lib/projects/building/laundry-screens";
import { furnishedFlats, railing, railingOfBars, register, topLevel, type ReadFloor } from "@/lib/projects/building/from-dwf-parts";
import { clipUnder, faceTheWeather, flushFacade, parapetOnWalls, readFloorSheet, settleStoreyLevels, sheetLevel } from "@/lib/projects/building/from-dwf-sheet";
export { sheetLevel } from "@/lib/projects/building/from-dwf-sheet";
import { HOUSE_FRAME_M, HOUSE_PLASTER_BODY, HOUSE_WINDOW_FRAME, houseSite, outdoorLights, paintByVolume, plasterInside, softenHouse } from "@/lib/projects/building/house-finish";
import { closeFenceEnds, houseYard, pavingAround, stripInventStoneAtBins, type HouseSiteLevels, type YardHint } from "@/lib/projects/building/house-yard";
import { balconiesPrimitives, floorBalconies, houseElevations, houseEntranceFlights, houseRoofScreens, houseSideFlights, streetSide, type StoodFlight } from "@/lib/projects/building/house-additions";
import { interiorStairs, type HouseBalcony, type RoofScreen } from "@/lib/projects/building/house-features";
import { printedRooms } from "@/lib/projects/dwf-floor";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
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
 * floor, stone outside and plaster within — a private house instead in grey
 * and brown plaster, with Jerusalem-stone window frames and its own ground — a terrace's railing 1.05 m high —
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
  /** A house's rooms as furnished from its sheet, in the building's frame: where its interior views stand. */
  rooms?: FurnishedRoom[];
};

/** A room furnished from the sheet: its kind, its area and its bounds, metres in the building's frame. */
export type FurnishedRoom = { kind: string; name: string; areaM2: number; x: number; z: number; w: number; d: number };

export type DwfBuildingFloor = BuildingFloorMeta & {
  /** The floor's sheet, in its own frame: shift it by `shift` (in metres) to land in the building's. */
  sheet: DwfGeometry;
  /** A house's openings as stood up, in the sheet's frame: every door its swings hang. */
  openings?: PlanOpening[];
};

export type DwfBuilding = {
  model: BuildingModel;
  floors: DwfBuildingFloor[];
  /** Which hatch the elevations draw each material in, and how many walls took one. */
  facade: { painted: number; key: Partial<Record<string, BuildingMaterial>> };
  /** The window its elevations draw, and how many windows it was measured on (0: the standard). */
  window: { sill: number; head: number; measured: number };
  /** A private house's balconies (by floor id), entrance flights and roof screens, as house-features.ts found them. */
  features?: { balconies: Record<string, HouseBalcony[]>; flights: StoodFlight[]; screens: RoofScreen[] };
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

export type BuildingFinish = "permit" | "house";

/**
 * A house's outer walls its floor's sheet draws in outline only — a corner
 * room's two faces, two lines a wall apart and no hatch — which the reader
 * sees nothing of, and the room stood open under the storey above like a
 * porch. A house's storey stands on the walls of the one under it: where the
 * floor above has an outer wall over this floor's own edge, and this floor
 * has no wall and no opening within 30 cm of it for 50 cm or more, that wall
 * is this floor's too. Its windows are cut where this floor's sheet frames
 * them (cutFramedWindows), by the caller.
 */
function wallsFromAbove(f: ReadFloor, shift: { x: number; y: number }, above: ReadFloor, aboveShift: { x: number; y: number }, aboveOutline: Outline): PlanWalls["bands"] {
  const { cols, rows } = f.walls.mask;
  const cm = f.walls.cm;
  const px = (v: number) => Math.round((v * 100) / cm);
  const at = (mask: Uint8Array, x: number, y: number) => {
    const i = px(x);
    const j = px(y);
    return i >= 0 && j >= 0 && i < cols && j < rows && mask[j * cols + i] === 1;
  };
  const found = findOpenings(f.walls, { mask: f.footprint, cm });
  const inOpening = (x: number, y: number) => found.some((o) => x >= o.x - 0.15 && x <= o.x + o.w + 0.15 && y >= o.y - 0.15 && y <= o.y + o.h + 0.15);
  // A wall of this floor's within 30 cm across and 5 cm along.
  const covered = (x: number, y: number, horizontal: boolean) => {
    for (let a = -0.05; a <= 0.05; a += cm / 100)
      for (let c = -0.3; c <= 0.3; c += cm / 100) {
        const [qx, qy] = horizontal ? [x + a, y + c] : [x + c, y + a];
        if (at(f.walls.mask.data, qx, qy)) return true;
      }
    return false;
  };
  // Where this floor stands, draws nothing and is at its edge: a storey set back over a deeper one stands no wall in its rooms.
  const free = (x: number, y: number, horizontal: boolean, reach: number) => {
    const edge = horizontal ? !at(f.footprint.data, x, y - reach) || !at(f.footprint.data, x, y + reach) : !at(f.footprint.data, x - reach, y) || !at(f.footprint.data, x + reach, y);
    return edge && at(f.footprint.data, x, y) && !covered(x, y, horizontal) && !inOpening(x, y);
  };
  const dx = aboveShift.x - shift.x;
  const dy = aboveShift.y - shift.y;
  const out: PlanWalls["bands"] = [];
  for (const b of above.walls.bands) {
    const horizontal = b.orientation === "h";
    const [a0, a1] = horizontal ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    const [t0, t1] = horizontal ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    if (a1 - a0 < 0.6) continue;
    // An outer wall of the floor above: the world on one face, the building on the other.
    const mid = (t0 + t1) / 2;
    const reach = (t1 - t0) / 2 + 0.3;
    let outer = 0;
    for (const s of [0.2, 0.5, 0.8]) {
      const u = a0 + (a1 - a0) * s;
      const [lx, ly] = horizontal ? [u, mid - reach] : [mid - reach, u];
      const [hx, hy] = horizontal ? [u, mid + reach] : [mid + reach, u];
      const lo = insidePolygon(aboveOutline, lx + aboveShift.x, ly + aboveShift.y);
      const hi = insidePolygon(aboveOutline, hx + aboveShift.x, hy + aboveShift.y);
      if (lo !== hi) outer++;
    }
    if (outer < 2) continue;
    // Along it in this floor's frame, 10 cm at a time: where this floor stands and draws nothing.
    const run: number[] = [];
    const flush = () => {
      if (run.length && run[run.length - 1]! - run[0]! >= 0.5) {
        const [s, e] = [run[0]! - 0.05, run[run.length - 1]! + 0.05];
        out.push(horizontal ? { orientation: "h", x: s, y: t0 + dy, w: e - s, h: t1 - t0 } : { orientation: "v", x: t0 + dx, y: s, w: t1 - t0, h: e - s });
      }
      run.length = 0;
    };
    for (let u = a0 + 0.05; u <= a1 - 0.05; u += 0.1) {
      const [x, y] = horizontal ? [u + dx, mid + dy] : [mid + dx, u + dy];
      const along = horizontal ? x : y;
      if (free(x, y, horizontal, reach)) run.push(along);
      else flush();
    }
    flush();
  }
  // The floor above's own windows break its wall where this floor's need not be: runs on one line are one wall wherever this floor is free between them, and this floor's sheet frames its windows in it.
  const span = (b: PlanWalls["bands"][number]) => (b.orientation === "h" ? [b.x, b.x + b.w, b.y, b.y + b.h] : [b.y, b.y + b.h, b.x, b.x + b.w]) as [number, number, number, number];
  const merged: PlanWalls["bands"] = [];
  for (const b of out.sort((p, q) => span(p)[0] - span(q)[0])) {
    const [s, e, t0, t1] = span(b);
    const horizontal = b.orientation === "h";
    const m = merged.find((o) => {
      const [, oe, o0, o1] = span(o);
      if (o.orientation !== b.orientation || Math.abs((o0 + o1) / 2 - (t0 + t1) / 2) > 0.1 || s - oe > 2.6 || s < oe) return false;
      const reach = Math.max(o1 - o0, t1 - t0) / 2 + 0.3;
      const mid = (t0 + t1) / 2;
      for (let u = oe + 0.05; u < s; u += 0.1) if (!free(horizontal ? u : mid, horizontal ? mid : u, horizontal, reach)) return false;
      return true;
    });
    if (!m) {
      merged.push({ ...b });
      continue;
    }
    const [ms, , m0, m1] = span(m);
    const [lo, hi] = [Math.min(m0, t0), Math.max(m1, t1)];
    Object.assign(m, horizontal ? { y: lo, h: hi - lo, x: ms, w: e - ms } : { x: lo, w: hi - lo, y: ms, h: e - ms });
  }
  return merged;
}

/** The arcs a sheet draws, metres in its walls' frame, with the ends each sweeps between. */
export function leavesOf(sheet: DwfGeometry): PlanLeaf[] {
  const metres = (v: number) => v / DWF_FLOOR_UNITS_PER_METRE;
  return sheet.arcs.map((a) => ({ cx: metres(a.cx), cy: metres(a.cy), r: metres(a.r), sweep: Math.abs(a.end - a.start), start: a.start, end: a.end }));
}

export function buildingFromDwf(
  strip: DwfGeometry,
  options?: {
    name?: string;
    finish?: BuildingFinish;
    site?: HouseSiteLevels;
    yard?: YardHint[];
    /** Where true north points in the plans' frame (compass.ts): the elevations' titles are turned by it. */
    north?: North;
    /** The roof's top and its parapet's, metres from ±0.00, where the elevations mark them. */
    top?: { roof: number; parapet: number };
    /** The furniture built to the haredi rules (HouseProject.haredi). */
    haredi?: boolean;
    /** A public building (a school, a clinic): its rooms named as its sheets print them, none guessed into a home's by size. */
    public?: boolean;
  },
): DwfBuilding {
  const house = options?.finish === "house";
  const north = options?.north ?? PLAN_NORTH;
  const read: ReadFloor[] = [];
  let autoLevel = 0;
  for (const s of splitStrip(strip)) {
    const roof = s.kind === "roof";
    const plan = s.kind === "floor" || roof;
    const housePlan = house && s.kind === "other" && printedRooms(sheetGeometry(strip, s.box).texts).length >= 4;
    if (!plan && !housePlan) continue;
    const marked = sheetLevel(sheetGeometry(strip, s.box));
    const f = readFloorSheet(strip, s.box, s.units, roof, house && marked == null ? autoLevel : undefined, house, options?.public);
    if (!f) continue;
    if (house && marked == null) autoLevel += DWF_BUILDING_STANDARDS.storey;
    read.push(f);
  }
  if (house) settleStoreyLevels(read);
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
  const metres = (v: number) => v / DWF_FLOOR_UNITS_PER_METRE;
  // A house's plan draws some windows' frames in a wall its hatch runs through.
  if (house) for (const f of floors) f.walls = cutFramedWindows(f.walls, f.sheet.segments.map((s) => ({ x1: metres(s.x1), y1: metres(s.y1), x2: metres(s.x2), y2: metres(s.y2) })));
  const houseHoles = new Map<ReadFloor, PlanOpening[]>();
  /**
   * A floor's openings, its outside doors marked by the leaves' swings its
   * sheet draws — a house's every door, carved where its walls read on
   * through it. Read once, on the floor's final outline: the first ask
   * carves the walls the floor is then stood up from.
   */
  const openingsOf = (f: ReadFloor) => {
    if (house) {
      const held = houseHoles.get(f);
      if (held) return held;
      const lines = f.sheet.segments.map((s) => ({ x1: metres(s.x1), y1: metres(s.y1), x2: metres(s.x2), y2: metres(s.y2) }));
      const found = houseOpenings(f.walls, { mask: f.footprint, cm: f.floor.cm }, leavesOf(f.sheet), lines);
      // A CAD file places its windows itself: each where its block stands, as wide.
      const drawn = (f.sheet.windowsDrawn ?? []).map((w) => ({ x: metres(w.x), y: metres(w.y), w: metres(w.w), h: metres(w.h), runs: w.runs }));
      const windowed = drawn.length ? fitDrawnWindows(found.walls, found.openings, drawn, { mask: f.footprint, cm: f.floor.cm }) : found;
      // And its doors, each where its block stands.
      const doors = (f.sheet.doorsDrawn ?? []).map((d) => ({ x1: metres(d.x1), y1: metres(d.y1), x2: metres(d.x2), y2: metres(d.y2) }));
      const read = doors.length ? fitDrawnDoors(windowed.walls, windowed.openings, doors, { mask: f.footprint, cm: f.floor.cm }, f.walls) : windowed;
      f.walls = read.walls;
      houseHoles.set(f, read.openings);
      return read.openings;
    }
    const swings: PlanSwing[] = f.sheet.arcs.map((a) => ({ cx: metres(a.cx), cy: metres(a.cy), r: metres(a.r), sweep: Math.abs(a.end - a.start) }));
    return markDoors(findOpenings(f.walls, { mask: f.footprint, cm: f.floor.cm }), swings);
  };

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
  // A floor closed by its walls — an open ground floor — keeps only what
  // stands under the floor above it, a metre and a half each way: its walls
  // close a fence and a gate beside the building too, and the elevations
  // draw those low, not a storey high.
  floors.forEach((f, i) => {
    const above = floors[i + 1];
    if (f.walled && above) f.footprint = clipUnder(f, shifts.get(f)!, above, shifts.get(above)!, 1.5);
  });
  const outlines = floors.map((f) => {
    const shift = shifts.get(f)!;
    const m = f.floor.cm / 100;
    return traceOutline(f.footprint).map(([x, y]) => [x * m + shift.x, y * m + shift.y] as [number, number]);
  });
  if (house)
    floors.forEach((f, i) => {
      const above = floors[i + 1];
      if (!above || above.roof) return;
      const lines = f.sheet.segments.map((s) => ({ x1: metres(s.x1), y1: metres(s.y1), x2: metres(s.x2), y2: metres(s.y2) }));
      // A window framed up to the end of a wall it meets: cut in the wall run on into that one, kept to its own length.
      const under = wallsFromAbove(f, shifts.get(f)!, above, shifts.get(above)!, outlines[i + 1]!).flatMap((b) => {
        const h = b.orientation === "h";
        const [a0, a1] = h ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
        const long = h ? { ...b, x: a0 - 0.3, w: a1 - a0 + 0.6 } : { ...b, y: a0 - 0.3, h: a1 - a0 + 0.6 };
        return cutFramedWindows({ ...f.walls, bands: [long] }, lines).bands.flatMap((p) => {
          const [s, e] = h ? [Math.max(p.x, a0), Math.min(p.x + p.w, a1)] : [Math.max(p.y, a0), Math.min(p.y + p.h, a1)];
          return e - s > 0.02 ? [h ? { ...p, x: s, w: e - s } : { ...p, y: s, h: e - s }] : [];
        });
      });
      if (under.length) f.walls = { ...f.walls, bands: [...f.walls.bands, ...under] };
    });
  const centre = buildingCentre(floors.map((f, i) => ({ level: f.level, roof: f.roof, outline: outlines[i]! })));
  const elevations = readElevations(strip, { house, north });
  // The top storey's height, to the roof the elevations mark where they mark it.
  const storeyHeight = (f: ReadFloor, i: number) => {
    const next = floors[i + 1];
    if (next) return next.level - f.level;
    if (options?.top && !f.roof && options.top.roof > f.level + 2) return options.top.roof - f.level;
    // The sections' highest mark is the top only when nothing stands on the
    // roof: here it was the stair head's, +36, and the top floor came out 6.5 m tall.
    return top != null && top > f.level + 1.5 ? Math.min(top - f.level, storey) : storey;
  };

  // The building's own window, for the windows its elevations do not show
  // clearly: the median sill and head of those they do — not a standard's.
  const measured: Array<{ sill: number; head: number }> = [];
  floors.forEach((f, i) => {
    const shift = shifts.get(f)!;
    const height = storeyHeight(f, i);
    for (const o of openingsOf(f)) {
      if (!o.exterior || !o.outward || o.door) continue;
      const drawnAt = windowHeights(elevations, { ...o, x: o.x + shift.x, y: o.y + shift.y, outward: o.outward }, f.level, height, centre);
      if (drawnAt && drawnAt.sill > 0.2) measured.push(drawnAt);
    }
  });
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!;
  const typicalWindow = {
    sill: measured.length >= 5 ? mid(measured.map((w) => w.sill)) : DWF_BUILDING_STANDARDS.window.sill,
    head: measured.length >= 5 ? mid(measured.map((w) => w.head)) : DWF_BUILDING_STANDARDS.window.head,
    surround: house ? HOUSE_FRAME_M : 0,
  };

  const prims: Primitive[] = [];
  const out: DwfBuildingFloor[] = [];
  const balconiesOf: Record<string, HouseBalcony[]> = {};
  /** The ground floor's openings as stood up, in the building's frame: a plan's "door" its elevation draws on a sill is a window here. */
  let groundOpenings: PlanOpening[] = [];
  floors.forEach((f, i) => {
    const shift = shifts.get(f)!;
    // The top storey is as tall as the storeys under it, or to the roof the elevations mark.
    const height = storeyHeight(f, i);
    const id = `floor-${i}`;
    const m = f.floor.cm / 100;
    const outline: Outline = outlines[i]!;
    const moved: PlanWalls = { ...f.walls, bands: f.walls.bands.map((b) => ({ ...b, x: b.x + shift.x, y: b.y + shift.y })) };
    const terraces = readDwfTerraces(f.floor, f.sheet);
    const furnishedRooms: FurnishedRoom[] = [];
    prims.push(...furnishedFlats(f, terraces, shift, id, house ? outline : undefined, house ? furnishedRooms : undefined, options?.haredi, options?.public));
    // A house's own stair, where its sheet draws it: rising from a storey with one over it, its treads on the storey it arrives at.
    if (house && !f.roof) {
      const over = floors.slice(i + 1).some((g) => !g.roof);
      prims.push(...interiorStairs(f.sheet, (x, z) => insidePolygon(outline, x, z), shift, f.level, height, `${id}:inside:stair`, over ? "up" : "treads"));
    }
    const terraceAt = new Uint8Array(f.floor.cols * f.floor.rows);
    for (const t of terraces) for (const k of t.pixels) terraceAt[k] = 1;
    const onTerraceDrawn = (x: number, y: number) => {
      const px = Math.round(((x - shift.x) * 100) / f.floor.cm);
      const py = Math.round(((y - shift.y) * 100) / f.floor.cm);
      return px >= 0 && py >= 0 && px < f.floor.cols && py < f.floor.rows && terraceAt[py * f.floor.cols + px] === 1;
    };
    // A house's upper floor: its balconies, which the terraces reader does not see.
    const balconies = house && !f.roof && f.level > 1 ? floorBalconies({ sheet: f.sheet, shift, outline: outlines[i]!, below: i > 0 ? outlines[i - 1] : undefined }, onTerraceDrawn) : [];
    if (balconies.length) balconiesOf[id] = balconies;
    const onTerrace = (x: number, y: number) => onTerraceDrawn(x, y) || balconies.some((b) => insidePolygon(b.ring, x, y));
    const openings = openingsOf(f).map((o) => {
      const placed = { ...o, x: o.x + shift.x, y: o.y + shift.y };
      if (!o.exterior || !o.outward) return placed;
      // Its sill and head as its elevation draws them — a door's head only.
      const drawnAt = windowHeights(elevations, { ...placed, outward: o.outward }, f.level, height, centre);
      // A "door" its elevation draws standing on a sill is a window: the plan's
      // sliding panels in a living room's front, at +0.60 on the facade sheet.
      const onSill = drawnAt != null && o.door === true && drawnAt.sill >= 0.3;
      // And a "window" its elevation draws down to the floor is a door — a balcony's, whose swing the plan leaves out (Gottlieb B upstairs).
      const toFloor = house && drawnAt != null && !o.door && drawnAt.sill < 0.15 && drawnAt.head - drawnAt.sill >= 1.9;
      const moved = drawnAt
        ? o.door && !onSill
          ? { ...placed, head: drawnAt.head }
          : { ...placed, sill: drawnAt.sill, head: drawnAt.head, ...(onSill ? { door: false, sliding: false, full: false } : {}), ...(toFloor ? { door: true, full: true } : {}) }
        : placed;
      // Half a metre out from its middle: a terrace there makes it a door onto it.
      const cx = moved.x + moved.w / 2;
      const cy = moved.y + moved.h / 2;
      const out = (o.orientation === "h" ? moved.h : moved.w) / 2 + 0.5;
      const px = o.orientation === "v" ? cx + o.outward * out : cx;
      const py = o.orientation === "h" ? cy + o.outward * out : cy;
      // A house's plan draws its doors' swings: a window beside its balcony door stays a window.
      return onTerrace(px, py) && (!house || o.door) ? { ...moved, full: true } : moved;
    });
    if (i === 0) groundOpenings = openings;
    const spec: FloorSpec = {
      id,
      level: f.level,
      height,
      outline,
      window: typicalWindow,
      facade: house ? HOUSE_PLASTER_BODY : "stone",
      interior: "plaster",
      ...(house ? { surroundMaterial: HOUSE_WINDOW_FRAME, frameMaterial: HOUSE_WINDOW_FRAME } : {}),
    };
    prims.push(...flushFacade(faceTheWeather(floorPrimitives(moved, openings, spec), outline, spec.facade), outline, spec.facade, id));
    prims.push(slab(inset(outline, 0.06), f.level - 0.02, 0.3, "slab", `${id}:slab`));
    // A house's ceiling under the slab over a storey, smooth white plaster:
    // seen from inside, the slab's underside and the paving over it read as
    // floor tiles on the ceiling (12/10/2026).
    if (house && i > 0) prims.push(slab(inset(outlines[i - 1] ?? outline, 0.06), f.level - 0.36, 0.01, "ceiling", `${floors[i - 1] ? `floor-${i - 1}` : id}:inside:ceiling`));
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
    prims.push(...balconiesPrimitives(balconies, f.level, DWF_BUILDING_STANDARDS.railing, outline, id));
    // A door onto a balcony at its very end: its stone surround stops at the
    // balcony's end, not hanging past it over the drop (Gottlieb A, 12/10/2026).
    for (const bal of balconies) {
      const xs = bal.ring.map(([x]) => x);
      const zs = bal.ring.map(([, z]) => z);
      const [bx0, bx1, bz0, bz1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      const alongX = bx1 - bx0 >= bz1 - bz0;
      for (let k = prims.length - 1; k >= 0; k--) {
        const q = prims[k]!;
        if (q.type !== "box" || q.tag !== `${id}:door` || q.material !== HOUSE_WINDOW_FRAME) continue;
        const across = alongX ? q.centre.z : q.centre.x;
        const [n0, n1] = alongX ? [bz0, bz1] : [bx0, bx1];
        if (across < n0 - 0.4 || across > n1 + 0.4) continue;
        const [lo, hi] = alongX ? [bx0, bx1] : [bz0, bz1];
        const c = alongX ? q.centre.x : q.centre.z;
        const half = (alongX ? q.size.x : q.size.z) / 2;
        const [a0, a1] = [Math.max(c - half, lo), Math.min(c + half, hi)];
        // Only a door at the balcony: a piece wholly off it belongs to another opening.
        if (c + half < lo - 0.3 || c - half > hi + 0.3) continue;
        if (a1 - a0 < 0.01) {
          prims.splice(k, 1);
          continue;
        }
        if (a0 === c - half && a1 === c + half) continue;
        prims[k] = { ...q, centre: { ...q.centre, [alongX ? "x" : "z"]: (a0 + a1) / 2 }, size: { ...q.size, [alongX ? "x" : "z"]: a1 - a0 } };
      }
    }
    // A house's storey is the houses' both: no "apartments" to title its plan by.
    out.push({ id, level: f.level, height, units: house ? [] : f.units, shift: { x: shift.x, y: shift.y }, outline, roof: f.roof, registration: shift.score, sheet: f.sheet, sheetWidth: f.sheet.pageWidth, sheetHeight: f.sheet.pageHeight, ...(house ? { openings, rooms: furnishedRooms } : {}) });
  });

  // The roof over the highest storey (not over a stair head standing on it).
  const storeys = out.filter((f) => !f.roof);
  const last = storeys[storeys.length - 1]!;
  const roofLevel = last.level + last.height;
  // The parapet's top as the elevations mark it, or a metre over the roof.
  const parapetTop = options?.top && options.top.parapet > roofLevel + 0.3 ? options.top.parapet : roofLevel + DWF_BUILDING_STANDARDS.parapet;
  prims.push(slab(inset(last.outline, 0.06), roofLevel, 0.35, "slab", "roof:slab"));
  if (house) prims.push(slab(inset(last.outline, 0.06), roofLevel - 0.02, 0.01, "ceiling", `${last.id}:inside:ceiling`));
  const topWalls = prims.filter((p) => p.type === "box" && (p.tag === last.id || p.tag?.startsWith(`${last.id}:`)) && p.centre.y + p.size.y / 2 >= roofLevel - 0.05);
  prims.push(...parapetOnWalls(parapet(last.outline, roofLevel, parapetTop, 0.25, house ? HOUSE_PLASTER_BODY : "stone", "roof:parapet"), topWalls));
  const headroom = out.filter((f) => f.roof);
  for (const h of headroom) prims.push(slab(inset(h.outline, 0.06), h.level + h.height, 0.3, "slab", "roof:slab"));
  // A house's solar heaters, in the screens its elevations draw over the parapet.
  const roofScreens = house ? houseRoofScreens(houseElevations(strip, north), last.outline, roofLevel, parapetTop) : null;
  if (roofScreens) prims.push(...roofScreens.primitives);

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
  const facade = paintFacades(prims, out, strip, centre, { house, north });
  // The laundry screens the elevations draw, in front of the facade.
  const screens = laundryScreens(elevations, out, centre);
  prims.push(...screens);

  // Ground: paving round a permit building. A private house stands on its own land.
  const xs = out.flatMap((f) => f.outline.map(([x]) => x));
  const ys = out.flatMap((f) => f.outline.map(([, y]) => y));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const ground = out[0]!.level;
  const pad = 12;
  let plot = { x: x0 - pad, z: y0 - pad, width: x1 - x0 + 2 * pad, depth: y1 - y0 + 2 * pad, yMin: ground - 0.5 };
  let flights: StoodFlight[] = [];
  let street: "north" | "south" | "east" | "west" | undefined;
  let plotBox: { x0: number; z0: number; x1: number; z1: number } | undefined;
  if (house) {
    const lowest = out[0]!;
    const yard = houseYard({ sheet: lowest.sheet, shift: lowest.shift, ground, outlines: storeys.map((f) => f.outline), levels: options?.site, hints: options?.yard });
    if (yard) {
      const front = streetSide(yard.primitives, yard.plot);
      street = front ?? undefined;
      plotBox = yard.plot;
      const stood = front
        ? houseEntranceFlights({ sheet: lowest.sheet, shift: lowest.shift, outlines: storeys.map((f) => f.outline), ground, plot: yard.plot, levels: options?.site, front, prims: yard.primitives })
        : null;
      // The side doors' steps, down to the land the elevations mark beside them: only where a door stands.
      const groundDoors = groundOpenings.filter((o) => o.door && o.exterior && o.outward).map((o) => ({ ...o, outward: o.outward! }));
      const alongWall = (door: { orientation: "h" | "v"; x: number; y: number; w: number; h: number; outward: 1 | -1 }) => drawnSideFlight(elevations, door, ground, centre);
      const side = front ? houseSideFlights({ doors: groundDoors, ground, front, levels: options?.site, taken: stood?.flights ?? [], plot: yard.plot, prims: yard.primitives, alongWall }) : null;
      prims.push(...yard.primitives.flatMap((p) => (p.type === "prism" && p.tag === "yard:paving" ? pavingAround(p) : [p])), ...(stood?.primitives ?? []), ...(side?.primitives ?? []));
      flights = [...(stood?.flights ?? []), ...(side?.flights ?? [])];
    }
    const site = houseSite(storeys.map((f) => f.outline), ground, yard ?? undefined);
    prims.push(...site.primitives);
    plot = {
      x: site.bounds.x0,
      z: site.bounds.z0,
      width: site.bounds.x1 - site.bounds.x0,
      depth: site.bounds.z1 - site.bounds.z0,
      yMin: site.bounds.yMin - 0.2,
    };
  } else {
    prims.push(slab([[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]], ground - 0.03, 0.4, "paving", "site:ground"));
  }
  if (house) {
    // Tone on tone by volume: the middle volume is the balcony's span along the front, the wings either side.
    const rings = Object.values(balconiesOf).flat().map((b) => b.ring);
    const xs = rings.flat().map(([x]) => x);
    const zs = rings.flat().map(([, z]) => z);
    const span = rings.length
      ? Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs)
        ? { axis: "x" as const, lo: Math.min(...xs), hi: Math.max(...xs) }
        : { axis: "z" as const, lo: Math.min(...zs), hi: Math.max(...zs) }
      : null;
    const soft = softenHouse(stripInventStoneAtBins(closeFenceEnds(paintByVolume(prims, span))));
    const lit = [
      ...soft,
      ...plasterInside(
        soft,
        out.filter((f) => !f.roof).map((f) => ({ level: f.level, height: f.height, rooms: f.rooms ?? [] })),
      ),
      ...(out[0] ? outdoorLights(soft, out[0].outline) : []),
    ];
    // Final pass after coping/lights — invent stone must not reappear at the bins.
    prims.length = 0;
    prims.push(...stripInventStoneAtBins(lit));
  }
  const topM = Math.max(parapetTop, Math.max(...out.map((f) => f.level + f.height)) + DWF_BUILDING_STANDARDS.parapet);
  return {
    model: {
      name: options?.name ?? (house ? "בית פרטי" : "בניין"),
      primitives: prims,
      extent: { ...plot, yMax: topM },
      north,
      ...(street ? { street } : {}),
      ...(plotBox ? { plot: plotBox } : {}),
    },
    floors: out,
    facade,
    window: { sill: typicalWindow.sill, head: typicalWindow.head, measured: measured.length },
    ...(house ? { features: { balconies: balconiesOf, flights, screens: roofScreens?.screens ?? [] } } : {}),
  };
}
