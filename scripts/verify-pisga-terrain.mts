#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the ground against the drawing's own spot heights.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-terrain.mts "<drawing.dxf>"
 *
 * The site sheet ("חישובי שטחים", x 257–266.5k) marks the finished ground and the levels of what stands on it as "+927.58" / "+8.27=931.47" (metres over the
 * survey, ±0.00 = 923.20). Each mark outside the building is read, placed in the plan frame by the plot's corners (the sheet's x 258575 is plan x 0, its y 644784 plan z 0),
 * and the model's ground (its terrain grid) is read at the same spot. The slope is judged by how far the ground is from the marks: the mean and the worst miss, and the marks
 * the ground misses by more than half a metre.
 */
import fs from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing, flattenDxf } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");

const dxf = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const model = await buildPisga(null, { dxf });
const g = model.primitives.find((p) => p.type === "terrain" && p.tag === "site:ground") as Extract<(typeof model.primitives)[number], { type: "terrain" }>;
const ground = (x: number, z: number) => {
  const fx = (x - g.x0) / g.dx, fz = (z - g.z0) / g.dx;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
  const h = (a: number, b: number) => g.heights[b * g.nx + a]!;
  return h(i, j) * (1 - tx) * (1 - tz) + h(i + 1, j) * tx * (1 - tz) + h(i, j + 1) * (1 - tx) * tz + h(i + 1, j + 1) * tx * tz;
};
const X0 = 258575, Y0 = 644784;
const marks = flattenDxf(dxf)
  .filter((p) => p.text && p.at && p.at.x > 256500 && p.at.x < 266800 && p.at.y > 640000 && p.at.y < 647500 && /9[2-4]\d\.\d\d/.test(p.text) && !/^\s*\d{3}\.\d\d\s*-/.test(p.text))
  .map((p) => ({ abs: Number([...p.text!.matchAll(/(9[2-4]\d\.\d\d)/g)].pop()![1]), x: (p.at!.x - X0) / 100, z: (Y0 - p.at!.y) / 100, text: p.text!.trim() }));
// Outside the building's footprint (x 0.9..53.9, z 0.2..16.6) the mark is the ground's; inside it is a floor or roof level.
// Marks that are not the ground's: the building's footprint (a floor or roof level), the existing kindergarten's box and roof terrace (+4.38 is its paving), the roof car park (17.25 and up), and
// the grated decks and landings (a deck's own level stands within 3 m of its polygon).
const decks = model.primitives.filter((p): p is Extract<(typeof model.primitives)[number], { type: "prism" }> => p.type === "prism" && /grate/.test(p.tag ?? ""));
const nearDeck = (m: { x: number; z: number }) => decks.some((d) => d.ring.some(([x, z]) => Math.hypot(x - m.x, z - m.z) < 3));
const outside = marks.filter((m) => {
  if (m.x > 0.5 && m.x < 54.5 && m.z > -0.5 && m.z < 17.2) return false;
  if (m.x > -3.4 && m.x < 56.8 && m.z > -7.4 && m.z < 8.1) return false;
  if (m.abs - 923.2 >= 14) return false;
  return !nearDeck(m);
});
const seen = new Set<string>();
const rows: string[] = [];
let sum = 0, n = 0, worst = 0;
for (const m of outside.sort((a, b) => a.z - b.z)) {
  const key = `${m.abs}|${m.x.toFixed(0)}|${m.z.toFixed(0)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const want = m.abs - 923.2;
  const have = ground(m.x, m.z);
  const err = have - want;
  sum += Math.abs(err); n++; worst = Math.max(worst, Math.abs(err));
  rows.push(`${Math.abs(err) > 0.5 ? "✗" : "✓"} (${m.x.toFixed(1)}, ${m.z.toFixed(1)}) סימן ${want.toFixed(2)} ← קרקע ${have.toFixed(2)} (${err >= 0 ? "+" : ""}${err.toFixed(2)})  ${m.text}`);
}
console.log(`# קרקע מול סימוני המפלס של שרטוט הפיתוח\n${n} סימנים מחוץ לבניין: סטייה ממוצעת ${(sum / n).toFixed(2)} מ', מקסימלית ${worst.toFixed(2)} מ'\n`);
console.log(rows.join("\n"));
