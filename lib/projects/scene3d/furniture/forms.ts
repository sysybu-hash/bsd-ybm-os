import { part, type PiecePart } from "@/lib/projects/scene3d/furniture/types";
import type { MaterialId } from "@/lib/projects/scene3d/types";

/**
 * Soft forms for furniture: rings, lofts and sweeps, from numbers.
 *
 * A piece of furniture is not a stack of boxes. These build the things a box cannot: a cushion that swells, a seat dished a hand deep, a leg that
 * narrows to its foot, a tap that arches, a pillow with its corners pulled in. Each returns PiecePart(s) in the piece's own frame — centre
 * relative to the piece's centre, y metres over the floor — with the form's bounding box as w, h and d, so every contract on a piece's footprint
 * still holds. Nothing here is drawn for one flat: a form is given its measured extents.
 */

type Ring = Array<[number, number]>;

/** A rounded rectangle, counter-clockwise, `seg` points to a corner: the same count every time, so rings of any size loft together. */
export function rrect(w: number, d: number, r: number, seg = 5): Ring {
  const rr = Math.max(0, Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4));
  const out: Ring = [];
  const corners: Array<[number, number, number]> = [
    [w / 2 - rr, d / 2 - rr, 0],
    [-w / 2 + rr, d / 2 - rr, Math.PI / 2],
    [-w / 2 + rr, -d / 2 + rr, Math.PI],
    [w / 2 - rr, -d / 2 + rr, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((Math.PI / 2) * i) / seg;
      out.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]);
    }
  }
  return out;
}

