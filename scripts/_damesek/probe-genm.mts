// scratch: the loose A-GENM pieces near the lift (floor 2), and texts there
import path from "node:path";
const G = await import("./plan-grid.mts");
const ps = G.readPieces(path.join(process.argv[2]!, process.argv[3]! + ".dxf"));
for (const p of ps) {
  const pts = p.pts ?? p.rings?.flat() ?? (p.at ? [p.at] : []);
  if (!pts.length) continue;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  if (Math.max(...xs) < -480 || Math.min(...xs) > -150 || Math.max(...ys) < 700 || Math.min(...ys) > 1080) continue;
  if (/DIMS|S-GRID|PDF_/.test(p.layer)) continue;
  if (!p.path.length && /A-GENM|0$/.test(p.layer) || p.text) console.log(p.layer, p.type, p.path[0]?.slice(0, 30) ?? "", p.text ?? "", p.rings ? "rings " + p.rings.map((r) => r.map((v) => `${v.x.toFixed(0)},${v.y.toFixed(0)}`).join(" ")).join(" | ") : pts.map((v) => `${v.x.toFixed(0)},${v.y.toFixed(0)}`).join(" "));
}
