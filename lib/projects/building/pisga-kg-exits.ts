import type { Primitive } from "@/lib/projects/building/model";
import { railingPrims, slopedTopRail, stairPrims, type TreadSet } from "@/lib/projects/building/pisga-stairs";

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
/** The east yard's floor, walled round: the condensers' screen (x 56.69–64.6, z 3.9–7.9). */
export const insideKindergartenYard = (x: number, z: number) => x > 56.69 && x < 64.6 && z > 3.9 && z < 7.9;

export function kindergartenExitsGround(x: number, z: number): [number, number] | undefined {
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // The east yard's floor.
  if (insideKindergartenYard(x, z)) return [0, 1];
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
  if (x > -13.8 && x < (z > 10.21 ? -10.4 : -12.4) && z > 4.17 && z < 11.3) return [linkLevel(z) - 0.35, 1];
  if (x >= -10.4 && x < -9.8 && z > 4.4 && z < 11.3) return [8.7, 1];
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

/** Treads only — `stairPrims` top-rail chips read as a bar blocking landings in kg-west-stairdn / terrace views. */
function treadsOnly(prims: Primitive[], tag: string): Primitive[] {
  return prims.filter((p) => !(p.type === "box" && (p.tag ?? "") === `${tag}-rail`));
}

/** Thin bars from a sloped line up: the open side of a flight, a bar every 12 cm from its nosing line to the handrail. */
function balusters(a: [number, number], b: [number, number], ya: number, yb: number, tag: string, h = 0.95): Primitive[] {
  const out: Primitive[] = [];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 0.12));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const y = ya + (yb - ya) * t;
    out.push({ type: "box", centre: { x: a[0] + (b[0] - a[0]) * t, y: y + h / 2, z: a[1] + (b[1] - a[1]) * t }, size: { x: 0.018, y: h, z: 0.018 }, material: "frame", tag });
  }
  return out;
}

/** Handrail following the same slope as `balusters` (F2 open side). */
function slopeTopRail(a: [number, number], b: [number, number], ya: number, yb: number, tag: string, h = 0.95): Primitive[] {
  return slopedTopRail(a, b, ya, yb, tag, h);
}

/**
 * A flight along x at z centre `zc`, `width` wide: its top tread at x `xTop` (level `top`), its last at `xBottom` (one rise over `bottom`).
 * Walled: the handrail on the wall side is fixed to it; the open side gets its bars apart. `steel`: the light stair the facade draws, each
 * tread a folded plate 25 cm deep under its nosing (a sloped stringer, stepped), not a mass down to `base`.
 */
function flight(xTop: number, xBottom: number, zc: number, width: number, n: number, top: number, bottom: number, base: number, steel = false, ownWallRail = true): { set: TreadSet; prims: Primitive[] } {
  const dir = Math.sign(xBottom - xTop);
  const going = Math.abs(xBottom - xTop) / n;
  const set: TreadSet = { n, width, pitch: going, dir: [dir, 0], first: [xTop + (dir * going) / 2, zc], last: [xBottom - (dir * going) / 2, zc], layer: "A4-40" };
  const prims = stairPrims(set, top, bottom, "site:stair-kg-exit", "concrete", base, true);
  if (!steel) return { set, prims };
  const rise = (top - bottom) / n;
  // stairPrims' handrails came out as short chips hanging on the yard wall (kg-east): the wall side gets one continuous rail 5 cm off the
  // wall, held by a bracket every 1.2 m; the open side has its balusters.
  const wallZ = zc + width / 2 - 0.04;
  const a: [number, number] = [xTop, wallZ], b: [number, number] = [xBottom, wallZ];
  const wallRail = ownWallRail ? slopedTopRail(a, b, top, bottom, "site:stair-kg-exit-rail", 0.9, 0.045) : [];
  const brackets = Math.max(2, Math.ceil(Math.abs(xBottom - xTop) / 1.2) + 1);
  for (let k = 0; ownWallRail && k < brackets; k++) {
    const t = (k + 0.5) / brackets, x = xTop + (xBottom - xTop) * t;
    wallRail.push({ type: "box", centre: { x, y: top + (bottom - top) * t + 0.86, z: wallZ + 0.06 }, size: { x: 0.03, y: 0.03, z: 0.12 }, material: "darkSteel", tag: "site:stair-kg-exit-rail" });
  }
  return {
    set,
    prims: [...prims.filter((p) => !(p.tag ?? "").endsWith("-rail")), ...wallRail].map((p, k) => {
      if (k >= n || p.type !== "box") return p;
      const h = top - k * rise;
      return { ...p, centre: { ...p.centre, y: h - (rise + 0.25) / 2 }, size: { ...p.size, y: rise + 0.25 }, material: "metal" as const };
    }),
  };
}

