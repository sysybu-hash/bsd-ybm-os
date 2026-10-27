#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — what the plan sheets hatch and draw as stairs, against what the model builds.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-surfaces.mts "<drawing.dxf>"
 *
 * Surfaces: each DXF hatch polygon (deduped across the three sheets) against the model's surface patches
 * and decks, by polygon. Stairs: each run of treads against the model's stair boxes, in a 2 cm raster:
 * the share of the drawing's tread-line ink the model's steps cover, and the share of the steps' footprint
 * that has ink under it.
 */
import fs from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");
const { dxfSurfaces } = await import("@/lib/projects/building/pisga-surfaces");
const { dxfTreadSets } = await import("@/lib/projects/building/pisga-stairs");
const dxf = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const model = await buildPisga(null, { dxf });
const sheets = ["floor-2", "floor-1", "roof"] as const;
const seen = new Set<string>();
const byKind: Record<string, { n: number; m2: number }> = {};
for (const sheet of sheets) {
  for (const s of dxfSurfaces(dxf, sheet)) {
    const k = `${s.kind}|${Math.round(Math.min(...s.ring.map((q) => q[0])) / 2)}|${Math.round(Math.min(...s.ring.map((q) => q[1])) / 2)}|${Math.round(s.areaM2 / 3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const e = (byKind[s.kind] ??= { n: 0, m2: 0 });
    e.n++;
    e.m2 += s.areaM2;
  }
}
const built = model.primitives.filter((p) => (p.tag ?? "").startsWith("site:surface:"));
console.log("## משטחים (מילויים)");
for (const [kind, e] of Object.entries(byKind)) console.log(`- ${kind}: ב-DXF ${e.n} מצולעים, ${Math.round(e.m2)} מ"ר; במודל ${built.filter((p) => p.tag === `site:surface:${kind}`).length} גופים`);

console.log("\n## מדרגות");
const stairBoxes = model.primitives.filter((p) => p.type === "box" && /stair/.test(p.tag ?? "")) as Array<Extract<(typeof model.primitives)[number], { type: "box" }>>;
const ppm = 50;
for (const sheet of sheets) {
  for (const set of dxfTreadSets(dxf, sheet)) {
    const mx = (set.first[0] + set.last[0]) / 2;
    const mz = (set.first[1] + set.last[1]) / 2;
    const near = stairBoxes.filter((b) => Math.hypot(b.centre.x - mx, b.centre.z - mz) < 4);
    const x0 = Math.floor(Math.min(set.first[0], set.last[0]) - set.width - 1);
    const z0 = Math.floor(Math.min(set.first[1], set.last[1]) - set.width - 1);
    const W = Math.ceil(Math.abs(set.last[0] - set.first[0]) + 2 * set.width + 3);
    const H = Math.ceil(Math.abs(set.last[1] - set.first[1]) + 2 * set.width + 3);
    const ink = new Uint8Array(W * ppm * H * ppm);
    const foot = new Uint8Array(ink.length);
    const plot = (m: Uint8Array, x: number, z: number) => { const i = Math.round((x - x0) * ppm), j = Math.round((z - z0) * ppm); if (i >= 0 && i < W * ppm && j >= 0 && j < H * ppm) m[j * W * ppm + i] = 1; };
    // The drawing's treads: each line across the run, drawn from its end to end.
    const perp: [number, number] = [-set.dir[1], set.dir[0]];
    for (let k = 0; k < set.n; k++) {
      const t = k / Math.max(1, set.n - 1);
      const cx = set.first[0] + (set.last[0] - set.first[0]) * t;
      const cz = set.first[1] + (set.last[1] - set.first[1]) * t;
      for (let u = -set.width / 2; u <= set.width / 2; u += 0.02) plot(ink, cx + perp[0] * u, cz + perp[1] * u);
    }
    for (const b of near) {
      const a = -(b.rotY ?? 0);
      for (let u = -b.size.x / 2; u <= b.size.x / 2; u += 0.02) for (let v = -b.size.z / 2; v <= b.size.z / 2; v += 0.02) plot(foot, b.centre.x + u * Math.cos(a) - v * Math.sin(a), b.centre.z + u * Math.sin(a) + v * Math.cos(a));
    }
    const dil = (m: Uint8Array, r: number) => { const o = new Uint8Array(m.length); const w = W * ppm; for (let i = 0; i < m.length; i++) if (m[i]) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const j = i + dy * w + dx; if (j >= 0 && j < m.length) o[j] = 1; } return o; };
    const dFoot = dil(foot, 3);
    const dInk = dil(ink, 3);
    let inkN = 0, inkIn = 0, footN = 0, footIn = 0;
    for (let i = 0; i < ink.length; i++) { if (ink[i]) { inkN++; if (dFoot[i]) inkIn++; } if (foot[i]) { footN++; if (dInk[i]) footIn++; } }
    console.log(`- ${sheet}: ${set.n} מדרגות ב-${mx.toFixed(1)},${mz.toFixed(1)} (רוחב ${set.width.toFixed(2)}, עומק ${set.pitch.toFixed(2)}): גופי מדרגה במודל ${near.length}; דיו המדרגות המכוסה ${inkN ? Math.round((100 * inkIn) / inkN) : 0}%, שטח המדרגות עם דיו מתחתיו ${footN ? Math.round((100 * footIn) / footN) : 0}%`);
  }
}
