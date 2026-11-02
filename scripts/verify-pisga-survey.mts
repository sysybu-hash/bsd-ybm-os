// The model's ground against the 2022 survey's spot heights: each spot's level beside the terrain under it (or the top of what is built
// there), the mean and worst misses, and the list over a tolerance. Free.
// SURVEY=<survey dxf> DXF=<architect dxf> npx tsx --conditions=react-server scripts/verify-pisga-survey.mts [tolerance m] [out.md]
import fs from "node:fs";
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");
const { readPisgaSurvey, surveyPlot } = await import("@/lib/projects/building/pisga-survey");
const { insidePolygon } = await import("@/lib/projects/building/assemble");
const tol = Number(process.argv[2] ?? 0.3);
const out = process.argv[3];
const dxf = readDxfDrawing(fs.readFileSync(process.env.DXF!))!;
const surveyDrawing = readDxfDrawing(fs.readFileSync(process.env.SURVEY!))!;
const survey = readPisgaSurvey(surveyDrawing);
const model = await buildPisga(null, { dxf, survey: surveyDrawing } as Parameters<typeof buildPisga>[1]);
type Terrain = Extract<(typeof model.primitives)[number], { type: "terrain" }>;
const grids = model.primitives.filter((p): p is Terrain => p.type === "terrain" && p.tag === "site:ground").sort((a, b) => a.dx - b.dx);
const terrainAt = (x: number, z: number) => {
  for (const g of grids) {
    const fi = (x - g.x0) / g.dx, fj = (z - g.z0) / g.dx;
    const i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.nz - 1) continue;
    if (g.dx >= 1 && (g.holes ?? []).some((h) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1)) continue;
    const u = fi - i, v = fj - j, H = (a: number, b: number) => g.heights[b * g.nx + a]!;
    return H(i, j) * (1 - u) * (1 - v) + H(i + 1, j) * u * (1 - v) + H(i, j + 1) * (1 - u) * v + H(i + 1, j + 1) * u * v;
  }
  return null;
};
// The highest built top within 15 cm over the ground at the spot: paving, a stair tread, a slab the spot was taken on.
const topAt = (x: number, z: number, near: number) => {
  let best: number | null = null;
  for (const p of model.primitives) {
    let top: number | null = null;
    if (p.type === "box") {
      const c = Math.cos(p.rotY ?? 0), s = Math.sin(p.rotY ?? 0);
      const dx = x - p.centre.x, dz = z - p.centre.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= p.size.x / 2 + 0.05 && Math.abs(lz) <= p.size.z / 2 + 0.05) top = p.centre.y + p.size.y / 2;
    } else if (p.type === "prism") {
      let inside = false;
      for (let i = 0, j = p.ring.length - 1; i < p.ring.length; j = i++) {
        const [xi, zi] = p.ring[i]!, [xj, zj] = p.ring[j]!;
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      if (inside) top = p.y1;
    }
    if (top == null || /rail|bar|tree|car|person|glass|frame/.test(p.tag ?? "")) continue;
    if (Math.abs(top - near) < 1.5 && (best == null || Math.abs(top - near) < Math.abs(best - near))) best = top;
  }
  return best;
};
const rows: Array<{ s: (typeof survey.spots)[number]; got: number; d: number; what: string }> = [];
for (const s of survey.spots) {
  if (s.x < -60 || s.x > 140 || s.z < -60 || s.z > 60) continue;
  const g = terrainAt(s.x, s.z);
  const t = topAt(s.x, s.z, s.level);
  const cands: Array<[number, string]> = [];
  if (g != null) cands.push([g, "ground"]);
  if (t != null) cands.push([t, "built"]);
  if (!cands.length) continue;
  const [got, what] = cands.sort((a, b) => Math.abs(a[0] - s.level) - Math.abs(b[0] - s.level))[0]!;
  rows.push({ s, got, d: got - s.level, what });
}
const plot = surveyPlot(survey)!;
const inLot = (r: (typeof rows)[number]) => insidePolygon(plot, r.s.x, r.s.z);
const stat = (rs: typeof rows) => { const a = rs.map((r) => Math.abs(r.d)); return `${rs.length} spots, mean ${(a.reduce((t, v) => t + v, 0) / (a.length || 1)).toFixed(2)} m, over ${tol} m: ${rs.filter((r) => Math.abs(r.d) > tol).length}`; };
console.log(`outside the lot (survey must hold): ${stat(rows.filter((r) => !inLot(r)))}`);
console.log(`inside the lot (the design may differ): ${stat(rows.filter(inLot))}`);
const abs = rows.map((r) => Math.abs(r.d));
const mean = abs.reduce((a, b) => a + b, 0) / (abs.length || 1);
const bad = rows.filter((r) => Math.abs(r.d) > tol).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
const lines = [
  `# Ground vs survey (25.12.2022)`,
  ``,
  `spots: ${rows.length}, mean miss ${mean.toFixed(2)} m, worst ${Math.max(0, ...abs).toFixed(2)} m, over ${tol} m: ${bad.length}`,
  ``,
  `| x | z | survey | model | miss | layer | on | lot |`,
  `|--:|--:|--:|--:|--:|---|---|---|`,
  ...bad.map((r) => `| ${r.s.x.toFixed(1)} | ${r.s.z.toFixed(1)} | ${r.s.level.toFixed(2)} | ${r.got.toFixed(2)} | ${r.d >= 0 ? "+" : ""}${r.d.toFixed(2)} | ${r.s.layer} | ${r.what} | ${inLot(r) ? "in" : "out"} |`),
];
if (out) fs.writeFileSync(out, lines.join("\n"));
console.log(lines.slice(0, 3).join("\n"));
console.log(lines.slice(6, 26).join("\n"));
