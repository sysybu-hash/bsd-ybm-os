import { insidePolygon } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { surveyGround, surveyGroundEverywhere, type PisgaSurvey } from "@/lib/projects/building/pisga-survey";

/**
 * The street below the kindergarten as the survey draws it: the kerbs (M2404), the kindergarten's sheet fence (M2601, "גדר פח"), the road
 * guard (M2438) and the stair railing (M2605). The road's levels are the surveyed ground: the surveyor's spots on the asphalt, which falls
 * from +2.5 at the west end of the arch to −0.9 east of the junction.
 *
 * The south kerb is an arch round the kindergarten (z −1.6 at x −23.6, −20.3 at x 21.8, −2.3 at x 75.9). East of the junction (x 44) the
 * north kerb is surveyed; west of it the survey stops at the road, and the road keeps the east part's width. The traffic islands are the
 * kerb rings the survey closes (or closes against its own north edge, z −31.82).
 */
type Pt = [number, number];
type Ring = Pt[];

export type SurveyStreet = {
  road: Ring;
  /** The road's arm north of the junction, past the survey (from the aerial). */
  arm: Ring;
  /** The arch's road face, west to east. */
  south: Pt[];
  /** The road's whole south edge, west to east: the arch and its run-outs from the aerial. */
  southRun: Pt[];
  islands: Ring[];
  walk: Ring | null;
  /** The road's level anywhere: the surveyed ground. */
  levelAt: (x: number, z: number) => number;
  /** Where the road or the sidewalk lies, its own level; else null. */
  surfaceAt: (x: number, z: number) => number | null;
  /** Where the plaza across the street stands clear of the road (the photographs place it there; the survey ends at the road). */
  plaza: { x: number; z: number };
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const len = (pts: Pt[]) => pts.slice(1).reduce((t, p, i) => t + dist(p, pts[i]!), 0);
const meanZ = (pts: Pt[]) => pts.reduce((t, p) => t + p[1], 0) / pts.length;
const unit = (a: Pt, b: Pt): Pt => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
// West of the junction the road is a dual carriageway 16.5 m across (the aerial's two lanes each way, the dashed line between).
const WEST_WIDTH = 16.5;
// Past the survey's ends, the road's edges as the aerial (27.12.22, fitted to the survey within ~3 m; pisga-neighbours.ts) draws them: west
// the dual road's south kerb toward the roundabout, east the low road's two kerbs down past the blocks, north the arm that turns up the hill.
const AERIAL_WEST_SOUTH: Pt[] = [[-250, 14], [-160, 13.7], [-100, 12.5], [-60, 9], [-40, 4.5]];
const AERIAL_EAST_SOUTH: Pt[] = [[112.5, 13.2], [147.5, 31.6], [200, 60.5], [240, 82]];
const AERIAL_EAST_NORTH: Pt[] = [[112.5, -2.5], [147.5, 13.2], [200, 41], [240, 63]];
// The kerbs are painted red and white west of this x (the junction and the kindergarten's frontage); east of it cars park along them.
const KERB_PAINT_EAST = 40;
// The zebra crossings the aerial shows at the junction: where on the road's edge each starts and the way it walks across.
const AERIAL_CROSSINGS: Array<{ from: Pt; dir: Pt; length: number }> = [
  // From the kindergarten's corner across the road past the splitter island's tip (aerial x 880–910, y 229–260).
  { from: [25.5, -19.5], dir: [0.69, -0.72], length: 14.5 },
  // From the triangle island across the north arm's mouth to the plaza (aerial x 920–935; photographs 1–2).
  { from: [39.6, -32.4], dir: [1, 0], length: 6 },
];
// Past z −125 (the aerial's edge) the arm runs on in its own direction down the valley, so no view sees it end.
const AERIAL_NORTH_ARM: { centre: Pt[]; width: number } = { centre: [[38.5, -31.8], [42, -60], [52, -90], [62, -125], [76, -175], [93, -240], [115, -320]], width: 18 };
/** The round plaza with the palms: on the aerial, the park east of the north arm just past the junction (photographs 1–10 look from it to the gate). */
export const PISGA_PLAZA_AT = { x: 58, z: -31 };

/** Chains the survey's polylines on a layer whose ends meet (within 5 cm) into longer ones. */
function chains(survey: PisgaSurvey, layer: string): Array<{ pts: Pt[]; closed: boolean }> {
  const lines = survey.lines.filter((l) => l.layer === layer && l.pts.length >= 2).map((l) => ({ pts: [...l.pts] as Pt[], closed: l.closed }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length && !merged; i++) {
      const a = lines[i]!;
      if (a.closed) continue;
      for (let j = 0; j < lines.length; j++) {
        const b = lines[j]!;
        if (i === j || b.closed) continue;
        const [a0, a1, b0, b1] = [a.pts[0]!, a.pts[a.pts.length - 1]!, b.pts[0]!, b.pts[b.pts.length - 1]!];
        let pts: Pt[] | null = null;
        if (dist(a1, b0) < 0.05) pts = [...a.pts, ...b.pts.slice(1)];
        else if (dist(a1, b1) < 0.05) pts = [...a.pts, ...[...b.pts].reverse().slice(1)];
        else if (dist(a0, b1) < 0.05) pts = [...b.pts, ...a.pts.slice(1)];
        else if (dist(a0, b0) < 0.05) pts = [...[...b.pts].reverse(), ...a.pts.slice(1)];
        if (!pts) continue;
        lines.splice(Math.max(i, j), 1);
        lines.splice(Math.min(i, j), 1);
        lines.push({ pts, closed: dist(pts[0]!, pts[pts.length - 1]!) < 0.05 });
        merged = true;
        break;
      }
    }
  }
  return lines;
}

/**
 * `far`: the site's own ground past the survey's hull. Without it the road's arms ran out over a flat plateau while the hills fell away under
 * them (the road floating over green in the aerial views, the user's mark, 2026-11-01).
 */
export function surveyStreet(survey: PisgaSurvey, far?: (x: number, z: number) => number): SurveyStreet | null {
  const flat = surveyGroundEverywhere(survey), tin = surveyGround(survey);
  const levelAt = (x: number, z: number) => tin(x, z) ?? (far ? far(x, z) : flat(x, z));
  const edgeZ = Math.min(...survey.lines.flatMap((l) => l.pts.map((p) => p[1])));
  const kerbs = chains(survey, "M2404").filter((c) => meanZ(c.pts) < 0);
  // The arch: the two long faces that run past both ends of the kindergarten; the road's is the northern one.
  const arch = kerbs.filter((c) => !c.closed && Math.min(...c.pts.map((p) => p[0])) < -20 && Math.max(...c.pts.map((p) => p[0])) > 70).map((c) => (c.pts[0]![0] < c.pts[c.pts.length - 1]![0] ? c.pts : [...c.pts].reverse()));
  if (!arch.length) return null;
  arch.sort((a, b) => meanZ(a) - meanZ(b));
  const south = arch[0]!;
  const walkFace = arch[arch.length - 1]!;
  // The north kerb: the longest other open face that reaches the arch's east end without running past its west end.
  const north = kerbs
    .filter((c) => !c.closed && len(c.pts) > 30 && Math.max(...c.pts.map((p) => p[0])) > 70 && Math.min(...c.pts.map((p) => p[0])) > -20)
    .map((c) => (c.pts[0]![0] < c.pts[c.pts.length - 1]![0] ? c.pts : [...c.pts].reverse()))
    .sort((a, b) => len(b) - len(a))[0];
  if (!north) return null;
  // Islands: closed kerb rings, and open ones whose two ends rest on the survey's north edge. The kerb's two faces are both drawn, so each
  // island comes twice, one ring inside the other; the outer one is the island. (The splitter island in the junction's middle is 21 m long,
  // its ring 44 m round.)
  // (The survey's north edge at the road is z −31.82; its lowest point, edgeZ, is a manhole far east of the junction.)
  const onEdge = (p: Pt) => p[1] < -31.6;
  const rings = kerbs
    .filter((c) => len(c.pts) < 60 && (c.closed || (onEdge(c.pts[0]!) && onEdge(c.pts[c.pts.length - 1]!))))
    .map((c) => ({ ring: c.closed ? c.pts.slice(0, -1) : c.pts, edge: !c.closed }))
    .filter((r) => r.ring.length >= 3);
  const islands: Ring[] = rings.map((r) => r.ring).filter((r, i, all) => !all.some((o, j) => j !== i && r.filter((p) => insidePolygon(o, p[0], p[1])).length >= r.length / 2));
  // The road ring: the arch west to east (with its run-outs), the north kerb back east to west, a point on its west end's line, then the
  // arch's own line WEST_WIDTH metres north of it back to the start.
  const tipX = north[0]![0];
  const offset = (p: Pt, i: number, pts: Pt[]): Pt => {
    const [a, b] = [pts[Math.max(0, i - 1)]!, pts[Math.min(pts.length - 1, i + 1)]!];
    const d = unit(a, b);
    return [p[0] + d[1] * WEST_WIDTH, p[1] - d[0] * WEST_WIDTH];
  };
  const southRun = [...AERIAL_WEST_SOUTH.filter((p) => p[0] < south[0]![0] - 3), ...south, ...AERIAL_EAST_SOUTH.filter((p) => p[0] > south[south.length - 1]![0] + 3)];
  const northRun = [...north, ...AERIAL_EAST_NORTH.filter((p) => p[0] > north[north.length - 1]![0] + 3)];
  const westEdge = southRun.map((p, i) => offset(p, i, southRun)).filter((p, i) => southRun[i]![0] < tipX - 0.5);
  const road: Ring = [...southRun, ...[...northRun].reverse(), [tipX - 0.5, Math.max(edgeZ, -31.82)], ...[...westEdge].reverse()];
  // The sidewalk: from the kerb's back face to the fence, the fence's pieces bridged across the gate.
  const fence = chains(survey, "M2601").map((c) => (c.pts[0]![0] < c.pts[c.pts.length - 1]![0] ? c.pts : [...c.pts].reverse())).sort((a, b) => a[0]![0] - b[0]![0]);
  const fencePts = fence.flat();
  const walk: Ring | null = fencePts.length >= 2
    ? [...walkFace.filter((p) => p[0] >= fencePts[0]![0] - 0.5 && p[0] <= fencePts[fencePts.length - 1]![0] + 0.5), ...[...fencePts].reverse()]
    : null;
  // The north arm, from the survey's north edge up the hill.
  const c = AERIAL_NORTH_ARM.centre;
  const side = (k: 1 | -1) => c.map((p, i) => {
    const d = unit(c[Math.max(0, i - 1)]!, c[Math.min(c.length - 1, i + 1)]!);
    return [p[0] - d[1] * k * (AERIAL_NORTH_ARM.width / 2), p[1] + d[0] * k * (AERIAL_NORTH_ARM.width / 2)] as Pt;
  });
  const arm: Ring = [...side(1), ...side(-1).reverse()];
  // Past the survey's TIN the hillside's ground climbed 30 cm a metre, lumpy, across the road west of the junction (the user's mark,
  // 2026-11-01): a road does not follow the hill across its width. There it carries on at the level of the nearest surveyed metre of the
  // road itself, so it meets the survey without a seam, and only from 18 m past it (up the north arm, the road's far west) eases back onto
  // the hill over the next 12.
  // Read on first use: `far` may be defined after the street (pisga.ts builds its past-survey ground later).
  let surveyed: Array<{ x: number; z: number; y: number }> | null = null;
  const surveyedRoad = () => {
    const out: Array<{ x: number; z: number; y: number }> = [];
    const xs = road.map((p) => p[0]), zs = road.map((p) => p[1]);
    for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
      for (let z = Math.floor(Math.min(...zs)); z <= Math.max(...zs); z++) {
        const y = insidePolygon(road, x, z) ? tin(x, z) : null;
        if (y != null) out.push({ x, z, y });
      }
    }
    return out;
  };
  const roadLevelAt = (x: number, z: number) => {
    const t = tin(x, z);
    if (t != null) return t;
    surveyed ??= surveyedRoad();
    if (!surveyed.length) return levelAt(x, z);
    // The nearest surveyed metres within 3 m of the nearest one, weighted by inverse square distance: one nearest metre alone stepped the
    // road in 15–30 cm terraces where the nearest changed.
    const ds = surveyed.map((s) => (s.x - x) ** 2 + (s.z - z) ** 2);
    const near = Math.sqrt(Math.min(...ds)), reach = (near + 3) ** 2;
    let sw = 0, sy = 0;
    surveyed.forEach((s, i) => { if (ds[i]! <= reach) { const wgt = 1 / (ds[i]! + 0.25); sw += wgt; sy += s.y * wgt; } });
    const w = Math.max(0, Math.min(1, (near - 18) / 12));
    return (sy / sw) * (1 - w) + levelAt(x, z) * w;
  };
  const surfaceAt = (x: number, z: number) => {
    if ((insidePolygon(road, x, z) && !islands.some((r) => insidePolygon(r, x, z))) || insidePolygon(arm, x, z)) return roadLevelAt(x, z) + 0.02;
    if (islands.some((r) => insidePolygon(r, x, z)) || (walk && insidePolygon(walk, x, z))) return roadLevelAt(x, z) + 0.15;
    return null;
  };
  return { road, south, southRun, islands, walk, arm, levelAt: roadLevelAt, surfaceAt, plaza: PISGA_PLAZA_AT };
}

