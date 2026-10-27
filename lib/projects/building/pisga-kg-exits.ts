import type { Primitive } from "@/lib/projects/building/model";
import { railingPrims, stairPrims, type TreadSet } from "@/lib/projects/building/pisga-stairs";

/**
 * The kindergarten's two emergency stairs ("מדרגות חירום קלות") and the service yard at its east end, as its own drawings give them: the plan
 * ("תכנית מפלס +4.54 גן ילדים קיים", the A1/A2-10 and A4-40 lines) for where, the north facade (block 321-F2) for the levels. The floor sheets
 * draw none of it but the yard's grating (A-100), which they share.
 *
 * East: a yard at ±0.00 for the condensers ("מסתור מעבים", x 56.69–65.5, z 4–7.9), walled to +5.62 with three openings in its north wall and
 * the A-100 grating over it at +4.22 (its underside +3.97). Along that wall's north face (z 2.7–3.8) the stair: a path at +1.08 from x 68.3,
 * ten treads up west to a landing at +2.72 (x 62.4–63.3), eleven more to a landing at +4.52 against the building's east face.
 * West: the upper floor's terrace at +4.52 (x −2.2…0.88, z −0.2…4.17, a stone parapet to +5.62), a walkway at +4.54 west from it along the
 * long wall's north face (z 3.0–4.17) to x −9.3, a wall under its end, and six treads up west to +5.6 on the slope.
 */

/**
 * The ground the drawings put under and beside them, for groundAt: [level, weight] at (x, z) — weight 1 where they give it, falling to 0 over
 * 3 m to the north of z −1 — or undefined where they say nothing.
 */
export function kindergartenExitsGround(x: number, z: number): [number, number] | undefined {
  // The east yard's floor.
  if (x > 56.69 && x < 64.6 && z > 3.9 && z < 7.9) return [0, 1];
  // (Falling smoothly to 0 over 4 m north of z −1, and over 2.5 m east of x 68.5, where the bank behind the stair's path takes over.)
  const t = z > -1 ? 1 : Math.max(0, (z + 5) / 4);
  const w = t * t * (3 - 2 * t) * (x < 68.5 ? 1 : Math.max(0, (71 - x) / 2.5));
  if (z <= -5 || z >= 4.3) return undefined;
  // North of the yard's wall the ground rises from ±0.00 at the building to the stair's path (+1.08 at x 67.4, the plan's mark).
  if (x > 56.69 && x < 71 && z <= 3.9) return [Math.max(0, Math.min(1.08, (1.08 * (x - 56.7)) / (67.4 - 56.7))), w];
  // West: +0.70 under and north of the walkway and the terrace (the facade's ground, to the north wing at x 5.2), the wall at x −9.4 holding
  // the slope past it; the stair cut into the slope, its head at +5.55. North of the stair the slope keeps its own ground.
  if (x > -9.4 && x < 5.2) return [0.7, w];
  if (x > -10.8 && x <= -9.4 && z > 3.0) return [4.44 + ((-9.3 - x) / 1.5) * 1.06, w];
  if (x > -13 && x <= -9.4 && z > 2.5) return [5.55, w];
  return undefined;
}

/** Thin bars from a sloped line up: the open side of a flight, a bar every 12 cm from its nosing line to the handrail. */
function balusters(a: [number, number], b: [number, number], ya: number, yb: number, tag: string): Primitive[] {
  const out: Primitive[] = [];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 0.12));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const y = ya + (yb - ya) * t;
    out.push({ type: "box", centre: { x: a[0] + (b[0] - a[0]) * t, y: y + 0.475, z: a[1] + (b[1] - a[1]) * t }, size: { x: 0.018, y: 0.95, z: 0.018 }, material: "frame", tag });
  }
  return out;
}

