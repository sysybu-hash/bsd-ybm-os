import { GoogleGenAI } from "@google/genai";

import { hasGeminiApiKey, getGeminiApiKey } from "@/lib/gemini-api-key";
import { createLogger } from "@/lib/logger";
import { finishPass, finishPrompt, massMatch, structuralMatch } from "@/lib/projects/building/finish";
import type { FinishComparison } from "@/lib/projects/floorplan-finish-judge";
import type { MeasuredStill } from "@/lib/projects/floorplan-render3d-still";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { recordFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";
import type { FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";

/**
 * The measured still, painted.
 *
 * The image model is not asked to draw the flat from the sheet — that is how
 * a sink and a hob swapped places, a laundry appeared and a roof terrace was
 * furnished. It is handed the measured render and asked to repaint its
 * surfaces; what comes back is laid over the render edge for edge and mass for
 * mass, and kept only if it moved nothing. Otherwise the render ships: it is
 * never wrong about the flat.
 */

const log = createLogger("floorplan-finish-still");

/** Thresholds the building's finishes are held to, measured on its cover and aerials. */
export const FINISH_MIN_EDGES = 0.6;
export const FINISH_MIN_MASSES = 0.5;
/** A call can take a minute; none starts closer than this to the deadline. */
const CALL_MS = 75_000;

export function finishSubject(styleKit: FloorplanVizStyleKit): string {
  const who = styleKit.audience === "haredi" ? "an apartment in Israel for a Haredi family" : "an apartment in Israel";
  return `${who}, seen from above, in the style "${styleKit.labelEn}"`;
}

export async function finishMeasuredStill(
  still: MeasuredStill,
  options: {
    styleKit: FloorplanVizStyleKit;
    unitTitle?: string;
    areaM2?: number;
    spend: FloorplanSpend;
    deadlineMs?: number;
    /** Paid calls at most; the second only when the first fell short. */
    tries?: number;
    /**
     * A judge the painting must also pass — what edges and masses cannot see:
     * a single bed painted double, a screen, lettering. Answers why it is
     * refused, or null.
     */
    judge?: (image: Buffer) => Promise<string | null>;
  },
): Promise<(FloorplanVizImage & { edges: number; masses: number }) | null> {
  if (!hasGeminiApiKey()) return null;
  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const prompt = finishPrompt("apartment", finishSubject(options.styleKit));
  let best: { image: Buffer; edges: number; masses: number; score: number } | null = null;
  for (let attempt = 1; attempt <= (options.tries ?? 2); attempt++) {
    if (options.deadlineMs && Date.now() + CALL_MS > options.deadlineMs) break;
    const done = await finishPass(client, prompt, still.plain);
    if (!done) continue;
    recordFloorplanSpend(options.spend, "image", done.model);
    const edges = await structuralMatch(still.plain, done.image);
    const masses = await massMatch(still.plain, done.image);
    const score = Math.min(edges, masses + 0.1);
    log.info("finish attempt", { attempt, model: done.model, edges: Number(edges.toFixed(3)), masses: Number(masses.toFixed(3)) });
    if (edges < FINISH_MIN_EDGES || masses < FINISH_MIN_MASSES || (best && score <= best.score)) continue;
    const refused = options.judge ? await options.judge(done.image) : null;
    if (refused) {
      log.info("finish refused by the judge", { attempt, refused });
      continue;
    }
    best = { image: done.image, edges, masses, score };
    if (best && best.score >= 0.7) break;
  }
  if (!best) {
    log.info("no finish held the measured still; the render ships");
    return null;
  }
  const stamped = await stampFloorplanStill(
    { base64: best.image.toString("base64"), mimeType: "image/jpeg" },
    { unitLabel: options.unitTitle, areaM2: options.areaM2 },
  );
  return {
    viewId: "overview",
    labelHe: "כל התוכנית — מבט על",
    mimeType: stamped.mimeType,
    base64: stamped.base64,
    origin: "finish",
    selected: true,
    edges: best.edges,
    masses: best.masses,
  };
}

/**
 * The judge a flat's painting answers to, beside edges and masses: the render
 * and the painting side by side, and only what the painting changed (see
 * floorplan-finish-judge). Nothing may be added — a bed, a sofa, a room, a
 * terrace, words — nothing taken away or turned into another piece, and
 * nothing turned; and the audience's rules are absolute: in a
 * haredi flat a bed painted wider, or a screen, refuses the painting.
 */
export function finishJudge(
  styleKit: FloorplanVizStyleKit,
  reference: Buffer,
  compare: (render: Buffer, painting: Buffer) => Promise<FinishComparison | null>,
): (image: Buffer) => Promise<string | null> {
  return async (image) => {
    const found = await compare(reference, image);
    if (!found) return null;
    const haredi = styleKit.audience === "haredi";
    if (found.turnedOrMirrored) return "turned or mirrored";
    if (found.bedAdded) return "bed added";
    if (found.bedRemoved) return "bed removed";
    if (found.bedsInRender >= 0 && found.bedsInPainting >= 0 && found.bedsInRender !== found.bedsInPainting) return "beds counted otherwise";
    if (found.sofasInRender >= 0 && found.sofasInPainting > found.sofasInRender) return "sofa added";
    if (found.furnitureAdded) return "furniture added";
    if (haredi && found.bedWidened) return "bed widened";
    if (haredi && found.screenAdded) return "screen";
    if (found.textAdded) return "lettering";
    if (found.spaceAdded) return "space added";
    return null;
  };
}
