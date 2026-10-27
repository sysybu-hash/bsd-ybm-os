#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה's free renders (render-pisga.mts, NOSIGN=1, OUT=2400) painted as photographs with Nano Banana 2.1 at 2K,
 * through the house pipeline (frame, edge/mass/part checks, repair, every attempt kept) — the route that held on Wolf.
 *
 *   npx tsx --env-file=../../../.env.local --conditions=react-server scripts/paint-pisga.mts
 *
 * Without PAINT=1 nothing is paid: it writes and prints each exact prompt and the estimate. PAINT=1 ALLOW_PAID_AI=1
 * paints, at most BUDGET_ILS (25). PLATES / OUT pick the folders; ONLY=<view,view> paints those views alone.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GEMINI_IMAGE_NANO_BANANA_21_MODEL } from "@/lib/gemini-model";
import { attemptEstimateUsd, houseAttemptsPerPicture, houseSpend, spentSoFar, type HouseImageSize } from "@/lib/projects/building/house-cost";
import { paintHousePictures } from "@/lib/projects/building/house-photoreal";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";

const root = "C:/Users/User/Desktop/BSD-YBM-OS/previews/pisga-2026-10-27";
// Raster plates (PT=0): traced frames of this model came back with walls missing and rooms scrambled on 2026-10-27.
const plates = process.env.PLATES ?? path.join(root, "plates-raster");
const out = process.env.OUT ?? path.join(root, "paint");
const SIZE: HouseImageSize = "2K";
const MODEL = GEMINI_IMAGE_NANO_BANANA_21_MODEL;

// Every element the model draws is named as what it is: a part the prompt leaves unnamed, or calls by a vague word, is what the painter drops (Wolf, 2026-10-26).
const COMMON = [
  "TASK: turn this exact 3D render of a real building into an unretouched architectural photograph of the same scene, taken from exactly the same camera. Re-surface only: a real material on every surface and real light. The render is the sole authority on what stands where — do not redesign, improve, add or remove anything.",
  "FRAME LOCK: the same camera, lens, horizon and framing. Every edge, corner, slab, window, door, railing, stair, post, tree and piece of furniture stays at the same place in the frame and the same size; every line of the render falls on the painting's. Do not zoom, crop, recentre, straighten or widen the view. The same number of storeys, windows, window panes, doors, railing bars, stair treads and trees as the render.",
];

const OUTSIDE = [
  ...COMMON,
  "THE BUILDING: מרכז פסגה, a two-storey teachers' centre on a hillside in Kiryat Arba, built on top of an existing two-storey stone kindergarten that steps down the slope below it.",
  "STONE: every stone-clad wall is honed sand-cream limestone (Jerusalem stone), never white: laid in horizontal courses 30–40 cm high exactly as the render's courses run, slabs of varying length, thin mortar joints, a gentle tone variation from slab to slab. The existing kindergarten below is the same stone, a little older and weathered. Bare concrete walls (retaining walls, ramp piers, the stair flights) stay smooth grey fair-faced concrete.",
  "THE DARK BAND: the plain dark charcoal band along the top of the north facade's parapet stays exactly as drawn, its length and height, matte dark grey stone — no lettering, logo or sign is added on it or anywhere.",
  "WINDOWS AND GLASS: every window frame, mullion and transom is dark anthracite-grey aluminium, exactly where the render draws it; the double-height glass curtain wall on the north keeps every mullion and transom as drawn, real clear glass reflecting the sky with the lobby and its stair seen through it as the render shows them. Each door stays a door: its frame, leaves, glass and handle.",
  "RAILINGS: every railing the render draws — round the terraces, decks, ramp, stairs and roof edges — is a black steel bar railing with a flat top rail, the same height, length, post spacing and bar count, kept wherever the render draws one and nowhere else. Never remove, lower or shorten a railing, never turn it into glass.",
  "THE COVERED RAMP: the long sloping accessible ramp is kept exactly: its dark blue-grey metal roof, its slim supports and piers, its railings, the same length and slope.",
  "STAIRS AND DECKS: every outdoor stair keeps each tread as drawn, pale concrete with dark steel handrails; the grated steel decks stay open steel grating; the terrace and plaza paving is light grey concrete pavers with fine joints, exactly where the render paves.",
  "THE ROOF: the roof car park keeps its dark asphalt, its white bay lines and every car the render parks there, the same cars in the same bays; the stone lift and stair bulkhead stays a plain stone box; add no tanks, panels, dishes, antennas, plants or people on any roof.",
  "GROUND AND STREET: the hillside is dry pale earth with sparse dry grass and small stones, exactly where the render's banks and slopes run; the street is dark asphalt with its white lane lines, crossing and kerbs as drawn, the parked cars as drawn. Every tree the render draws is a real tree in full leaf where it stands and its size, and no other tree. Add nothing: no people, extra cars, benches, signs, text or logos.",
  "LIGHT: a clear late-afternoon sun, warm and fairly low, raking across the stone so its joints read; soft natural shadows; shaded faces cool and full of detail; a real clear sky with a few thin clouds. Photographed on a full-frame camera at f/8: true-to-life colour, natural dynamic range, tack-sharp, no bloom, haze, airbrushing or oversaturation — it must look photographed, not rendered.",
];

