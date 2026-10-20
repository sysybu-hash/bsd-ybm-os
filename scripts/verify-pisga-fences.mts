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
const model = await buildPisga(null, { dxf });
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
  if (isRailTag(b.tag ?? "") || b.size.y < 0.1 || b.material === "glass") continue;
  solids.push({ top: topOf(b), foot: b.centre.y - b.size.y / 2, wide: b.size.x >= 0.3 && b.size.z >= 0.3, at: (x, z, pad) => inFoot(b, x, z, pad) });
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
const levelAt = (x: number, z: number, limit: number) => {
  let best = ground(x, z);
  for (const s of solids) if (s.wide && s.top <= limit + 0.05 && s.top > best && s.at(x, z, 0)) best = s.top;
  return best;
};
const wallNear = (x: number, z: number, y: number) => solids.some((s) => s.top - s.foot >= 1.2 && s.foot <= y && s.top >= y + 0.9 && s.at(x, z, 0.35));

// The top rails: thin boxes in a railing's tag, about 4–6 cm high, long.
type Run = { tag: string; x1: number; z1: number; x2: number; z2: number; y: number; len: number };
const rails: Run[] = [];
for (const b of boxes) {
  const tag = b.tag ?? "";
  if (!isRailTag(tag)) continue;
  if (b.size.y > 0.12 || Math.max(b.size.x, b.size.z) < 0.25) continue;
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
      const walk = p.y - 1.0;
      const sides = [1, -1].map((s) => {
        const sx = x + -dz * s * 1.0;
        const sz = z + dx * s * 1.0;
        return { x: sx, z: sz, level: levelAt(sx, sz, walk + 0.3), wall: wallNear(sx, sz, walk) };
      });
      const under = levelAt(x, z, walk + 0.3);
      if (walk - under > 0.6) floating++;
      const drops = sides.map((s) => (s.wall ? 0 : walk - s.level));
      const drop = Math.max(...drops);
      dropMax = Math.max(dropMax, drop);
      steps++;
      if (drop < 0.4) low++;
    }
  }
  const share = steps ? low / steps : 0;
  if (share >= 0.6 && len > 1.5) findings.push({ kind: "unneeded", where: `${run.tag} ${seg(run.pieces[0]!)}…`, detail: `אורך ${len.toFixed(1)} מ', בשני צדדיו הקרקע עד 0.4 מ' מתחת למפלס ההליכה (נפילה מרבית ${dropMax.toFixed(2)})` });
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
    if (off > 0.12) continue;
    const t1 = (b.x1 - a.x1) * ax + (b.z1 - a.z1) * az;
    const t2 = (b.x2 - a.x1) * ax + (b.z2 - a.z1) * az;
    const overlap = Math.min(a.len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
    if (overlap > 0.5 * Math.min(a.len, b.len) && a.tag !== b.tag) findings.push({ kind: "doubled", where: `${a.tag} ${seg(a)} ↔ ${b.tag} ${seg(b)}`, detail: `חפיפה ${overlap.toFixed(1)} מ' בשני מעקות שונים` });
  }
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
    // The surface's own level: the highest solid top under its middle within a few cm of a deck/slab; the ground where it lies on it.
    const cx = s.ring.reduce((t, q) => t + q[0], 0) / s.ring.length;
    const cz = s.ring.reduce((t, q) => t + q[1], 0) / s.ring.length;
    const level = levelAt(cx, cz, 30);
    let gap = 0;
    let bad = 0;
    let first: [number, number] | null = null;
    for (let i = 0; i < s.ring.length; i++) {
      const a = s.ring[i]!;
      const b = s.ring[(i + 1) % s.ring.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / 1.0));
      // The outward side: away from the centre.
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        const ox = x - cx;
        const oz = z - cz;
        const ol = Math.hypot(ox, oz) || 1;
        const outX = x + (ox / ol) * 1.0;
        const outZ = z + (oz / ol) * 1.0;
        const outLevel = levelAt(outX, outZ, level + 0.2);
        gap++;
        if (level - outLevel >= 1.0 && !near(x, z) && !wallNear(x, z, level) && !wallNear(outX, outZ, level)) {
          bad++;
          first ??= [x, z];
        }
      }
    }
    if (bad >= 3) missing.push(`- ${s.kind} ${s.pattern} ${s.areaM2.toFixed(0)} מ"ר סביב (${cx.toFixed(1)}, ${cz.toFixed(1)}) מפלס ${level.toFixed(2)}: ${bad} מ-${gap} נקודות בשפה נופלות מטר ויותר בלי מעקה (הראשונה ב-${first![0].toFixed(1)}, ${first![1].toFixed(1)})`);
  }
}
out(`## קצה משטח נופל בלי מעקה: ${missing.length}`);
for (const m of missing.slice(0, 60)) out(m);
const text = lines.join("\n");
console.log(text);
if (process.argv[3]) fs.writeFileSync(process.argv[3], text);
