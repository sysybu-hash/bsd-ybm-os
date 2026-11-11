import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
for (const id of ["ק", "שיפוע", "מרתף", "גג", "פ"]) {
  const s = storeys.find((x) => x.id === id)!;
  const m = new Map<string, number>();
  for (const p of s.pieces) { if (p.path.includes("A$C2edb726f") || p.layer === "dim" || p.path.some((n) => n.startsWith("*D"))) continue; const k = `${p.layer} [${p.path.join(">")}] ${p.type}`; m.set(k, (m.get(k) ?? 0) + 1); }
  console.log("== " + id); console.log([...m].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([k, n]) => n + " " + k).join("\n"));
}