const slab = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, tag: string, material: "concrete" | "stone" | "paving" | "metal" | "louvre" = "concrete"): Primitive => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 },
  material,
  tag,
});

// Link stair (handover b0446999): +5.6 → +8.84 in the slope cut west of the plot wall — plan width 1.2 m between parallel stone guards.
const LINK = { x0: -13.85, x1: -12.65, a0: 4.17, mid0: 6.97, mid1: 7.97, top: 10.49, foot: 5.6, half: 7.31, head: 8.84, going: 0.28 };
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
    if ((p.tag === "site:retaining-kg" && x > L.x0 - 0.1 && x < L.x1 + 0.1 && z > 4.1 && z < 4.45) || (/^site:surface-rail/.test(p.tag ?? "") && x > -12.0 && x < -10.2 && z > 4.35 && z < 11.3)) prims.splice(i, 1);
  }
  const cx = (L.x0 + L.x1) / 2, w = L.x1 - L.x0, tag = "site:stair-kg-link";
  const flightA: TreadSet = { n: 10, width: w, pitch: L.going, dir: [0, -1], first: [cx, L.mid0 - L.going / 2], last: [cx, L.a0 + L.going / 2], layer: "A4-40" };
  const flightB: TreadSet = { n: 9, width: w, pitch: L.going, dir: [0, -1], first: [cx, L.top - L.going / 2], last: [cx, L.mid1 + L.going / 2], layer: "A4-40" };
  prims.push(
    ...treadsOnly(stairPrims(flightA, L.half, L.foot, tag, "stone", L.foot - 0.4, true), tag),
    ...treadsOnly(stairPrims(flightB, L.head, L.half, tag, "stone", L.half - 0.4, true), tag),
  );
  // Slope fill west of the flights only — an east cheek at x≈−11.95 read as «stairs into a wall» (kg-west-link-top).
  prims.push(slab(-14.2, L.x0, L.a0, 10.21, L.foot - 0.4, L.head - 0.06, `${tag}-fill`, "stone"));
  // Half landing + east turn only — do not pave over the flight channel (kg-west-link-top: treads vanishing into a deck).
  prims.push(
    slab(L.x0, L.x1, L.mid0, L.mid1, L.half - 0.4, L.half, `${tag}-landing`, "stone"),
    // The sheet's paving platform (x −11.7…−7.89, z 4.25…11.2, now at +8.84) is the floor east of x −11.7 and south to z 11.2: a slab laid over it at
    // the same level is two coplanar tops z-fighting (kg-west-link-top, the pale sheet). The landing is only what the platform lacks.
    slab(L.x0, -11.7, 9.98, 11.55, L.head - 0.06, L.head, `${tag}-landing`, "paving"),
    slab(-11.7, -10.4, 11.2, 11.55, L.head - 0.06, L.head, `${tag}-landing`, "paving"),
  );
  const walls = "site:retaining-link";
  prims.push(slab(-14.2, L.x0, L.a0, 11.55, L.foot - 0.4, 13.2, walls, "stone"));
  prims.push(slab(L.x1, -11.95, L.a0, 7.05, L.foot - 0.4, L.head + 1.05, walls, "stone"));
  // North cap on the west channel only — not across the east walk at z≈10–11.
  prims.push(slab(-14.2, L.x0, 11.05, 11.55, L.head - 0.4, Math.max(L.head + 1.0, groundAt(-13, 11.5) + 0.3), walls, "stone"));
}

/**
 * West of the kindergarten's west wing the site sheet draws a rectangle at +9.15 (x −10…−3.25, z 4.65…9.25, the mark +932.35 inside it) whose
 * north strip is the grating it hatches (x −9.3…−3.4, z 4.3…6.2): a light well for the wing's west windows, under a grating, beside a terrace.
 * Built so: the deck paved at +9.15 south of the strip; over the strip a steel grating at the deck's level, open bars, and under it the
 * well down to floor −1's mark "+7.99" at (−5.2, 5.2), the wing's roof. One step over the west platform's +8.84, six steps down south to
 * the courtyard's +8.12, a railing on the outer edges. The posts and railings the surfaces gave the grating and the platform's east edge go.
 */
