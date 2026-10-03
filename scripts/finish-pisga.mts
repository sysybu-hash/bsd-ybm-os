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
  "north-facade": ["exterior", "the north facade of a two-storey stone-clad teachers' centre with a double-height glass curtain wall, standing on the existing two-storey stone kindergarten building"],
  site: ["exterior", "high aerial view of the whole site from the south: the street, the car park entrance, the roof, the sunken courtyard and the existing kindergarten on the slope below"],
  "roof-top": ["exterior", "near top-down aerial view of the roof: the car park with its bays and entrance, the paved roof plaza, the lift bulkhead"],
  "aerial-ne": ["exterior", "aerial view of the teachers' centre from the north-east, a car park on its roof at street level, the existing kindergarten below"],
  "aerial-sw": ["exterior", "aerial view from the south-west over the street, the roof car park and its gated entrance"],
  courtyard: ["exterior", "the sunken south courtyard with a colonnade under the upper floor, a row of trees along the tall stone retaining wall"],
  "elev-north": ["elevation", "north elevation"],
  "elev-south": ["elevation", "south elevation"],
  "elev-east": ["elevation", "east elevation, the new building above the existing kindergarten, the street at the top left"],
  "elev-west": ["elevation", "west elevation, the new building above the existing kindergarten, the street at the top right"],
  "section-aa": ["section", "long section A-A through both floors, the lobby stair and the existing kindergarten below"],
  "section-bb": ["section", "cross section B-B through the multi-purpose hall with its raked theatre seating"],
  "section-dd": ["section", "cross section D-D through the stair from the street down to the courtyard"],
  "dollhouse-1": ["cutaway", "cutaway of the upper floor: learning spaces, lobby with double-height void, multi-purpose hall with raked theatre seating, offices"],
  "dollhouse-2": ["cutaway", "cutaway of the lower floor: computer rooms, classrooms, support rooms, lobby with open stair"],
  "future-dollhouse-1": ["cutaway", "cutaway of the upper floor in its future plan: a 236 m² events hall with round banquet tables, a kitchen, the lobby and the multi-purpose hall"],
  lobby: ["interior", "the double-height entrance lobby with an open stone stair and a glass curtain wall"],
  hall: ["interior", "a 135 m² multi-purpose hall with raked teal theatre seats, oak acoustic slat walls and a projection screen"],
  "future-event-hall": ["interior", "a 236 m² events hall with round banquet tables under white cloths"],
  design: ["interior", "a learning-design studio with long oak tables and chairs"],
  workshop: ["interior", "an early-childhood workshop room with tables, chairs and round tables"],
  computers: ["interior", "a computer lab with long white benches and monitors"],
  classroom: ["interior", "a classroom with group tables, chairs and round tables"],
  lift: ["photo", "an external platform lift for wheelchair access beside a building, up to a balcony"],
};

/** What the model changed in a view before, said back to it. */
const FOCUS: Record<string, string> = {
  "section-aa": "This is an architectural section. The flat grey-brown solid at the bottom is the existing kindergarten cut through, drawn solid (poche): keep it a flat solid cut face — do NOT open it into rooms, windows or furniture. The dark brown mass is cut earth: keep it solid and flat-faced. The rooms above belong to a public teachers' centre: keep exactly the furniture shown — NO sofas, beds, televisions or home furniture.",
  "section-bb": "This is an architectural section. The flat grey-brown solid at the bottom is the existing kindergarten cut through, drawn solid (poche): keep it a flat solid cut face — do NOT open it into rooms, windows or furniture. The dark brown mass is cut earth: keep it solid and flat-faced. The rooms above belong to a public teachers' centre: keep exactly the furniture shown — NO sofas, beds, televisions or home furniture.",
  "section-dd": "This is an architectural section. The flat grey-brown solid at the bottom is the existing kindergarten cut through, drawn solid (poche): keep it a flat solid cut face — do NOT open it into rooms, windows or furniture. The dark brown mass is cut earth: keep it solid and flat-faced. The rooms above belong to a public teachers' centre: keep exactly the furniture shown — NO sofas, beds, televisions or home furniture.",
  "elev-east": "This is a flat orthographic elevation. The brown mass is the ground cut along the face: keep it a solid flat earth section with its exact outline. Keep the existing kindergarten's windows exactly as drawn.",
  "elev-west": "This is a flat orthographic elevation. The brown mass is the ground cut along the face: keep it a solid flat earth section with its exact outline. Keep the existing kindergarten's windows exactly as drawn.",
  workshop: "CRITICAL for this view: the two large dark rectangles on the left wall are WINDOWS — show them as clear glazing with daylight and the hillside outside, not stone or panels.",
  "north-facade": "CRITICAL for this view: in front of the building there is NO road, NO car park and NO cars — only the natural rocky hillside falling away, exactly as the render shows. Keep the lower stone buildings (the existing kindergarten) with their small windows as they are.",
  site: "CRITICAL for this view: keep the building's exact massing — a long flat-roofed block with the car park on its east part of the roof, the stair tower and lift by the entrance, the sunken courtyard and the lower existing buildings. Do not simplify it to one box and do not move the car park off the roof. Keep the street, the crossing and the parked cars where they are.",
  "roof-top": "CRITICAL for this view: this is a plan-like top view. Keep every edge of the roof exactly: the paved plaza on the west, the asphalt car park with its painted bays on the east, the entrance gap in the parapet onto the street, the lift bulkhead, the courtyard and the lower roofs. Do not add planting or trees on the roof. Do not change any outline.",
  courtyard: "CRITICAL for this view: keep the tall solid stone retaining wall on the right rising to the top of the frame, the single row of trees in front of it, the colonnade and the overhang on the left, the walkway ending at a stone wall. No view beyond the wall.",
  lift: "This is the architect's own sketch of the lift. Make it a luxury photograph of the same scene from the same camera: the same wall, the lift tower, the glass platform at the bottom, the balcony with its railing, the window and the pipe, all in place. REMOVE the person and the wheelchair: the glass platform stands empty. Crisp, high resolution.",
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
  for (let attempt = 0; attempt < Number(process.env.TRIES ?? 2) && calls < 60; attempt++) {
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
