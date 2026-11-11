// scratch: what stands round the end cubicle doors (floor 1 @-1592,944 / 1204)
import path from "node:path";
const G = await import("./plan-grid.mts");
const ps = G.readPieces(path.join(process.argv[2]!, "M-floor1.dxf"));
for (const p of ps) {
  const pts = p.pts ?? p.rings?.flat() ?? [];
  if (!pts.length || /ANNO|FURN|FIXT/.test(p.layer)) continue;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 < -1700 || x0 > -1480 || y1 < 880 || y0 > 1010) continue;
  console.log(p.layer, p.block ?? "", p.rings ? "ring" : "line", `X${x0.toFixed(0)}..${x1.toFixed(0)} Y${y0.toFixed(0)}..${y1.toFixed(0)}`);
}
