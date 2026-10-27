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
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // The east yard's floor.
  if (x > 56.69 && x < 64.6 && z > 3.9 && z < 7.9) return [0, 1];
  // East of the building, north of the yard: a forecourt at ±0.00 (the facades' ground at the east end; F2 draws it under the stair) out past
  // the plot's edge to x 70, paved round the steps that come down to it; the slope takes over 4 m north of z −6 and 3 m east of x 70.
  if (x > 56.69 && x < 73 && z > -10 && z <= 3.9) return [0, smooth(z > -6 ? 1 : Math.max(0, (z + 10) / 4)) * smooth(x < 70 ? 1 : Math.max(0, (73 - x) / 3))];
  // West: the steps down north from the stair's head path cut into the slope (their treads 15 cm over it), fading over 1.4 m each side.
  if (x > -15.3 && x < -12.1 && z > -0.1 && z < 2.9) {
    const side = x < -13.9 ? (x + 15.3) / 1.4 : x > -12.7 ? (-12.1 - x) / 0.6 : 1;
    return [3.9 + ((z + 0.1) / 3.0) * 1.7 - 0.15, smooth(Math.max(0, Math.min(1, side)))];
  }
  // (Falling smoothly to 0 over 4 m north of z −1.)
  const w = smooth(z > -1 ? 1 : Math.max(0, (z + 5) / 4));
  // The stair up from the west head path to the +8.84 platform (kindergartenWestLink), cut into the slope between its walls, and the
  // platform's west strip, which the slope buried, down to its own level behind the plot's west wall.
  if (x > -13.8 && x < (z > 10.21 ? -11.3 : -12.4) && z > 4.17 && z < 11.3) return [linkLevel(z) - 0.35, 1];
  if (x >= -12.4 && x < -9.8 && z > 4.4 && z < 11.3) return [8.7, 1];
  // The light well under the west grating (kindergartenWestWell): its floor at the walkway's ground, inside its walls.
  if (x > -9.4 && x < -3.3 && z > 4.3 && z < 6.3) return [0.7, 1];
  if (z <= -5 || z >= 4.3) return undefined;
  // West: +0.70 under and north of the walkway and the terrace (the facade's ground, to the north wing at x 5.2), the wall at x −9.4 holding
  // the slope past it; the stair cut into the slope, its head at +5.55. North of the stair the slope keeps its own ground.
  if (x > -9.6 && x < 5.2) return [0.7, w];
  if (x > -10.8 && x <= -9.6 && z > 3.0) return [4.44 + ((-9.3 - x) / 1.5) * 1.06, w];
  if (x > -14.5 && x <= -9.6 && z > 2.5) return [5.55, w];
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

// The link stair west of the plot's west wall (x −12.1): from the head path's +5.6 at z 4.17, ten treads up south to a half landing at +7.31
// (z 6.97–7.97), nine more to +8.84 at z 10.21, a landing east through the wall's end onto the platform. 19 risers of 17 cm, 28 cm goings.
const LINK = { x0: -13.7, x1: -12.55, a0: 4.17, mid0: 6.97, mid1: 7.97, top: 10.49, foot: 5.6, half: 7.31, head: 8.84, going: 0.28 };
function linkLevel(z: number): number {
  const L = LINK;
  if (z <= L.a0) return L.foot;
  if (z < L.mid0) return Math.min(L.half, L.foot + Math.ceil((z - L.a0) / L.going) * ((L.half - L.foot) / 10));
  if (z < L.mid1) return L.half;
  if (z < L.top) return Math.min(L.head, L.half + Math.ceil((z - L.mid1) / L.going) * ((L.head - L.half) / 9));
  return L.head;
}

/**
 * The west exit's way on up (the user's call, 2026-10-27; no sheet draws it): from the head path at +5.6 up to the +8.84 platform by the
 * plot's emergency exit. The two are 15 cm apart in plan and 3.24 m in height, and the sheet's exit in the plot's west wall (about z 6.5)
 * is too near the path for any flight, so the stair runs south in a cut in the slope west of that wall — two flights and a half landing,
 * stone walls each side with the handrails fixed to them — and turns east onto the platform at z 10.2–11.2 where the wall ends. The plot's
 * west wall stands as the stair's east wall, a parapet a metre over the platform; the slope that buried the platform's west strip is held
 * behind it, and the platform's own railing along that edge goes.
 */
