import { readBreuer } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const s = storeys.find((x) => x.id === "שיפוע")!;
const cp = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š", heb = "אבגדהוזחטיךכלםמןנסעףפץצקרשת";
const dec = (t: string) => [...t].map((c) => { const i = cp.indexOf(c); return i >= 0 ? heb[i] : c; }).join("");
for (const p of s.pieces) if (p.type === "INSERT" && p.path.includes("A$C2edb726f")) console.log(p.layer, p.insert, (p.at!.x - s.origin.x).toFixed(0), (p.at!.y - s.origin.y).toFixed(0), (p.attribs ?? []).map((a) => a.tag + "=" + dec(a.text)).join(";"));
