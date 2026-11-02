import { floorPrimitives, inset, insidePolygon, slab, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
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
/**
 * `terrace`: the roof terrace at the plan's own marks, "+4.52" (three of them, and its railings' +5.62 / +6.22 are 1.10 / 1.70 over it).
 * The survey's "+927.58" / "+927.62" (+4.38 / +4.42) are the existing paving under the new one.
 */
export const KINDERGARTEN = { ground: 0, floor: 4.54, terrace: 4.52, roof: 7.99 } as const;
/** Its extents in the plan frame, metres (the plan's, confirmed by the section blocks). */
const BOX = { x0: -3.3, x1: 56.7, z0: -7.2, z1: 8.0 };
/** The upper floor stands on the south part: the new building's north wall line (1.02) is its north face. */
const UPPER_Z0 = 1.02;
/**
 * Its ground floor's outer face, measured off the plan's outer-face layer (A2-10): not its box. The north face steps — z −7.22 from x 5.57 to
 * 18.58, back to −4.01 to x 24.34, −7.22 again to 30.72, and −4.01 from there to the east end (the pergola the floor sheets draw at x 33–36.5
 * stands in front of it); the west end is narrower, the face down x 5.2 to the upper floor's line and the west wing's north face at z 4.17.
 * (The box stood 113 m² of building where the plan has the yard.)
 */
const GROUND: Outline = [[-3.3, 7.96], [-3.3, 4.17], [1.06, 4.17], [1.06, UPPER_Z0], [5.2, UPPER_Z0], [5.2, -2.43], [5.57, -2.43], [5.57, -7.22], [18.58, -7.22], [18.58, -4.01], [24.34, -4.01], [24.34, -7.22], [30.72, -7.22], [30.72, -4.01], [56.69, -4.01], [56.69, 7.96]];
/**
 * Its ground floor's walls: GROUND with the porch the plan draws in its north face east of the pergola: side walls at x 36.97 and 47.89 from
 * the face back to a glazed wall at z -1.35, a door in each side wall. The floor and the terrace over it run on across the porch as GROUND has
 * them; only the walls step back.
 */
const GROUND_FACES: Outline = [...GROUND.slice(0, 14), [36.97, -4.01], [36.97, -1.35], [47.89, -1.35], [47.89, -4.01], ...GROUND.slice(14)];
/**
 * Where the upper floor ends: east of x 35.5 there is none. The kindergarten's north facade (321-F2) draws the new building's slab (+7.79 … +7.99)
 * there on five piers from x 35.5 to 53.7 over the terrace's parapet, and its east facade (321-F3) the same slab on posts with the exit's landing
 * open under it; section B-B (x ≈ 49) has two rows of columns standing on the kindergarten's roof and a wall at the back against the rock. So
 * the terrace runs on under the building, roofed by it (the user's mark on aerial-ne, 2026-11-01: "it stands on columns").
 */
const OPEN_X = 35.5;
/** The upper floor: the ground floor's part south of UPPER_Z0, west of OPEN_X. The rest of the ground floor's roof is the north terrace. */
const UPPER: Outline = [[-3.3, 7.96], [-3.3, 4.17], [1.06, 4.17], [1.06, UPPER_Z0], [OPEN_X, UPPER_Z0], [OPEN_X, 7.96]];
const TERRACE: Outline = [...GROUND.slice(4, 15), [56.69, 7.96], [OPEN_X, 7.96], [OPEN_X, UPPER_Z0]];
/** The columns under the building east of OPEN_X: the piers' x off 321-F2 (50 cm wide), their two rows' z off 321-F3 and section B-B (which differ by up to a metre). */
const OPEN_COLUMNS = { x: [38.59, 42.42, 46.25, 50.08, 53.09], z: [1.77, 4.07], size: 0.5 };
/** The new building's footprint, standing on its roof: no railing along an edge under it. */
// (Its east face is at x 53.70 on the floor sheets: the floor's slab runs on to 53.93 under it.)
const NEW_BUILDING: Outline = [[0.87, 1.01], [53.7, 1.01], [53.7, 16.6], [0.87, 16.6]];

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

/** A window or a door in an outer wall, along its face: from s0 to s1 (plan metres along the wall's axis). */
type Opening = { s0: number; s1: number; door: boolean };

/**
 * The openings the plan draws in one outer face (the line `at` across, from a to b along): its windows, the frame lines on A4-10 lying in the
 * wall (within 45 cm of the face, parallel, 30 cm or longer), joined where they touch; and its doors, a swing (A4-10 or A2-10, a leaf 70 cm or
 * wider) hinged in the wall: the span between its hinge and where its leaf closes on the face, both leaves of a double door. A window's lines
 * under a door are the door's frame.
 */
export function faceOpenings(drawing: DxfDrawing, a: number, b: number, at: number, along: "x" | "z"): Opening[] {
  const axis = (q: [number, number]) => (along === "x" ? q[0] : q[1]);
  const off = (q: [number, number]) => Math.abs((along === "x" ? q[1] : q[0]) - at);
  const windows: Array<[number, number]> = [];
  const doors: Array<[number, number]> = [];
  for (const p of pieces(drawing)) {
    const q0 = p.pts?.[0] ?? p.arc?.c;
    if (!q0 || q0.x < SHEET.left || q0.x > SHEET.left + SHEET.width || q0.y < SHEET.frameY || q0.y > SHEET.frameY + SHEET.height) continue;
    if (p.arc && /^(A4-10|A2-10)$/.test(p.layer)) {
      const c = toFrame(p.arc.c);
      // Its two ends as well as the points along it: on the REVIT blocks the sampled points leave out the end where the leaf shuts.
      const ends = [p.arc.start, p.arc.end].map((t) => toFrame({ x: p.arc!.c.x + p.arc!.r * Math.cos(t), y: p.arc!.c.y + p.arc!.r * Math.sin(t) }));
      const pts = [...arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end).map(toFrame), ...ends];
      const r = Math.max(...pts.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
      // (A double door drawn as one swing has its centre between the leaves, set into the wall up to half its thickness and more.)
      if (r < 0.7 || off(c) > 0.5) continue;
      const shut = pts.filter((q) => off(q) < 0.35).map(axis);
      if (!shut.length) continue;
      const s0 = Math.max(a, Math.min(axis(c), ...shut)), s1 = Math.min(b, Math.max(axis(c), ...shut));
      if (s1 - s0 > 0.6) doors.push([s0, s1]);
      continue;
    }
    if (p.layer !== "A4-10" || !p.pts || p.pts.length < 2) continue;
    const pts = p.pts.map(toFrame);
    for (let k = 1; k < pts.length; k++) {
      const [u, v] = [pts[k - 1]!, pts[k]!];
      if (Math.max(off(u), off(v)) > 0.45) continue;
      const s0 = Math.max(a, Math.min(axis(u), axis(v))), s1 = Math.min(b, Math.max(axis(u), axis(v)));
      if (s1 - s0 > 0.3) windows.push([s0, s1]);
    }
  }
  const merge = (iv: Array<[number, number]>, gap: number) => {
    const m: Array<[number, number]> = [];
    for (const r of [...iv].sort((x, y) => x[0] - y[0])) { const l = m[m.length - 1]; if (l && r[0] <= l[1] + gap) l[1] = Math.max(l[1], r[1]); else m.push([r[0], r[1]]); }
    return m;
  };
  const doorSpans = merge(doors, 0.05);
  // A window run cut where a door stands in it; what is left under 40 cm is the door's frame.
  const windowSpans = merge(windows, 0.12).flatMap(([w0, w1]) => {
    let parts: Array<[number, number]> = [[w0, w1]];
    for (const [d0, d1] of doorSpans) parts = parts.flatMap(([x0, x1]): Array<[number, number]> => (d1 <= x0 || d0 >= x1 ? [[x0, x1]] : [[x0, d0 - 0.1], [d1 + 0.1, x1]])).filter(([y0, y1]) => y1 - y0 >= 0.4);
    return parts;
  });
  return [...doorSpans.map(([s0, s1]) => ({ s0, s1, door: true })), ...windowSpans.map(([s0, s1]) => ({ s0, s1, door: false }))].sort((x, y) => x.s0 - y.s0);
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

/**
 * Where the ground is dug for it, in the plan frame: its ground floor's outline and the court between its two north wings (x 18.58–24.34, walled
 * on three sides, a step drawn down into it on A4-40), which the slope would otherwise fill to its windows' heads.
 */
/**
 * A paved pad at the floor's level outside each of the ground floor's outer doors, 1.6 m out and 30 cm past each jamb: the facades draw the
 * ground at +0.70 along the north face, which stood over the doors' feet.
 */
export function kindergartenDoorPads(drawing: DxfDrawing): Outline[] {
  const pads: Outline[] = [];
  GROUND_FACES.forEach((p, i) => {
    const q = GROUND_FACES[(i + 1) % GROUND_FACES.length]!;
    const along = Math.abs(q[1] - p[1]) < 0.01 ? "x" : "z";
    const [a, b, at] = along === "x" ? [Math.min(p[0], q[0]), Math.max(p[0], q[0]), p[1]] : [Math.min(p[1], q[1]), Math.max(p[1], q[1]), p[0]];
    const mid = (a + b) / 2;
    // Outward: the side of the face away from the building.
    const out = along === "x" ? (insidePolygon(GROUND_FACES, mid, at + 0.3) ? -1 : 1) : insidePolygon(GROUND_FACES, at + 0.3, mid) ? -1 : 1;
    for (const o of faceOpenings(drawing, a, b, at, along)) {
      if (!o.door) continue;
      const [s0, s1, f0, f1] = [o.s0 - 0.3, o.s1 + 0.3, at, at + out * 1.6];
      pads.push(along === "x" ? [[s0, f0], [s1, f0], [s1, f1], [s0, f1]] : [[f0, s0], [f1, s0], [f1, s1], [f0, s1]]);
    }
  });
  return pads;
}

export const kindergartenOutline = (): Outline => GROUND.filter(([x, z]) => !(x > 18 && x < 25 && z > -4.5));

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
  const moved = (ring: Outline): Outline => ring.map(([x, z]) => [x + SHIFT, z + SHIFT] as [number, number]);
  const floors = [
    { level: KINDERGARTEN.ground, height: KINDERGARTEN.floor - KINDERGARTEN.ground, ring: GROUND },
    { level: KINDERGARTEN.floor, height: KINDERGARTEN.roof - KINDERGARTEN.floor, ring: UPPER },
  ];
  for (const { level, height, ring } of floors) {
    const outline = moved(ring);
    const ground = level === KINDERGARTEN.ground;
    const xs = outline.map((q) => q[0]);
    const zs = outline.map((q) => q[1]);
    const [x0, z0, x1, z1] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    const spec: FloorSpec = { id: "kindergarten", level, height, outline, window: { sill: 1.0, head: 2.6, surround: 0.1 }, facade: "existing", interior: "plaster" };
    // The rooms: the plan's walls on this floor's part of the box; the shell: its four walls, a window band on each.
    // A wall that runs on past this floor's outline (the upper floor stands on the south part only) stops at it: the rest would stand out on the terrace as a stone stub.
    // Nor a wall of the plan lying in an outer wall's own thickness (the porch's piers at z −1.35): its plaster stood in the shell's glazing.
    const shellFaces = ground ? moved(GROUND_FACES) : outline;
    const inShell = (b: { x: number; y: number; w: number; h: number }) => shellFaces.some((p, i) => {
      const q = shellFaces[(i + 1) % shellFaces.length]!;
      const [cx, cz] = [b.x + b.w / 2, b.y + b.h / 2];
      return Math.abs(q[1] - p[1]) < 0.01
        ? b.w >= b.h && Math.abs(cz - p[1]) < 0.3 && cx > Math.min(p[0], q[0]) && cx < Math.max(p[0], q[0])
        : b.h >= b.w && Math.abs(cx - p[0]) < 0.3 && cz > Math.min(p[1], q[1]) && cz < Math.max(p[1], q[1]);
    });
    const clipped = walls.bands
      .filter((b) => !inShell(b))
      .filter((b) => b.y + b.h > z0 + 0.3 && b.y < z1 - 0.3 && b.x > x0 + 0.3 && b.x + b.w < x1 - 0.3 && insidePolygon(outline, b.x + b.w / 2, (Math.max(b.y, z0) + Math.min(b.y + b.h, z1)) / 2))
      .map((b) => ({ ...b, y: Math.max(b.y, z0), h: Math.min(b.y + b.h, z1) - Math.max(b.y, z0) }))
      // Each end stops at the shell's own faces, not the box's: a wall of the plan running out past the porch's back wall stood in the porch
      // as a white plaster strip (kg-upper-nw, the user's mark, 2026-11-01).
      .map((b) => {
        // (Both its faces inside: its centre line lay on the porch's side wall's face, and a centre on an edge counts as in.)
        const alongZ = b.h >= b.w, [c0, c1] = alongZ ? [b.x + 0.02, b.x + b.w - 0.02] : [b.y + 0.02, b.y + b.h - 0.02];
        let [s0, s1] = alongZ ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
        const inside = (s: number) => [c0, c1].every((c) => insidePolygon(shellFaces, alongZ ? c : s, alongZ ? s : c));
        while (s1 - s0 > 0.1 && !inside(s0 + 0.01)) s0 += 0.02;
        while (s1 - s0 > 0.1 && !inside(s1 - 0.01)) s1 -= 0.02;
        return alongZ ? { ...b, y: s0, h: s1 - s0 } : { ...b, x: s0, w: s1 - s0 };
      })
      .filter((b) => b.h >= 0.1 && b.w >= 0.05);
    const rooms = { ...walls, bands: clipped };
    out.push(...floorPrimitives(rooms, [], spec));
    const t = 0.3;
    const wall = (cx: number, cz: number, sx: number, sz: number, y0: number, y1: number) =>
      out.push({ type: "box", centre: { x: cx, y: (y0 + y1) / 2, z: cz }, size: { x: sx, y: y1 - y0, z: sz }, material: "existing", tag: "kindergarten" });
    // The shell along each of the outline's (square) edges: the ground floor's faces step back at the porch.
    const faces = ground ? moved(GROUND_FACES) : outline;
    const sides = faces.map((p, i) => {
      const q = faces[(i + 1) % faces.length]!;
      return Math.abs(q[1] - p[1]) < 0.01 ? ([Math.min(p[0], q[0]), Math.max(p[0], q[0]), p[1], "x"] as const) : ([Math.min(p[1], q[1]), Math.max(p[1], q[1]), p[0], "z"] as const);
    });
    const box = (along: "x" | "z", z: number, s0: number, s1: number, y0: number, y1: number, thick: number, material: "existing" | "glass" | "frame", tag: string) =>
      out.push({ type: "box", centre: { x: along === "x" ? (s0 + s1) / 2 : z, y: (y0 + y1) / 2, z: along === "x" ? z : (s0 + s1) / 2 }, size: { x: along === "x" ? s1 - s0 : thick, y: y1 - y0, z: along === "x" ? thick : s1 - s0 }, material, tag });
    for (const [a, b, z, along] of sides) {
      if (ground) {
        // The ground floor: the plan's own windows and doors in each face (a window from 1.0 to 2.6; a door from the floor to 2.2 under a
        // transom, glazed, its leaves meeting on a mullion), solid stone between them.
        const open = faceOpenings(drawing, a - SHIFT, b - SHIFT, z - SHIFT, along).map((o) => ({ ...o, s0: o.s0 + SHIFT, s1: o.s1 + SHIFT }));
        let from = a;
        for (const o of [...open, { s0: b, s1: b, door: false }]) {
          const s0 = Math.max(o.s0, from);
          if (s0 - from > 0.01) box(along, z, from, s0, level, level + height, t, "existing", "kindergarten");
          if (o.s1 - s0 > 0.01) {
            const tag = o.door ? "kindergarten:door" : "kindergarten:window";
            const [g0, g1] = o.door ? [0.02, 2.22] : [1.0, 2.6];
            box(along, z, s0, o.s1, level + g1 + 0.06, level + height, t, "existing", "kindergarten");
            if (!o.door) box(along, z, s0, o.s1, level, level + g0, t, "existing", "kindergarten");
            box(along, z, s0, o.s1, level + g0, level + g1, 0.03, "glass", tag);
            box(along, z, s0, o.s1, level + g1, level + g1 + 0.06, 0.08, "frame", tag);
            // Mullions about every 1.2 m; a door's at its jambs and between its leaves.
            const n = Math.max(1, Math.round((o.s1 - s0) / (o.door ? 1.1 : 1.2)));
            for (let k = 0; k <= n; k++) {
              const m = s0 + ((o.s1 - s0) * k) / n;
              box(along, z, m - 0.03, m + 0.03, level + g0, level + g1, 0.08, "frame", tag);
            }
            // A door's leaves: a solid kick panel at the foot and a push bar across, so it reads as a door beside the glass.
            if (o.door) {
              box(along, z, s0, o.s1, level, level + 0.3, 0.06, "frame", tag);
              box(along, z, s0 + 0.1, o.s1 - 0.1, level + 1.0, level + 1.06, 0.1, "frame", tag);
            }
          }
          from = Math.max(from, o.s1);
        }
        continue;
      }
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
  out.push(slab(inset(moved(UPPER), 0.06), KINDERGARTEN.roof, 0.3, "slab", "kindergarten:roof"));
  out.push(slab(inset(moved(TERRACE), 0.06), KINDERGARTEN.terrace, 0.3, "paving", "kindergarten:terrace"));
  // Under the building east of OPEN_X: its columns from the terrace up to the slab, and the wall at the back (z 7.96) against the rock.
  const [colFoot, colHead] = [KINDERGARTEN.terrace, KINDERGARTEN.roof];
  for (const x of OPEN_COLUMNS.x) for (const z of OPEN_COLUMNS.z) out.push({ type: "box", centre: { x: x + SHIFT, y: (colFoot + colHead) / 2, z: z + SHIFT }, size: { x: OPEN_COLUMNS.size, y: colHead - colFoot, z: OPEN_COLUMNS.size }, material: "existing", tag: "kindergarten:column" });
  out.push({ type: "box", centre: { x: (OPEN_X + NEW_BUILDING[1]![0]) / 2 + SHIFT, y: (colFoot + colHead) / 2, z: 7.96 - 0.15 + SHIFT }, size: { x: NEW_BUILDING[1]![0] - OPEN_X, y: colHead - colFoot, z: 0.3 }, material: "existing", tag: "kindergarten" });
  // The railings the sheets' notes call for ("הגבהת מעקה קיים", "no foothold and no climbing"): the plan's marks +5.62 and +6.22 (over its +4.52) are the existing 1.10 m railing and the raised 1.70 m one.
  // As the kindergarten's north facade (321-F2) draws them along the whole terrace: a solid parapet in the wall's face to +5.62 and over it,
  // flush, the raised part to +6.22 as a closed panel (glazed here, its frame along the top), nothing to set a foot on or climb. (Upright bars
  // the full 1.7 m stood here before; the user asked for this edge as the drawing has it, 2026-11-01.)
  const railing = (ax: number, az: number, bx: number, bz: number, level: number, head: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const along = Math.abs(bx - ax) >= Math.abs(bz - az);
    const mid = { x: (ax + bx) / 2, z: (az + bz) / 2 };
    const [wall, top] = [head, head + 0.6];
    const run = (y0: number, y1: number, thick: number, material: "existing" | "glass" | "frame") =>
      out.push({ type: "box", centre: { x: mid.x, y: (y0 + y1) / 2, z: mid.z }, size: { x: along ? len : thick, y: y1 - y0, z: along ? thick : len }, material, tag: "kindergarten:railing" });
    run(level, wall, 0.2, "existing");
    run(wall, top - 0.05, 0.03, "glass");
    run(top - 0.05, top, 0.08, "frame");
  };
  // Every open edge of the north terrace (not its line against the upper floor), then of the upper roof (not its south edge, the building's own
  // wall, nor where the new building stands on it), 10 cm in from the face. The upper roof's north edge drops 3.5 m onto the terrace east of x 53.92.
  const edgeRails = (ring: Outline, level: number, skip: (x: number, z: number) => boolean, head = level + 1.04) => ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    const [mx, mz] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const n: [number, number] = Math.abs(q[1] - p[1]) < 0.01 ? [0, insidePolygon(ring, mx, mz + 0.2) ? 0.1 : -0.1] : [insidePolygon(ring, mx + 0.2, mz) ? 0.1 : -0.1, 0];
    let from: number | null = null;
    // Every 10 cm: in forty steps a long edge's railing stopped up to 1.4 m short of the building it meets.
    const steps = Math.max(40, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.1));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const blocked = skip(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
      if (!blocked && from === null) from = t;
      if ((blocked || k === steps) && from !== null) {
        const [ax, az] = [p[0] + (q[0] - p[0]) * from + n[0] + SHIFT, p[1] + (q[1] - p[1]) * from + n[1] + SHIFT];
        const [bx, bz] = [p[0] + (q[0] - p[0]) * t + n[0] + SHIFT, p[1] + (q[1] - p[1]) * t + n[1] + SHIFT];
        if (Math.hypot(bx - ax, bz - az) > 0.3) railing(ax, az, bx, bz, level, head);
        from = null;
      }
    }
  });
  // (Nor its west edge where the west terrace (pisga-kg-exits.ts, z −0.2…1.02) lies against it at its own level.)
  // (Nor under the building, where the terrace runs on beneath it east of OPEN_X.)
  // (Open where the east exit stair's landing meets the terrace's east edge, x 56.69, z 2.7–3.8: the railing ran across its head, the user's mark.)
  edgeRails(TERRACE, KINDERGARTEN.terrace, (x, z) => Math.abs(z - UPPER_Z0) < 0.01 || (x < 5.6 && z > -0.2) || (z > UPPER_Z0 + 0.01 && insidePolygon(NEW_BUILDING, x, z)) || (Math.abs(x - 56.69) < 0.05 && z > 2.6 && z < 3.9), 5.62);
  edgeRails(UPPER, KINDERGARTEN.roof, (x, z) => Math.abs(z - 7.96) < 0.01 || insidePolygon(NEW_BUILDING, x, z));
  return shifted(out, -SHIFT, -SHIFT);
}