/** An ellipse as a ring of n points. */
export function ellipse(rx: number, rz: number, n = 24): Ring {
  return Array.from({ length: n }, (_, i) => [rx * Math.cos((2 * Math.PI * i) / n), rz * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
}

const scaled = (ring: Ring, s: number, dx = 0, dz = 0): Ring => ring.map(([x, z]) => [x * s + dx, z * s + dz]);

/**
 * A cushion: a rounded block that swells towards its middle and is pinched at top and bottom. `corner` is the plan radius. Its bounding box is exactly w × h × d.
 */
export function cushion(tag: string, material: MaterialId, box: { x: number; y: number; z: number; w: number; h: number; d: number }, opts: { corner?: number; tiltX?: number } = {}): PiecePart {
  const { w, h, d } = box;
  const base = rrect(w, d, opts.corner ?? Math.min(w, d) * 0.22);
  const steps = 7;
  const sections = Array.from({ length: steps }, (_, k) => {
    const t = k / (steps - 1);
    // 0.84 at the very top and bottom, 1 through the belly: a soft crown and a tucked base.
    const s = 0.84 + 0.16 * Math.sin(Math.PI * t) ** 0.7;
    return { y: -h / 2 + h * t, ring: scaled(base, s) };
  });
  const out = { ...part(tag, material, box), shape: { kind: "loft" as const, sections, capped: true } };
  return opts.tiltX ? { ...out, tiltX: opts.tiltX } : out;
}

/** A pillow: a flattened ellipsoid pulled in at its corners, laid at a slight angle. */
export function pillow(tag: string, material: MaterialId, box: { x: number; y: number; z: number; w: number; h: number; d: number }, tiltX = 0): PiecePart {
  const out = { ...part(tag, material, box), shape: { kind: "ellipsoid" as const, segments: 16 } };
  return tiltX ? { ...out, tiltX } : out;
}

/** A leg that narrows from its top to its foot: a round loft, `top` and `foot` radii. */
export function taperedLeg(tag: string, material: MaterialId, at: { x: number; z: number; h: number }, top: number, foot: number): PiecePart {
  const n = 12;
  const sections = [0, 1].map((k) => ({ y: -at.h / 2 + at.h * k, ring: ellipse(k === 0 ? foot : top, k === 0 ? foot : top, n) }));
  return { ...part(tag, material, { x: at.x, y: at.h / 2, z: at.z, w: top * 2, h: at.h, d: top * 2 }), shape: { kind: "loft" as const, sections, capped: true } };
}

/** A plan outline extruded: any footprint with soft edges (a seat pan, a table top, a headboard). */
export function slab(tag: string, material: MaterialId, box: { x: number; y: number; z: number; w: number; h: number; d: number }, corner: number, bevel = 0.012): PiecePart {
  return { ...part(tag, material, box), shape: { kind: "extrude" as const, outline: rrect(box.w, box.d, corner, 6), bevel } };
}

/** A tube along a path (a gooseneck tap, a bent chair leg, a handle). Path points are relative to the part's own centre; the bounds are given. */
export function tube(tag: string, material: MaterialId, box: { x: number; y: number; z: number; w: number; h: number; d: number }, path: Array<[number, number, number]>, radius: number): PiecePart {
  return { ...part(tag, material, box), shape: { kind: "sweep" as const, path, radius, segments: 8 } };
}

/** A solid of revolution about the vertical axis: bowls, lamp bases, burners, round tops. Profile (radius, y) from the bottom, y relative to the part's centre. */
export function turned(tag: string, material: MaterialId, at: { x: number; y: number; z: number }, radius: number, h: number, profile: Array<[number, number]>): PiecePart {
  return { ...part(tag, material, { x: at.x, y: at.y, z: at.z, w: radius * 2, h, d: radius * 2 }), shape: { kind: "lathe" as const, profile, segments: 32 } };
}


/**
 * A hollow vessel: a lip lying on a surface, walls going down, a floor. Not a slab with a dark plate on it — it has depth a camera can see into.
 * `lip` is the rim's outer size and `well` the opening's; `depth` metres below the rim; the floor is a little smaller than the opening and rounded more.
 * The part's box is the lip's extent and the vessel's depth, its top at `top`.
 */
export function hollow(tag: string, material: MaterialId, at: { x: number; z: number; top: number }, lip: { w: number; d: number }, well: { w: number; d: number }, depth: number, corner = 0.05, floorInset = 0.03): PiecePart {
  const seg = 5;
  const sections = [
    { y: depth / 2, ring: rrect(lip.w, lip.d, corner + (lip.w - well.w) / 2, seg) },
    { y: depth / 2, ring: rrect(well.w, well.d, corner, seg) },
    { y: -depth / 2 + 0.01, ring: rrect(well.w - floorInset, well.d - floorInset, corner + floorInset, seg) },
    { y: -depth / 2, ring: rrect(well.w - floorInset - 0.01, well.d - floorInset - 0.01, corner + floorInset, seg) },
  ];
  return { ...part(tag, material, { x: at.x, y: at.top - depth / 2, z: at.z, w: lip.w, h: depth, d: lip.d }), shape: { kind: "loft" as const, sections, capped: true } };
}

/**
 * A free-standing hollow body: a tub, a vessel basin. Outer walls rise from a narrower foot to the full rim, the rim runs inward to the opening, and the inside goes down to a
 * floor `floorH` above the bottom. The box is w x h x d on the floor (bottom at y0).
 */
export function shell(tag: string, material: MaterialId, box: { x: number; y0: number; z: number; w: number; h: number; d: number }, wall: number, corner: number, floorH: number): PiecePart {
  const seg = 6;
  const { w, h, d } = box;
  const ow = Math.max(0.05, w - 2 * wall), od = Math.max(0.05, d - 2 * wall);
  const sections = [
    { y: -h / 2, ring: rrect(w * 0.9, d * 0.9, corner * 0.8, seg) },
    { y: -h / 2 + h * 0.18, ring: rrect(w, d, corner, seg) },
    { y: h / 2, ring: rrect(w, d, corner, seg) },
    { y: h / 2, ring: rrect(ow, od, Math.max(0.01, corner - wall), seg) },
    { y: -h / 2 + floorH + 0.02, ring: rrect(ow * 0.94, od * 0.94, Math.max(0.02, corner - wall) + 0.03, seg) },
    { y: -h / 2 + floorH, ring: rrect(ow * 0.9, od * 0.9, Math.max(0.03, corner - wall) + 0.04, seg) },
  ];
  return { ...part(tag, material, { x: box.x, y: box.y0 + h / 2, z: box.z, w, h, d }), shape: { kind: "loft" as const, sections, capped: true } };
}