/** A grid of the road's levels over a ring's extent, a metre a sample, for a drape. */
function gridOver(rings: Ring[], levelAt: (x: number, z: number) => number) {
  const xs = rings.flatMap((r) => r.map((p) => p[0])), zs = rings.flatMap((r) => r.map((p) => p[1]));
  const x0 = Math.floor(Math.min(...xs)) - 1, z0 = Math.floor(Math.min(...zs)) - 1;
  const nx = Math.ceil(Math.max(...xs) - x0) + 2, nz = Math.ceil(Math.max(...zs) - z0) + 2;
  const heights: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights.push(levelAt(x0 + i, z0 + j));
  return { x0, z0, dx: 1, nx, nz, heights };
}

/** A railing or fence along a polyline: posts, rails and bars, its foot on `footAt`; `panel` hangs a sheet over its lower part. */
function fencePrims(pts: Pt[], footAt: (x: number, z: number) => number, height: number, material: BuildingMaterial, tag: string, panel?: { material: BuildingMaterial; height: number }): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const l = dist(a, b);
    if (l < 0.05) continue;
    const rotY = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const n = Math.max(1, Math.round(l / 0.13));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = footAt(x, z);
      const post = k === 0 || k % 18 === 0;
      const w = post ? 0.07 : 0.022;
      out.push({ type: "box", centre: { x, y: y + height / 2, z }, size: { x: w, y: height, z: w }, rotY, material, tag });
    }
    const [mx, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [ya, yb] = [footAt(a[0], a[1]), footAt(b[0], b[1])];
    const ym = (ya + yb) / 2;
    for (const h of [0.12, height - 0.05]) out.push({ type: "box", centre: { x: mx, y: ym + h, z: mz }, size: { x: l, y: 0.05, z: 0.04 }, rotY, material, tag });
    if (panel) out.push({ type: "custom-mesh", stations: [{ x: a[0], z: a[1], yFoot: ya + 0.05, yTop: ya + panel.height }, { x: b[0], z: b[1], yFoot: yb + 0.05, yTop: yb + panel.height }], thick: 0.02, material: panel.material, tag });
  }
  return out;
}

