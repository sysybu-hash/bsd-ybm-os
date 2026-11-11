import path from "node:path";
import sharp from "sharp";
const G = await import("./plan-grid.mts");
const dir = process.argv[2]!, out = process.argv[3]!;
const names = ["M-ground", "M-floor1", "M-floor2", "M-floor3", "M-roof"];
const all = names.map((n) => G.readPieces(path.join(dir, n + ".dxf")));
const pts = all.flatMap((ps) => G.wallRings(ps).flat());
const xs = pts.map((p) => p.x).sort((a, b) => a - b), ys = pts.map((p) => p.y).sort((a, b) => a - b);
console.log("walls bbox cm", xs[0], xs.at(-1), ys[0], ys.at(-1));
const pad = 300;
for (const [n, ps] of names.map((n, i) => [n, all[i]!] as const)) {
  const g = G.makeGrid(xs[0]! - pad, ys[0]! - pad, xs.at(-1)! + pad, ys.at(-1)! + pad);
  for (const p of ps) if (p.rings && G.WALL_LAYERS.test(p.layer)) G.fillRings(g, p.rings);
  const walls = g.a.slice();
  for (const p of ps) if (p.path.some((n) => G.OPENING.test(n)) && !/A-ANNO/.test(p.layer)) {
    if (p.arc) { const a = p.arc; const n = 12; for (let i = 0; i < n; i++) { const t0 = a.start + ((a.end - a.start) * i) / n, t1 = a.start + ((a.end - a.start) * (i + 1)) / n; G.drawLine(g, { x: a.c.x + a.r * Math.cos(t0), y: a.c.y + a.r * Math.sin(t0) }, { x: a.c.x + a.r * Math.cos(t1), y: a.c.y + a.r * Math.sin(t1) }, 2); } }
    if (p.pts) for (let i = 0; i + 1 < p.pts.length; i++) G.drawLine(g, p.pts[i]!, p.pts[i + 1]!, 2);
  }
  const fp = G.footprint(g, 70);
  const img = Buffer.alloc(g.nx * g.ny * 3);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i, o = ((g.ny - 1 - j) * g.nx + i) * 3;
    const c = walls[k] ? [0, 0, 0] : g.a[k] === 2 ? [220, 0, 0] : fp[k] ? [190, 200, 230] : [255, 255, 255];
    img[o] = c[0]!; img[o + 1] = c[1]!; img[o + 2] = c[2]!;
  }
  await sharp(img, { raw: { width: g.nx, height: g.ny, channels: 3 } }).png().toFile(path.join(out, `grid-${n}.png`));
  let area = 0; for (const v of fp) area += v;
  console.log(n, "rings", G.wallRings(ps).length, "floor m²", (area * G.CELL * G.CELL / 1e4).toFixed(0));
}
