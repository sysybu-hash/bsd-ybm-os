import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
for (const st of storeys) {
  const ms = st.pieces.filter((p) => p.text && /u\.?k\s*=/i.test(p.text));
  console.log(st.id, ms.length, ms.slice(0, 6).map((p) => `${p.type}${p.dimension ? "D" : ""} ${(p.at!.x - st.origin.x).toFixed(0)},${(p.at!.y - st.origin.y).toFixed(0)} r${(p.rotation ?? 0).toFixed(0)} [${p.path.join(">")}] ${p.text}`).join("\n  "));
}
const a = storeys.find((s) => s.id === "א")!;
for (const p of a.pieces) if (p.text && /u\.?k\s*=/i.test(p.text) && !p.dimension) console.log("mark", (p.at!.x - a.origin.x).toFixed(0), (p.at!.y - a.origin.y).toFixed(0), (p.rotation ?? 0).toFixed(0));
