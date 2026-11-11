import { readBreuer } from "./read.mts";
const { storeys, all } = readBreuer(process.argv[2]!);
for (const name of ["מפלס כולל רחוב", "צפון-2"]) {
  const ps = all.filter((p) => p.path.includes(name));
  const byL: Record<string, number> = {}; for (const p of ps) byL[`${p.layer}/${p.text ? "TEXT" : p.type}`] = (byL[`${p.layer}/${p.text ? "TEXT" : p.type}`] ?? 0) + 1;
  const tabs = storeys.filter((s) => s.pieces.some((p) => p.path.includes(name))).map((s) => s.id);
  console.log(name, ps.length, "tabs:", tabs.join(","), JSON.stringify(byL));
  console.log("  texts:", ps.filter((p) => p.text).slice(0, 25).map((p) => p.text).join(" | "));
}
