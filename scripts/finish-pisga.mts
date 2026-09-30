#!/usr/bin/env npx tsx
/**
 * The photographic finish over the measured renders of מרכז פסג"ה — PAID:
 * each view is one image call, two at most, 24 calls in all.
 *
 *   npx tsx --conditions=react-server scripts/finish-pisga.mts <renders dir> [view…]
 *
 * Each finish is laid over its render edge for edge (structuralMatch); one
 * that moved the building is tried once more and otherwise not used.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { GoogleGenAI } = await import("@google/genai");
const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
const { finishPass, finishPrompt, structuralMatch } = await import("@/lib/projects/building/finish");
type Kind = import("@/lib/projects/building/finish").FinishKind;
const sharp = (await import("sharp")).default;

const VIEWS: Record<string, [Kind, string]> = {
  "north-facade": ["exterior", "the north facade of a two-storey stone-clad teachers' centre with a double-height glass curtain wall, standing on an existing kindergarten building"],
  "aerial-ne": ["exterior", "aerial view of the teachers' centre from the north-east, a car park on its roof at street level, the existing kindergarten below"],
  "aerial-sw": ["exterior", "aerial view from the south-west over the street, the roof car park and the building"],
  courtyard: ["exterior", "the sunken south courtyard with a colonnade under the upper floor, a row of trees along the stone retaining wall"],
  "dollhouse-1": ["cutaway", "cutaway of the upper floor: learning spaces, lobby with double-height void, multi-purpose hall with theatre seating, offices"],
  "dollhouse-2": ["cutaway", "cutaway of the lower floor: computer rooms, classrooms, support rooms, lobby with open stair"],
  lobby: ["interior", "the double-height entrance lobby with an open stone stair and a glass curtain wall"],
  hall: ["interior", "a 135 m² multi-purpose hall with teal theatre seats, oak acoustic slat walls and a projection screen"],
  design: ["interior", "a learning-design studio with long oak tables and chairs"],
  workshop: ["interior", "an early-childhood workshop room with tables, chairs and round tables"],
  computers: ["interior", "a computer lab with long white benches and monitors"],
  classroom: ["interior", "a classroom with group tables, chairs and round tables"],
};

/** What the model changed in a view before, said back to it. */
const FOCUS: Record<string, string> = {
  "aerial-ne":
    "CRITICAL for this view: the lower buildings in front (the existing kindergarten) are plain flat-roofed stone boxes with flat paved roofs — no railings, no balconies, no parapets, no terraces, no cantilevers. Do not add any structure to them. The upper building has NO sign on its east side; the only lettering is on the dark band of the north facade, where it already is. Keep the paved platform on the left as a flat slab on the ground.",
  courtyard:
    "CRITICAL for this view: the whole right side of the image is a tall solid stone retaining wall rising to the top edge of the frame — keep it tall and solid, do NOT lower it, do NOT turn it into a low wall or fence, and do NOT show any landscape, sky or view beyond it on the right. The trees stand in one row in front of that wall. The far end of the walkway ends at a stone wall. Keep the colonnade, the overhang and the windows on the left exactly.",
};

const [dir, ...only] = process.argv.slice(2);
if (!dir) throw new Error("usage: <renders dir> [view…]");
const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const out = path.join(dir, "finished");
fs.mkdirSync(out, { recursive: true });
const PASS = Number(process.env.FINISH_PASS ?? 0.55);
let calls = 0;
const report: Array<{ view: string; score: number; used: boolean; model?: string }> = [];
for (const [view, [kind, subject]] of Object.entries(VIEWS)) {
  if (process.env.OVERLAY_ONLY) break;
  if (only.length && !only.includes(view)) continue;
  const render = fs.readFileSync(path.join(dir, `pisga-${view}.jpg`));
  const bare = path.join(dir, `pisga-${view}-nosign.jpg`);
  // The model is given the render with its lettering, so it keeps the band
  // the lettering is on; the letters themselves are drawn back after.
  const input = render;
  const unlettered = fs.existsSync(bare) ? fs.readFileSync(bare) : null;
  const meta = await sharp(render).metadata();
  let best: { image: Buffer; score: number; model: string } | null = null;
  for (let attempt = 0; attempt < Number(process.env.TRIES ?? 2) && calls < 24; attempt++) {
    calls++;
    const t = Date.now();
    const got = await finishPass(client, `${finishPrompt(kind, subject)}\n${FOCUS[view] ?? ""}`, input);
    if (!got) {
      console.log(`${view}: no image (${Date.now() - t}ms)`);
      continue;
    }
    const fitted = await sharp(got.image).resize(meta.width, meta.height, { fit: "fill" }).jpeg({ quality: 93 }).toBuffer();
    const score = await structuralMatch(input, fitted);
    console.log(`${view}: attempt ${attempt + 1} ${got.model} match ${score.toFixed(3)} (${Date.now() - t}ms)`);
    fs.writeFileSync(path.join(out, `pisga-${view}-try${attempt + 1}.jpg`), fitted);
    if (!best || score > best.score) best = { image: fitted, score, model: got.model };
    if (score >= PASS) break;
  }
  const used = !!best && best.score >= PASS;
  let final = used ? best!.image : render;
  if (used && unlettered) final = await letterBack(render, unlettered, final);
  fs.writeFileSync(path.join(out, `pisga-${view}.jpg`), final);
  report.push({ view, score: best?.score ?? 0, used, model: best?.model });
}
if (!process.env.OVERLAY_ONLY) fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ calls, pass: PASS, report }, null, 2));
console.log(`calls ${calls}`);

/**
 * The lettering drawn back by the system: the pixels where the render with its
 * sign differs from the render without it are the letters, and those pixels
 * of the render are laid over the finish.
 */
async function letterBack(withSign: Buffer, without: Buffer, finish: Buffer): Promise<Buffer> {
  const a = await sharp(withSign).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = a.info;
  const b = await sharp(without).removeAlpha().resize(w, h, { fit: "fill" }).raw().toBuffer();
  const out = Buffer.from(await sharp(finish).removeAlpha().resize(w, h, { fit: "fill" }).raw().toBuffer());
  const n = w * h;
  const letter = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const d = Math.abs(a.data[k * 3]! - b[k * 3]!) + Math.abs(a.data[k * 3 + 1]! - b[k * 3 + 1]!) + Math.abs(a.data[k * 3 + 2]! - b[k * 3 + 2]!);
    if (d > 60) letter[k] = 1;
  }
  const grow = (m: Uint8Array, r: number) => {
    const o = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (!m[k]) continue;
      const x = k % w, y = (k - x) / w;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const qx = x + dx, qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h) o[qy * w + qx] = 1;
      }
    }
    return o;
  };
  // The band and its lettering are the system's to draw: the render's own
  // pixels there, over whatever the model painted.
  const drawn = grow(letter, 1);
  for (let k = 0; k < n; k++) if (drawn[k]) for (let c = 0; c < 3; c++) out[k * 3 + c] = a.data[k * 3 + c]!;
  return sharp(out, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 93 }).toBuffer();
}

if (process.env.OVERLAY_ONLY) {
  // Re-draw the system's band and lettering over a finish already paid for.
  const [view, tryFile] = process.env.OVERLAY_ONLY.split(":") as [string, string];
  const render = fs.readFileSync(path.join(dir, `pisga-${view}.jpg`));
  const bare = fs.readFileSync(path.join(dir, `pisga-${view}-nosign.jpg`));
  fs.writeFileSync(path.join(out, `pisga-${view}.jpg`), await letterBack(render, bare, fs.readFileSync(path.join(out, tryFile))));
}
