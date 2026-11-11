// The polylines of chosen survey layers on the slope tab, plot-local cm, plus the plot.
import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const st = storeys.find((s) => s.id === (process.argv[4] ?? "שיפוע"))!;
const re = new RegExp(`^(${process.argv[3]})$`);
for (const p of st.pieces) {
  if (!re.test(p.layer)) continue;
  const pts = p.pts ?? (p.rings?.[0] ?? []);
  console.log(p.layer, p.type, p.insert ?? "", (p as { closed?: boolean }).closed ? "closed" : "", pts.map((q) => `${(q.x - st.origin.x).toFixed(0)},${(q.y - st.origin.y).toFixed(0)}`).join(" "));
}
