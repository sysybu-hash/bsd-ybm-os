import { readBreuer } from "./read.mts";
const [file, tab, a, b, c, d] = process.argv.slice(2);
const [x0, x1, y0, y1] = [a, b, c, d].map(Number) as [number, number, number, number];
const { storeys } = readBreuer(file!);
const st = storeys.find((s) => s.id === tab)!;
const n = new Map<string, number>();
for (const p of st.pieces) { const q = p.pts?.[0] ?? p.at ?? p.arc?.c; if (!q) continue; const x = q.x - st.origin.x, y = q.y - st.origin.y; if (x < x0 || x > x1 || y < y0 || y > y1) continue; const k = `${p.layer}|${p.type}|c${p.colour.toString(16)}`; n.set(k, (n.get(k) ?? 0) + 1); }
console.log([...n].sort((u, v) => v[1] - u[1]).map(([k, v]) => `${k}:${v}`).join("\n"));
