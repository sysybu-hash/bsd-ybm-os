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

const PLAN = "This is an exact top-down orthographic view of a floor plan cut through the walls, seen straight from above. Keep it perfectly top-down and flat — no perspective, no tilt. Keep every wall, door opening, stair and piece of furniture exactly where it is. The white area is paper: keep it white.";
const TOP = "This is an exact top-down orthographic aerial view, straight down. Keep it perfectly flat-on, no perspective. Keep every roof edge, parking bay line, car, tree, road and building outline exactly.";
const SIGN = "Where the render has Hebrew lettering on the dark band, keep that band dark and plain; the lettering is added afterwards.";
const VIEWS: Record<string, [Kind, string, string]> = {
  "s01-north": ["elevation", "north elevation of a stone-clad teachers' centre above an existing kindergarten", SIGN],
  "s02-site": ["exterior", "site plan seen from above: the building, its roof car park, the street and the slope", TOP],
  "s03-roof-top": ["exterior", "upper roof seen from above: the car park, the roof plaza, the lift bulkhead", TOP],
  "s04-roof": ["exterior", "roof seen from above: the car park and the roof plaza", TOP],
  "s05-floor-1": ["cutaway", "upper floor plan: learning spaces, lobby with a double-height void and open stair, offices, workshop, multi-purpose hall with raked seating", PLAN],
  "s06-floor-2": ["cutaway", "lower floor plan: computer rooms, classrooms, support rooms, lobby and stair, colonnade", PLAN],
  "s07-future": ["cutaway", "upper floor future plan: a 236 m² events hall with round banquet tables, kitchen, lobby, workshop, multi-purpose hall", PLAN],
  "s08-north": ["elevation", "north elevation of a stone-clad teachers' centre above an existing kindergarten", SIGN],
  "s08-south": ["elevation", "south elevation over the sunken courtyard, with the colonnade and the accessible ramp", "Keep it a flat orthographic elevation with the same outline: the stone building, its windows, the columns of the colonnade, the glass ramp railing and the brown cut ground exactly where they are. Do not add trees, people, sky features or ground planting in front of the building."],
  "s09-east": ["elevation", "east elevation, the new building above the existing kindergarten", ""],
  "s09-west": ["elevation", "west elevation, the new building above the existing kindergarten", ""],
  "s10-aa": ["section", "long section A-A through both floors and the existing kindergarten", ""],
  "s10-bb": ["section", "cross section B-B through the multi-purpose hall with raked seating", ""],
  "s10-cc": ["section", "cross section C-C through the lift and the lobby", ""],
  "s11-dd": ["section", "cross section D-D through the stair from the street to the courtyard", ""],
};
const SECTION =
  "This is an architectural section. The flat grey-brown solid at the bottom is the existing kindergarten cut through, drawn solid: keep it a flat solid cut face — no rooms, windows or furniture in it. The dark brown mass is cut earth: keep it solid. Keep exactly the furniture shown in the rooms — no sofas, beds or televisions.";

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
  const meta = await sharp(render).metadata();
  // The model draws at about 1.5 megapixels: hand it the render at that size.
  const input = await sharp(render).resize({ width: 2048, height: 2048, fit: "inside" }).jpeg({ quality: 93 }).toBuffer();
  let best: { image: Buffer; score: number } | null = null;
  for (let t = 0; t < TRIES; t++) {
    calls++;
    const prompt = [finishPrompt(kind, subject), kind === "section" ? SECTION : "", focus].filter(Boolean).join("\n");
    const got = await finishPass(client, prompt, input);
    if (!got) continue;
    const fitted = await sharp(got.image).resize(meta.width, meta.height, { fit: "fill", kernel: "lanczos3" }).jpeg({ quality: 94 }).toBuffer();
    const score = await structuralMatch(render, fitted);
    console.log(`${id}: try ${t + 1} match ${score.toFixed(3)}`);
    fs.writeFileSync(path.join(dir, `${id}.try${t + 1}.jpg`), fitted);
    if (!best || score > best.score) best = { image: fitted, score };
    if (score >= PASS) break;
  }
  fs.writeFileSync(path.join(dir, `${id}.finished.jpg`), best && best.score >= PASS ? best.image : render);
}
console.log(`calls ${calls}`);
