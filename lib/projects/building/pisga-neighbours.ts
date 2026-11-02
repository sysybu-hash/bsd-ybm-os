import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";

/**
 * The buildings round Pisga, as the plot's aerial (27.12.22/המגרש.png, north up) shows them, fitted to the survey's frame at 2.93 px a metre
 * with plan x = (px − 806) / 2.93, z = (py − 314) / 2.93 (the kerbs, the island and both stair corridors land within about 3 m). Neither the
 * survey nor the architect's DXF draws them; their heights are read from the photographs of the existing state (13–17: the terraced row
 * west with red roofs over the stair wall, the stepped white blocks east, 6–7 storeys from the low road).
 *
 * Footprints are rotated rectangles: a centre, a length along `angle` (degrees from plan x toward plan z), a width across.
 */
type Block = { x: number; z: number; length: number; width: number; angle: number; above: number; roof?: "tile" | "flat"; material?: BuildingMaterial };

// The terraced row west of the west stair, between the dual road and the upper road: fourteen houses, a red-roofed body 6 m by 11.5 m on the
// upper road's side (z 20–31.5) two storeys over it, and a lower stone wing toward the road below (z 13–20).
const WEST_ROW: Array<[number, number]> = [
  [-156.3, -150.2], [-146.9, -140.8], [-137.5, -131.4], [-128.1, -122], [-118.8, -113.1], [-109.4, -103.8], [-96.7, -90.6],
  [-87.4, -81.3], [-78.5, -72.4], [-68.6, -63], [-59.7, -53.6], [-50.4, -44.2], [-41, -35.3], [-31.6, -25.5],
];

// East of the east stair: the stepped flat-roofed blocks along the low road, and the long red-roofed blocks on the upper road behind them,
// all turned to the road (26.6°).
const EAST: Block[] = [
  { x: 91, z: 21.1, length: 20, width: 14, angle: 26.6, above: 6, roof: "flat" },
  { x: 119, z: 35.1, length: 26, width: 13, angle: 26.6, above: 6, roof: "flat" },
  { x: 146.2, z: 46.5, length: 24, width: 12, angle: 26.6, above: 6, roof: "flat" },
  { x: 171.5, z: 57.9, length: 22, width: 12, angle: 26.6, above: 6, roof: "flat" },
  { x: 81.4, z: 35.1, length: 26, width: 11, angle: 26.6, above: 12, roof: "tile" },
  { x: 111.6, z: 49.1, length: 24, width: 11, angle: 26.6, above: 12, roof: "tile" },
  { x: 139.2, z: 60.5, length: 24, width: 11, angle: 26.6, above: 12, roof: "tile" },
];

// The local council's building across the upper road, south-west (parcel 501 on the site plan): set into the slope, its roof under solar
// panels, a strip of red tile on its south edge.
const COUNCIL: Array<[number, number]> = [[-97.8, 61.5], [-83.1, 58.7], [-47.7, 58.7], [-33.1, 75], [-36.4, 96.3], [-97.8, 96.3]];

/** A box turned so its length runs along `angle`. */
function turned(b: { x: number; z: number; length: number; width: number; angle: number }, y0: number, y1: number, material: BuildingMaterial, tag: string): Primitive {
  return { type: "box", centre: { x: b.x, y: (y0 + y1) / 2, z: b.z }, size: { x: b.length, y: y1 - y0, z: b.width }, rotY: (-b.angle * Math.PI) / 180, material, tag };
}

/** Two tiled slopes meeting over the length, `rise` over the eaves. */
function gable(b: { x: number; z: number; length: number; width: number; angle: number }, eaves: number, rise: number, tag: string): Primitive[] {
  const a = (b.angle * Math.PI) / 180, pitch = Math.atan2(rise, b.width / 2), half = b.width / 2 / Math.cos(pitch) + 0.3;
  // The local z axis (across the length) in plan.
  const [cx, cz] = [-Math.sin(a), Math.cos(a)];
  return [1, -1].map((side) => ({
    type: "box" as const,
    centre: { x: b.x + cx * side * (b.width / 4), y: eaves + rise / 2, z: b.z + cz * side * (b.width / 4) },
    size: { x: b.length + 0.4, y: 0.14, z: half },
    rotY: -a,
    rotX: side * pitch,
    material: "roofTile" as const,
    tag,
  }));
}

