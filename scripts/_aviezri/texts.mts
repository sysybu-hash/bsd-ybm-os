import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { heb } from "./heb.mts";
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(process.argv[2]!)))!;
const box = process.argv[3]?.split(",").map(Number);
for (const p of flattenDxf(d)) {
  const at = p.at; if (!at) continue;
  if (box && (at.x < box[0]! || at.x > box[1]! || at.y < box[2]! || at.y > box[3]!)) continue;
  const t = p.text ?? (p.attribs ?? []).map((a) => a.text).join(" / ");
  if (!t) continue;
  console.log(Math.round(at.x), Math.round(at.y), p.layer, (p.height ?? 0).toFixed(0), heb(t), p.insert ? `[${p.insert}]` : "");
}
