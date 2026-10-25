import { floorPrimitives, inset, slab, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { Primitive } from "@/lib/projects/building/model";
import type { PaintedPath, PdfPage } from "@/lib/projects/building/pdf-paths";
import { readPlanWalls, type PlanWalls } from "@/lib/projects/building/plan-walls";
import { arcPoints, flattenDxf, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * The existing kindergarten the centre is built on, placed by the working
 * drawing's own plan of it ("תכנית מפלס +4.54 גן ילדים קיים": a REVIT
 * export on its own layers, drawn 0.26% smaller than the floor sheets) and
 * the drawing's own section blocks of it (321-S1, 321-S3, 321-F1, 321-F3).
 *
 * The plan is laid onto the floors' frame by the plot's polygon, which both
 * draw (scale 0.9974, mean residual 11 cm). The sections confirm that
 * placement: section A-A's ground-floor walls run x −3.4 … 57.8 and the plan's
 * building x −3.3 … 56.7; the facades' blocks give its depth, 17–18 m, and
 * the plan's z −7.2 … 8.0.
 *
 * Its walls on the plan's wall layers are partial — the halls are glazed to
 * the plot's edge — so the building is closed by a shell on its extents and
 * the plan's walls stand inside it as its rooms.
 */
const SHEET = { left: 222419, frameY: 641275, width: 9257, height: 5492 };
const FIT = { s: 0.9974, tx: -148, ty: -2 };
/** The floors' frame: the building's north-west corner is at (0.88, 1.02) m, 1985 and 3395 units in from the sheet. */
const CORNER = { x: 1985, y: 3395, mx: 0.88, mz: 1.02 };

/** The kindergarten's levels (section A-A): ground floor, upper floor, roof — the centre stands on it. */
export const KINDERGARTEN = { ground: 0, floor: 4.54, roof: 7.99 } as const;
/** Its extents in the plan frame, metres (the plan's, confirmed by the section blocks). */
const BOX = { x0: -3.3, x1: 56.7, z0: -7.2, z1: 8.0 };
/** The upper floor stands on the south part: the new building's north wall line (1.02) is its north face. */
const UPPER_Z0 = 1.02;

/**
 * A page for the readers, a point a centimetre, point (500, 1030) the corner
 * of the region read: the kindergarten reaches 3 m west and 7 m north of the
 * frame's origin, so the page is shifted by SHIFT metres and the primitives
 * shifted back.
 */
const PAGE = { x: 500, y: 1030 };
const SHIFT = 12;

const cache = new WeakMap<DxfDrawing, DxfPiece[]>();
const pieces = (drawing: DxfDrawing): DxfPiece[] => {
  let all = cache.get(drawing);
  if (!all) {
    all = flattenDxf(drawing);
    cache.set(drawing, all);
  }
  return all;
};

/** The room walls: the plan's two wall layers, in red; the glazing and the stairs on the others are left out. */
const WALL_LAYER = /^(A2-10|A1-10)$/;

/** A sheet point in the plan frame, metres (x east, y south). */
const toFrame = (q: Pt): [number, number] => {
  const x = FIT.s * (q.x - SHEET.left) + FIT.tx;
  const y = FIT.s * (q.y - SHEET.frameY) + FIT.ty;
  return [(x - CORNER.x) / 100 + CORNER.mx, (CORNER.y - y) / 100 + CORNER.mz];
};

function wallsPage(drawing: DxfDrawing): PdfPage {
  const paths: PaintedPath[] = [];
  for (const p of pieces(drawing)) {
    const q = p.pts?.[0] ?? p.arc?.c;
    if (!q || q.x < SHEET.left || q.x > SHEET.left + SHEET.width || q.y < SHEET.frameY || q.y > SHEET.frameY + SHEET.height) continue;
    if (!WALL_LAYER.test(p.layer)) continue;
    const line = p.pts && p.pts.length >= 2 ? (p.closed ? [...p.pts, p.pts[0]!] : p.pts) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : null;
    if (!line) continue;
    const ring = line.map((c) => {
      const [x, z] = toFrame(c);
      return [(x + SHIFT) * 100 + PAGE.x, (z + SHIFT) * 100 + PAGE.y] as [number, number];
    });
    // Only what stands inside the building's box.
    if (ring.some(([x, y]) => x / 100 - 5 - SHIFT < BOX.x0 - 0.5 || x / 100 - 5 - SHIFT > BOX.x1 + 0.5 || y / 100 - 10.3 - SHIFT < BOX.z0 - 0.5 || y / 100 - 10.3 - SHIFT > BOX.z1 + 0.5)) continue;
    paths.push({ rings: [ring], filled: false, stroked: true, fill: null, stroke: 0xff0000, lineWidth: 1 });
  }
  return { width: 2400, height: 1700, paths };
}

/** The primitives moved by (dx, dz) metres. */
function shifted(prims: Primitive[], dx: number, dz: number): Primitive[] {
  return prims.map((p) => {
    switch (p.type) {
      case "box":
      case "cylinder":
        return { ...p, centre: { ...p.centre, x: p.centre.x + dx, z: p.centre.z + dz } };
      case "prism":
        return { ...p, ring: p.ring.map(([x, z]) => [x + dx, z + dz] as [number, number]), ...(p.holes ? { holes: p.holes.map((h) => h.map(([x, z]) => [x + dx, z + dz] as [number, number])) } : {}) };
      default:
        return p;
    }
  });
}

const rectRing = (x0: number, z0: number, x1: number, z1: number): Outline => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

/** Where the ground is dug for it: its box, in the plan frame. */
export const kindergartenOutline = (): Outline => rectRing(BOX.x0, BOX.z0, BOX.x1, BOX.z1);

/**
 * The kindergarten: a shell on its box with a band of windows round each
 * floor, the plan's walls inside as rooms, a slab under each floor and its
 * roof. Both floors take the plan's walls: the ground floor's own plan (the
 * "00.0" sheets, two unplaced parts) is not placed by anything.
 */
export function buildKindergarten(drawing: DxfDrawing): Primitive[] {
  const walls: PlanWalls = readPlanWalls(wallsPage(drawing), { x: PAGE.x, y: PAGE.y, width: 7600, height: 3000 }, { unitsPerMetre: 100, pens: { colours: [0xff0000] }, closePx: 8 });
  const out: Primitive[] = [];
  // The ground floor under the whole box; above it only the south part, from z 1.02: the north is a terrace at its roof (+4.52 on the sheets).
  const floors = [
    { level: KINDERGARTEN.ground, height: KINDERGARTEN.floor - KINDERGARTEN.ground, z0: BOX.z0 },
    { level: KINDERGARTEN.floor, height: KINDERGARTEN.roof - KINDERGARTEN.floor, z0: UPPER_Z0 },
  ];
  for (const { level, height, z0: nz } of floors) {
    const [x0, z0, x1, z1] = [BOX.x0 + SHIFT, nz + SHIFT, BOX.x1 + SHIFT, BOX.z1 + SHIFT];
    const outline = rectRing(x0, z0, x1, z1);
    const spec: FloorSpec = { id: "kindergarten", level, height, outline, window: { sill: 1.0, head: 2.6, surround: 0.1 }, facade: "existing", interior: "plaster" };
    // The rooms: the plan's walls on this floor's part of the box; the shell: its four walls, a window band on each.
    // A wall that runs on past this floor's outline (the upper floor stands on the south part only) stops at it: the rest would stand out on the terrace as a stone stub.
    const clipped = walls.bands
      .filter((b) => b.y + b.h > z0 + 0.3 && b.y < z1 - 0.3 && b.x > x0 + 0.3 && b.x + b.w < x1 - 0.3)
      .map((b) => ({ ...b, y: Math.max(b.y, z0), h: Math.min(b.y + b.h, z1) - Math.max(b.y, z0) }))
      .filter((b) => b.h >= 0.1);
    const rooms = { ...walls, bands: clipped };
    out.push(...floorPrimitives(rooms, [], spec));
    const t = 0.3;
    const wall = (cx: number, cz: number, sx: number, sz: number, y0: number, y1: number) =>
      out.push({ type: "box", centre: { x: cx, y: (y0 + y1) / 2, z: cz }, size: { x: sx, y: y1 - y0, z: sz }, material: "existing", tag: "kindergarten" });
    for (const [a, b, z, along] of [[x0, x1, z0, "x"], [x0, x1, z1, "x"], [z0, z1, x0, "z"], [z0, z1, x1, "z"]] as const) {
      // Solid below the sill and above the head; between them piers 1.6 m wide every 3.2 m, glazing in between.
      wall(along === "x" ? (a + b) / 2 : z, along === "x" ? z : (a + b) / 2, along === "x" ? b - a : t, along === "x" ? t : b - a, level, level + 1.0);
      wall(along === "x" ? (a + b) / 2 : z, along === "x" ? z : (a + b) / 2, along === "x" ? b - a : t, along === "x" ? t : b - a, level + 2.6, level + height);
      // The bays leave a bare gap at each end of the run, through which the plan's plaster walls showed from outside: close both with stone.
      let end = a + 0.4;
      while (end + 3.2 <= b) end += 3.2;
      for (const [g0, g1] of [[a, a + 0.4], [end, b]] as const) {
        if (g1 - g0 < 0.02) continue;
        const gc = (g0 + g1) / 2;
        wall(along === "x" ? gc : z, along === "x" ? z : gc, along === "x" ? g1 - g0 : t, along === "x" ? t : g1 - g0, level + 1.0, level + 2.6);
      }
      for (let s = a + 0.4; s + 3.2 <= b; s += 3.2) {
        const cs = s + 0.8;
        wall(along === "x" ? cs : z, along === "x" ? z : cs, along === "x" ? 1.6 : t, along === "x" ? t : 1.6, level + 1.0, level + 2.6);
        out.push({ type: "box", centre: { x: along === "x" ? cs + 1.6 : z, y: level + 1.8, z: along === "x" ? z : cs + 1.6 }, size: { x: along === "x" ? 1.4 : 0.03, y: 1.4, z: along === "x" ? 0.03 : 1.4 }, material: "glass", tag: "kindergarten:window" });
      }
    }
    out.push(slab(inset(outline, 0.06), level - 0.02, 0.3, "slab", "kindergarten:slab"));
  }
  // Its roofs: the south part's at +7.99, the north terrace's at the upper floor's level.
  out.push(slab(inset(rectRing(BOX.x0 + SHIFT, UPPER_Z0 + SHIFT, BOX.x1 + SHIFT, BOX.z1 + SHIFT), 0.06), KINDERGARTEN.roof, 0.3, "slab", "kindergarten:roof"));
  out.push(slab(inset(rectRing(BOX.x0 + SHIFT, BOX.z0 + SHIFT, BOX.x1 + SHIFT, UPPER_Z0 + SHIFT), 0.06), KINDERGARTEN.floor + 0.04, 0.3, "paving", "kindergarten:terrace"));
  // The railings the sheets' notes call for ("הגבהת מעקה קיים", "no foothold and no climbing"): the plan's marks +5.62 and +6.22 over the terrace's +4.52 are the existing 1.10 m railing and the raised 1.70 m one.
  // Upright bars only, so there is nothing to climb; a post every 1.6 m, a top rail, a kerb at the foot.
  const railing = (ax: number, az: number, bx: number, bz: number, level: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 0.14));
    const along = Math.abs(bx - ax) >= Math.abs(bz - az);
    const at = (t: number) => ({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
    const y1 = level + 1.7;
    const mid = at(0.5);
    out.push({ type: "box", centre: { x: mid.x, y: level + 0.1, z: mid.z }, size: { x: along ? len : 0.2, y: 0.2, z: along ? 0.2 : len }, material: "existing", tag: "kindergarten:railing" });
    out.push({ type: "box", centre: { x: mid.x, y: y1, z: mid.z }, size: { x: along ? len : 0.06, y: 0.05, z: along ? 0.06 : len }, material: "frame", tag: "kindergarten:railing" });
    for (let k = 0; k <= n; k++) {
      const p = at(k / n);
      const post = k % 11 === 0 || k === n;
      out.push({ type: "box", centre: { x: p.x, y: (level + 0.2 + y1) / 2, z: p.z }, size: { x: post ? 0.07 : 0.018, y: y1 - level - 0.2, z: post ? 0.07 : 0.018 }, material: "frame", tag: "kindergarten:railing" });
    }
  };
  const [rx0, rx1, rz0, rz1, rzu] = [BOX.x0 + SHIFT + 0.1, BOX.x1 + SHIFT - 0.1, BOX.z0 + SHIFT + 0.1, BOX.z1 + SHIFT - 0.1, UPPER_Z0 + SHIFT];
  // The north terrace's three open sides, then the upper roof's west and east edges (its north runs under the new building, its south is the building's own wall).
  const t0 = KINDERGARTEN.floor + 0.04;
  railing(rx0, rz0, rx1, rz0, t0);
  railing(rx0, rz0, rx0, rzu, t0);
  railing(rx1, rz0, rx1, rzu, t0);
  railing(rx0, rzu, rx0, rz1, KINDERGARTEN.roof);
  railing(rx1, rzu, rx1, rz1, KINDERGARTEN.roof);
  // The upper roof's north edge is a 3.5 m drop onto the terrace wherever the new building does not stand against it: the two ends west and east of the building (x 0.88 and 53.92).
  railing(rx0, rzu, 0.88 + SHIFT, rzu, KINDERGARTEN.roof);
  railing(53.92 + SHIFT, rzu, rx1, rzu, KINDERGARTEN.roof);
  return shifted(out, -SHIFT, -SHIFT);
}