/** One line per railing: the survey draws a rail's two faces 20–40 cm apart; a chain within half a metre of one kept is its other face. */
function singleFaces(lines: Array<{ pts: Pt[] }>): Pt[][] {
  const kept: Pt[][] = [];
  const near = (p: Pt, line: Pt[]) => line.some((q, i) => {
    const r = line[i + 1];
    if (!r) return dist(p, q) < 0.5;
    const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) / l2));
    return Math.hypot(p[0] - q[0] - (r[0] - q[0]) * t, p[1] - q[1] - (r[1] - q[1]) * t) < 0.5;
  });
  for (const l of [...lines].sort((a, b) => len(b.pts) - len(a.pts))) if (!kept.some((k) => l.pts.every((p) => near(p, k)))) kept.push(l.pts);
  return kept;
}

/** The street's primitives: the asphalt and the sidewalk draped on the surveyed levels, the kerbs, the islands, the fence, the guard and the railing. */
export function surveyStreetPrims(survey: PisgaSurvey, street: SurveyStreet, groundAt: (x: number, z: number) => number, onStair: (x: number, z: number) => boolean = () => false): Primitive[] {
  const out: Primitive[] = [];
  const grid = gridOver([street.road], street.levelAt);
  out.push({ type: "drape", ring: street.road, holes: street.islands, grid, lift: 0.02, material: "asphalt", tag: "site:survey-road" });
  out.push({ type: "drape", ring: street.arm, grid: gridOver([street.arm], street.levelAt), lift: 0.02, material: "asphalt", tag: "site:aerial-road" });
  for (const r of street.islands) out.push({ type: "drape", ring: r, grid, lift: 0.15, material: "brickRed", tag: "site:survey-island" });
  if (street.walk) out.push({ type: "drape", ring: street.walk, grid: gridOver([street.walk], street.levelAt), lift: 0.15, material: "paving", tag: "site:survey-walk" });
  // Kerbs: every M2404 face, 15 cm over the road, 12 cm wide. West of the parking east of the junction they are painted red and white a
  // metre each, as the photographs show them round the junction and along the kindergarten's frontage (1, 2, 8, 9); by the parked cars
  // (11, 12) they are bare stone. An island's kerb is black and white (Street View, 2012).
  for (const c of chains(survey, "M2404")) {
    if (meanZ(c.pts) >= 0) continue;
    const island = street.islands.some((r) => c.pts.filter((p) => r.some((q) => dist(p, q) < 0.4)).length >= c.pts.length / 2);
    const at = (p: Pt) => { const y = street.levelAt(p[0], p[1]); return { x: p[0], z: p[1], yTop: y + 0.15, yFoot: y - 0.3 }; };
    let run: Array<ReturnType<typeof at>> = [];
    let paint: BuildingMaterial | null = null;
    const flush = () => { if (run.length >= 2) out.push({ type: "custom-mesh", stations: run, thick: 0.12, material: paint ?? "stone", tag: "site:survey-kerb" }); };
    let s = 0;
    for (let i = 1; i < c.pts.length; i++) {
      const [a, b] = [c.pts[i - 1]!, c.pts[i]!];
      const l = dist(a, b);
      const n = Math.max(1, Math.ceil(l / 0.25));
      for (let k = i === 1 ? 0 : 1; k <= n; k++, s += k > 0 ? l / n : 0) {
        const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const m: BuildingMaterial = island ? (Math.floor(s) % 2 ? "kerbBlack" : "parkingLine") : p[0] < KERB_PAINT_EAST ? (Math.floor(s) % 2 ? "kerbRed" : "parkingLine") : "stone";
        if (m !== paint && run.length) { run.push(at(p)); flush(); run = []; }
        paint = m;
        run.push(at(p));
      }
    }
    flush();
  }
  out.push(...crossings(street));
  // The disabled bay by the kerb west of the parked cars (photographs 11–12): blue, 2.5 m by 6.
  {
    const kerb = street.south;
    const k = kerb.reduce((best, p, j) => (Math.abs(p[0] - 44) < Math.abs(kerb[best]![0] - 44) ? j : best), 0);
    const [p, q] = [kerb[k]!, kerb[Math.min(kerb.length - 1, k + 1)]!];
    const d = unit(p, q);
    const n: Pt = [d[1], -d[0]];
    const c: Pt = [p[0] + n[0] * 1.3, p[1] + n[1] * 1.3];
    const st = [-3, 3].map((t) => { const x = c[0] + d[0] * t, z = c[1] + d[1] * t, y = street.levelAt(x, z); return { x, z, yTop: y + 0.044, yFoot: y - 0.05 }; });
    out.push({ type: "custom-mesh", stations: st, thick: 2.4, material: "lineBlue", tag: "site:survey-road-bay" });
  }
  // Behind the road's south edge where no sidewalk runs, the road was cut into the slope and the ground stood over the kerb as a bare bank of earth,
  // its edge stepped by the ground grid (photo-east-stair, east of the stair's foot, 1.2 m). A stone retaining wall holds it: from the kerb's
  // back 40 cm deep, its coping 15 cm over the ground behind, wherever that ground stands 30 cm or more over the kerb, off the stair's path.
  {
    const kerb = street.southRun;
    let run: Array<{ x: number; z: number; yTop: number; yFoot: number }> = [];
    const flush = () => { if (run.length >= 2) out.push({ type: "custom-mesh", stations: run, thick: 0.4, material: "stone", tag: "site:survey-street-wall" }); run = []; };
    for (let i = 1; i < kerb.length; i++) {
      const [a, b] = [kerb[i - 1]!, kerb[i]!];
      const len = dist(a, b);
      if (len < 1e-3) continue;
      let [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      if (nz < 0) [nx, nz] = [-nx, -nz];
      const n = Math.max(1, Math.ceil(len / 0.5));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
        const kerbTop = street.levelAt(x, z) + 0.15;
        const behind = Math.max(groundAt(x + nx * 0.6, z + nz * 0.6), groundAt(x + nx * 1, z + nz * 1));
        const [wx, wz] = [x + nx * 0.2, z + nz * 0.2];
        if (behind - kerbTop < 0.3 || onStair(wx, wz) || onStair(x + nx, z + nz) || (street.walk && insidePolygon(street.walk, x + nx * 0.6, z + nz * 0.6))) { flush(); continue; }
        run.push({ x: wx, z: wz, yTop: behind + 0.15, yFoot: kerbTop - 0.45 });
      }
    }
    flush();
  }
  out.push(...roadMarkings(street));
  // The kindergarten's fence: grey bars 1.8 m high, blue sheet over the lower 1.4 m (photographs 1–10, 13–17).
  // Its foot is the sidewalk's paving or the yard's ground behind it, whichever is lower, so it never hangs over either: the ground taken a
  // metre round, since the drawn ground is a metre grid and between its samples it sags under a point taken half a metre out (x 9–11 north of
  // the kindergarten, 20–30 cm).
  const walkTop = (x: number, z: number) => Math.min(street.levelAt(x, z) + 0.15, ...[[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => groundAt(x + dx!, z + dz!)));
  for (const pts of singleFaces(chains(survey, "M2601"))) out.push(...fencePrims(pts, walkTop, 1.8, "metal", "site:survey-fence", { material: "fenceBlue", height: 1.4 }));
  for (const pts of singleFaces(chains(survey, "M2438"))) out.push(...fencePrims(pts, (x, z) => street.levelAt(x, z), 0.75, "metal", "site:survey-guard"));
  // The east stair's railing: the photographs' dark green bars, a metre high on the ground. Where it runs along a flight it is that
  // flight's own rail, which the stair builds (pisga-survey-stairs), so only its runs off the stair stand here.
  for (const pts of singleFaces(chains(survey, "M2605"))) {
    const runs: Pt[][] = [[]];
    for (const p of pts) {
      if (onStair(p[0], p[1])) { if (runs[runs.length - 1]!.length) runs.push([]); } else runs[runs.length - 1]!.push(p);
    }
    for (const r of runs) if (r.length >= 2) out.push(...fencePrims(r, groundAt, 1.0, "railGreen", "site:survey-stair-railing"));
  }
  // Street lights behind the south kerb, about every 28 m (Street View, 2012; photographs 1–7): a grey pole 8 m high, its arm reaching
  // 1.5 m over the road, a lamp head at its end. None on a stair's path.
  {
    const run = street.southRun;
    let s = 0, next = 6;
    for (let i = 1; i < run.length; i++) {
      const [a, b] = [run[i - 1]!, run[i]!];
      const l = dist(a, b);
      if (l < 1e-3) continue;
      const d = unit(a, b);
      let n: Pt = [-d[1], d[0]];
      if (n[1] < 0) n = [-n[0], -n[1]];
      while (next <= s + l) {
        const t = next - s;
        next += 28;
        const [x, z] = [a[0] + d[0] * t + n[0] * 0.5, a[1] + d[1] * t + n[1] * 0.5];
        if (x < -60 || x > 130 || onStair(x, z) || onStair(x + n[0], z + n[1])) continue;
        const y = Math.max(street.levelAt(x, z) + 0.15, groundAt(x, z));
        out.push({ type: "cylinder", centre: { x, y: y + 4, z }, radius: 0.08, height: 8, material: "metal", tag: "site:survey-lamp" });
        const [hx, hz] = [x - n[0] * 1.5, z - n[1] * 1.5];
        out.push({ type: "box", centre: { x: (x + hx) / 2, y: y + 7.95, z: (z + hz) / 2 }, size: { x: 0.06, y: 0.06, z: 1.5 }, rotY: Math.atan2(-n[0], -n[1]), material: "metal", tag: "site:survey-lamp" });
        out.push({ type: "box", centre: { x: hx, y: y + 7.9, z: hz }, size: { x: 0.25, y: 0.1, z: 0.55 }, rotY: Math.atan2(-n[0], -n[1]), material: "metal", tag: "site:survey-lamp" });
      }
      s += l;
    }
  }
  // Cars parked along the kerb east of the junction, as in photographs 11–12.
  const kerb = street.south;
  for (const [i, x] of [50, 56.5, 63].entries()) {
    const k = kerb.reduce((best, p, j) => (Math.abs(p[0] - x) < Math.abs(kerb[best]![0] - x) ? j : best), 0);
    const [p, q] = [kerb[k]!, kerb[Math.min(kerb.length - 1, k + 1)]!];
    const d = unit(p, q);
    const [cx, cz] = [p[0] + d[1] * 1.2, p[1] - d[0] * 1.2];
    out.push({ type: "car", at: { x: cx, y: street.levelAt(cx, cz), z: cz }, rotY: -Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2, colour: [0xf2f2f2, 0x3c4248, 0xd8d8d8][i]!, tag: "car" });
  }
  return out;
}

/**
 * The road's white lines, as the aerial shows them: across from every metre of the south edge to the far edge, a road 13 m or wider is the
 * dual carriageway (west of the junction), a solid double line in its middle and a dashed line between the two lanes each way; a narrower
 * one (the low road east of it) has a dashed centre line. Dashes 3 m with 6 m gaps, lines 12 cm wide. None across the junction's mouth
 * (where the far edge lies past 20 m or in the north arm) nor over an island. Each line is a strip 4.5 cm over the asphalt, following its
 * slope.
 */
function roadMarkings(street: SurveyStreet): Primitive[] {
  const out: Primitive[] = [];
  // Within 3 m of a zebra crossing's walk line the lane lines stop.
  const nearCrossing = (x: number, z: number) => AERIAL_CROSSINGS.some(({ from, dir, length }) => {
    const l = Math.hypot(dir[0], dir[1]), u = ((x - from[0]) * dir[0] + (z - from[1]) * dir[1]) / l;
    return u > -1 && u < length + 1 && Math.abs((x - from[0]) * dir[1] - (z - from[1]) * dir[0]) / l < 3;
  });
  const edges: Array<[Pt, Pt]> = [street.road, ...street.islands].flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [Pt, Pt]));
  // Distance from p along unit d to the nearest road or island edge more than a metre out.
  const across = (p: Pt, d: Pt) => {
    let best = Infinity;
    for (const [a, b] of edges) {
      const e: Pt = [b[0] - a[0], b[1] - a[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-9) continue;
      const w: Pt = [a[0] - p[0], a[1] - p[1]];
      const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
      if (t > 1 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  };
  type Station = { x: number; z: number; yTop: number; yFoot: number };
  const lines = new Map<string, Station[][]>();
  const add = (key: string, on: boolean, x: number, z: number) => {
    const runs = lines.get(key) ?? [[]];
    lines.set(key, runs);
    const last = runs[runs.length - 1]!;
    if (!on) { if (last.length) runs.push([]); return; }
    const y = street.levelAt(x, z);
    last.push({ x, z, yTop: y + 0.045, yFoot: y - 0.05 });
  };
  const run = street.southRun;
  // Every half metre of the south edge: the point, the way into the road (lower z) and the width across.
  const stations: Array<{ p: Pt; n: Pt; w: number; s: number }> = [];
  let s = 0;
  for (let i = 1; i < run.length; i++) {
    const [a, b] = [run[i - 1]!, run[i]!];
    const l = dist(a, b);
    if (l < 1e-3) continue;
    const t: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    let n: Pt = [-t[1], t[0]];
    if (n[1] > 0) n = [-n[0], -n[1]];
    const steps = Math.max(1, Math.ceil(l / 0.5));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++, s += l / steps) {
      const p: Pt = [a[0] + (b[0] - a[0]) * (k / steps), a[1] + (b[1] - a[1]) * (k / steps)];
      stations.push({ p, n, w: across(p, n), s });
    }
  }
  // The far kerb has bays, mouths and survey jitter: lines placed at fractions of the raw width wave with it. They follow the median
  // width over 12 m of road instead, and stop where the raw width strays more than a metre and a half from it (a bay or a mouth).
  // The way across is the mean over the same 12 m, since across 16 m of road a few degrees of kerb jitter move a line by a metre.
  const smooth = stations.map((st) => {
    const near = stations.filter((o) => Math.abs(o.s - st.s) <= 6);
    const ws = near.filter((o) => Number.isFinite(o.w)).map((o) => o.w).sort((x, y) => x - y);
    const [nx, nz] = near.reduce(([x, z], o) => [x + o.n[0], z + o.n[1]], [0, 0]), nl = Math.hypot(nx, nz) || 1;
    return { w: ws.length ? ws[Math.floor(ws.length / 2)]! : Infinity, n: [nx / nl, nz / nl] as Pt };
  });
  stations.forEach(({ p, w: raw, s }, j) => {
    const { w, n } = smooth[j]!;
    const at = (f: number): Pt => [p[0] + n[0] * w * f, p[1] + n[1] * w * f];
    const open = w >= 5 && w <= 20 && Math.abs(raw - w) < 1.5 && !insidePolygon(street.arm, ...at(0.5)) && !nearCrossing(...at(0.5));
    const dash = s % 9 < 3;
    const dual = w >= 13;
    add("centre", open && !dual && dash, ...at(0.5));
    for (const [key, f] of [["mid-a", 0.5 - 0.12 / w], ["mid-b", 0.5 + 0.12 / w]] as const) add(key, open && dual, ...at(f));
    for (const [key, f] of [["lane-s", 0.25], ["lane-n", 0.75]] as const) add(key, open && dual && dash, ...at(f));
  });
  for (const runs of lines.values()) for (const st of runs) if (st.length >= 2) out.push({ type: "custom-mesh", stations: st, thick: 0.12, material: "parkingLine", tag: "site:survey-road-line" });
  return out;
}


/**
 * The zebra crossings: from each start, white bars 50 cm wide with 50 cm gaps, 3 m long across the walk, for the crossing's length; a bar
 * that would lie on an island or off the road is left out.
 */
function crossings(street: SurveyStreet): Primitive[] {
  const out: Primitive[] = [];
  const onRoad = (x: number, z: number) => (insidePolygon(street.road, x, z) || insidePolygon(street.arm, x, z)) && !street.islands.some((r) => insidePolygon(r, x, z));
  for (const { from, dir, length } of AERIAL_CROSSINGS) {
    const l = Math.hypot(dir[0], dir[1]);
    const d: Pt = [dir[0] / l, dir[1] / l], t: Pt = [-d[1], d[0]];
    for (let s = 0.5; s < length; s += 1) {
      const c: Pt = [from[0] + d[0] * s, from[1] + d[1] * s];
      const st = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((u) => { const x = c[0] + t[0] * u, z = c[1] + t[1] * u, y = street.levelAt(x, z); return { x, z, yTop: y + 0.08, yFoot: y - 0.05 }; });
      if (st.every((q) => onRoad(q.x, q.z))) out.push({ type: "custom-mesh", stations: st, thick: 0.5, material: "parkingLine", tag: "site:survey-road-zebra" });
    }
  }
  return out;
}