/**
 * A flight along x at z centre `zc`, `width` wide: its top tread at x `xTop` (level `top`), its last at `xBottom` (one rise over `bottom`).
 * Walled: the handrail on the wall side is fixed to it; the open side gets its bars apart. `steel`: the light stair the facade draws, each
 * tread a folded plate 25 cm deep under its nosing (a sloped stringer, stepped), not a mass down to `base`.
 */
function flight(xTop: number, xBottom: number, zc: number, width: number, n: number, top: number, bottom: number, base: number, steel = false): { set: TreadSet; prims: Primitive[] } {
  const dir = Math.sign(xBottom - xTop);
  const going = Math.abs(xBottom - xTop) / n;
  const set: TreadSet = { n, width, pitch: going, dir: [dir, 0], first: [xTop + (dir * going) / 2, zc], last: [xBottom - (dir * going) / 2, zc], layer: "A4-40" };
  const prims = stairPrims(set, top, bottom, "site:stair-kg-exit", "concrete", base, true);
  if (!steel) return { set, prims };
  const rise = (top - bottom) / n;
  return {
    set,
    prims: prims.map((p, k) => {
      if (k >= n || p.type !== "box") return p;
      const h = top - k * rise;
      return { ...p, centre: { ...p.centre, y: h - (rise + 0.25) / 2 }, size: { ...p.size, y: rise + 0.25 }, material: "metal" as const };
    }),
  };
}

const slab = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, tag: string, material: "concrete" | "stone" | "paving" | "metal" = "concrete"): Primitive => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 },
  material,
  tag,
});

