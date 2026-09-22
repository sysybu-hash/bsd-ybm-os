

import { type FloorplanLayout } from "@/lib/projects/floorplan-layout";

import {
  buildInkWallJpeg,
  cropFloorplanRasterToUnit,
} from "@/lib/projects/floorplan-photo-prep";

import { type FloorplanVizJobSpec } from "@/lib/projects/floorplan-viz-scope";

import { locatorFocusForGeneration } from "@/lib/projects/floorplan-locator";

import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";

import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-viz-jobs");

/**
 * A picture for the image model, never the PDF itself.
 *
 * Gemini reads a PDF happily when it is answering questions about one. Asked
 * to DRAW from a PDF attachment it treats the sheet as a description rather
 * than a picture to copy, and returns a plausible apartment instead of this
 * one — mirrored, with rooms moved. Every raster path already sends a JPEG;
 * a PDF sheet never was one, which is why the vector plans drifted worst.
 */
export async function planImageForGeneration(plan: {
  mimeType: string;
  base64: string;
}): Promise<{ mimeType: string; base64: string }> {
  if (plan.mimeType !== "application/pdf") return plan;
  const jpeg = await rasterizePdfPageJpeg(Buffer.from(plan.base64, "base64"));
  if (!jpeg) {
    log.warn("could not rasterise the sheet for the image model; sending the PDF");
    return plan;
  }
  return { mimeType: "image/jpeg", base64: jpeg };
}

export const IMAGE_CONCURRENCY = 2;
export type VizJob = FloorplanVizJobSpec & {
  prompt: string;
};

export async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R | null>): Promise<R[]> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out.filter((row): row is R => row != null);
}

export function floorplanOverviewAttachments(input: {
  plan: { mimeType: string; base64: string };
  ink?: string | null;
  massing?: string | null;
  geometryLock?: { mimeType: string; base64: string } | null;
  /** The sheet with every room named on it, when the extractor placed them. */
  planGuide?: { mimeType: string; base64: string } | null;
  /** A schematic of the flat built from where the rooms were read. */
  schematicPlate?: { mimeType: string; base64: string } | null;
  /** The sheet itself, cropped to the flat and washed by room. */
  tintedPlan?: { mimeType: string; base64: string } | null;
}): Array<{ mimeType: string; base64: string }> {
  const inkAtt = input.ink ? [{ mimeType: "image/jpeg" as const, base64: input.ink }] : [];
  const massingAtt = input.massing ? [{ mimeType: "image/jpeg" as const, base64: input.massing }] : [];
  if (input.geometryLock?.base64) {
    // The measured route had the plate and never the washed drawing, and the
    // plate alone is blocks: the model read it as a suggestion and moved
    // דירה 21's kitchen into the living room. The drawing goes first — it is
    // this flat's own ink — and the plate behind it fixes what the ink leaves
    // ambiguous, which is what each enclosure is and how big it is.
    if (input.tintedPlan?.base64) {
      return [input.tintedPlan, input.geometryLock, input.plan, ...inkAtt, ...massingAtt];
    }
    return [input.geometryLock, input.plan, ...inkAtt, ...massingAtt];
  }
  // The sheet's own drawing leads where we have it washed by room: it is this
  // apartment exactly, which no reconstruction of it can be.
  if (input.tintedPlan?.base64) {
    return [input.tintedPlan, input.plan, ...inkAtt, ...massingAtt];
  }
  // The plate leads where there is one: it is a picture of this flat rather
  // than a drawing to interpret, and the model copies a picture far more
  // faithfully than it reads a plan. The named map and the sheet follow.
  if (input.schematicPlate?.base64) {
    const guide = input.planGuide?.base64 ? [input.planGuide] : [];
    return [input.schematicPlate, ...guide, input.plan, ...inkAtt, ...massingAtt];
  }
  // The named map leads: it says where each room goes, and the clean sheet
  // behind it says what is drawn inside them.
  if (input.planGuide?.base64) {
    return [input.planGuide, input.plan, ...inkAtt, ...massingAtt];
  }
  return [input.plan, ...inkAtt, ...massingAtt];
}

