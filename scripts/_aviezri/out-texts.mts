import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
const R = readAviezri(process.argv[2]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) for (const p of ps) {
  const t = p.text ?? (p.attribs ?? []).map((a) => a.text).join(" "); if (!t || !p.at) continue;
  const { x, y } = p.at; const out = x < -20 || x > 3165 || y < -20 || y > 3083 || (x > 2480 && y > 1080 && y < 2960) || x < 300;
  if (out) console.log(id, Math.round(x), Math.round(y), p.layer, heb(t));
}