const INSIDE = [
  ...COMMON,
  "THE ROOM: inside מרכז פסגה, a newly built teachers' centre. Every piece the render stands — each desk, table, chair, auditorium seat, worktop, whiteboard, shelf, stair, planter and door — stays exactly the piece it is, where it is, its size and its count; add no furniture, and no television, screen or projector screen anywhere the render draws none.",
  "SURFACES: smooth white plaster walls and ceilings; the ceiling's square light panels stay where they are, lit; timber floors are oak boards with their grain and joints, stone and porcelain floors with their joints; wooden slat walls keep every slat; tables and desktops as their render colours, real oak or white laminate; chairs and auditorium seats in deep teal upholstery with visible weave; window frames dark anthracite-grey aluminium, the view outside real hillside and sky as the render frames it.",
  "LIGHT: soft daylight through the windows with the ceiling panels on, true-to-life colour, natural dynamic range, real texture and soft shadow, verticals straight, nothing airbrushed — it must look photographed, not rendered. No people.",
];

// The pipeline picks a picture's checks by its name: high aerials as view-aerial-* (railings checked), the rest from outside as view-corner-*, rooms as view-room-*.
const VIEWS: Record<string, { name: string; look: string }> = {};
for (const v of ["aerial-ne", "aerial-sw", "site", "roof-top"]) VIEWS[v] = { name: `view-aerial-${v.replace(/^aerial-/, "").replace(/-/g, "")}.jpg`, look: OUTSIDE.join("\n") };
for (const v of ["north-facade", "north-terrace", "east-side", "west-side", "end-e", "end-w", "courtyard"]) VIEWS[v] = { name: `view-corner-${v.replace(/-/g, "")}.jpg`, look: OUTSIDE.join("\n") };
for (const v of ["lobby", "hall", "design", "classroom", "computers", "workshop", "event-hall"]) VIEWS[v] = { name: `view-room-${v.replace(/-/g, "")}.jpg`, look: INSIDE.join("\n") };

const files = await readdir(plates);
const only = process.env.ONLY?.split(",");
const pictures = new Map<string, Buffer>();
const looks = new Map<string, string>();
for (const [id, v] of Object.entries(VIEWS)) {
  if (only && !only.includes(id)) continue;
  const file = files.find((f) => new RegExp(`^pisga-(pt\\d+-)?${id}-nosign\\.jpg$`).test(f));
  if (!file) {
    console.warn(`${id}: no plate in ${plates}`);
    continue;
  }
  pictures.set(v.name, await readFile(path.join(plates, file)));
  looks.set(v.name, v.look);
}

await mkdir(path.join(out, "attempts"), { recursive: true });
await writeFile(path.join(out, "prompt-outside.txt"), OUTSIDE.join("\n"));
await writeFile(path.join(out, "prompt-inside.txt"), INSIDE.join("\n"));
const attempts = houseAttemptsPerPicture();
const perCall = attemptEstimateUsd(MODEL, 2, new Date(), SIZE);
console.log(`outside prompt (${OUTSIDE.join("\n").length} chars) and inside prompt (${INSIDE.join("\n").length} chars), sent as is, written to ${out}`);
console.log(`pictures (${pictures.size}): ${[...pictures.keys()].join(", ")}`);
console.log(`model ${MODEL} at ${SIZE}; up to ${attempts} calls a picture; at most ~$${(perCall * attempts * pictures.size).toFixed(2)}, ~$${(perCall * pictures.size).toFixed(2)} if each holds on the first call`);

if (process.env.PAINT !== "1") {
  console.log("\ndry run: nothing was sent. PAINT=1 ALLOW_PAID_AI=1 paints.");
  process.exit(0);
}
const spend = houseSpend({ budgetIls: Number(process.env.BUDGET_ILS ?? 25) });
const set = {
  names: () => [...pictures.keys()],
  get: (n: string) => pictures.get(n),
  set: (n: string, b: Buffer) => void pictures.set(n, b),
};
const painted = await paintHousePictures(set, {
  subject: "מרכז פסגה, a stone-clad teachers' centre on a hillside",
  style: resolveFloorplanVizStyle(null),
  models: [MODEL],
  spend,
  concurrency: 2,
  look: (n) => ({ look: looks.get(n)!, imageSize: SIZE }),
  keep: (n, attempt, b) => void writeFile(path.join(out, "attempts", `${n.replace(/\.jpg$/, "")}-${attempt}.jpg`), b),
  say: (s) => console.log(s),
});
for (const n of painted) await writeFile(path.join(out, n.replace(/^view-(corner|aerial|room)-/, "painted-")), pictures.get(n)!);
const cost = spentSoFar(spend);
console.log(`done: ${painted.length}/${pictures.size} held; spent $${cost.usd.toFixed(2)} (₪${cost.ils.toFixed(2)})`);
