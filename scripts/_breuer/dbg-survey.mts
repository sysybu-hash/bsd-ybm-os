import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const s = storeys.find((x) => x.id === "שיפוע")!;
const sv = s.pieces.filter((p) => p.path.includes("A$C2edb726f"));
const m = new Map<string, number>();
for (const p of sv) { const k = `${p.type} ${p.layer} ${p.path.slice(p.path.indexOf("A$C2edb726f") + 1).join(">")}`; m.set(k, (m.get(k) ?? 0) + 1); }
console.log([...m].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => n + " " + k).join("\n"));
// design level marks in ק / שיפוע / מרתף
for (const id of ["ק", "שיפוע"]) { const st = storeys.find((x) => x.id === id)!; for (const p of st.pieces) if (p.text && /^[±+\-]?\d+\.\d\d/.test(p.text) && !p.path.includes("A$C2edb726f") && !p.dimension) console.log(id, p.layer, p.path.join(">"), (p.at!.x - st.origin.x).toFixed(0), (p.at!.y - st.origin.y).toFixed(0), p.text); }