export function kindergartenWestWell(prims: Primitive[]): void {
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i]!;
    if (p.type === "prism" && p.tag === "site:surface:grate") {
      const xs = p.ring.map((q) => q[0]);
      const zs = p.ring.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      // The hatch's solid 22 cm slab read as a dark strip: the grating is built here as open bars over the well.
      if (cx > -10 && cx < -3 && cz > 4 && cz < 7) prims.splice(i, 1);
      continue;
    }
    if (p.type !== "box") continue;
    const { x, z } = p.centre;
    if ((p.tag === "site:surface:grate-post" && x > -9.4 && x < -3.3 && z > 4.2 && z < 6.3) || (/^site:surface-rail/.test(p.tag ?? "") && x > -10.6 && x < -3.25 && z > 4.2 && z < 9.35)) prims.splice(i, 1);
  }
  const level = 9.15, bear = 8.93;
  // The paved deck from the grating's south edge (z 6.2) to the south lip; the well under the grating, its floor the sheet's +7.99.
  const well = { x0: -9.2, x1: -3.4, z0: 4.47, z1: 6.2, floor: 7.99 };
  prims.push(
    slab(-10.4, -3.3, 4.17, 4.47, 0.4, level, "site:retaining-well", "stone"),
    slab(-10.4, -9.2, 4.47, 6.2, 0.4, level, "site:retaining-well", "stone"),
    slab(-3.4, -3.3, 4.47, 6.2, 0.4, level, "site:retaining-well", "stone"),
    slab(well.x0, well.x1, well.z0, well.z1, 0.4, well.floor, "site:well-floor", "concrete"),
    slab(-10.4, -3.3, well.z1, 9.2, 0.4, level - 0.06, "site:well-terrace-fill", "stone"),
    slab(-10.4, -3.3, well.z1, 9.2, level - 0.06, level, "site:well-terrace", "paving"),
    // +8.84 strip east of the well, past the sheet's platform (z 11.2) — continuous with link landing (kg-west-link-top).
    slab(-10.4, -9.45, 11.2, 11.55, LINK.head - 0.06, LINK.head, "site:well-terrace", "paving"),
  );
  // The grating: flat bars 3 cm wide every 6 cm across the well, on two bearers and the walls.
  for (let x = well.x0 + 0.05; x < well.x1 - 0.02; x += 0.06) prims.push({ type: "box", centre: { x, y: level - 0.02, z: (well.z0 + well.z1) / 2 }, size: { x: 0.03, y: 0.04, z: well.z1 - well.z0 }, material: "metal", tag: "site:well-grating" });
  for (const z of [well.z0 + 0.03, (well.z0 + well.z1) / 2, well.z1 - 0.03]) prims.push({ type: "box", centre: { x: (well.x0 + well.x1) / 2, y: level - 0.06, z }, size: { x: well.x1 - well.x0, y: 0.08, z: 0.05 }, material: "metal", tag: "site:well-grating" });
  void bear;
  const down: TreadSet = { n: 6, width: 1.5, pitch: 0.3, dir: [0, 1], first: [-5.65, 9.35], last: [-5.65, 10.85], layer: "A4-40" };
  // Treads only: stairPrims' handrail is one horizontal chip per tread. Both sides are open, so a span rail follows the baluster tops.
  prims.push(...treadsOnly(stairPrims(down, level, 8.12, "site:stair-well", "stone", 7.7), "site:stair-well"));
  const rail = "site:stair-well-rail";
  const lipZ = 9.17;
  const headZ = down.first[1];
  const hRail = 1.05;
  // Same underside as railingPrims' top bar (centred at level+hRail, 5 cm thick).
  const balH = hRail - 0.025;
  const xWest = down.first[0] - (down.width / 2 - 0.04);
  const xEast = down.first[0] + (down.width / 2 - 0.04);
  for (const x of [xWest, xEast]) {
    // Short return, lip to the first nosing, at the terrace rail height. Too short for railingPrims (0.18 m).
    // Corner post at (x, lipZ). The lip rail omits its own post there.
    prims.push({ type: "box", centre: { x, y: level + hRail, z: (lipZ + headZ) / 2 }, size: { x: headZ - lipZ, y: 0.05, z: 0.06 }, rotY: -Math.PI / 2, material: "frame", tag: rail });
    prims.push({ type: "box", centre: { x, y: level + hRail / 2, z: lipZ }, size: { x: 0.07, y: hRail, z: 0.07 }, material: "frame", tag: rail });
    prims.push(...balusters([x, headZ], [x, down.last[1]], level, 8.12, rail, balH), ...slopeTopRail([x, headZ], [x, down.last[1]], level, 8.12, rail, balH));
  }
  // South lip stops on the corner posts (x −6.36 and −4.94). One rail on the outer north edge, not a second fence across the deck.
  prims.push(
    ...railingPrims([-9.8, 4.32], [-9.8, 8.85], level, rail, hRail, { start: false }),
    ...railingPrims([-9.8, 10.35], [-9.8, 9.25], 8.84, rail, hRail),
    ...railingPrims([-8.0, lipZ], [xWest, lipZ], level, rail, hRail, { end: false }),
    ...railingPrims([xEast, lipZ], [-3.3, lipZ], level, rail, hRail, { start: false }),
    ...railingPrims([-3.33, 7.9], [-3.33, 9.2], level, rail, hRail),
    ...railingPrims([-9.8, 4.32], [-3.42, 4.32], level, rail, hRail),
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
  // (Only the west one: east of x 35.5 there is no upper storey — the building stands there on columns over the terrace, 321-F3 drawing the
  // east exit's landing open under its slab — so the east exit comes out onto the terrace without a door.)
  for (const o of [{ z0: 3.05, z1: 4.15, face: 0.91, out: -1 }]) {
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
    // The condensers' screen: aluminium louvres fill each opening (bare, they read as windows without glass — kg-east).
    for (let y = 0.55; y < 2.85; y += 0.12) out.push(slab(o0, o1, 3.96, 4.04, y, y + 0.05, "site:retaining-yard-louvre", "louvre"));
    from = o1;
  }
  out.push(slab(from, 64.9, 3.9, 4.1, 0, wallTop, "site:retaining-yard", "stone"));
  out.push(slab(64.6, 64.9, 4.1, 7.9, 0, wallTop, "site:retaining-yard", "stone"));
  // Its south side holds the bank (+4.2…+5.2 just past it): the earth stood there as a bare face down to the yard's floor.
  out.push(slab(56.69, 64.9, 7.9, 8.1, 0, wallTop, "site:retaining-yard", "stone"));
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
  const lower = flight(63.3, 66.3, zc, w, 10, 2.72, 1.08, 0.78, true, false);
  const upper = flight(59.3, 62.4, zc, w, 11, 4.52, 2.72, 2.42, true, false);
  out.push(...lower.prims, ...upper.prims);
  // The wall's handrail is one diagonal from the top landing to the foot, over the middle landing too (two pieces, one a flight, read as
  // two broken lines on the wall — kg-east, the user's mark, 2026-11-01); the two flights' slopes differ by 3%.
  out.push(...slopedTopRail([59.3, zc + w / 2 - 0.04], [66.3, zc + w / 2 - 0.04], 4.52, 1.08, "site:stair-kg-exit-rail", 0.9, 0.045));
  for (let k = 0; k < 7; k++) {
    const t = (k + 0.5) / 7;
    out.push({ type: "box", centre: { x: 59.3 + 7 * t, y: 4.52 + (1.08 - 4.52) * t + 0.86, z: zc + w / 2 + 0.02 }, size: { x: 0.03, y: 0.03, z: 0.12 }, material: "darkSteel", tag: "site:stair-kg-exit-rail" });
  }
  out.push(slab(62.4, 63.3, 2.7, 3.8, 2.47, 2.72, "site:kg-exit-landing", "metal"));
  out.push(slab(56.69, 59.3, 2.7, 3.8, 4.27, 4.52, "site:kg-exit-landing", "metal"));
  // The facade draws one post, under the upper landing's free end; the rest hangs between the building, the wall and the path.
  post(59.2, zn + 0.1, 4.27);
  // The open (north) side: bars up the flights, a railing along the landings.
  // Each flight's bars carry a top rail at the landings' railing height, so the guard runs on unbroken from the top landing to the foot.
  out.push(...balusters([59.3, zn + 0.04], [62.4, zn + 0.04], 4.52, 2.72 + (4.52 - 2.72) / 11, rail), ...slopeTopRail([59.3, zn + 0.04], [62.4, zn + 0.04], 4.52, 2.72, rail));
  out.push(...balusters([63.3, zn + 0.04], [66.3, zn + 0.04], 2.72, 1.08 + (2.72 - 1.08) / 10, rail), ...slopeTopRail([63.3, zn + 0.04], [66.3, zn + 0.04], 2.72, 1.08, rail));
  out.push(...railingPrims([56.69, zn + 0.04], [59.3, zn + 0.04], 4.52, rail, 0.95));
  out.push(...railingPrims([62.4, zn + 0.04], [63.3, zn + 0.04], 2.72, rail, 0.95));
  out.push(...railingPrims([66.3, zn + 0.04], [68.05, zn + 0.04], 1.08, rail, 0.95));
  out.push(...railingPrims([69.16, 2.7], [69.16, 3.8], 1.08, rail, 0.95));
  out.push(...railingPrims([68.2, 3.76], [69.2, 3.76], 1.08, rail, 0.95));
  // The forecourt's paving: round the steps' foot, and along the kindergarten's north face (its windows at the ground) to the middle wing.
  out.push(pave([[56.69, -6], [69.1, -6], [69.1, 0.9], [68.05, 0.9], [68.05, -4.01], [56.69, -4.01]], groundAt), pave([[30.72, -6], [56.69, -6], [56.69, -4.01], [30.72, -4.01]], groundAt));

  // West (F2 / תוכנית +4.54): one deck slab; parapet stone where the facade draws it (not fragmented paving).
  // One paving height with kindergarten:terrace (+4.52) — avoids z-fighting on kg-west-in / deck.
  // West of x≈−3.35 only — `kindergarten:terrace` (+4.52) covers the wing; avoids double paving (kg-west-in).
  out.push(slab(-9.3, -3.35, -0.2, 4.17, 3.94, 4.52, "kindergarten:west-deck", "paving"));
  // The terrace itself (x −3.35…0.9, z −0.2…4.17): north of the west wing, so neither the wing's roof nor the deck reached it, and the wing's
  // door opened on a walled pit. Its paving at the deck's height runs on into the deck, which is the way to it.
  out.push(slab(-3.35, 0.9, -0.2, 4.17, 3.94, 4.52, "kindergarten:west-terrace", "paving"));
  out.push(slab(-2.2, 5.2, -0.2, 0.1, 4.54, 6.17, "kindergarten:west-terrace-parapet", "stone"));
  out.push(slab(-2.2, -1.9, 0.1, 3.0, 4.54, 6.17, "kindergarten:west-terrace-parapet", "stone"));
  out.push(slab(-11.74, -3.3, 4.17, 4.47, 0.4, 4.54 + 1.1, "site:retaining-kg", "stone"));
  // The deck's open edges carry its railing: the north lip (z −0.15, on to the terrace's parapet at x −2.2) and the west edge down to the six
  // treads (z 2.92). At z 2.92 across the deck it stood against the wall with the paving running out past it.
  out.push(...railingPrims([-9.25, -0.15], [-2.2, -0.15], 4.52, rail, 0.95));
  out.push(...railingPrims([-9.25, -0.15], [-9.25, 2.92], 4.52, rail, 0.95, { start: false }));
  out.push(slab(-9.6, -9.4, 3.0, 4.17, 0.5, 3.97, "site:retaining-kg", "stone"));
  out.push(slab(-9.65, -9.35, -4.5, 3.05, 0.45, 3.85, "site:retaining-kg", "stone"));
  const west = flight(-10.8, -9.3, 3.65, 1.2, 6, 5.6, 4.54, 4.24);
  out.push(...treadsOnly(west.prims, "site:stair-kg-exit"));
  const sixTop = 4.54 + (5.6 - 4.54) / 6;
  out.push(...balusters([-10.8, 2.92], [-9.3, 2.92], 5.6, sixTop, rail), ...slopeTopRail([-10.8, 2.92], [-9.3, 2.92], 5.6, sixTop, rail));
  out.push(slab(-13.9, -10.8, 2.9, 4.17, 5.45, 5.6, "site:kg-exit-path", "paving"));
  // Head-path stone guard: two smooth L pieces (not 20 cm tiles).
  out.push(slab(-14.05, -11.74, 4.17, 4.38, 5.25, 6.15, "site:retaining-kg", "stone"));
  out.push(slab(-14.05, -13.95, 2.88, 4.38, 5.25, 6.15, "site:retaining-kg", "stone"));
  // +5.6: stone L-guard carries the handrail — no horizontal chip across the six-tread / north-stair throats (kg-west-stairdn).
  const westDown: TreadSet = { n: 10, width: 1.2, pitch: 0.3, dir: [0, -1], first: [-13.3, 2.75], last: [-13.3, 0.05], layer: "A4-40" };
  out.push(...treadsOnly(stairPrims(westDown, 5.6, 3.9, "site:stair-kg-exit", "stone", Math.min(groundAt(-13.3, 0), groundAt(-13.3, 2)) - 0.3), "site:stair-kg-exit"));
  out.push(...balusters([-12.64, 2.75], [-12.64, 0.05], 5.6, 3.9, rail), ...slopeTopRail([-12.64, 2.75], [-12.64, 0.05], 5.6, 3.9, rail));
  out.push(pave([[-13.9, -8], [-12.7, -8], [-12.7, -0.1], [-13.9, -0.1]], groundAt));
  return out;
}