export function kindergartenWestLink(prims: Primitive[], groundAt: (x: number, z: number) => number): void {
  const L = LINK;
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i]!;
    if (p.type !== "box") continue;
    const { x, z } = p.centre;
    if ((p.tag === "site:retaining-kg" && x > L.x0 - 0.1 && x < L.x1 + 0.1 && z > 4.1 && z < 4.45) || (/^site:surface-rail/.test(p.tag ?? "") && x > -12.0 && x < -11.2 && z > 4.35 && z < 11.3)) prims.splice(i, 1);
  }
  const cx = (L.x0 + L.x1) / 2, w = L.x1 - L.x0, tag = "site:stair-kg-link";
  const flightA: TreadSet = { n: 10, width: w, pitch: L.going, dir: [0, -1], first: [cx, L.mid0 - L.going / 2], last: [cx, L.a0 + L.going / 2], layer: "A4-40" };
  const flightB: TreadSet = { n: 9, width: w, pitch: L.going, dir: [0, -1], first: [cx, L.top - L.going / 2], last: [cx, L.mid1 + L.going / 2], layer: "A4-40" };
  prims.push(...stairPrims(flightA, L.half, L.foot, tag, "stone", L.foot - 0.4, true), ...stairPrims(flightB, L.head, L.half, tag, "stone", L.half - 0.4, true));
  prims.push(
    slab(L.x0, L.x1, L.mid0, L.mid1, L.half - 0.4, L.half, `${tag}-landing`, "stone"),
    slab(L.x0, -11.4, L.top, 11.2, L.head - 0.4, L.head, `${tag}-landing`, "paving"),
    slab(L.x1, -11.4, 10.21, L.top, L.head - 0.4, L.head, `${tag}-landing`, "paving"),
    // Between the wall and the platform's slanting west edge, and under its north face down to the path: paved, filled solid.
    slab(-11.95, -10.4, 4.17, 10.21, L.foot - 0.4, L.head - 0.06, `${tag}-fill`, "stone"),
    slab(-11.95, -10.4, 4.17, 10.21, L.head - 0.06, L.head, `${tag}-landing`, "paving"),
  );
  const walls = "site:retaining-link";
  for (let z = L.a0; z < 11.55 - 1e-6; z += 0.25) {
    const z1 = Math.min(11.55, z + 0.25), m = (z + z1) / 2;
    prims.push(slab(-14.05, L.x0, z, z1, L.foot - 0.4, Math.max(groundAt(-14.4, m) + 0.3, linkLevel(m) + 1.0), walls, "stone"));
    if (z < 10.21 - 1e-6) prims.push(slab(L.x1, -11.95, z, Math.min(10.21, z1), L.foot - 0.4, L.head + 1.05, walls, "stone"));
  }
  for (let x = -14.05; x < -10.4 - 1e-6; x += 0.25) {
    const x1 = Math.min(-10.4, x + 0.25);
    prims.push(slab(x, x1, 11.2, 11.55, L.head - 0.4, Math.max(L.head + 1.0, groundAt((x + x1) / 2, 11.9) + 0.3), walls, "stone"));
  }
}

/**
 * West of the kindergarten's west wing the site sheet draws a rectangle at +9.15 (x −10…−3.25, z 4.65…9.25, the mark +932.35 inside it) whose
 * north strip is the grating it hatches (x −9.3…−3.4, z 4.3…6.2): a light well for the wing's west windows, under a grating, beside a terrace.
 * Built so: the well's floor at +0.70, stone walls round it — the long wall raised to bear the grating, a railing on it (the 8 m drop to the
 * kindergarten's walkway), a west wall the grating bears on, the terrace's fill on the south — the grating on them, no posts; the terrace
 * paved at +9.15 over its fill, one step over the west platform's +8.84 (paved on to it), six steps down south to the courtyard's +8.12, a
 * railing on its edges over that paving. The posts and railings the surfaces gave the grating and the platform's east edge go.
 */
