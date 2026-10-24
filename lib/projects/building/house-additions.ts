import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import { PLAN_NORTH, sideOfTitle, type North } from "@/lib/projects/building/compass";
import {
  balconyPrimitives,
  elevationOutline,
  flightPrimitives,
  HOUSE_FEATURE_STANDARDS,
  houseBalconies,
  houseFlights,
  roofScreenPrimitives,
  roofScreens,
  slattedBoxes,
  type ElevationFace,
  type HouseBalcony,
  type HouseFlight,
  type RoofScreen,
  type SlattedBox,
} from "@/lib/projects/building/house-features";
import { centreOf, profileAt, type HouseSiteLevels } from "@/lib/projects/building/house-yard";
import type { Primitive } from "@/lib/projects/building/model";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { splitStrip } from "@/lib/projects/sheet-split";

/**
 * The house's features (house-features.ts) stood up on the model the floor
 * sheets built: each upper floor's balconies, the entrance flights of its
 * ground floor, and the solar heaters' screens on its roof.
 */

/** The elevations a strip titles by face, each in its own frame, by the plan's side the compass turns its title to. */
export function houseElevations(strip: DwfGeometry, north: North = PLAN_NORTH): Array<{ face: ElevationFace; g: DwfGeometry }> {
  return splitStrip(strip).flatMap((d) => {
    const face = d.kind === "elevation" && d.title ? sideOfTitle(d.title, north) : null;
    return face ? [{ face, g: sheetGeometry(strip, d.box) }] : [];
  });
}

/** The roof's screens as the elevations draw them, stood on the roof between its slab and their height over the parapet. */
export function houseRoofScreens(
  elevations: Array<{ face: ElevationFace; g: DwfGeometry }>,
  roof: Outline,
  roofLevel: number,
  parapetTop: number,
): { screens: RoofScreen[]; primitives: Primitive[] } {
  const faces: Partial<Record<ElevationFace, SlattedBox[]>> = {};
  for (const { face, g } of elevations) {
    const e = elevationOutline(g);
    if (e) faces[face] = [...(faces[face] ?? []), ...slattedBoxes(e)];
  }
  const screens = roofScreens(faces, roof);
  return { screens, primitives: screens.flatMap((s) => roofScreenPrimitives(s, roofLevel, parapetTop)) };
}

/**
 * An upper floor's balconies, in the building's frame: those not on a terrace
 * its terraces reader already stood up. `below` is the storey under it.
 */
