import { readBreuer } from "./read.mts";
const [file, tabs, re] = process.argv.slice(2);
const { storeys } = readBreuer(file!);
const R = new RegExp(re ?? "%|רמפ|מדרג|שיפוע|גינ|חצר|מעקה", "i");
for (const st of storeys.filter((s) => tabs!.split(",").includes(s.id))) for (const p of st.pieces) {
  if (!p.text || !p.at || p.path.some((n) => n.startsWith("A$C2edb"))) continue;
  if (R.test(p.text)) console.log(st.id, p.layer, JSON.stringify(p.text.slice(0, 60)), (p.at.x - st.origin.x).toFixed(0), (p.at.y - st.origin.y).toFixed(0), p.path.at(-1));
}
