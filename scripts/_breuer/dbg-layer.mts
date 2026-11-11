// One layer's pieces on one storey: kind, block, place (plan-local cm), and pieces flattened from those blocks on other layers.
import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const st = storeys.find((s) => s.id === (process.argv[4] ?? "ב"))!;
const ins = new Set<string>();
for (const p of st.pieces) if (p.layer === process.argv[3]) { ins.add(p.insert ?? ""); console.log(p.type, p.insert ?? "", p.at ? `${Math.round(p.at.x - st.origin.x)},${Math.round(p.at.y - st.origin.y)}` : "", (p.attribs ?? []).map((a) => `${a.tag}=${a.text}`).join(" ")); }
const kids = new Map<string, number>();
for (const p of st.pieces) if (p.path.some((n) => ins.has(n))) { const k = `${p.path.join(">")} ${p.layer} ${p.type}`; kids.set(k, (kids.get(k) ?? 0) + 1); }
for (const [k, n] of kids) console.log("  child", k, n);
