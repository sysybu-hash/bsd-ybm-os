// Factory (Delicatess, Kiryat Arba): the chosen free renders painted (paid image calls) through the platform painter
// (paintHousePictures: judge, repairs, spend cap), with looks of the factory's own — an industrial food plant on a Judean-hills
// slope, its interiors white hygienic production halls, its dollhouses a cut model. Every attempt is kept.
// DRY=1 prints the texts that would be sent and stops (free).
// ALLOW_PAID_AI=1 npx tsx --env-file=.env.local --conditions=react-server scripts/_factory/paint.mts <renders dir> <out dir> <ceiling ₪> [size 1K|2K|4K] [names]
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
const KEEP = "KEEP EXACTLY: the camera position, lens and framing; every wall, column, slab, door, window, roller door, canopy, ramp, parapet, fence, gate, wall, kerb, pole and wire in the same place and size; every truck, car, tree, shrub, machine, table, rack, crate and worker where it is, its size, its colour and its count. Do NOT add, remove, move or resize anything. Do NOT add windows, doors, storeys, signs, lettering or logos. Do NOT change the building's proportions.";
// The user, 2026-11-10 (approving the paint): "add, in the remaining empty areas, vegetation, signage, lawns — a natural industrial
// surrounding". Only the EMPTY ground is dressed; the drawn site stays exactly as drawn (KEEP).
// NO_ADD=1: the ground is left as drawn — the dressing above made the judge refuse every exterior (2026-11-11)
const ADD = process.env.NO_ADD === "1" ? "Add nothing at all: the bare land round the plot stays bare dry Judean-hills ground, no buildings, roads, lawns or signs added." : "THE ONE EXCEPTION TO 'do not add': the empty bare ground — the open land round the plot and beyond the road, and bare unpaved patches inside the plot — is dressed as a well-kept, natural industrial zone in the Judean hills: neat irrigated lawns along the road verges and the plot's front; planted beds of rosemary, lavender and low Mediterranean shrubs; a few young olive and carob trees in rows along the road; and, further back on the open land, the low, plain light-grey and stone-faced sheds and workshops of neighbouring industrial plots with their own fences, set well behind, never in front of or touching this factory, its yard, ramp, trucks or cars. Signage, small and real: on the factory's facade beside the main gate one clean company sign of plain bold capital letters reading DELICATESS; at the gate a small post sign; at the drive's mouth a standard red-and-white 'no entry' sign on the exit lane and a white directional arrow sign 'TRUCKS' — nothing else lettered. Nothing is added on the asphalt, the paving, the ramp, the building or in front of the cameras.";
export const FACTORY_EXTERIOR = [
  "This image is an exact architectural render of a new meat-products factory on a gently sloping plot in the industrial zone of Kiryat Arba, in the Judean hills. Repaint it as an unretouched professional architectural photograph, full-frame camera, tilt-shift lens at f/8: true-to-life colour, natural dynamic range, real light. It must look photographed, not rendered: no airbrushing, no bloom or haze over the building, no oversaturation.",
  KEEP,
  "The factory's walls are smooth pale-grey insulated metal sandwich panels in long horizontal bands with crisp joints, newly built and clean; the plinth and the parapets fair-faced concrete; the loading docks are 3.2 m sectional doors under dark steel canopies, each framed by a black rubber dock seal with two bumpers, a truck backed into the seal with its rear doors folded open; a high band of fixed glazing runs along the walls under the parapet, and the offices have ordinary windows; the glass real glazing with soft sky reflections. The truck ramp is a sloped raised road climbing from the ground to the first floor: a dark asphalt deck on an earth fill faced with stone retaining walls, a low concrete kerb and a steel guard rail of two rails along its open edges; it rises the whole way to the raised lane on the columns along the building, exactly as the render slopes it — never flattened into a road on the ground, never ended at a gate or a wall, no barrier or gate across it. Both ramps start and end inside the site fence on a short level asphalt landing beside the parking yard; the fence runs closed past their ends — trucks come and go through the yard and the gate. The old site walls are rough local limestone with a concrete cap; the fence and gates dark steel.",
  "The site: the asphalt yard, drive and road are real dark asphalt with their white markings, the paving light concrete pavers, the kerbs grey concrete, all continuous to the frame's edge as the render lays them — no gap, step or end in them. The planted strips are low green shrubs in brown mulch; the grass verges a dry Mediterranean green. The trucks are real refrigerated delivery trucks, white and grey boxes on dark cabs, the cars real clean modern cars of the colours drawn, with real glass, tyres and reflections. The bare land round the plot is dry Judean-hills ground: pale terra-rossa earth, scattered limestone rocks, low dry grass and a few olive trees and scrub, at the level the render draws it, never a cliff or a mound; far off on the horizon only, soft in the haze, rounded hills with terraces.",
  "Clear late-morning light: a high bright sun from the side, crisp but soft-edged shadows, a clean blue sky with a few light clouds. No people.",
  ADD,
  "Tack-sharp from front to back.",
].join(" ");
export const FACTORY_INTERIOR = [
  "This image is an exact render of a room inside a new meat-products factory. Repaint it as an unretouched professional photograph of a working, spotless food plant, full-frame camera, wide lens at f/8: true-to-life colour, real light. It must look photographed, not rendered.",
  KEEP,
  "Walls and ceilings are white hygienic food-grade insulated panels with neat joints and coved corners; the floor seamless light-grey epoxy resin, satin, with soft reflections; the machines, tables, sinks and racks brushed stainless steel; the crates food-grade plastic of the colours drawn; the doors white panel or steel as drawn. Bright even 5000 K light from flush LED panels in the ceiling, soft shadows, no glare. The workers wear white coats, white hairnets and caps, white boots and blue gloves, as drawn — real people at work, their faces calm and natural, never distorted.",
  "Tack-sharp from front to back.",
].join(" ");
export const FACTORY_DOLLHOUSE = [
  "This image is an exact cutaway render of a new meat-products factory seen from above at an angle, the roof and upper walls cut away to show one storey's rooms. Repaint it as a high-end architectural cutaway model photograph: true-to-life materials, soft daylight from above, gentle ambient occlusion in the corners, crisp cut wall tops in plain white.",
  KEEP,
  "Inside: white hygienic panel walls, light-grey epoxy floors, brushed stainless-steel machines and tables, plastic crates of the colours drawn, workers in white. Outside: the asphalt yard and drive with white markings, light pavers, grey kerbs, real trucks and cars, limestone site walls, dry green verges, the bare land pale earth with scattered rocks — at the level the render draws it.",
  ADD,
  "Tack-sharp from front to back.",
].join(" ");
// Per-view notes (2026-11-11): two south-east views of option 1 failed three rounds — the painter filled the bare slope in front of
// the building with a car park, a gate or a road, and ran the raised lane out to the street. Each note says what the render shows there.
const FRONT_BARE = "IN THIS VIEW, EXACTLY AS RENDERED: the ground in front of the building's near (south) face, below the row of columns, is the plot's bare natural slope of pale earth — NO car park, NO paving, NO parking lines, NO road, NO drive, NO gate, NO fence and NO garden there. The raised lane along the building's left side stays up at the deck level on its stone wall and meets the ground only at the far end, by the street behind the building; it never comes down to the front and never leads out to a road or a gate. The street on the right and behind stays exactly where it is, as wide as drawn, with NO vehicles on it. The green strip with the earth path on the left stays a green strip. The two dock doors on the upper facade stand closed with NO truck at them in this view — none is added; the parking yard, the gate and the ramps' landings are behind the building, out of sight here, and are not drawn in front. Keep the camera exactly: the building the same size and in the same place in the frame.";
const VIEW_NOTES: Record<string, string> = { "view-out-aerial-se.jpg": FRONT_BARE, "view-doll-first-se.jpg": FRONT_BARE };
const lookFor = (n: string) => [lookForBase(n), VIEW_NOTES[n] ?? ""].filter(Boolean).join(" ");
const lookForBase = (n: string) => (/^view-in-/.test(n) ? FACTORY_INTERIOR : /^view-doll-/.test(n) ? FACTORY_DOLLHOUSE : FACTORY_EXTERIOR);
if (process.env.DRY === "1" && process.env.DRY_VIEWS) { for (const v of process.env.DRY_VIEWS.split(",")) console.log(`
— view-${v}.jpg —
${lookFor(`view-${v}.jpg`)}`); process.exit(0); }
if (process.env.DRY === "1") { console.log(`size ${size}\n\n— exterior —\n${FACTORY_EXTERIOR}\n\n— interior —\n${FACTORY_INTERIOR}\n\n— dollhouse —\n${FACTORY_DOLLHOUSE}`); process.exit(0); }
if (process.env.ALLOW_PAID_AI !== "1") throw new Error("set ALLOW_PAID_AI=1: this run pays for its paintings");
const ceiling = Number(ceilingArg);
if (!(ceiling > 0 && ceiling <= 15)) throw new Error(`ceiling ₪${ceilingArg} — give one between 0 and 15`);

const kindOf = (n: string): Kind => ({ kind: /^view-in-/.test(n) ? "interior" : /^view-doll-/.test(n) ? "cutaway" : "exterior", look: lookFor(n), whole: true, local: /^view-in-/.test(n) ? "interior" : true, railings: false, minEdges: FINISH_MIN_EDGES, minMasses: FINISH_MIN_MASSES, attempts: 3, imageSize: size });
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
      subject: "מפעל דליקטס קריית ארבע",
      style: resolveFloorplanVizStyle(undefined),
      say,
      spend,
      models: houseImageModels(),
      group: "מפעל דליקטס",
      lookOf: (n) => (wanted.includes(n) ? kindOf(n) : null),
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
