/**
 * Factory — a render set from the saved model: exterior (aerials + eye level from four sides), interiors (the oven hall and one room
 * of each kind), and a dollhouse of each storey (roof and the storey above cut away). Free: the raster renderer, no paid call.
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/_factory/views.mts <model dir> <out dir> [widthPx=1600] [only=id,id]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import type { BuildingCamera } from "@/lib/projects/building/render-page";

delete process.env.ALLOW_PAID_AI;
const [dir, out, widthArg, onlyArg] = process.argv.slice(2) as [string, string, string?, string?];
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"));
const base = dwfBuildingViews({ floors: state.floors, model: { extent: model.extent, primitives: model.primitives } }, undefined, {}, { house: false, public: true });
const pick = (id: string) => base.find((v) => v.id === id)!;
type P2 = [number, number];
type V = { id: string; payload: Record<string, unknown> & { camera: BuildingCamera } };
const views: V[] = [];
for (const id of ["aerial-se", "hero", "aerial-nw"]) views.push({ id: `out-${id}`, payload: pick(id).payload as V["payload"] });
const aerial = pick("aerial-se").payload as V["payload"];

// the ground under a point, from the model's terrain grid
const terr = model.primitives.find((p: { type: string }) => p.type === "terrain") as { x0: number; z0: number; dx: number; nx: number; nz: number; heights: number[] };
const gAt = (x: number, z: number) => { const i = Math.max(0, Math.min(terr.nx - 1, Math.round((x - terr.x0) / terr.dx))), j = Math.max(0, Math.min(terr.nz - 1, Math.round((z - terr.z0) / terr.dx))); return terr.heights[j * terr.nx + i] ?? 0; };

// ---- exterior at eye level: from the four diagonals, 1.7 m over the ground, ~38 m from the building's middle ----
const e = model.extent as { x: number; z: number; width: number; depth: number };
const cx = e.x + e.width / 2, cz = e.z + e.depth / 2;
// a neighbour's building from the survey stands in the way of a diagonal: turn the camera round the middle, 5° at a time, till the
// sight line to the middle clears it (option 1's south-east view looked straight at the neighbour's stone wall)
const blockers = (model.primitives as Array<{ type: string; tag?: string; ring?: P2[] }>).filter((p) => p.type === "prism" && p.tag === "survey:building").map((p) => p.ring!);
const segX = (a: P2, b: P2, c: P2, d: P2) => { const o = (p: P2, q: P2, r: P2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
// the middle and 12 m either side of it across the view: a neighbour that hides half the building blocks the view as well
const blocked = (p: P2, q: P2) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]), n: P2 = [-(q[1] - p[1]) / d, (q[0] - p[0]) / d];
  return [0, 12, -12].some((k) => { const t: P2 = [q[0] + n[0] * k, q[1] + n[1] * k]; return blockers.some((r) => r.some((u, i) => segX(p, t, u, r[(i + 1) % r.length]!))); }); };
for (const [nm, dx, dz] of [["ne", 1, -1], ["se", 1, 1], ["sw", -1, 1], ["nw", -1, -1]] as const) {
  const R = 0.5 * Math.hypot(e.width, e.depth) + 6, a0 = Math.atan2(dz, dx);
  let px = cx + Math.cos(a0) * R, pz = cz + Math.sin(a0) * R;
  for (const t of [5, -5, 10, -10, 15, -15, 20, -20, 25, -25, 30, -30, 35, -35, 40, -40]) {
    if (!blocked([px, pz], [cx, cz])) break;
    const a = a0 + (t * Math.PI) / 180; px = cx + Math.cos(a) * R; pz = cz + Math.sin(a) * R;
  }
  const gy = gAt(px, pz);
  views.push({ id: `out-eye-${nm}`, payload: { ...aerial, camera: { position: { x: px, y: gy + 1.7, z: pz }, target: { x: cx, y: gy + 1.7, z: cz }, fovDeg: 60, shiftY: 0.18 } } });
}

// ---- interiors ----
const LEVEL: Record<string, number> = { ground: 0, first: 5.3 };
const HEIGHT: Record<string, number> = { ground: 5.0, first: 4.0 };
type Room = { name: string; areaM2: number; at: P2; ring: P2[]; doorEdge: number };
const inside = (storey: string, room: Room, idSuffix: string) => {
  const r = room.ring, c = room.at, y0 = LEVEL[storey]!, h = HEIGHT[storey]!;
  // stand just inside the room's door (the equipment keeps clear of that wall) and look across at the far wall; a room with no
  // door is seen from a corner to the far corner
  let from: P2, to: P2;
  if (room.doorEdge >= 0) {
    const a = r[room.doorEdge]!, b = r[(room.doorEdge + 1) % r.length]!, m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const L = Math.hypot(c[0] - m[0], c[1] - m[1]), ux = (c[0] - m[0]) / L, uz = (c[1] - m[1]) / L;
    // near a corner of the door wall (the kits keep that wall clear), looking into the room 18° off square to it, so the door
    // wall stays out of frame: a view down the door's line ran into the middle table's end, and a corner-to-corner one showed
    // the doorway as a black slab, the room beyond unlit (2026-11-10)
    const W = Math.hypot(a[0] - b[0], a[1] - b[1]), ex = (a[0] - b[0]) / W, ez = (a[1] - b[1]) / W;
    const sgn = -ez * ux + ex * uz >= 0 ? 1 : -1, nx = -ez * sgn, nz = ex * sgn; // inward normal (toward the centre)
    const fwd: P2 = [nx * Math.cos(0.31) + ex * Math.sin(0.31), nz * Math.cos(0.31) + ez * Math.sin(0.31)];
    from = [b[0] + nx * 1.1 + ex * 1.0, b[1] + nz * 1.1 + ez * 1.0];
    const deep = 2 * Math.abs((c[0] - m[0]) * nx + (c[1] - m[1]) * nz);
    to = [from[0] + fwd[0] * deep * 0.8, from[1] + fwd[1] * deep * 0.8];
    void L;
  } else {
    const a = r[0]!, b = r[2]!, toC = (p: P2, t: number): P2 => [p[0] + (c[0] - p[0]) * t, p[1] + (c[1] - p[1]) * t];
    from = toC(a, 0.7 / Math.hypot(c[0] - a[0], c[1] - a[1])); to = toC(b, 0.15);
  }
  const xs = r.map((p) => p[0]), zs = r.map((p) => p[1]);
  views.push({ id: `in-${storey}-${idSuffix}`, payload: { ...aerial, camera: { position: { x: from[0], y: y0 + 1.65, z: from[1] }, target: { x: to[0], y: y0 + 1.1, z: to[1] }, fovDeg: 78, interior: true, clearGlass: true, room: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), floorY: y0, ceilingY: y0 + h } } } });
};
const want: Array<[string, RegExp, string]> = [
  ["ground", /ייצור/, "production"], ["ground", /פריסה/, "slicing"], ["ground", /אריזה/, "packing"], ["ground", /מהתנור/, "oven-exit"],
  ["ground", /קצביה/, "butchery"], ["ground", /קפה/, "dining"], ["first", /מחסן/, "dry-store"], ["first", /הקפאה|קירור/, "cold-store"], ["first", /הנהלה/, "offices"],
];
for (const [st, re, id] of want) {
  const rooms = (report[`${st}Rooms`] as Room[]).filter((q) => re.test(q.name) && q.ring?.length === 4).sort((a, b) => b.areaM2 - a.areaM2);
  if (rooms[0]) inside(st, rooms[0], id); else console.log(`no ${id} room on ${st}`);
}
// the oven hall: along the oven row, from past its raw-side end, 2.6 m to the raw side of the line
if (report.ovenRow) {
  const { centre: [ox, oz], dir: [dx, dz] } = report.ovenRow as { centre: P2; dir: P2 };
  const nx = -dz, nz = dx, off = 2.6, back = 11;
  views.push({ id: "in-ground-oven-hall", payload: { ...aerial, camera: { position: { x: ox - dx * back + nx * off, y: 1.7, z: oz - dz * back + nz * off }, target: { x: ox + dx * 4, y: 1.4, z: oz + dz * 4 }, fovDeg: 74, interior: true, clearGlass: true, room: { x0: ox - 12, x1: ox + 12, z0: oz - 12, z1: oz + 12, floorY: 0, ceilingY: 5 } } } });
}

// the storey's stairs drawn whole over the cut (a "site:" tag is not clipped): cut at 2.9 m the second flight of the U stair stood
// as a solid block and the stair read as half a storey with no landing (the user, 2026-11-10)
const stairsWhole = (prims: unknown[], st: string) => (prims as Array<{ tag?: string }>).map((p) => new RegExp(`^${st}:stair`).test(p.tag ?? "") ? { ...p, tag: `site:whole:${p.tag}` } : p);
// ---- dollhouse: each storey from above at an angle, everything over its walls' cut height taken off ----
for (const [st, sid] of [["ground", "floor-0"], ["first", "floor-1"]] as const) {
  const y0 = LEVEL[st]!;
  for (const [nm, ax, az] of [["se", 1, 1], ["nw", -1, -1]] as const) {
    const R = 0.75 * Math.hypot(e.width, e.depth);
    views.push({ id: `doll-${st}-${nm}`, payload: { ...aerial, model: { ...model, primitives: stairsWhole(model.primitives, st) }, camera: { position: { x: cx + (ax * R) / Math.SQRT2, y: y0 + R * 0.95, z: cz + (az * R) / Math.SQRT2 }, target: { x: cx, y: y0, z: cz }, fovDeg: 42, cutAboveM: y0 + 2.9, hideTags: ["roof", sid === "floor-1" ? "ground:ceiling" : "zz"] } } });
  }
}

const TOP_TILT_DEG = 55; // the booklet reads the same number (booklet.mts)
// ---- the booklet's storey plans: each storey straight from above, as the dollhouse cuts it (2.9 m over its floor), in parallel
// projection, north (−z) up, framed on its rooms ± 4 m — the booklet lays its numbers and camera marks over it in the same frame
// (the user, 2026-11-10: "the maps like the dollhouse from above, not plain squares") ----
for (const [st, sid] of [["ground", "floor-0"], ["first", "floor-1"]] as const) {
  const y0 = LEVEL[st]!, rs = (report[`${st}Rooms`] as Array<{ ring: P2[] }>).flatMap((r) => r.ring);
  const x0 = Math.min(...rs.map((p) => p[0])) - 4, x1 = Math.max(...rs.map((p) => p[0])) + 4, z0 = Math.min(...rs.map((p) => p[1])) - 4, z1 = Math.max(...rs.map((p) => p[1])) + 4;
  // In 3D, as the dollhouse (the user, 2026-11-10: "the view in three dimensions, as we did in the flats"): a parallel camera from the
  // south, TILT° down from level — the floor keeps a plan's frame (x across, north up, its depth foreshortened by sin TILT, exact for
  // the booklet's numbers and camera marks) while the walls stand up and show their height.
  const TILT = (TOP_TILT_DEG * Math.PI) / 180, sA = Math.sin(TILT), cA = Math.cos(TILT), WH = 3; // WH: room over the north edge for the walls
  const W = 2400, halfW = (x1 - x0) / 2, halfH = ((z1 - z0) * sA + WH * cA) / 2, H = Math.round((W * halfH) / halfW);
  // the walls the cut passes through drawn solid charcoal, stopped just under the cut so each has a top
  const wallRe = new RegExp(`^(${st}):(shell|room|corridor-wall|parapet|terrace-parapet|coping)`);
  const cutY = y0 + 2.85;
  type Pr = { type: string; tag?: string; material?: string; centre?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number }; rotY?: number };
  // the openings: the lintels over the doors are taken off (cut to the cut height they closed every opening — "why no doors and passages")
  const all = model.primitives as Pr[];
  const lintels = all.filter((p) => p.type === "box" && new RegExp(`^${st}:(room|shell):lintel`).test(p.tag ?? ""));
  // walls keep their own finish (as the flats' dollhouse); a dark cap on each cut top draws the plan's wall line
  const prims: unknown[] = all.filter((p) => !lintels.includes(p)).flatMap((p) => {
    if (!wallRe.test(p.tag ?? "") || /door|window|glass/.test(p.tag ?? "")) return [p];
    if (p.type !== "box" || !p.centre || !p.size) return [p];
    const lo = p.centre.y - p.size.y / 2, hi = Math.min(p.centre.y + p.size.y / 2, cutY);
    if (hi <= lo + 0.01) return [p];
    return [{ ...p, centre: { ...p.centre, y: (lo + hi) / 2 }, size: { ...p.size, y: hi - lo } },
      { ...p, tag: `${st}:plan:wall-cap`, material: "rubber", centre: { ...p.centre, y: hi + 0.015 }, size: { ...p.size, x: p.size.x + 0.01, y: 0.03, z: p.size.z + 0.01 } }];
  });
  // … and each door's swing drawn on the floor, as a plan draws it: the leaf stands open; a quarter arc from its tip to where it shuts
  const floorY = y0 + 0.04;
  const seg = (p: P2, q: P2, tag: string) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 0.01) return; prims.push({ type: "box", centre: { x: (p[0] + q[0]) / 2, y: floorY, z: (p[1] + q[1]) / 2 }, size: { x: L + 0.02, y: 0.02, z: 0.05 }, rotY: -Math.atan2(q[1] - p[1], q[0] - p[0]), material: "darkSteel", tag }); };
  let arcs = 0;
  for (const d of all.filter((p) => p.type === "box" && new RegExp(`^${st}:room:door$`).test(p.tag ?? "") && p.centre && p.size)) {
    const c: P2 = [d.centre!.x, d.centre!.z], r = d.rotY ?? 0, u: P2 = [Math.cos(r), -Math.sin(r)], w = d.size!.x;
    const L = lintels.map((l) => ({ l, k: Math.hypot(l.centre!.x - c[0], l.centre!.z - c[1]) })).sort((p, q) => p.k - q.k)[0];
    if (!L || L.k > w * 1.5) continue;
    const lc: P2 = [L.l.centre!.x, L.l.centre!.z];
    const ends: P2[] = [[c[0] - u[0] * w / 2, c[1] - u[1] * w / 2], [c[0] + u[0] * w / 2, c[1] + u[1] * w / 2]];
    ends.sort((p, q) => Math.hypot(p[0] - lc[0], p[1] - lc[1]) - Math.hypot(q[0] - lc[0], q[1] - lc[1]));
    const hinge = ends[0]!, tip = ends[1]!;
    const toL: P2 = [lc[0] - hinge[0], lc[1] - hinge[1]], kL = Math.hypot(toL[0], toL[1]) || 1;
    const shut: P2 = [hinge[0] + (toL[0] / kL) * w, hinge[1] + (toL[1] / kL) * w];
    const a0 = Math.atan2(tip[1] - hinge[1], tip[0] - hinge[0]); let a1 = Math.atan2(shut[1] - hinge[1], shut[0] - hinge[0]);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
    const N = 10; let prev = tip;
    for (let k = 1; k <= N; k++) { const t = a0 + ((a1 - a0) * k) / N, q: P2 = [hinge[0] + Math.cos(t) * w, hinge[1] + Math.sin(t) * w]; seg(prev, q, `${st}:plan:door-swing`); prev = q; }
    arcs++;
  }
  console.log(`top-${st}: ${lintels.length} lintels off, ${arcs} door swings drawn`);
  const fc = { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2 };
  // the frame's middle, in the picture: the floor's middle raised by half the wall room (screen up = (0, cos, −sin))
  const tg = { x: fc.x, y: fc.y + (WH * cA / 2) * cA, z: fc.z - (WH * cA / 2) * sA };
  const D = 120;
  views.push({ id: `top-${st}`, payload: { ...aerial, width: W, height: H, model: { ...model, primitives: stairsWhole(prims, st) }, camera: { position: { x: tg.x, y: tg.y + D * sA, z: tg.z + D * cA }, target: tg, fovDeg: 30, orthoHalfWidth: halfW, cutAboveM: y0 + 2.9, hideTags: ["roof"] } } as V["payload"] });
}

const only = onlyArg ? onlyArg.split(",") : null;
const run = views.filter((v) => !only || only.includes(v.id));
mkdirSync(out, { recursive: true });
// every view's camera, for the booklet's maps of where each picture was taken; CAMS_ONLY=1 writes them and renders nothing
writeFileSync(path.join(dir, "views.json"), JSON.stringify(views.map((v) => ({ id: v.id, camera: v.payload.camera, ...(v.payload.width && /^top-/.test(v.id) ? { width: v.payload.width, height: v.payload.height } : {}) })), null, 1));
if (process.env.CAMS_ONLY === "1") { console.log(`${views.length} cameras → ${path.join(dir, "views.json")}`); process.exit(0); }
const t0 = Date.now();
const frames = await renderBuildingFrames(run.map((v) => ({ ...v.payload, ...(process.env.TRACE ? { pathTrace: { samples: Number(process.env.TRACE) } } : {}), model: (v.payload as { model?: unknown }).model ?? { ...model, primitives: model.primitives } }) as never), { outputWidthPx: widthArg ? Number(widthArg) : 1600 });
run.forEach((v, i) => writeFileSync(path.join(out, `${v.id}.jpg`), frames[i]!));
console.log(`${run.length} views → ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${run.map((v) => v.id).join(", ")}`);
