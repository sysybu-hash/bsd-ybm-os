#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — every railing and fence of the model, judged one by one: where a railing stands over no drop (not needed), where a paved edge falls away with
 * nothing on it (missing), and where two railings lie on the same line (doubled).
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-fences.mts "<drawing.dxf>" [out.md]
 *
 * A railing's top rail is the run of thin box pieces at about a metre over its walking level; the drop beside it is read off the ground (the model's own terrain grid)
 * and the decks, a metre either side. No railing is judged against a hand list: the model's own heights say whether the edge needs one.
 */
import fs from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");
const { dxfSurfaces } = await import("@/lib/projects/building/pisga-surfaces");

type Box = { type: "box"; centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; rotY?: number; material?: string; tag?: string };
const dxf = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
// SURVEY=<survey dxf>: the model as the renders build it, with the 2022 survey's ground, stairs and street.
const model = await buildPisga(null, { dxf, ...(process.env.SURVEY ? { survey: (await import("@/lib/projects/dxf-drawing")).readDxfDrawing((await import("node:fs")).readFileSync(process.env.SURVEY))! } : {}) });
const prims = model.primitives;

// The ground: the fine terrain grid, bilinear.
const g = prims.find((p) => p.type === "terrain" && p.tag === "site:ground") as Extract<(typeof prims)[number], { type: "terrain" }>;
const ground = (x: number, z: number) => {
  const fx = (x - g.x0) / g.dx;
  const fz = (z - g.z0) / g.dx;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const tz = Math.max(0, Math.min(1, fz - j));
  const h = (a: number, b: number) => g.heights[b * g.nx + a]!;
  return h(i, j) * (1 - tx) * (1 - tz) + h(i + 1, j) * tx * (1 - tz) + h(i, j + 1) * (1 - tx) * tz + h(i + 1, j + 1) * tx * tz;
};

const boxes = prims.filter((p): p is Box => p.type === "box");
const isRailTag = (t: string) => /rail|fence|gate|guard|parapet-rail/i.test(t);
// A guard's top rail, by its shape whatever its tag (the ramp's and the emergency stair's carry none of the words above): a metal or frame bar under
// 8 cm both across and high, 10 cm long or more (a stair's handrail is laid in short sections), not a window's or a door's frame, not furniture.
const isRailBar = (b: Box) =>
  (isRailTag(b.tag ?? "") || /frame|metal/.test(b.material)) &&
  !/window|door|curtain|sill|glazing|surround|furniture|facade|roof:lines/.test(b.tag ?? "") &&
  b.size.y <= 0.08 && Math.min(b.size.x, b.size.z) <= 0.08 && Math.max(b.size.x, b.size.z) >= 0.1;