/** The neighbours' primitives; `groundAt` gives each its foot (the lowest ground under it) and the level its height is counted from (the ground on its upper side). */
export function pisgaNeighbours(groundAt: (x: number, z: number) => number): Primitive[] {
  const out: Primitive[] = [];
  const tag = "site:neighbour";
  const footOf = (pts: Array<[number, number]>) => Math.min(...pts.map(([x, z]) => groundAt(x, z))) - 0.5;
  for (const [a, b] of WEST_ROW) {
    const body = { x: (a + b) / 2, z: 25.75, length: 11.5, width: b - a, angle: 90 };
    const top = groundAt(body.x, 31.5) + 6.5;
    out.push(turned(body, footOf([[a, 20], [b, 20], [a, 31.5], [b, 31.5]]), top, "neighbourFacade", tag), ...gable(body, top, 2, `${tag}-roof`));
    const wing = { x: (a + b) / 2, z: 16.5, length: b - a + 3, width: 7, angle: 0 };
    out.push(turned(wing, footOf([[a, 13], [b, 13], [a, 20], [b, 20]]), groundAt(body.x, 20) + 3, "neighbourFacade", tag));
  }
  for (const e of EAST) {
    const a = (e.angle * Math.PI) / 180, [ux, uz] = [Math.cos(a), Math.sin(a)], [vx, vz] = [-Math.sin(a), Math.cos(a)];
    const corners: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([p, q]) => [e.x + (ux * p! * e.length + vx * q! * e.width) / 2, e.z + (uz * p! * e.length + vz * q! * e.width) / 2]);
    // Its upper side is the one toward the upper road (+z across).
    const top = groundAt(e.x + (vx * e.width) / 2, e.z + (vz * e.width) / 2) + e.above;
    out.push(turned(e, footOf(corners), top, e.material ?? "neighbourFacade", tag));
    if (e.roof === "tile") out.push(...gable(e, top, 1.6, `${tag}-roof`));
  }
  const cx = COUNCIL.reduce((t, p) => t + p[0], 0) / COUNCIL.length, cz = COUNCIL.reduce((t, p) => t + p[1], 0) / COUNCIL.length;
  const councilTop = groundAt(cx, cz) + 9;
  out.push({ type: "prism", ring: COUNCIL, y0: footOf(COUNCIL), y1: councilTop, material: "neighbourFacade", tag });
  out.push({ type: "prism", ring: [[-97.8, 89], [-36.4, 89], [-36.4, 96.3], [-97.8, 96.3]], y0: councilTop, y1: councilTop + 0.5, material: "roofTile", tag: `${tag}-roof` });
  return out;
}

/** The neighbours' plan outlines, for the cameras: a frame should not stand behind one. */
export function pisgaNeighbourBoxes(prims: Primitive[]): Array<{ x0: number; x1: number; z0: number; z1: number; y1: number }> {
  return prims.flatMap((p) => {
    if (!(p.tag ?? "").startsWith("site:neighbour") || (p.tag ?? "").endsWith("-roof")) return [];
    if (p.type === "box") {
      const r = Math.hypot(p.size.x, p.size.z) / 2;
      return [{ x0: p.centre.x - r, x1: p.centre.x + r, z0: p.centre.z - r, z1: p.centre.z + r, y1: p.centre.y + p.size.y / 2 }];
    }
    if (p.type === "prism") return [{ x0: Math.min(...p.ring.map((q) => q[0])), x1: Math.max(...p.ring.map((q) => q[0])), z0: Math.min(...p.ring.map((q) => q[1])), z1: Math.max(...p.ring.map((q) => q[1])), y1: p.y1 }];
    return [];
  });
}
