#!/usr/bin/env npx tsx
/**
 * The photographic finish over each sheet-matched render — PAID: one image
 * call a drawing, a second where the first moved the structure.
 *
 *   npx tsx --conditions=react-server scripts/finish-pisga-sheets.mts <views dir> [id…]
 *
 * Writes <id>.finished.jpg — the finish where it keeps the render's structure,
 * the render itself where it does not — for pisga_compose.py to place.
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

const PLAN = "This is an exact top-down orthographic view straight down, a floor plan cut through the walls, WITH ITS WHOLE SURROUNDINGS. Make it a photoreal high-altitude drone photograph of this exact scene with the roof removed: keep the full frame edge to edge — the street with its parking bays, crossing and cars, the sidewalks, the stairs, the trees, the existing kindergarten roofs and the bare ground around, exactly where they are. Do NOT turn it into a model on a white or grey background, do NOT crop, do NOT remove the surroundings. Keep every wall, door opening, stair and piece of furniture exactly where it is and do not add any furniture, kitchen, appliance or room that is not in the render. Keep it perfectly top-down, no perspective."
const TOP = "This is an exact top-down orthographic aerial view, straight down. Keep it perfectly flat-on, no perspective. Keep every roof edge, parking bay line, car, tree, road and building outline exactly.";
const SIGN = "Where the render has Hebrew lettering on the dark band, keep that band dark and plain; the lettering is added afterwards.";
const VIEWS: Record<string, [Kind, string, string]> = {
  "s01-north": ["elevation", "north elevation of a stone-clad teachers' centre above an existing kindergarten", SIGN],
  "s02-site": ["exterior", "site plan seen from above: the building, its roof car park, the street and the slope", TOP],
  "s03-roof-top": ["exterior", "upper roof seen from above: the car park, the roof plaza, the lift bulkhead", TOP],
  "s04-roof": ["exterior", "roof seen from above: the car park and the roof plaza", TOP],
  "s05-floor-1": ["exterior", "upper floor plan: learning spaces, lobby with a double-height void and open stair, offices, workshop, multi-purpose hall with raked seating", PLAN],
  "s06-floor-2": ["exterior", "lower floor plan: computer rooms, classrooms, support rooms, lobby and stair, colonnade", PLAN + " East and north of the building there is ONLY bare sandy ground and the existing flat stone roofs shown — do NOT add any building, tiled roof, courtyard, plaza or structure there."],
  "s07-future": ["exterior", "upper floor future plan: a 236 m² events hall with round banquet tables, kitchen, lobby, workshop, multi-purpose hall", PLAN],
  "s08-north": ["elevation", "north elevation of a stone-clad teachers' centre above an existing kindergarten", SIGN],
  "s08-south": ["elevation", "south elevation over the sunken courtyard, with the colonnade and the accessible ramp", "Keep it a flat orthographic elevation with exactly the same outline and size. The upper floor's wall between the stair tower and the four windows is a PLAIN SOLID stone wall: no recess, box, balcony or opening there. Keep every window, column, the glass ramp railing and the stair tower exactly. Keep the brown cut ground exactly as drawn, including its raised parts left and right. No trees, people or planting."],
  "s09-east": ["elevation", "east elevation, the new building above the existing kindergarten", ""],
  "s09-west": ["elevation", "west elevation, the new building above the existing kindergarten", ""],
  "s10-aa": ["section", "long section A-A through both floors and the existing kindergarten", ""],
  "s10-bb": ["section", "cross section B-B through the multi-purpose hall with raked seating", ""],
  "s10-cc": ["section", "cross section C-C through the lift and the lobby", ""],
  "s11-dd": ["section", "cross section D-D through the stair from the street to the courtyard", ""],
};
const SECTION =
  "STRICT: paint ONLY what the render shows. Every room keeps exactly the furniture drawn in the render — the same tables, chairs and seats in the same places — and NOTHING else: no bar, counter, shelves, bottles, kitchen, appliances, sofas, televisions, screens, artwork, lamps or plants that are not in the render. Outside the building add NOTHING: no cars, trees, people or structures. This is an architectural section. The flat grey-brown solid at the bottom is the existing kindergarten cut through, drawn solid: keep it a flat solid cut face — no rooms, windows or furniture in it. The dark brown mass is cut earth: keep it solid. Keep exactly the furniture shown in the rooms — no sofas, beds or televisions.";

const [dir, ...only] = process.argv.slice(2);
if (!dir) throw new Error("usage: <views dir> [id…]");
const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
const PASS = Number(process.env.FINISH_PASS ?? 0.6);
const TRIES = Number(process.env.TRIES ?? 2);
let calls = 0;
for (const [id, [kind, subject, focus]] of Object.entries(VIEWS)) {
  if (only.length && !only.includes(id)) continue;
  const file = path.join(dir, `${id}.jpg`);
  if (!fs.existsSync(file)) continue;
  const render = fs.readFileSync(file);
    // The model draws at about 1.5 megapixels: hand it the render at that size.
  // An elevation is given the model cropped to its drawing, a little margin
  // round it: the white paper round a flat elevation invites it to redraw.
  let crop: { left: number; top: number; width: number; height: number } | null = null;
  if (kind === "elevation" || kind === "section") {
    const { data, info } = await sharp(render).greyscale().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
    for (let y = 0; y < info.height; y += 2) for (let x = 0; x < info.width; x += 2) {
      if (data[y * info.width + x]! < 236) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const pad = 40;
    if (x1 > x0) crop = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: Math.min(info.width, x1 + pad) - Math.max(0, x0 - pad), height: Math.min(info.height, y1 + pad) - Math.max(0, y0 - pad) };
  }
  const base = crop ? await sharp(render).extract(crop).toBuffer() : render;
  const baseMeta = await sharp(base).metadata();
  const input = await sharp(base).resize({ width: 2048, height: 2048, fit: "inside" }).jpeg({ quality: 93 }).toBuffer();
  let best: { image: Buffer; score: number } | null = null;
  for (let t = 0; t < TRIES; t++) {
    calls++;
    const prompt = [finishPrompt(kind, subject), kind === "section" ? SECTION : "", focus].filter(Boolean).join("\n");
    const got = await finishPass(client, prompt, input);
    if (!got) continue;
    const part = await sharp(got.image).resize(baseMeta.width, baseMeta.height, { fit: "fill", kernel: "lanczos3" }).jpeg({ quality: 94 }).toBuffer();
    const score = await structuralMatch(base, part);
    const fitted = crop
      ? await sharp(render).composite([{ input: part, left: crop.left, top: crop.top }]).jpeg({ quality: 94 }).toBuffer()
      : part;
    console.log(`${id}: try ${t + 1} match ${score.toFixed(3)}`);
    fs.writeFileSync(path.join(dir, `${id}.try${t + 1}.jpg`), fitted);
    if (!best || score > best.score) best = { image: fitted, score };
    if (score >= PASS) break;
  }
  fs.writeFileSync(path.join(dir, `${id}.finished.jpg`), best && best.score >= PASS ? best.image : render);
}
console.log(`calls ${calls}`);
