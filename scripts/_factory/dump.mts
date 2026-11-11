// Factory (Kiryat Arba) — what each plan DXF holds, by layer and by place, to find the two options and the room boxes.
//   npx tsx --conditions=react-server scripts/_factory/dump.mts <dxf>
import fs from "node:fs";
import { flattenDxf, readDxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

const f = process.argv[2]!;
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(f)))!;
const all = flattenDxf(d);
const X0 = 21150000, Y0 = 0; // print x relative to this to keep numbers short
const anchor = (p: DxfPiece) => p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c ?? p.rings?.[0]?.[0];
const fmt = (q?: { x: number; y: number }) => (q ? `${((q.x - X0) / 100).toFixed(1)},${((q.y - Y0) / 100).toFixed(1)}` : "?");
const byLayer = new Map<string, DxfPiece[]>();
for (const p of all) {
  const k = `${p.path.join(">") || "-"} :: ${p.layer} :: ${p.type}`;
  const a = byLayer.get(k) ?? [];
  a.push(p);
  byLayer.set(k, a);
}
for (const [k, ps] of [...byLayer].sort()) {
  const xs = ps.map(anchor).filter(Boolean).map((q) => q!.x), ys = ps.map(anchor).filter(Boolean).map((q) => q!.y);
  console.log(`${k}  n=${ps.length}  x ${((Math.min(...xs) - X0) / 100).toFixed(0)}..${((Math.max(...xs) - X0) / 100).toFixed(0)} y ${(Math.min(...ys) / 100).toFixed(0)}..${(Math.max(...ys) / 100).toFixed(0)}`);
}
console.log("\n--- walls (00-WL, 00-WL pnimi) ---");
for (const p of all) {
  if (!/^00-WL/.test(p.layer) || !p.pts || p.path.length) continue;
  const xs = p.pts.map((q) => q.x), ys = p.pts.map((q) => q.y);
  console.log(`${p.layer.padEnd(12)} ${p.type} closed=${p.closed} n=${p.pts.length} from ${fmt(p.pts[0])} box ${((Math.max(...xs) - Math.min(...xs)) / 100).toFixed(2)}x${((Math.max(...ys) - Math.min(...ys)) / 100).toFixed(2)} m`);
}
console.log("\n--- inserts at top level ---");
for (const p of all) if (p.type === "INSERT" && p.path.length === 0) console.log(`${p.insert} [${p.layer}] at ${fmt(p.at)} rot=${((p.rot ?? 0) * 180 / Math.PI).toFixed(0)} mir=${!!p.mirrored}`);
console.log("\n--- texts at top level ---");
for (const p of all) if (p.text && p.path.length === 0 && !p.dimension) console.log(`${p.text} [${p.layer}] at ${fmt(p.at)} h=${p.height?.toFixed(0)}`);