export function kindergartenWestWell(prims: Primitive[]): void {
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i]!;
    if (p.type !== "box") continue;
    const { x, z } = p.centre;
    if ((p.tag === "site:surface:grate-post" && x > -9.4 && x < -3.3 && z > 4.2 && z < 6.3) || (/^site:surface-rail/.test(p.tag ?? "") && x > -10.6 && x < -3.25 && z > 4.2 && z < 9.35)) prims.splice(i, 1);
  }
  const level = 9.15, bear = 8.93;
  prims.push(
    slab(-9.8, -3.3, 4.17, 4.47, 0.4, level, "site:retaining-well", "stone"),
    slab(-9.8, -9.2, 4.47, 6.2, 0.4, bear, "site:retaining-well", "stone"),
    slab(-9.8, -3.3, 6.2, 9.2, 0.4, level - 0.06, "site:well-terrace-fill", "stone"),
    slab(-9.8, -3.3, 6.2, 9.2, level - 0.06, level, "site:well-terrace", "paving"),
    slab(-10.4, -9.8, 4.17, 9.2, 5.2, 8.78, "site:well-terrace-fill", "stone"),
    slab(-10.4, -9.8, 4.17, 9.2, 8.78, 8.84, "site:well-terrace", "paving"),
  );
  const down: TreadSet = { n: 6, width: 1.5, pitch: 0.3, dir: [0, 1], first: [-5.65, 9.35], last: [-5.65, 10.85], layer: "A4-40" };
  prims.push(...stairPrims(down, level, 8.12, "site:stair-well", "stone", 7.7));
  const rail = "site:stair-well-rail";
  prims.push(
    ...railingPrims([-9.3, 4.4], [-3.4, 4.4], level, rail, 1.05),
    ...railingPrims([-7.9, 9.17], [-6.45, 9.17], level, rail, 1.05),
    ...railingPrims([-4.85, 9.17], [-3.3, 9.17], level, rail, 1.05),
    ...railingPrims([-3.33, 7.9], [-3.33, 9.2], level, rail, 1.05),
  );
}

/** Paving laid on the ground over a ring: a skin 5 cm over it, half-metre cells. */
function pave(ring: Array<[number, number]>, groundAt: (x: number, z: number) => number): Primitive {
  const xs = ring.map((q) => q[0]), zs = ring.map((q) => q[1]);
  const dx = 0.5, x0 = Math.min(...xs) - dx, z0 = Math.min(...zs) - dx;
  const nx = Math.ceil((Math.max(...xs) - x0) / dx) + 2, nz = Math.ceil((Math.max(...zs) - z0) / dx) + 2;
  const inside = (x: number, z: number) => ring.reduce((c, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return (p[1] > z) !== (q[1] > z) && x < p[0] + ((z - p[1]) * (q[0] - p[0])) / (q[1] - p[1]) ? !c : c;
  }, false);
  const heights: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * dx, z = z0 + j * dx; heights.push(groundAt(x, z) + (inside(x, z) ? 0.05 : -0.6)); }
  return { type: "terrain", x0, z0, dx, nx, nz, heights, material: "paving", tag: "site:kg-exit-path" };
}

/**
 * The doors the two exits lead out of (321-F3 east, 321-F1 west): a solid steel door in the upper storey's wall at the top of each, from its
 * floor (+4.54) a door's height up, as wide as the landing — east at z 2.7–3.8 in the face at x 56.54–56.84, west at z 3.05–4.15 in the face
 * at x 0.91–1.21 (the plan's door swing there). A window of the shell's band the door runs into is closed with the wall's stone: the door
 * takes its place, and the wall is cut round the door (its boxes split).
 */
