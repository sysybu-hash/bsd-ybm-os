// Scratch: the elevation DXF's own lines drawn in red over the render of the face it draws — every line where the model should
// have an edge. Views are orthographic: half width 18.368 m over the image width, centred on the camera's target.
import path from "node:path";
import { readFileSync } from "node:fs";
import sharp from "sharp";
const G = await import("./plan-grid.mts");
const [modelDir, dxfDir, outDir] = process.argv.slice(2) as [string, string, string];
const report = JSON.parse(readFileSync(path.join(modelDir, "report.json"), "utf8"));
const pairs: Array<[string, string]> = [["חזית מזרחית", "elev-east"], ["חזית צפונית", "elev-south"], ["חזית דרומית", "elev-north"], ["חזית מערבית", "elev-west"]];
const RIGHT: Record<string, [number, number, number]> = { "elev-east": [0, 0, -1], "elev-west": [0, 0, 1], "elev-south": [1, 0, 0], "elev-north": [-1, 0, 0] };
const C = { x: -7.408775892655713, y: 10.25, z: -3.0638599276484006 }, HW = 18.368;
for (const [name, view] of pairs) {
  const map = report.maps[name];
  const img = sharp(path.join(modelDir, "results", view + ".jpg"));
  const { width: W, height: H } = await img.metadata();
  const k = W! / (2 * HW), r = RIGHT[view]!;
  const cr = C.x * r[0] + C.z * r[2];
  const toPx = (e: number, ycm: number) => {
    const a = (e - map.b) / map.s; // plan cm
    const P = map.axis === "X" ? { x: a / 100, z: 0 } : { x: 0, z: -a / 100 };
    const u = P.x * r[0] + P.z * r[2] - cr;
    return [W! / 2 + u * k, H! / 2 - (ycm / 100 - C.y) * k] as const;
  };
  const ps = G.readPieces(path.join(dxfDir, name + ".dxf"));
  let d = "";
  for (const p of ps) {
    if (/ANNO|DIMS|GRID|Level|TEXT|G-|A-FLOR-LEVL|C-TOPO|RPC|L-SITE/i.test(p.layer) || p.text) continue;
    const seqs = p.rings ?? (p.pts ? [p.pts] : []);
    for (const q of seqs) { if (q.length < 2) continue; d += "M" + q.map((v) => toPx(v.x, v.y).map((n) => n.toFixed(1)).join(",")).join("L"); }
    if (p.arc) {
      const { c, r: rr, start, end } = p.arc; let e1 = end; if (e1 < start) e1 += Math.PI * 2;
      const n = 24; const pts: string[] = [];
      for (let i = 0; i <= n; i++) { const t = start + ((e1 - start) * i) / n; pts.push(toPx(c.x + rr * Math.cos(t), c.y + rr * Math.sin(t)).map((v) => v.toFixed(1)).join(",")); }
      d += "M" + pts.join("L");
    }
    if (p.circle) { const [x0, y0] = toPx(p.circle.c.x - p.circle.r, p.circle.c.y); const [x1] = toPx(p.circle.c.x + p.circle.r, p.circle.c.y); const R = Math.abs(x1 - x0) / 2; d += `M${(x0 + x1) / 2 - R},${y0}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0`; }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.7" stroke-opacity="0.75"/></svg>`;
  await img.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toFile(path.join(outDir, `overlay-${view}.png`));
  console.log("overlay", name, view);
}