export async function attachmentsForJob(
  job: VizJob,
  plan: { base64: string; mimeType: string },
  ink: string | null,
  massing: string | null,
  layout: FloorplanLayout,
  overviewStill?: { mimeType: string; base64: string } | null,
  geometryLock?: { mimeType: string; base64: string } | null,
  planGuide?: { mimeType: string; base64: string } | null,
  schematicPlate?: { mimeType: string; base64: string } | null,
  tintedPlan?: { mimeType: string; base64: string } | null,
): Promise<Array<{ mimeType: string; base64: string }>> {
  const planImage = await planImageForGeneration(plan);
  if (job.viewId === "interior") {
    const focus = locatorFocusForGeneration(layout, "interior", job.roomName);
    const cropped = await cropFloorplanRasterToUnit(planImage.base64, planImage.mimeType, focus.crop);
    const cropB64 = cropped?.base64 ?? planImage.base64;
    const cropMime = cropped?.mimeType ?? planImage.mimeType;
    const roomInk = await buildInkWallJpeg(cropB64);
    return roomInk
      ? [
          { mimeType: cropMime, base64: cropB64 },
          { mimeType: "image/jpeg", base64: roomInk },
        ]
      : [{ mimeType: cropMime, base64: cropB64 }];
  }
  const planAtt = floorplanOverviewAttachments({
    plan: planImage,
    ink,
    massing,
    geometryLock,
    planGuide,
    schematicPlate,
    tintedPlan,
  });
  if (job.viewId === "isometric" && overviewStill?.base64) {
    planAtt.push(overviewStill);
  }
  return planAtt;
}

/**
 * Turns an audit failure into an instruction.
 *
 * Echoing "1 screen(s) in a haredi still" back at the model told it something
 * was wrong and nothing about what to do instead, and it drew a screen again on
 * all three attempts. Naming the fix — take the panel off the wall, leave the
 * wall bare — is what the retry actually needs.
 */