const isGuardPart = (b: Box) => isRailTag(b.tag ?? "") || isRailBar(b) || (b.material === "glass" && Math.min(b.size.x, b.size.z) <= 0.03 && b.size.y <= 1.3);
// A box's footprint corners (rotY turns about y).
const corners = (b: Box): Array<[number, number]> => {
  const a = b.rotY ?? 0;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]) => [b.centre.x + (u * b.size.x * c + v * b.size.z * s) / 2, b.centre.z + (-u * b.size.x * s + v * b.size.z * c) / 2] as [number, number]);
};
const topOf = (b: Box) => b.centre.y + b.size.y / 2;
const inFoot = (b: Box, x: number, z: number, pad = 0) => {
  const a = -(b.rotY ?? 0);
  const dx = x - b.centre.x;
  const dz = z - b.centre.z;
  const u = dx * Math.cos(a) + dz * Math.sin(a);
  const v = -dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(u) <= b.size.x / 2 + pad && Math.abs(v) <= b.size.z / 2 + pad;
};
// What can be walked on or stood against: a box (deck, slab, wall) or a prism (a terrace, a platform, a mass), each with its top, its foot and a footprint test.
type Solid = { top: number; foot: number; wide: boolean; at: (x: number, z: number, pad: number) => boolean };
const inRing = (ring: Array<[number, number]>, x: number, z: number) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const solids: Solid[] = [];
for (const b of boxes) {
  // A grated tread or a deck plate is 5 cm thick and walked on: only thin boxes that are narrow too are skipped.
  if (isGuardPart(b) || (b.size.y < 0.1 && Math.min(b.size.x, b.size.z) < 0.2) || b.material === "glass") continue;
  // A wall's head (a parapet 30 cm, a retaining wall 50 cm, both tall) is not a floor to walk on; a paving skin's 25 cm tiles, low, are.
  const thin = Math.min(b.size.x, b.size.z);
  // A stair's tread is a block down to the ground, tall but walked on.
  solids.push({ top: topOf(b), foot: b.centre.y - b.size.y / 2, wide: thin >= 0.6 || (thin >= 0.2 && (b.size.y < 0.8 || /stair/.test(b.tag ?? ""))), at: (x, z, pad) => inFoot(b, x, z, pad) });
}
for (const p of prims) {
  if (p.type !== "prism" || isRailTag(p.tag ?? "")) continue;
  const xs = p.ring.map((q) => q[0]);
  const zs = p.ring.map((q) => q[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const holes = p.holes ?? [];
  solids.push({
    top: p.y1,
    foot: p.y0,
    wide: x1 - x0 >= 0.3 && z1 - z0 >= 0.3,
    at: (x, z, pad) => {
      if (x < x0 - pad || x > x1 + pad || z < z0 - pad || z > z1 + pad) return false;
      const hit = (px: number, pz: number) => inRing(p.ring, px, pz) && !holes.some((h) => inRing(h, px, pz));
      return hit(x, z) || (pad > 0 && ([[pad, 0], [-pad, 0], [0, pad], [0, -pad]] as const).some(([dx, dz]) => hit(x + dx, z + dz)));
    },
  });
}
// A sloped piece (a ramp's slab, a wall with a sloping head) is a run of stations: each span between two is a solid, its top the higher of theirs.
for (const p of prims) {
  if (p.type !== "custom-mesh" || isRailTag(p.tag ?? "") || p.material === "glass") continue;
  for (let i = 1; i < p.stations.length; i++) {
    const [a, b] = [p.stations[i - 1]!, p.stations[i]!], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const [ux, uz] = [(b.x - a.x) / len, (b.z - a.z) / len];
    solids.push({
      top: Math.max(a.yTop, b.yTop),
      foot: Math.min(a.yFoot, b.yFoot),
      wide: p.thick >= 0.6 || (p.thick >= 0.2 && Math.max(a.yTop - a.yFoot, b.yTop - b.yFoot) < 0.8),
      at: (x, z, pad) => {
        const [rx, rz] = [x - a.x, z - a.z], along = rx * ux + rz * uz, across = -rx * uz + rz * ux;
        return along >= -pad && along <= len + pad && Math.abs(across) <= p.thick / 2 + pad;
      },
    });
  }
}
// A rail stands on its deck's very edge: the deck is looked for 12 cm round the point, so the edge counts as on it.
const levelAt = (x: number, z: number, limit: number) => {
  let best = ground(x, z);
  for (const s of solids) if (s.wide && s.top <= limit + 0.05 && s.top > best && s.at(x, z, 0.12)) best = s.top;
  return best;
};
// A wall guards an edge when it stands 0.9 m over the walking level: a roof's 1.15 m parapet does.
const wallNear = (x: number, z: number, y: number) => solids.some((s) => s.top - s.foot >= 0.9 && s.foot <= y + 0.1 && s.top >= y + 0.9 && s.at(x, z, 0.35));

// The top rails: thin boxes in a railing's tag, about 4–6 cm high, long.
type Run = { tag: string; x1: number; z1: number; x2: number; z2: number; y: number; len: number };
const rails: Run[] = [];
for (const b of boxes) {
  const tag = b.tag ?? "";
  if (!isRailBar(b)) continue;
  const a = b.rotY ?? 0;
  const alongX = b.size.x >= b.size.z;
  const len = alongX ? b.size.x : b.size.z;
  const dir: [number, number] = alongX ? [Math.cos(a), -Math.sin(a)] : [Math.sin(a), Math.cos(a)];
  rails.push({ tag, x1: b.centre.x - (dir[0] * len) / 2, z1: b.centre.z - (dir[1] * len) / 2, x2: b.centre.x + (dir[0] * len) / 2, z2: b.centre.z + (dir[1] * len) / 2, y: b.centre.y, len });
}
// Chain pieces into runs by tag and contact (end to end within 12 cm).
const runs: Array<{ tag: string; pieces: Run[] }> = [];
for (const r of rails) {
  const hit = runs.find((q) => q.tag === r.tag && q.pieces.some((p) => [[p.x2, p.z2, r.x1, r.z1], [p.x1, p.z1, r.x2, r.z2], [p.x2, p.z2, r.x2, r.z2], [p.x1, p.z1, r.x1, r.z1]].some(([a, b, c, d]) => Math.hypot(a! - c!, b! - d!) < 0.12) && Math.abs(p.y - r.y) < 0.3));
  if (hit) hit.pieces.push(r);
  else runs.push({ tag: r.tag, pieces: [r] });
}

const lines: string[] = [];
const out = (s = "") => lines.push(s);
out(`# מעקות וגדרות במודל מרכז פסגה`);
out(`נמצאו ${rails.length} קטעי מעקה עליון ב-${runs.length} רצפים. כל רצף נבדק מול הנפילה ליד.\n`);

type Finding = { kind: "unneeded" | "doubled" | "floating"; where: string; detail: string };
const findings: Finding[] = [];
const seg = (r: Run) => `(${r.x1.toFixed(1)}, ${r.z1.toFixed(1)}) → (${r.x2.toFixed(1)}, ${r.z2.toFixed(1)})`;
for (const run of runs) {
  const len = run.pieces.reduce((t, p) => t + p.len, 0);
  // Sample the run every ~1.5 m: the walking level under the rail, the lower ground a metre to either side.
  let steps = 0;
  let low = 0;
  let dropMax = 0;
  let floating = 0;
  for (const p of run.pieces) {
    const n = Math.max(1, Math.round(p.len / 1.5));
    const dx = (p.x2 - p.x1) / p.len;
    const dz = (p.z2 - p.z1) / p.len;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = p.x1 + (p.x2 - p.x1) * t;
      const z = p.z1 + (p.z2 - p.z1) * t;
      // The walking level is the surface under the rail 0.9–1.9 m down: railings are 1.0–1.1 m, the kindergarten's raised one 1.7 m.
      const below = levelAt(x, z, p.y - 0.85);
      const walk = p.y - below <= 1.9 ? below : p.y - 1.0;
      const sides = [1, -1].map((s) => {
        // 60 cm out: a metre out can land on the far side of a gap, on the wall across it.
        const sx = x + -dz * s * 0.6;
        const sz = z + dx * s * 0.6;
        return { x: sx, z: sz, level: levelAt(sx, sz, walk + 0.3), wall: wallNear(sx, sz, walk) };
      });
      const under = levelAt(x, z, walk + 0.3);
      if (walk - under > 0.6) { floating++; if (process.env.FDBG && run.tag.includes(process.env.FDBG)) console.error("FLOAT", x.toFixed(2), z.toFixed(2), "rail", p.y.toFixed(2), "below", below.toFixed(2), "under", under.toFixed(2)); }
      const drops = sides.map((s) => (s.wall ? 0 : walk - s.level));
      const drop = Math.max(...drops);
      dropMax = Math.max(dropMax, drop);
      steps++;
      if (drop < 0.4) low++;
    }
  }
  const share = steps ? low / steps : 0;
  // A stair's handrail is wanted whatever the drop (the sheets' "מאחז יד"): it is not judged as a guard.
  const handrail = /stair/.test(run.tag);
  // A surveyed boundary fence or road guard (the kindergarten's sheet fence, M2601; the guard rail, M2438) stands for a line, not a drop.
  const boundary = /^site:survey-(fence|guard)/.test(run.tag);
  if (!handrail && !boundary && share >= 0.6 && len > 1.5) findings.push({ kind: "unneeded", where: `${run.tag} ${seg(run.pieces[0]!)}…`, detail: `אורך ${len.toFixed(1)} מ', בשני צדדיו הקרקע עד 0.4 מ' מתחת למפלס ההליכה (נפילה מרבית ${dropMax.toFixed(2)})` });
  if (steps && floating / steps >= 0.5 && len > 1.5) findings.push({ kind: "floating", where: `${run.tag} ${seg(run.pieces[0]!)}…`, detail: `אורך ${len.toFixed(1)} מ', מתחת לרצף אין משטח או קרקע בגובה ההליכה (תלוי באוויר ב-${floating} מ-${steps} נקודות)` });
}
// Doubled: two runs (or one tag's two pieces) along the same line, overlapping, at a similar height.
for (let i = 0; i < rails.length; i++) {
  for (let j = i + 1; j < rails.length; j++) {
    const a = rails[i]!;
    const b = rails[j]!;
    if (Math.abs(a.y - b.y) > 0.25) continue;
    const ax = (a.x2 - a.x1) / a.len;
    const az = (a.z2 - a.z1) / a.len;
    const bx = (b.x2 - b.x1) / b.len;
    const bz = (b.z2 - b.z1) / b.len;
    if (Math.abs(ax * bx + az * bz) < 0.97) continue;
    const off = Math.abs((b.x1 - a.x1) * -az + (b.z1 - a.z1) * ax);
    if (off > 0.5) continue;
    const t1 = (b.x1 - a.x1) * ax + (b.z1 - a.z1) * az;
    const t2 = (b.x2 - a.x1) * ax + (b.z2 - a.z1) * az;
    const overlap = Math.min(a.len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
    if (overlap > 0.5 * Math.min(a.len, b.len)) findings.push({ kind: "doubled", where: `${a.tag} ${seg(a)} ↔ ${b.tag} ${seg(b)}`, detail: `חפיפה ${overlap.toFixed(1)} מ', מרחק ${off.toFixed(2)} מ' בין הקווים` });
  }
}
// Doubled by a wall: a railing beside a wall, parapet or kerb (within 50 cm, along it) whose head is as high as the rail or higher — the wall
// already guards there. The wall: a box at least 0.9 m tall and 0.6 m thin or less, not glass, not a rail's own post.
// A run with posts: an upright frame/metal box 0.4–1.3 m tall within 10 cm of its line.
const posts = boxes.filter((b) => /frame|metal/.test(b.material) && b.size.y >= 0.4 && b.size.y <= 1.3 && Math.max(b.size.x, b.size.z) <= 0.1);
const posted = (run: { pieces: Run[] }) => run.pieces.some((p) => posts.some((b) => b.centre.y + b.size.y / 2 <= p.y + 0.05 && b.centre.y + b.size.y / 2 >= p.y - 0.15 && Math.hypot(b.centre.x - (p.x1 + p.x2) / 2, b.centre.z - (p.z1 + p.z2) / 2) <= p.len / 2 + 0.1 && Math.abs((b.centre.x - p.x1) * -(p.z2 - p.z1) / p.len + (b.centre.z - p.z1) * (p.x2 - p.x1) / p.len) < 0.1));
const walls = boxes.filter((b) => !isGuardPart(b) && b.size.y >= 0.9 && Math.min(b.size.x, b.size.z) <= 0.6 && Math.max(b.size.x, b.size.z) >= 0.5 && b.material !== "glass" && !/furniture|fixture|partition|tree|person|car/.test(b.tag ?? "") && !/^site:stair/.test(b.tag ?? ""));
for (const run of runs) {
  // A handrail fixed to a stair's side wall is the wall's handrail, not a second guard; its posts would be (they are not built there).
  if (/stair/.test(run.tag) && !posted(run)) continue;
  let beside = 0;
  let total = 0;
  const by = new Map<string, number>();
  for (const p of run.pieces) {
    const n = Math.max(1, Math.round(p.len / 0.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = p.x1 + (p.x2 - p.x1) * t;
      const z = p.z1 + (p.z2 - p.z1) * t;
      total++;
      const w = walls.find((b) => inFoot(b, x, z, 0.5) && topOf(b) >= p.y - 0.25 && b.centre.y - b.size.y / 2 <= p.y - 0.8);
      if (w) {
        beside++;
        by.set(w.tag ?? "", (by.get(w.tag ?? "") ?? 0) + 1);
      }
    }
  }
  const len = run.pieces.reduce((t, q) => t + q.len, 0);
  if (total && beside / total >= 0.3 && beside * 0.5 >= 1) findings.push({ kind: "doubled", where: `${run.tag} ${seg(run.pieces[0]!)}…`, detail: `אורך ${len.toFixed(1)} מ', ${beside} מ-${total} נקודות לצד קיר שגובהו כגובה המעקה (${[...by.keys()].join(", ")})` });
}
const label = { unneeded: "מעקה שאינו נחוץ (אין נפילה לידו)", floating: "מעקה תלוי באוויר", doubled: "מעקה כפול" } as const;
for (const kind of ["unneeded", "floating", "doubled"] as const) {
  const list = findings.filter((f) => f.kind === kind);
  out(`## ${label[kind]}: ${list.length}`);
  for (const f of list.slice(0, 40)) out(`- ${f.where}: ${f.detail}`);
  out();
}

// Missing: along each paved or decked surface's free edge — a 1 m fall outside it and no railing, wall or building within half a metre.
const sheets = ["floor-2", "floor-1", "roof"] as const;
const stairBoxes = boxes.filter((b) => /stair/.test(b.tag ?? "") && !isGuardPart(b) && Math.min(b.size.x, b.size.z) >= 0.2);
const seen = new Set<string>();
const missing: string[] = [];
const near = (x: number, z: number) => rails.some((p) => {
  const dx = p.x2 - p.x1;
  const dz = p.z2 - p.z1;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - p.x1) * dx + (z - p.z1) * dz) / l2));
  return Math.hypot(x - (p.x1 + dx * t), z - (p.z1 + dz * t)) < 0.6;
});
for (const sheet of sheets) {
  for (const s of dxfSurfaces(dxf, sheet)) {
    const key = `${s.kind}|${Math.round(Math.min(...s.ring.map((q) => q[0])) / 2)}|${Math.round(Math.min(...s.ring.map((q) => q[1])) / 2)}|${Math.round(s.areaM2 / 3)}`;
    if (seen.has(key) || s.areaM2 < 4) continue;
    seen.add(key);
    // Each edge point is judged on its own: the level 30 cm in from the edge against the level a metre out, both sides found by the
    // ring itself (a ring's middle is no guide: a long sidewalk's falls inside the building, and its outward side is not away from it).
    const cx = s.ring.reduce((t, q) => t + q[0], 0) / s.ring.length;
    const cz = s.ring.reduce((t, q) => t + q[1], 0) / s.ring.length;
    let gap = 0;
    const stretches: Array<{ a: [number, number]; b: [number, number]; n: number; level: number; drop: number }> = [];
    let cur: (typeof stretches)[number] | null = null;
    for (let i = 0; i < s.ring.length; i++) {
      const a = s.ring[i]!;
      const b = s.ring[(i + 1) % s.ring.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.05) continue;
      const n = Math.max(1, Math.round(len / 1.0));
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const sgn = inRing(s.ring, x + nx * 0.3, z + nz * 0.3) ? 1 : -1;
        const inX = x + nx * 0.3 * sgn;
        const inZ = z + nz * 0.3 * sgn;
        const outX = x - nx * 1.0 * sgn;
        const outZ = z - nz * 1.0 * sgn;
        if (inRing(s.ring, outX, outZ)) continue;
        // A hatch drawn over a stair reads a tread as its level: a stair's edges are its handrails' to guard, judged with the railings above.
        if (stairBoxes.some((b) => inFoot(b, x, z, 0.3))) continue;
        const level = levelAt(inX, inZ, 30);
        const outLevel = levelAt(outX, outZ, level + 0.2);
        gap++;
        if (level - outLevel >= 1.0 && !near(x, z) && !wallNear(x, z, level) && !wallNear(outX, outZ, level)) {
          if (cur && Math.hypot(cur.b[0] - x, cur.b[1] - z) < 1.6) {
            cur.b = [x, z];
            cur.n++;
            cur.drop = Math.max(cur.drop, level - outLevel);
          } else {
            cur = { a: [x, z], b: [x, z], n: 1, level, drop: level - outLevel };
            stretches.push(cur);
          }
        } else cur = null;
      }
    }
    const bad = stretches.filter((q) => q.n >= 2);
    if (bad.length) missing.push(`- ${s.kind} ${s.pattern} ${s.areaM2.toFixed(0)} מ"ר סביב (${cx.toFixed(1)}, ${cz.toFixed(1)}): ${bad.map((q) => `(${q.a[0].toFixed(1)}, ${q.a[1].toFixed(1)})→(${q.b[0].toFixed(1)}, ${q.b[1].toFixed(1)}) מפלס ${q.level.toFixed(2)} נפילה ${q.drop.toFixed(1)}`).join("; ")} — ${bad.reduce((t, q) => t + q.n, 0)} מ-${gap} נקודות`);
  }
}
out(`## קצה משטח נופל בלי מעקה: ${missing.length}`);
for (const m of missing.slice(0, 60)) out(m);
const text = lines.join("\n");
console.log(text);
if (process.argv[3]) fs.writeFileSync(process.argv[3], text);
