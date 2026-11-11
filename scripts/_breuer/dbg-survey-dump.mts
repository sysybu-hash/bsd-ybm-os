import fs from "node:fs";
import { readBreuer } from "./read.mts";
import { segmentsOf } from "./grid.mts";
const { storeys } = readBreuer(process.argv[2]!);
const st = storeys.find((s) => s.id === "שיפוע")!;
const L = /^(M2207|M2202|M2220|M4804|M2602|M1010|C1660|C1610|M2603|M2412|M2417|M2601|M2802|55|gvul|wall|TR_YXZ|M2801)$/;
const out: Array<{ l: string; s: number[][] }> = [];
const txt: Array<{ l: string; x: number; y: number; t: string }> = [];
for (const p of st.pieces) {
  if (!L.test(p.layer)) continue;
  if (p.layer === "wall" && p.path.some((n) => /A\$C2edb/.test(n))) continue;
  for (const [a, b] of segmentsOf(p)) out.push({ l: p.layer, s: [[a.x - st.origin.x, a.y - st.origin.y], [b.x - st.origin.x, b.y - st.origin.y]] });
  if (p.text && p.at) txt.push({ l: p.layer, x: p.at.x - st.origin.x, y: p.at.y - st.origin.y, t: p.text });
  if (p.type === "INSERT" && p.at && p.attribs) for (const a of p.attribs) if (a.text.trim()) txt.push({ l: p.layer + ":" + a.tag, x: p.at.x - st.origin.x, y: p.at.y - st.origin.y, t: a.text });
}
fs.writeFileSync(process.argv[3]!, JSON.stringify({ out, txt }));
console.log(out.length, txt.length);