export function kindergartenExits(groundAt: (x: number, z: number) => number): Primitive[] {
  const out: Primitive[] = [];
  const rail = "site:stair-kg-exit-rail";
  const post = (x: number, z: number, top: number) => {
    const g = groundAt(x, z) - 0.2;
    if (top - g > 0.2) out.push(slab(x - 0.1, x + 0.1, z - 0.1, z + 0.1, g, top, "site:kg-exit-post"));
  };

  // East: the yard's walls (guards of the grating: tagged as retaining walls, so no railing stands beside them), the north one with its three openings.
  const wallTop = 5.62;
  let from = 56.69;
  for (const [o0, o1] of [[59.3, 60.0], [61.04, 61.86], [62.84, 63.66]] as const) {
    out.push(slab(from, o0, 3.9, 4.1, 0, wallTop, "site:retaining-yard", "stone"));
    // The facade draws the openings from +0.5 to +2.9: a sill under each, a lintel over.
    out.push(slab(o0, o1, 3.9, 4.1, 0, 0.5, "site:retaining-yard", "stone"));
    out.push(slab(o0, o1, 3.9, 4.1, 2.9, wallTop, "site:retaining-yard", "stone"));
    from = o1;
  }
  out.push(slab(from, 64.9, 3.9, 4.1, 0, wallTop, "site:retaining-yard", "stone"));
  out.push(slab(64.6, 64.9, 4.1, 7.9, 0, wallTop, "site:retaining-yard", "stone"));
  // Past the yard the plan carries the wall on east to x 68.2, holding the bank south of the stair's path: its top follows the bank, as the
  // facade draws no +5.62 east of the yard.
  for (let x = 64.9; x < 68.2 - 1e-6; x += 0.2) {
    const x1 = Math.min(68.2, x + 0.2);
    out.push(slab(x, x1, 3.9, 4.1, 0, Math.max(groundAt((x + x1) / 2, 3.8) + 0.4, groundAt((x + x1) / 2, 4.6) + 0.3), "site:retaining-yard", "stone"));
  }

  // East: the stair, its path, landings and posts.
  const zc = 3.25, w = 1.1, zn = zc - w / 2;
  out.push(slab(66.3, 68.3, 2.7, 3.8, Math.min(groundAt(67.3, 3.25), 1.08) - 0.3, 1.08, "site:kg-exit-path", "paving"));
  const lower = flight(63.3, 66.3, zc, w, 10, 2.72, 1.08, 0.78, true);
  const upper = flight(59.3, 62.4, zc, w, 11, 4.52, 2.72, 2.42, true);
  out.push(...lower.prims, ...upper.prims);
  out.push(slab(62.4, 63.3, 2.7, 3.8, 2.47, 2.72, "site:kg-exit-landing", "metal"));
  out.push(slab(56.69, 59.3, 2.7, 3.8, 4.27, 4.52, "site:kg-exit-landing", "metal"));
  // The facade draws one post, under the upper landing's free end; the rest hangs between the building, the wall and the path.
  post(59.2, zn + 0.1, 4.27);
  // The open (north) side: bars up the flights, a railing along the landings.
  out.push(...balusters([59.3, zn + 0.04], [62.4, zn + 0.04], 4.52, 2.72 + (4.52 - 2.72) / 11, rail));
  out.push(...balusters([63.3, zn + 0.04], [66.3, zn + 0.04], 2.72, 1.08 + (2.72 - 1.08) / 10, rail));
  out.push(...railingPrims([56.69, zn + 0.04], [59.3, zn + 0.04], 4.52, rail, 0.95));
  out.push(...railingPrims([62.4, zn + 0.04], [63.3, zn + 0.04], 2.72, rail, 0.95));

  // West: the terrace, out to the upper storey's edge the plan draws ("קצה קומה עליונה", z 0 from x −2 to the north wing at x 5.2), its
  // solid parapet from +3.97 to +6.17 the whole 7.2 m the facade draws; no columns (the facade draws none: it spans from the building).
  out.push(slab(-2.2, 0.88, -0.2, 4.17, 3.97, 4.52, "kindergarten:west-terrace", "paving"));
  out.push(slab(0.88, 5.2, -0.2, 1.02, 3.97, 4.52, "kindergarten:west-terrace", "paving"));
  out.push(slab(-2.2, 5.2, -0.2, 0.1, 4.52, 6.17, "kindergarten:west-terrace-parapet", "stone"));
  out.push(slab(-2.2, -1.9, 0.1, 3.0, 4.52, 6.17, "kindergarten:west-terrace-parapet", "stone"));
  // The long wall the walkway runs along (the plan's z 4.17 line, x −11.74…−3.3), to a guard's height over the walkway.
  out.push(slab(-11.74, -3.3, 4.17, 4.47, 0.4, 4.54 + 1.1, "site:retaining-kg", "stone"));
  // The walkway, its railing (no posts: the facade hangs it off the long wall); the wall under its west end.
  out.push(slab(-9.3, -2.2, 3.0, 4.17, 3.97, 4.54, "site:kg-exit-landing"));
  out.push(...railingPrims([-9.3, 3.04], [-2.2, 3.04], 4.54, rail, 0.95));
  // The wall under its west end, holding the slope (+5.55) north of the stair; under the walkway only to the walkway.
  out.push(slab(-9.6, -9.4, 3.0, 4.17, 0.5, 3.97, "site:retaining-kg", "stone"));
  // North of it, holding the slope's own ground: its top 0.3 m over the slope behind it, in half-metre lengths.
  for (let z = -4.5; z < 3.0 - 1e-6; z += 0.5) out.push(slab(-9.6, -9.4, z, Math.min(3.0, z + 0.5), 0.5, Math.max(1.2, groundAt(-10.1, z + 0.25) + 0.3), "site:retaining-kg", "stone"));
  // Six treads up west to the slope at +5.6, and the pad at their head.
  const west = flight(-10.8, -9.3, 3.585, 1.17, 6, 5.6, 4.54, 4.24);
  out.push(...west.prims);
  out.push(...balusters([-10.8, 3.04], [-9.3, 3.04], 5.6, 4.54 + (5.6 - 4.54) / 6, rail));
  out.push(slab(-12.3, -10.8, 3.0, 4.17, 5.3, 5.6, "site:kg-exit-path", "paving"));
  return out;
}
