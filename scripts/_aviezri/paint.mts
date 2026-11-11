// Aviezri synagogue: the chosen free renders painted (paid image calls) through the platform painter (paintHousePictures:
// judge, repairs, spend cap), with a look of the building's own, read from its photos (IMG_9805, 20261105_114605, the 2018
// aerial) and the concept sketch: cream Jerusalem stone over the existing kindergarten storey's pale plaster, slim dark-grey
// window frames, a stone walk with stone parapets over a sunken yard. Every attempt is kept.
// DRY=1 prints the text that would be sent and stops (free).
// ALLOW_PAID_AI=1 npx tsx --env-file=.env.local --conditions=react-server scripts/_aviezri/paint.mts <renders dir> <out dir> <ceiling ₪> [size 1K|2K|4K] [names]
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
export const AVIEZRI_LOOK = [
  "This image is an exact architectural render of a synagogue being extended in a quiet hillside residential neighbourhood in Israel. Repaint it as an unretouched professional architectural photograph, taken on a full-frame camera with a tilt-shift lens at f/8: true-to-life colour, natural dynamic range, real light. It must look photographed, not rendered: no airbrushing, no bloom or haze over the building, no oversaturation.",
  "KEEP EXACTLY: the camera position, lens and framing; every wall, cornice, arch, window, mullion, door, parapet, stair, bridge, slab and roof edge in the same place and size. Do NOT add, remove, move or resize anything. Do NOT add windows, doors, balconies, storeys, signs, logos or any lettering; the only lettering is the Hebrew name already drawn on the arched panel over the entrance — keep those letters exactly as drawn, crisp, in dark bronze. There are NO people: no person or human figure anywhere.",
  "The upper storeys are honed cream Jerusalem limestone in even horizontal courses with fine joints, exactly where the render draws stone, newly built and clean; the cornices are smooth dressed stone of the same cream; each arched window has a smooth stone surround. The windows are tall arched windows in slim dark-grey aluminium frames with the mullions and transoms drawn, real clear glass with soft reflections of the sky. The low storey under the stone, the existing kindergarten floor, is smooth pale off-white plaster exactly where the render draws it. The walk, the bridges, the stairs and their parapets are the same cream stone with a lighter flat coping; the yard below is green synthetic grass where drawn and pale paving elsewhere; the street is dark asphalt.",
  "Clear late-afternoon light: the sun low in the west, warm but not orange, raking the stone so its grain and joints read, soft shadows, the shaded faces cool and full of detail. A calm clear sky, soft blue fading paler at the horizon, a few thin clouds. Far off along the horizon only, low and soft in distance haze, the pale stone apartment buildings of the neighbourhood, never in front of the building.",
  "Tack-sharp from front to back.",
].join(" ");
export const AVIEZRI_INTERIOR_LOOK = [
  "This image is an exact architectural render of the inside of a newly built Orthodox synagogue in Israel (beit midrash halls, a women's gallery, a hall of tables, an entrance hall). Repaint it as an unretouched professional interior photograph, full-frame camera, eye height, verticals straight, true-to-life colour and natural dynamic range. It must look photographed, not rendered: no airbrushing, no bloom, no oversaturation.",
  "KEEP EXACTLY: the camera position, lens and framing; every wall, column, arch, window, door, stair, rail, parapet and ceiling edge, and every piece of furniture — each pew and its shtender, the bimah and its rails, each Aron Kodesh with its parochet and columns, each amud, the rav's chair, each table and chair, each bookcase, coat hook, counter, sink, fridge and toilet cubicle — in the same place, size and count. Do NOT add, remove, move or resize anything. Add no people, no chandeliers or lamps beyond the lights the render draws, no books on the pews or tables, no screens, signs, posters, lettering or symbols.",
  "Real materials exactly where the render draws them: walnut-stained solid wood pews, shtenders, tables, ark and bookcases with visible grain; the pews' seats and backs upholstered in deep red fabric where the render shows red; the parochet deep red velvet with a fine gold border; the bookcases holding rows of dark leather-bound sefarim with gold spines; smooth warm-white plaster walls and ceilings with the flush downlights the render draws, lit; honed cream Jerusalem stone round the arched windows; large pale porcelain floor tiles with fine joints, matt grey stone treads on the stairs; clear glass rails and window glass with slim dark-grey aluminium frames; brushed steel where the render draws steel; white ceramic and pale quartz in the washrooms.",
  "Light: soft daylight through the tall arched windows with the view outside bright and gently overexposed, mixed with the warm-white downlights glowing evenly; natural bounce light, soft contact shadows under every pew and table, the ceilings bright and clean, never grey or dirty. Calm, dignified, tack-sharp from front to back.",
].join(" ");
if (process.env.DRY === "1") { console.log(`size ${size}\n\nEXTERIOR\n${AVIEZRI_LOOK}\n\nINTERIOR (view-in-*)\n${AVIEZRI_INTERIOR_LOOK}`); process.exit(0); }
if (process.env.ALLOW_PAID_AI !== "1") throw new Error("set ALLOW_PAID_AI=1: this run pays for its paintings");
const ceiling = Number(ceilingArg);
if (!(ceiling > 0 && ceiling <= 15)) throw new Error(`ceiling ₪${ceilingArg} — give one between 0 and 15`);

const kind: Kind = { kind: "exterior", look: AVIEZRI_LOOK, whole: true, local: true, railings: false, minEdges: FINISH_MIN_EDGES, minMasses: FINISH_MIN_MASSES, attempts: 3, imageSize: size };
const inside: Kind = { kind: "interior", look: AVIEZRI_INTERIOR_LOOK, local: "interior", railings: false, minEdges: FINISH_MIN_EDGES, minMasses: FINISH_MIN_MASSES, attempts: 3, imageSize: size };
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
      subject: "בית כנסת אבי עזרי",
      style: resolveFloorplanVizStyle(undefined),
      say,
      spend,
      models: houseImageModels(),
      group: "אבי עזרי",
      lookOf: (n) => (wanted.includes(n) ? (n.startsWith("view-in-") ? inside : kind) : null),
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