export function kindergartenExitDoors(prims: Primitive[]): void {
  const [y0, y1] = [4.54, 6.64];
  for (const o of [
    { z0: 2.7, z1: 3.8, face: 56.84, out: 1 },
    { z0: 3.05, z1: 4.15, face: 0.91, out: -1 },
  ]) {
    const [wx0, wx1] = o.out > 0 ? [o.face - 0.3, o.face] : [o.face, o.face + 0.3];
    const onFace = (b: Extract<Primitive, { type: "box" }>) => b.centre.x > wx0 - 0.1 && b.centre.x < wx1 + 0.1;
    // The window the door meets: its glass goes, stone to the band's sill and head (+5.54…+7.14) across its bay and the gaps beside it.
    for (let i = prims.length - 1; i >= 0; i--) {
      const b = prims[i]!;
      if (b.type !== "box" || b.tag !== "kindergarten:window" || !onFace(b) || b.centre.y < y0) continue;
      const [bz0, bz1] = [b.centre.z - b.size.z / 2, b.centre.z + b.size.z / 2];
      if (bz1 <= o.z0 - 0.4 || bz0 >= o.z1 + 0.4) continue;
      prims.splice(i, 1, { type: "box", centre: { x: (wx0 + wx1) / 2, y: 6.34, z: (bz0 + bz1) / 2 }, size: { x: wx1 - wx0, y: 1.6, z: bz1 - bz0 + 0.2 }, material: "existing", tag: "kindergarten" });
    }
    for (let i = prims.length - 1; i >= 0; i--) {
      const b = prims[i]!;
      if (b.type !== "box" || b.rotY || !/^kindergarten/.test(b.tag ?? "") || /railing|exit-door/.test(b.tag ?? "") || !onFace(b)) continue;
      const [by0, by1, bz0, bz1] = [b.centre.y - b.size.y / 2, b.centre.y + b.size.y / 2, b.centre.z - b.size.z / 2, b.centre.z + b.size.z / 2];
      if (by1 <= y0 || by0 >= y1 || bz1 <= o.z0 || bz0 >= o.z1) continue;
      const piece = (ya: number, yb: number, za: number, zb: number): Primitive => ({ ...b, centre: { x: b.centre.x, y: (ya + yb) / 2, z: (za + zb) / 2 }, size: { x: b.size.x, y: yb - ya, z: zb - za } });
      const pieces: Primitive[] = [];
      if (by0 < y0) pieces.push(piece(by0, y0, bz0, bz1));
      if (by1 > y1) pieces.push(piece(y1, by1, bz0, bz1));
      if (bz0 < o.z0) pieces.push(piece(Math.max(by0, y0), Math.min(by1, y1), bz0, o.z0));
      if (bz1 > o.z1) pieces.push(piece(Math.max(by0, y0), Math.min(by1, y1), o.z1, bz1));
      prims.splice(i, 1, ...pieces);
    }
    // The leaf, set 8 cm into the opening; a steel frame round it; a push bar across at hand height.
    const tag = "kindergarten:exit-door", zc = (o.z0 + o.z1) / 2, leafX = o.face - o.out * 0.08;
    prims.push({ type: "box", centre: { x: leafX, y: (y0 + y1) / 2, z: zc }, size: { x: 0.05, y: y1 - y0, z: o.z1 - o.z0 }, material: "frame", tag });
    for (const [za, zb] of [[o.z0, o.z0 + 0.06], [o.z1 - 0.06, o.z1]] as const) prims.push({ type: "box", centre: { x: o.face - o.out * 0.05, y: (y0 + y1) / 2, z: (za + zb) / 2 }, size: { x: 0.1, y: y1 - y0, z: zb - za }, material: "darkSteel", tag });
    prims.push({ type: "box", centre: { x: o.face - o.out * 0.05, y: y1 - 0.03, z: zc }, size: { x: 0.1, y: 0.06, z: o.z1 - o.z0 }, material: "darkSteel", tag });
    prims.push({ type: "box", centre: { x: leafX + o.out * 0.06, y: y0 + 1.0, z: zc }, size: { x: 0.04, y: 0.04, z: o.z1 - o.z0 - 0.3 }, material: "metal", tag });
  }
}

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
  // The path the plan marks +1.08: a landing on posts over the forecourt (F2 draws its rail and a post over ±0.00), on to the plot's edge,
  // and six steps down north off its east end to the forecourt.
  out.push(slab(66.3, 69.2, 2.7, 3.8, 0.83, 1.08, "site:kg-exit-landing"));
  for (const [x, z] of [[66.4, 2.8], [69.1, 2.8], [69.1, 3.7], [67.6, 2.8]] as const) out.push(slab(x - 0.1, x + 0.1, z - 0.1, z + 0.1, groundAt(x, z) - 0.2, 0.83, "site:kg-exit-post"));
  const down: TreadSet = { n: 6, width: 1.1, pitch: 0.3, dir: [0, -1], first: [68.6, 2.55], last: [68.6, 1.05], layer: "A4-40" };
  out.push(...stairPrims(down, 1.08, 0, "site:stair-kg-exit", "stone", -0.2));
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
  out.push(...railingPrims([66.3, zn + 0.04], [68.05, zn + 0.04], 1.08, rail, 0.95));
  out.push(...railingPrims([69.16, 2.7], [69.16, 3.8], 1.08, rail, 0.95));
  out.push(...railingPrims([68.2, 3.76], [69.2, 3.76], 1.08, rail, 0.95));
  // The forecourt's paving: round the steps' foot, and along the kindergarten's north face (its windows at the ground) to the middle wing.
  out.push(pave([[56.69, -6], [69.1, -6], [69.1, 0.9], [68.05, 0.9], [68.05, -4.01], [56.69, -4.01]], groundAt), pave([[30.72, -6], [56.69, -6], [56.69, -4.01], [30.72, -4.01]], groundAt));

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
  for (let z = -4.5; z < 3.0 - 1e-6; z += 0.5) out.push(slab(-9.6, -9.4, z, Math.min(3.0, z + 0.5), Math.min(0.5, groundAt(-9.2, z + 0.25) - 0.3, groundAt(-9.2, z) - 0.3, groundAt(-9.2, Math.min(3.0, z + 0.5)) - 0.3), Math.max(1.2, groundAt(-10.1, z + 0.25) + 0.3), "site:retaining-kg", "stone"));
  // Six treads up west to the slope at +5.6, and the pad at their head.
  const west = flight(-10.8, -9.3, 3.585, 1.17, 6, 5.6, 4.54, 4.24);
  out.push(...west.prims);
  out.push(...balusters([-10.8, 3.04], [-9.3, 3.04], 5.6, 4.54 + (5.6 - 4.54) / 6, rail));
  // Its head path at +5.6 runs on west past the plot's edge (F2 draws its rail on, level), held by a low wall on the uphill side and at its end,
  // and ten steps take it down north to the slope's foot (+3.9), a path on at the ground's grade from there.
  out.push(slab(-13.9, -10.8, 2.9, 4.17, 5.3, 5.6, "site:kg-exit-path", "paving"));
  for (let x = -13.9; x < -11.74 - 1e-6; x += 0.2) out.push(slab(x, Math.min(-11.74, x + 0.2), 4.17, 4.37, 5.3, Math.max(5.9, groundAt(x + 0.1, 4.7) + 0.3), "site:retaining-kg", "stone"));
  for (let z = 2.9; z < 4.37 - 1e-6; z += 0.2) out.push(slab(-14.1, -13.9, z, Math.min(4.37, z + 0.2), 5.3, Math.max(5.9, groundAt(-14.5, z + 0.1) + 0.3), "site:retaining-kg", "stone"));
  out.push(...railingPrims([-12.7, 2.94], [-10.8, 2.94], 5.6, rail, 0.95));
  const westDown: TreadSet = { n: 10, width: 1.2, pitch: 0.3, dir: [0, -1], first: [-13.3, 2.75], last: [-13.3, 0.05], layer: "A4-40" };
  out.push(...stairPrims(westDown, 5.6, 3.9, "site:stair-kg-exit", "stone", Math.min(groundAt(-13.3, 0), groundAt(-13.3, 2)) - 0.3));
  out.push(pave([[-13.9, -8], [-12.7, -8], [-12.7, -0.1], [-13.9, -0.1]], groundAt));
  return out;
}
