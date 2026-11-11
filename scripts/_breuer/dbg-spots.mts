import { readBreuer, ABS_ZERO } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const S = storeys.find((s) => s.id === "שיפוע")!;
for (const p of S.pieces) {
  if (p.type !== "INSERT" || !p.path.includes("A$C2edb726f") || p.insert !== "M1502_P" || !p.at) continue;
  const h = p.attribs?.map((a) => `${a.tag}=${a.text}`).join(" ");
  const v = Number(p.attribs?.find((a) => a.tag === "HEIGHT")?.text.match(/(\d+\.\d+)/)?.[1]);
  if (v - ABS_ZERO < -3.8 || v - ABS_ZERO > -1) console.log((p.at.x - S.origin.x).toFixed(0), (p.at.y - S.origin.y).toFixed(0), (v - ABS_ZERO).toFixed(2), h);
}
