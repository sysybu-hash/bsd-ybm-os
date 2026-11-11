import { readBreuer, toModel } from "./read.mts";
const { storeys } = readBreuer(process.argv[2]!);
const st = storeys.find((s) => s.id === "ק")!;
const plot = st.pieces.find((p) => p.path.includes("גבולות מעודכנים") && p.layer === "gvul" && p.pts && p.pts.length > 3)!.pts!;
console.log("plot (model m):", plot.map((q) => toModel(st.origin, q).map((v) => v.toFixed(1)).join(",")).join("  "));
for (const p of st.pieces) if (p.text && /גבול מגרש|לחניה/.test(p.text) && p.at) { const [x, z] = toModel(st.origin, p.at); console.log(p.text, "at", x.toFixed(1), z.toFixed(1), "rot", (p as { rotation?: number }).rotation ?? ""); }
