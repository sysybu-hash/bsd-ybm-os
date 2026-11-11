// Breuer 21: the chosen free renders painted (paid image calls) through the platform painter (paintHousePictures: judge, repairs,
// spend cap), with a look of the building's own — a Jerusalem-stone apartment tower on a Bnei Brak street, not the plaster
// house the platform's look is written for. Every attempt is kept.
// DRY=1 prints the text that would be sent and stops (free).
// ALLOW_PAID_AI=1 npx tsx --env-file=.env.local --conditions=react-server scripts/_breuer/paint.mts <renders dir> <out dir> <ceiling ₪> [size 1K|2K|4K] [names]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { houseImageModels } from "@/lib/projects/building/house-booklet-job";
import { costLines, houseSpend, spentSoFar, type HouseImageSize } from "@/lib/projects/building/house-cost";
import { paintHousePictures, type Kind } from "@/lib/projects/building/house-photoreal";
import { FINISH_MIN_EDGES, FINISH_MIN_MASSES } from "@/lib/projects/floorplan-finish-still";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import { runWithAiUsage } from "@/lib/ai-usage";

const [src, out, ceilingArg, sizeArg, namesArg] = process.argv.slice(2) as [string, string, string, string?, string?];
const size = (sizeArg ?? "2K") as HouseImageSize;
// The user, 2026-11-10: "golden hour, soft sun colours, warm light coming from the homes"; cars, no figures; the road whole.
export const BREUER_LOOK = [
  "This image is an exact architectural render of a new stone apartment building standing between two streets in Bnei Brak, Israel. Repaint it as an unretouched professional architectural photograph, taken on a full-frame camera with a tilt-shift lens at f/8: true-to-life colour, natural dynamic range, real light. It must look photographed, not rendered: no airbrushing, no bloom or haze over the building, no oversaturation.",
  "KEEP EXACTLY: the camera position, lens and framing; every wall, stone box, balcony, railing, window, mullion, louvre, slab and roof edge in the same place and size; every tree and every car where it is, its size, its colour and its count. Do NOT add, remove, move or resize anything. Do NOT add windows, doors, balconies, storeys, signs, lettering or logos. Do NOT change the building's proportions. There are NO people: no person or human figure anywhere, not in a car, not on a balcony, not in a window.",
  "The walls are honed cream Jerusalem limestone in even horizontal courses with fine joints, exactly where the render draws stone, newly built and clean: no stains or weathering. The glass is real double glazing with soft reflections of the sky; the balcony railings are glass in slim dark frames as drawn; the louvre screens slim pale aluminium slats.",
  "The streets: the asphalt road, its dashed white centre line and the grey concrete-paver pavements with their kerbs run on unbroken to the edges of the frame, exactly as the render lays them, level and continuous — no gap, step or end in them. The parked and driving cars are real, clean modern cars of the colours drawn, with real glass, tyres and reflections, standing on the road. The bare ground the render draws round the plot and beyond the pavements is level, dry, well-kept urban ground — compacted earth and low dry grass at the same level as the pavement, never falling away and never a mound; far off along the horizon only, low and soft in distance haze, a quiet city of pale stone apartment buildings, never in front of the building or the cars.",
  "Golden hour, gently: the last hour before sunset, the sun low and soft, a pale warm honey light — not deep orange — grazing the stone so its grain and joints read, long soft shadows, the shaded faces cool and full of detail. The sky a calm clear evening sky, soft blue overhead fading to a pale warm peach at the horizon, a few thin clouds faintly lit. Warm 2700 K light glows from inside the homes: in many windows and balcony doors the warm lamplight of the rooms behind the glass, soft and inviting, some rooms brighter, some dim, a few dark — light seen only as its glow, no visible fittings, no glare.",
  "Tack-sharp from front to back.",
].join(" ");
if (process.env.DRY === "1") { console.log(`size ${size}\n\n${BREUER_LOOK}`); process.exit(0); }
if (process.env.ALLOW_PAID_AI !== "1") throw new Error("set ALLOW_PAID_AI=1: this run pays for its paintings");
const ceiling = Number(ceilingArg);
if (!(ceiling > 0 && ceiling <= 10)) throw new Error(`ceiling ₪${ceilingArg} — give one between 0 and 10`);

const kind: Kind = { kind: "exterior", look: BREUER_LOOK, whole: true, local: true, railings: false, minEdges: FINISH_MIN_EDGES, minMasses: FINISH_MIN_MASSES, attempts: 3, imageSize: size };
const set = new Map<string, Buffer>();
for (const f of readdirSync(src)) if (/\.jpg$/.test(f)) set.set(`view-${f}`, readFileSync(path.join(src, f)));
const wanted = namesArg ? namesArg.split(",").map((n) => `view-${n.replace(/\.jpg$/, "")}.jpg`) : [...set.keys()];
mkdirSync(path.join(out, "attempts"), { recursive: true });
const attemptNo = new Map<string, number>();
const spend = houseSpend({ budgetIls: ceiling });
const say = (s: string) => console.log(s);
say(`painting ${wanted.join(", ")} at ${size}, ceiling ₪${ceiling}`);
const done = await runWithAiUsage(spend.ledger, () =>
  paintHousePictures(
    { names: () => [...set.keys()], get: (n: string) => set.get(n), set: (n: string, d: Buffer) => void set.set(n, d) },
    {
      subject: "ברויאר 21",
      style: resolveFloorplanVizStyle(undefined),
      say,
      spend,
      models: houseImageModels(),
      group: "ברויאר 21",
      lookOf: (n) => (wanted.includes(n) ? kind : null),
      only: (n) => wanted.includes(n),
      keep: (name, _attempt, painting) => {
        const k = (attemptNo.get(name) ?? 0) + 1; attemptNo.set(name, k);
        writeFileSync(path.join(out, "attempts", `${name.replace(/^view-|\.jpg$/g, "")}-${k}.jpg`), painting);
      },
    },
  ),
);
for (const n of done) writeFileSync(path.join(out, n.replace(/^view-/, "")), set.get(n)!);
say(`${done.length} of ${wanted.length} painted (held by the judge); spent ₪${spentSoFar(spend).ils.toFixed(2)}`);
for (const line of costLines(spend)) say(line);
