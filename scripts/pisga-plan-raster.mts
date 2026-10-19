#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — a floor sheet of the DXF drawn as a plan picture, in the plan frame (metres, x east, z south): hatches filled by pattern class, lines by their own colour.
 *
 *   npx tsx --conditions=react-server scripts/pisga-plan-raster.mts "<drawing.dxf>" <out.png> <floor-2|floor-1|roof> <x0> <x1> <z0> <z1> [px per m]
 */
import fs from "node:fs";
import sharp from "sharp";
const { readDxfDrawing, flattenDxf, entitiesWithin, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const [file, out, id, a, b, c, d, s] = process.argv.slice(2);
const [x0, x1, z0, z1] = [a, b, c, d].map(Number) as [number, number, number, number];
const k = Number(s ?? 20);
const left = PISGA_DXF.sheets[id as "floor-1"], { frameY, width, height, corner } = PISGA_DXF;
const at = (q: { x: number; y: number }): [number, number] => [(q.x - left - corner.x) / 100 + 0.88, (frameY + corner.y - q.y) / 100 + 1.02];
const dxf = readDxfDrawing(fs.readFileSync(file!))!;
const ps = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
const X = (x: number) => ((x - x0) * k).toFixed(1), Z = (z: number) => ((z - z0) * k).toFixed(1);
const fill = (pat: string | undefined, col: number) => (!pat ? "none" : /GRATE/.test(pat) ? "#4a4d55" : /HBONE|B8|B816|paving/i.test(pat) ? "#d9b38c" : /CONC|DOTS/.test(pat) ? "#b9b9b9" : /EARTH|SAND/.test(pat) ? "#c8b48a" : /ANSI31/.test(pat) ? "none" : "#c0c0c0");
let g = "";
for (const p of ps) {
  if (p.rings && (p.pattern || p.solid)) {
    const f = fill(p.pattern ?? "SOLID", p.colour); if (f === "none") continue;
    g += `<path fill="${f}" fill-opacity="0.8" fill-rule="evenodd" d="${p.rings.map((r) => "M" + r.map(at).map(([x, z]) => `${X(x)},${Z(z)}`).join("L") + "Z").join("")}"/>`;
    continue;
  }
  const pts = p.circle ? arcPoints(p.circle.c, p.circle.r, 0, 7) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : p.pts;
  if (p.text && p.at) { const [x, z] = at(p.at); g += `<text x="${X(x)}" y="${Z(z)}" font-size="${Math.max(6, (p.height ?? 10) * k / 100)}" fill="#c00">${p.text.replace(/[<&]/g, "")}</text>`; continue; }
  if (!pts || pts.length < 2) continue;
  g += `<polyline fill="none" stroke="#${(p.colour === 0xffffff ? 0 : p.colour).toString(16).padStart(6, "0")}" stroke-width="0.7" points="${pts.map(at).map(([x, z]) => `${X(x)},${Z(z)}`).join(" ")}"/>`;
}
const W = Math.round((x1 - x0) * k), H = Math.round((z1 - z0) * k);
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${g}</svg>`)).png().toFile(out!);
console.log(out, W, H, ps.length);
