#!/usr/bin/env npx tsx
/**
 * בי"ס וולף — the exterior views painted by Nano Banana 2.1 (PAID, ~$0.05 a picture at 2K), from the free engine's renders.
 *
 *   npx tsx --conditions=react-server scripts/wolf-gemini-paint.mts <plates dir> <out dir> <ids, e.g. ext-7,ext-1> [attempts=1]
 *
 * Each call carries the render (the geometry, first) and one photograph of the building as it stands (materials and colours only).
 * Every attempt is kept in <out>/attempts, with its structural scores in the name; the best one by those scores is <out>/<id>.jpg.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { GoogleGenAI } = await import("@google/genai");
const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
const { finishPass, structuralMatch, massMatch } = await import("@/lib/projects/building/finish");

const [plates, outDir, idList, attemptsArg] = process.argv.slice(2);
if (!plates || !outDir || !idList) throw new Error("usage: <plates dir> <out dir> <ids> [attempts]");
const attempts = Number(attemptsArg ?? 1);
const MODEL = "gemini-nano-banana-2.1";
const REFERENCES = [path.resolve("מערכת הדמיות/סמינר וולף/תמונות קיימות/WhatsApp Image 2026-10-21 at 18.34.16 (1).jpeg")];

export const WOLF_PROMPT = [
  "The first image is a 3D render of a school building (the GEOMETRY). The second image is a line drawing of that same render: every line in it is an edge that must stay where it is. The third image is a photograph of the same building as it stands today: use it for MATERIALS and COLOURS only, never for geometry.",
  "KEEP THE CAMERA EXACTLY: the same viewpoint, the same angle, the same lens, the same framing, the same crop, the horizon at the same height. The building must be seen from the same corner, with the same faces visible and the same perspective as in the render. Count the windows in each row on the render's facades: keep exactly that number in each row, at the same spacing, and the same narrow windows beside the curved corner.",
  "Turn the render into a professional architectural photograph at golden hour, shot by an architectural photographer on a full-frame camera with a 24mm tilt-shift lens: a brand-new, immaculately clean, well-maintained building, natural colour, gentle contrast, soft long shadows, a beautiful sky with a few soft clouds.",
  "Materials as in the photograph: honed sand-cream limestone in neat horizontal courses with thin dark joints (not white, not honey-orange); dark-green painted aluminium window frames, with vertical green security bars on the lower floors' windows; thick cream-ochre concrete canopies over the window rows; intact red-brown interlocking pavers in running bond, clean and evenly swept: no cracks, stains, weeds or debris; the lawn and trees as in the render.",
  "Do NOT move, add or remove anything of the geometry: the same walls, the same windows and doors, the same canopies, the same curved glazed corner, the same roof fence, each where the render has it, the same size and count.",
  "The roof fence has a stone pier every 5 metres and at every corner (so only a few piers, far apart, with wide slatted bays between them), and on top of EVERY pier, without exception, a small lantern with a warm glowing glass and a dark cap: keep every one, none skipped. Black wall lamps glow warm on the stone walls where the render has them.",
  "The yard is beautiful: the paved area is laid with perfectly regular red-brown interlocking pavers in running bond, with a soft natural sheen and gentle tone variation between pavers, crisp and clean, neatly edged where it meets the lawn. The green lawn and the trees round the yard are those of the render: keep every tree where it is, make them real, healthy, lush trees (olive, pine, ficus) with natural foliage, and the lawn a rich, evenly mown natural green.",
  "No people, no cars, no text, no extra buildings or walls, no new trees beyond the render's.",
].join("\n");

fs.mkdirSync(path.join(outDir, "attempts"), { recursive: true });
fs.writeFileSync(path.join(outDir, "prompt.txt"), WOLF_PROMPT, "utf8");
const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const refs = REFERENCES.map((f) => fs.readFileSync(f));

for (const id of idList.split(",")) {
  const render = fs.readFileSync(path.join(plates, `${id}-raw.jpg`));
  const meta = await sharp(render).metadata();
  // The model frames to 3:2: the render (1.6) is padded to it with its own edge rows, so the camera is not re-composed, and the answer is cropped back.
  const pad = Math.round(((meta.width! / 1.5) - meta.height!) / 2);
  const padded = await sharp(render).extend({ top: pad, bottom: pad, extendWith: "copy" }).jpeg({ quality: 93 }).toBuffer();
  const lines = await sharp(padded).greyscale().convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] }).linear(6, 0).negate().jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(outDir, `${id}-lines.jpg`), lines);
  let best: { score: number; file: string } | null = null;
  for (let k = 1; k <= attempts; k++) {
    const res = await finishPass(client, WOLF_PROMPT, [padded, lines, ...refs], [MODEL], "2K");
    if (!res) { console.log(`${id} attempt ${k}: no picture`); continue; }
    const rm = await sharp(res.image).metadata();
    const keepH = Math.round(rm.width! / (meta.width! / meta.height!));
    const cropped = await sharp(res.image).extract({ left: 0, top: Math.round((rm.height! - keepH) / 2), width: rm.width!, height: keepH }).jpeg({ quality: 94 }).toBuffer();
    const s = await structuralMatch(render, cropped);
    const m = await massMatch(render, cropped);
    const score = Math.min(s, m);
    const file = path.join(outDir, "attempts", `${id}-a${k}-s${s.toFixed(2)}-m${m.toFixed(2)}.jpg`);
    fs.writeFileSync(file, cropped);
    console.log(`${id} attempt ${k} (${res.model}): structure ${s.toFixed(2)}, mass ${m.toFixed(2)} -> ${file}`);
    if (!best || score > best.score) best = { score, file };
  }
  if (best) fs.copyFileSync(best.file, path.join(outDir, `${id}.jpg`));
}
process.exit(0);