export function remedyFor(failure: string): string {
  if (/screen/i.test(failure)) {
    return "Remove every screen AND whatever it rests on. Take the dark panel off the wall, delete the media unit facing the sofa, and clear every desk, shelf and bedside table of anything dark and rectangular — a closed laptop counts. A desk keeps only closed books, a lamp and a pen cup. Put NOTHING in the screen's place: that wall stays bare and the floor in front of it stays clear. Never lay a picture, a canvas or a panel flat on the floor — the only rectangle on a floor is an area rug.";
  }
  if (/kitchen sink basins/i.test(failure)) {
    return "Redraw the kitchen sink with exactly the basin count the plan draws — a double-bowl sink is two basins side by side in one counter cut-out, not one large basin.";
  }
  if (/island stools/i.test(failure)) {
    return "Put exactly the drawn number of stools at the island, evenly spaced along its long side.";
  }
  if (/double bed/i.test(failure)) {
    return "Replace EVERY wide mattress with a single 90x200 twin along the long wall — long narrow rectangle, more than twice as long as it is wide, ONE pillow, ONE headboard, at most ONE nightstand. Remove the second nightstand. Two pillows under one headboard is still a double. The master bedroom is not an exception. Do this in every bedroom that has a wide bed.";
  }
  if (/turned \d+ degrees/i.test(failure)) {
    return "The whole flat is turned the wrong way round. Rebuild it in the plan's orientation: read off the sheet which edge the bathrooms sit against and which edge the kitchen sits against, and put them against those same edges of the frame. Do not rotate the plan by any amount for a better fit to the canvas.";
  }
  if (/mirrored/i.test(failure)) {
    return "The whole flat is flipped. Rebuild it the way round the plan draws it: find the entrance door on the sheet, note which side of the flat it is on, and put it on that same side of the frame — then lay the kitchen, the terrace and the bedrooms out around it in the plan's order, left to right. Do not flip, mirror or reflect the plan for any reason.";
  }
  if (/invented outside|roomsOutside|footprint/i.test(failure)) {
    return "Delete the INDOOR rooms/corridor that sit OUTSIDE the apartment outline on the sheet — usually a long utility strip or wing glued beside the entrance / stair core / elevator that the plan leaves as common space. Trace the printed flat boundary and keep ONLY what is inside it. Do NOT delete a מרפסת / balcony / outdoor paving to 'fix' this — outdoor decks are a different defect. Do not shrink living rooms or erase terraces as a substitute.";
  }
  if (/front door missing|entrance door missing/i.test(failure)) {
    return "Find the entrance swing / door leaf on the SALES PLAN (usually on the outer wall next to חדר מדרגות / מעלית / the corridor — on דירה 22 it is on the living-room side opposite the small מרפסת). Cut ONLY that wall open and put a door leaf there. NEVER put the front door on a façade the plan hatches as מרפסת. NEVER turn a balcony pocket into a foyer / מבואה. A balcony slider is not the front door.";
  }
  if (/furnished as indoor/i.test(failure)) {
    return "The pocket the plan hatches as מרפסת / שטח המרפסת (with a printed m² figure) must be OUTDOOR again: pale paving, railing, open sky — at the printed size only. Take out wood floor, sofas, desks, laundry machines, and any foyer furniture. NEVER convert that pocket into an entrance hall or מבואה — the front door is a different wall on the sheet.";
  }
  if (/indoor room\(s\) rendered as outdoor|paving covers living|merged into one deck|entrance turned into a terrace|grown larger than the printed pocket/i.test(failure)) {
    return "Indoor living/kitchen/hall stay indoor floors under a roof. Terraces are ONLY the hatched pockets with printed area figures — keep each pocket separate at its printed size (e.g. 3.3 m² and 8.0 m² stay two pockets). Do not pull a roof terrace onto this floor or merge pockets into one courtyard. Do not invent a foyer where the sheet draws מרפסת.";
  }
  if (/terrace\(s\) invented|terrace\(s\) grown|outdoor paving covers/i.test(failure)) {
    return "Shrink or split outdoor paving to match the printed מרפסת pockets on the sheet (printed m² and outline). Remove paving, railing and outdoor furniture that sit where the plan has no hatch. Do not delete a pocket the sheet does print. Do not replace a balcony with an entrance hall.";
  }
  if (/left without a bed/i.test(failure)) {
    return "Every bedroom the plan draws a bed rectangle in must have a mattress. The empty room with only a wardrobe is that bedroom — put the drawn bed back. Do not leave bedroom floor empty.";
  }
  if (/beds \d|bedrooms \d/i.test(failure)) {
    return "Count the beds you have drawn before finishing and match the plan exactly — no extra bed to fill a room, no room left without the bed the plan draws in it.";
  }
  if (/opening\(s\) cut into/i.test(failure)) {
    return "Close every opening the plan does not draw. Walk every wall on the sheet, internal ones too: where the hatch runs unbroken the wall is solid, so render solid wall there — no window, no doorway, no pass-through, no matter how dark or closed-in the room looks.";
  }
  if (/printed terrace\(s\) missing/i.test(failure)) {
    return "Restore every מרפסת the plan hatches (printed m² figure). Cut the outdoor pocket back into that façade — pale paving, railing, open sky at the printed size. Do not leave a sealed wall, curtains, or bookcases where the sheet draws שטח המרפסת.";
  }
  if (/invented where the plan has no hatch/i.test(failure)) {
    return "Remove every terrace the plan does not hatch. The living room's outer walls stay walls — no deck glued onto a façade that has no printed מרפסת pocket.";
  }
  if (/stair flight/i.test(failure)) {
    return "Delete EVERY stair flight from the photograph — shaft, grey core, and open outdoor steps on a terrace. This flat is one level: no מדרגות פנים. A roof terrace at a different ⊕ must not appear on this floor with steps. Keep only same-level hatched מרפסת pockets the sheet prints, with a railing and no stairs.";
  }
  if (/wet fixture/i.test(failure)) {
    return "Take every toilet, basin, bath and shower out of the rooms the plan draws dry. A bedroom has a bed, a wardrobe and a bedside table and nothing else — no pan, no basin, no tiled wet floor. Wet fixtures belong only in the rooms the sheet draws pans or basins in.";
  }
  if (/washer\(s\) on a leisure terrace|washers \d/i.test(failure)) {
    return "Match laundry to the plan exactly. If the sheet draws ZERO washers / no חדר שירות / no מרפסת שירות, DELETE every washing machine and the whole invented laundry alcove — that space may be living wall or a printed מרפסת instead. Never invent a laundry room. If the plan draws N machines, keep exactly N in those rooms only.";
  }
  if (/bathtubs \d/i.test(failure)) {
    return "Copy wet fixtures from the plan exactly. If the sheet draws a washing-machine symbol in that wet room (and no bathtub outline), put a washer there — never invent a bathtub. Remove every bathtub the plan does not draw.";
  }
  if (/kitchen fridge missing/i.test(failure)) {
    return "Put a tall fridge / מקרר cabinet back in the kitchen run exactly where the plan draws it. Low counters alone are not enough when the sheet shows a fridge rectangle.";
  }
  if (/furniture in the entrance/i.test(failure)) {
    return "Clear the entrance completely. Take out the table, the desk, the chairs, the console, the shelving and anything else standing on that floor, and leave bare floor. A mirror or coat hooks on the wall may stay; nothing stands.";
  }
  if (/fitted unit/i.test(failure)) {
    return "Remove the fitted units the plan does not draw. A bookcase, sefarim cabinet, sideboard, wardrobe or shelving wall belongs only where the sheet draws a symbol for it; everywhere else, and at the entrance in particular, the floor stays clear.";
  }
  if (/seating group/i.test(failure)) {
    return "Copy lounge seating from the plan. If the living room draws only a dining table, take the sofa and armchairs out — dining chairs around the table are not a lounge. If the plan draws one sofa group, keep only that one in the living room. The entrance stays circulation.";
  }
  if (/unfurnished/i.test(failure)) {
    return "Furnish every enclosed room. An empty floor with bare walls is not acceptable unless the plan draws the room empty.";
  }
  if (/CAD annotation/i.test(failure)) {
    return "Drop every 2D drawing mark: no black entrance triangle, no north arrow, no dimension ticks, no flat hatch on a floor.";
  }
  if (/letters or digits/i.test(failure)) {
    return "Remove every readable letter and digit from the photograph — room names, dimensions, captions. Leave book spines BLANK (no letters). Do not restage furniture.";
  }
  return "Correct this against the plan.";
}

