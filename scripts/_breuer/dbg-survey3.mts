import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const st = storeys.find((s) => s.id === "שיפוע")!;
for (const L of ["TR_YXZ","M2207","M2202","M2220","M4804","M2602","M1010","C1660","C1610","M2603","M2412","M2417","M2601","M2802","55"]) {
  const ps = st.pieces.filter((p) => p.layer === L);
  const ins = ps.filter((p) => p.type === "INSERT").slice(0, 2).map((p) => `${p.insert} attrs=${JSON.stringify((p as {attrs?: unknown}).attrs ?? (p as {attributes?: unknown}).attributes ?? "")}`.slice(0, 160));
  const poly = ps.filter((p) => p.pts && p.pts.length > 1);
  const len = poly.reduce((s, p) => s + p.pts!.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - p.pts![i]!.x, q.y - p.pts![i]!.y), 0), 0);
  const txt = ps.filter((p) => p.text).slice(0, 3).map((p) => p.text);
  console.log(L, "| n", ps.length, "| polys", poly.length, "len", (len / 100).toFixed(0), "m |", ins.join(" ; "), "|", txt.join(" / "));
}
