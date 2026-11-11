import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(process.argv[2]!)))!;
const all = flattenDxf(d);
const re = new RegExp(process.argv[3] ?? "kir");
const st = new Map<string, number>();
for (const p of all) {
  if (!re.test(p.layer)) continue;
  const k = `${p.layer} ${p.type} closed=${!!p.closed} n=${p.pts?.length ?? p.rings?.map((r) => r.length).join("/")} path=${p.path.slice(-1)[0] ?? "-"}`;
  const pts = p.pts ?? p.rings?.flat() ?? [];
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (process.env.V) console.log(k, w.toFixed(0), h.toFixed(0), Math.min(...xs).toFixed(0), Math.min(...ys).toFixed(0));
  st.set(k.replace(/n=\d+/, "n=#"), (st.get(k.replace(/n=\d+/, "n=#")) ?? 0) + 1);
}
for (const [k, n] of [...st].sort((a, b) => b[1] - a[1])) console.log(n, k);