export function floorBalconies(floor: { sheet: DwfGeometry; shift: { x: number; y: number }; outline: Outline; below?: Outline }, onTerrace: (x: number, z: number) => boolean): HouseBalcony[] {
  const { sheet, shift, outline, below } = floor;
  const inHouse = (x: number, z: number) => insidePolygon(outline, x + shift.x, z + shift.y);
  const overBelow = below ? (x: number, z: number) => insidePolygon(below, x + shift.x, z + shift.y) : undefined;
  return houseBalconies(sheet, inHouse, shift, undefined, overBelow).filter((b) => {
    const xs = b.ring.map(([x]) => x);
    const zs = b.ring.map(([, z]) => z);
    return !onTerrace((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2);
  });
}

/** The plot's side its street railing stands on: the street's. */
export function streetSide(prims: Primitive[], plot: { x0: number; z0: number; x1: number; z1: number }): "north" | "south" | "east" | "west" | null {
  const rail = prims.find((p) => p.type === "box" && p.tag === "yard:railing");
  if (!rail || rail.type !== "box") return null;
  const { x, z } = rail.centre;
  const d: Array<["north" | "south" | "east" | "west", number]> = [
    ["north", Math.abs(z - plot.z0)],
    ["south", Math.abs(z - plot.z1)],
    ["west", Math.abs(x - plot.x0)],
    ["east", Math.abs(x - plot.x1)],
  ];
  return d.sort((a, b) => a[1] - b[1])[0]![0];
}

/** A door in the ground floor's outside wall, in the building's frame: its hole and which way is out. */
export type HouseDoor = { orientation: "h" | "v"; x: number; y: number; w: number; h: number; outward: 1 | -1 };

/**
 * The steps down from the ground floor's side doors: where the elevations
 * mark the land beside a door on a side other than the street's
 * (`levels.sideFlights`, by the plan's side), a flight as wide as the door
 * and a little more runs straight out from its sill down to that land, at
 * the standards' riser and a 28 cm tread, with a handrail on both sides,
 * and its path on at that land to the plot's edge, sunk in the yard's paving.
 * A door whose land is not below its floor, or that a flight already serves
 * (`taken`), gets none.
 */
export function houseSideFlights(input: {
  doors: HouseDoor[];
  ground: number;
  front: "north" | "south" | "east" | "west";
  levels?: HouseSiteLevels;
  taken: StoodFlight[];
  plot?: { x0: number; z0: number; x1: number; z1: number };
  /** The yard's primitives: its paving is cut for the paths. */
  prims?: Primitive[];
  /** A door whose elevation draws its flight along the wall (drawnSideFlight): which way it falls. */
  alongWall?: (door: HouseDoor) => { falls: 1 | -1 } | null;
}): { primitives: Primitive[]; flights: StoodFlight[] } {
  const { doors, ground, front, levels, taken, plot, prims } = input;
  const paving = prims?.find((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && p.tag === "yard:paving");
  const s = HOUSE_FEATURE_STANDARDS;
  const TREAD = 0.28;
  const out: Primitive[] = [];
  const stood: StoodFlight[] = [];
  for (const d of doors) {
    const side = d.orientation === "h" ? (d.outward > 0 ? "south" : "north") : d.outward > 0 ? "east" : "west";
    const land = levels?.sideFlights?.[side];
    if (side === front || land == null) continue;
    const along = d.orientation === "h" ? "x" : "z";
    const [a, b] = d.orientation === "h" ? [d.x - 0.1, d.x + d.w + 0.1] : [d.y - 0.1, d.y + d.h + 0.1];
    if (taken.some((t) => t.flight.along === along && t.flight.a < b && t.flight.b > a)) continue;
    const bottom = ground + land;
    const drop = ground - bottom;
    // The wall's outer face: the flight's first tread starts there.
    const face = d.orientation === "h" ? (d.outward > 0 ? d.y + d.h : d.y) : d.outward > 0 ? d.x + d.w : d.x;
    const base = { risers: 0, riser: 0, from: ground, to: bottom };
    const flight: HouseFlight = { along, a, b, lines: [face], out: d.outward };
    if (drop < 2 * s.minRiser) {
      stood.push({ ...base, flight, skipped: `the land beside it, ${bottom.toFixed(2)}, is not below the floor` });
      continue;
    }
    let risers = Math.max(2, Math.round(drop / s.riser));
    if (drop / risers > s.maxRiser) risers = Math.ceil(drop / s.maxRiser);
    const parallel = input.alongWall?.(d);
    if (parallel) {
      // Along the wall, as the elevation draws it: a landing at the door, a metre wide, and the treads falling away from it beside the wall.
      const WIDE = 1.0;
      const [u0, u1] = d.outward > 0 ? [face, face + WIDE] : [face - WIDE, face];
      const start = parallel.falls > 0 ? b : a;
      const lines = Array.from({ length: risers }, (_, k) => start + parallel.falls * TREAD * k);
      const run: HouseFlight = { along: d.orientation === "h" ? "z" : "x", a: u0, b: u1, lines, out: parallel.falls };
      const end = start + parallel.falls * TREAD * (risers + 1);
      const built = flightPrimitives(run, ground, bottom, end, "yard:stairs");
      // The landing before the door, at the floor.
      const [l0, l1] = [Math.min(a, b), Math.max(a, b)];
      out.push(
        d.orientation === "h"
          ? { type: "box", centre: { x: (l0 + l1) / 2, y: (ground - 0.2 + bottom) / 2 + 0.1, z: (u0 + u1) / 2 }, size: { x: l1 - l0, y: ground - bottom + 0.2, z: WIDE }, material: "floorStone", tag: "yard:stairs" }
          : { type: "box", centre: { x: (u0 + u1) / 2, y: (ground - 0.2 + bottom) / 2 + 0.1, z: (l0 + l1) / 2 }, size: { x: WIDE, y: ground - bottom + 0.2, z: l1 - l0 }, material: "floorStone", tag: "yard:stairs" },
      );
      out.push(...built.primitives);
      // Its handrail on the open side, falling with it.
      const rise = drop / risers;
      const u = d.outward > 0 ? u1 - 0.02 : u0 + 0.02;
      for (let k = 0; k < risers; k++) {
        for (let p = 0; p < 6; p++) {
          const t = (k + (p + 0.5) / 6) / risers;
          const v = start + parallel.falls * TREAD * risers * t;
          const [x, z] = d.orientation === "h" ? [v, u] : [u, v];
          out.push({ type: "box", centre: { x, y: ground - drop * t - rise / 2 + 0.9, z }, size: d.orientation === "h" ? { x: TREAD / 6 + 0.01, y: 0.05, z: 0.05 } : { x: 0.05, y: 0.05, z: TREAD / 6 + 0.01 }, material: "metal", tag: "yard:stairs:railing" });
        }
        if (k === 0 || k === risers - 1 || k % 3 === 0) {
          const v = start + parallel.falls * TREAD * (k + 0.5);
          const [x, z] = d.orientation === "h" ? [v, u] : [u, v];
          out.push({ type: "box", centre: { x, y: ground - rise * (k + 1) + 0.45, z }, size: { x: 0.04, y: 0.9, z: 0.04 }, material: "metal", tag: "yard:stairs:railing" });
        }
      }
      stood.push({ ...base, flight: run, risers, riser: rise });
      continue;
    }
    const lines = Array.from({ length: risers }, (_, k) => face + d.outward * TREAD * k);
    const foot = face + d.outward * TREAD * (risers + 1);
    const edge = plot ? (d.orientation === "h" ? (d.outward > 0 ? plot.z1 : plot.z0) : d.outward > 0 ? plot.x1 : plot.x0) : foot;
    if (plot && (edge - foot) * d.outward < 0) {
      stood.push({ ...base, flight, skipped: `${risers} steps do not fit the ${Math.abs(edge - face).toFixed(2)} m to the plot's edge` });
      continue;
    }
    const built = flightPrimitives({ ...flight, lines }, ground, bottom, edge, "yard:stairs");
    out.push(...built.primitives);
    if (built.sunk && paving) cutPaving(paving, built.sunk);
    // A handrail on both sides, 90 cm over the treads' nosings: one rail
    // falling with the flight — laid in short level pieces, the model's boxes
    // turning only about the vertical — on posts at its ends and every third
    // tread. A post and a level rail a tread stood as a row of loose Ts.
    const rise = drop / risers;
    const PIECES = 6;
    for (const u of [a + 0.02, b - 0.02]) {
      for (let k = 0; k < risers; k++) {
        const y = ground - rise * (k + 1);
        if (k === 0 || k === risers - 1 || k % 3 === 0) {
          const v = face + d.outward * TREAD * (k + 0.5);
          const [x, z] = along === "x" ? [u, v] : [v, u];
          out.push({ type: "box", centre: { x, y: y + 0.45, z }, size: { x: 0.04, y: 0.9, z: 0.04 }, material: "metal", tag: "yard:stairs:railing" });
        }
        for (let p = 0; p < PIECES; p++) {
          const t = (k + (p + 0.5) / PIECES) / risers;
          const v = face + d.outward * TREAD * risers * t;
          const height = ground - drop * t - rise / 2 + 0.9;
          const [x, z] = along === "x" ? [u, v] : [v, u];
          const len = TREAD / PIECES + 0.01;
          out.push({ type: "box", centre: { x, y: height, z }, size: along === "x" ? { x: 0.05, y: 0.05, z: len } : { x: len, y: 0.05, z: 0.05 }, material: "metal", tag: "yard:stairs:railing" });
        }
      }
    }
    stood.push({ ...base, flight: { ...flight, lines }, risers, riser: rise });
  }
  return { primitives: out, flights: stood };
}

/** A floor's balconies stood up: slab, and a railing on the edges off the house. */
export function balconiesPrimitives(balconies: HouseBalcony[], level: number, railingTop: number, outline: Outline, tag: string): Primitive[] {
  return balconies.flatMap((b) => balconyPrimitives(b, level, railingTop, outline, tag));
}

/**
 * A flight's sunk path cut out of the yard's paving — unless it lies in a hole
 * the paving already has: a lower terrace (house-yard sideTerraces). Two holes
 * laid over one another broke the paving's triangulation, and a slab of it
 * stood across the terrace on a slant.
 */
function cutPaving(paving: Extract<Primitive, { type: "prism" }>, sunk: Outline): void {
  const [cx, cz] = sunk.reduce(([x, z], [px, pz]) => [x + px / sunk.length, z + pz / sunk.length], [0, 0]);
  if ((paving.holes ?? []).some((h) => insidePolygon(h, cx, cz))) return;
  paving.holes = [...(paving.holes ?? []), sunk];
}

export type StoodFlight = { flight: HouseFlight; risers: number; riser: number; from: number; to: number; skipped?: string };

/**
 * The ground floor's entrance flights stood up, down from the floor at the
 * house to the land where their path meets the plot's edge: the sidewalk on
 * the street side. The steps are the treads the plan draws, where it draws
 * them, each rising as the drop shares out up to the standards' highest riser;
 * what they leave of the drop the path slopes down on to the edge. It is
 * sunk in the yard's paving; the fence there is opened for it and the gate
 * drawn beside it stands in it.
 */
export function houseEntranceFlights(input: {
  sheet: DwfGeometry;
  shift: { x: number; y: number };
  outlines: Outline[];
  ground: number;
  plot: { x0: number; z0: number; x1: number; z1: number };
  levels?: HouseSiteLevels;
  /** The street's side of the plot. */
  front: "north" | "south" | "east" | "west";
  /** The model's primitives so far: the yard's paving, fence and gate are cut and moved for the paths. */
  prims: Primitive[];
}): { primitives: Primitive[]; flights: StoodFlight[] } {
  const { sheet, shift, outlines, ground, plot, levels, front, prims } = input;
  const s = HOUSE_FEATURE_STANDARDS;
  const inHouse = (x: number, z: number) => outlines.some((o) => insidePolygon(o, x + shift.x, z + shift.y));
  const levelAt = (x: number) => {
    if (!levels) return 0;
    const t = Math.max(-0.4, Math.min(1.4, (x - plot.x0) / Math.max(1e-6, plot.x1 - plot.x0)));
    return levels.west + (levels.east - levels.west) * t;
  };
  const centre = centreOf(outlines);
  const streetAlongX = front === "north" || front === "south";
  /** The land at a flight's foot: on the street side the sidewalk, as its own profile marks it where it does. */
  const footAt = (side: string, along: number, landX: number) =>
    side === front && levels?.street?.length ? profileAt(levels.street, along - (streetAlongX ? centre.x : centre.z)) : levelAt(landX) - (side === front ? 0.15 : 0);
  const out: Primitive[] = [];
  const stood: StoodFlight[] = [];
  const paving = prims.find((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && p.tag === "yard:paving");
  for (const f of houseFlights(sheet, inHouse, shift)) {
    const [mid, first] = [(f.a + f.b) / 2, f.lines[0]!];
    const side = f.along === "x" ? (f.out > 0 ? "south" : "north") : f.out > 0 ? "east" : "west";
    const end = f.along === "x" ? (f.out > 0 ? plot.z1 : plot.z0) : f.out > 0 ? plot.x1 : plot.x0;
    const landX = f.along === "x" ? mid : end;
    const bottom = ground + footAt(side, mid, landX);
    const drop = ground - bottom;
    const base = { flight: f, risers: 0, riser: 0, from: ground, to: bottom };
    if (drop < 2 * s.minRiser) {
      stood.push({ ...base, skipped: `the land at its foot, ${bottom.toFixed(2)}, is not below the floor` });
      continue;
    }
    const tread = f.lines.length > 1 ? Math.abs(f.lines[1]! - f.lines[0]!) : 0.3;
    // As many steps as the drop takes at the standard riser, not as many treads as the plan draws: the plan draws the same
    // flight at both doors, and the street facade counts them — eleven down the west door's 1.67 m, five down the east door's
    // 0.76 — where the land falls away along the street (17/10/2026). What the room to the plot's edge holds, less a tread.
    const roomOut = Math.floor(Math.abs(end - first) / tread) - 1;
    // The plan draws the steps from partway down the path, a landing's metre or two past the door, and stops at the last tread;
    // the rest of a deep drop's steps run back toward the house, leaving a 1 m landing at its door.
    let toHouse = 0;
    for (let d = 0.1; d <= 6; d += 0.1) {
      const q = first - f.out * d;
      if (outlines.some((o) => (f.along === "x" ? insidePolygon(o, mid, q) : insidePolygon(o, q, mid)))) break;
      toHouse = d;
    }
    const spare = Math.max(0, Math.floor((toHouse - 1.0) / tread));
    if (roomOut + spare < 2) {
      stood.push({ ...base, skipped: `the ${Math.abs(end - first).toFixed(2)} m to the plot's edge does not hold two treads` });
      continue;
    }
    const wanted = Math.round(drop / s.riser);
    const extra = Math.max(0, Math.min(wanted - roomOut, spare));
    const risers = Math.max(2, Math.min(wanted, roomOut + extra));
    const start = first - f.out * tread * extra;
    const lines = Array.from({ length: risers }, (_, k) => start + f.out * tread * k);
    const riser = Math.min(s.maxRiser, drop / risers);
    const foot = ground - riser * risers;
    const flight = { ...f, lines };
    const built = flightPrimitives(flight, ground, foot, end, "yard:stairs", bottom);
    out.push(...built.primitives);
    if (built.sunk && paving) cutPaving(paving, built.sunk);
    stood.push({ ...base, flight, risers, riser });
    if (side !== front) continue;
    // The fence across the path's end is opened for it; the gate beside it stands in it.
    const [lo, hi] = [f.a, f.b];
    const across = (p: Extract<Primitive, { type: "box" }>) => (f.along === "x" ? [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2, p.centre.z] : [p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2, p.centre.x]) as [number, number, number];
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims[i]!;
      if (p.type !== "box" || !/^yard:(fence|railing)$/.test(p.tag ?? "")) continue;
      const [a, b, at] = across(p);
      if (Math.abs(at - end) > 0.3 || b <= lo || a >= hi) continue;
      const keep = [
        [a, Math.min(b, lo)],
        [Math.max(a, hi), b],
      ].filter(([u, v]) => v! - u! > 0.02);
      prims.splice(i, 1, ...keep.map(([u, v]) => ({ ...p, centre: f.along === "x" ? { ...p.centre, x: (u! + v!) / 2 } : { ...p.centre, z: (u! + v!) / 2 }, size: f.along === "x" ? { ...p.size, x: v! - u! } : { ...p.size, z: v! - u! } })));
    }
    const gate = prims.find((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.tag === "yard:gate" && Math.abs(across(p)[2] - end) < 0.3 && Math.abs((across(p)[0] + across(p)[1]) / 2 - mid) < 2);
    if (gate) {
      const h = gate.size.y;
      gate.centre = f.along === "x" ? { x: mid, y: bottom + h / 2, z: gate.centre.z } : { x: gate.centre.x, y: bottom + h / 2, z: mid };
      gate.size = f.along === "x" ? { ...gate.size, x: hi - lo } : { ...gate.size, z: hi - lo };
    }
  }
  return { primitives: out, flights: stood };
}