/**
 * How many times a failed audit is worth re-rolling before shipping the least
 * bad frame.
 *
 * Run-to-run spread on the same sheet is wider than the spread inside one run.
 * Two consecutive runs of דירה 14 on identical code and prompts gave a frame
 * with the plan's stepped outline and four bedrooms, and then a plain rectangle
 * with two — so a best-of-three can simply be handed three bad draws. Five buys
 * a materially better chance of a clean frame, and the early exit below means
 * the extra calls are only spent on the runs that are going badly.
 */
export const MAX_AUDITED_ATTEMPTS = 5;

/**
 * Good enough to stop paying for re-rolls: nothing disqualifying, and at most a
 * couple of count mismatches. A perfect audit effectively never happens on these
 * sheets, so waiting for one would always burn the full budget.
 */
export const GOOD_ENOUGH_SCORE = 2;

/**
 * Generate, count what came back, and re-roll when the counts disagree.
 *
 * Only the whole-plan views are audited. An interior close-up shows one room, so
 * apartment-wide counts say nothing about it, and auditing it would spend a
 * vision call to learn nothing.
 */
/**
 * The wall hint the model traces. A PDF carries its walls as vectors, so they can
 * be handed over exactly; a scan only has ink to threshold, which keeps the
 * furniture and dimension chains along with the walls.
 */
