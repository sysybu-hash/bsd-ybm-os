import { GoogleGenAI } from "@google/genai";

import { hasGeminiApiKey, getGeminiApiKey } from "@/lib/gemini-api-key";
import { createLogger } from "@/lib/logger";
import { correctionPrompt, designPrompt, finishPass, finishPrompt, massMatch, structuralMatch, wallMatchDetail } from "@/lib/projects/building/finish";
import type { FinishComparison, SpotFinding } from "@/lib/projects/floorplan-finish-judge";
import type { MeasuredStill } from "@/lib/projects/floorplan-render3d-still";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { recordFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";
import { designStyleBlock, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";

/**
 * The measured still, designed.
 *
 * The image model is not asked to draw the flat from the sheet — that is how
 * a sink and a hob swapped places, a laundry appeared and a roof terrace was
 * furnished. It is handed the measured render as the layout and designs the
 * flat on it — the brochure's look is the model's — and what comes back is
 * checked where accuracy lives: its walls against the measured walls' map,
 * and its furniture, piece by piece and kind by kind, by a judge beside the
 * render. Otherwise the render ships: it is never wrong about the flat.
 */

const log = createLogger("floorplan-finish-still");

/** Thresholds the building's finishes are held to, measured on its cover and aerials. */
export const FINISH_MIN_EDGES = 0.6;
export const FINISH_MIN_MASSES = 0.5;
/**
 * A designed flat's walls: the share of the measured walls' outline the
 * design keeps an edge on, over the flat and in its worst 1.5 m cell. Its
 * own furniture is the model's to style; its walls are not. Measured on
 * דירה 14 and 21: designs that kept the walls scored 0.985–0.999 and ≥ 0.74
 * in their worst cell; one that redrew the bathrooms 0.947 and 0.54, one
 * that moved a bedroom's walls 0.908 and 0.24.
 */
export const DESIGN_MIN_WALLS = 0.95;
export const DESIGN_MIN_WALL_CELL = 0.65;
/** A call can take a minute; none starts closer than this to the deadline. */
const CALL_MS = 75_000;

/** Why a design was refused — with, from the spot check, where — or null. */
export type Verdict = string | { reason: string; marks: SpotFinding[] } | null;

/**
 * The refused design with its faults framed: red round what to clear, blue
 * where a piece goes back. Told "open floor at the middle right" the model
 * left the seating it had added there; shown a frame, it has a place.
 */
export async function markDesign(design: Buffer, layout: Buffer, marks: SpotFinding[]): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const d = await sharp(design).metadata();
  const l = await sharp(layout).metadata();
  const sx = (d.width ?? 1) / (l.width ?? 1);
  const sy = (d.height ?? 1) / (l.height ?? 1);
  const line = Math.max(4, Math.round((d.width ?? 1000) / 300));
  const rects = marks
    .map((m) => {
      const colour = m.action === "clear" ? "#ff1a1a" : "#1a5cff";
      return `<rect x="${m.box.x * sx}" y="${m.box.y * sy}" width="${m.box.w * sx}" height="${m.box.h * sy}" fill="none" stroke="${colour}" stroke-width="${line}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}">${rects}</svg>`;
  return sharp(design).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 90 }).toBuffer();
}

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
    judge?: (image: Buffer) => Promise<Verdict>;
    /** Every design as it comes back, before any check: kept for review. */
    onDesign?: (image: Buffer, attempt: number) => void;
  },
): Promise<(FloorplanVizImage & { edges: number; masses: number }) | null> {
  if (!hasGeminiApiKey()) return null;
  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  // Designed where the measured walls' map is to hand — the model styles the
  // flat and the walls are checked against the map; otherwise repainted, and
  // the whole render's edges and masses checked.
  const design = still.walls != null;
  const style = designStyleBlock(options.styleKit);
  const prompt = design
    ? designPrompt(finishSubject(options.styleKit), {
        haredi: options.styleKit.audience === "haredi",
        inventory: still.inventory,
        style,
      })
    : finishPrompt("apartment", finishSubject(options.styleKit), { look: style });
  let best: { image: Buffer; edges: number; masses: number; score: number } | null = null;
  /** The last design the judge refused, and why: the next call corrects it. */
  const refusedDesigns: Array<{ image: Buffer; reason: string; marks?: SpotFinding[] }> = [];
  for (let attempt = 1; attempt <= (options.tries ?? 2); attempt++) {
    if (options.deadlineMs && Date.now() + CALL_MS > options.deadlineMs) break;
    const correcting = design ? refusedDesigns.pop() : undefined;
    refusedDesigns.length = 0;
    const marked = correcting?.marks?.length ? await markDesign(correcting.image, still.plain, correcting.marks).catch(() => null) : null;
    const done = correcting
      ? await finishPass(
          client,
          correctionPrompt(correcting.reason, { inventory: still.inventory, style, marked: marked != null }),
          [correcting.image, still.plain, ...(marked ? [marked] : [])],
        )
      : await finishPass(client, prompt, still.plain);
    if (!done) continue;
    recordFloorplanSpend(options.spend, "image", done.model);
    options.onDesign?.(done.image, attempt);
    let edges: number;
    let masses: number;
    let held: boolean;
    if (design) {
      const kept = await wallMatchDetail(still.walls!, done.image);
      edges = kept.all;
      masses = 1;
      held = kept.all >= DESIGN_MIN_WALLS && kept.worstCell >= DESIGN_MIN_WALL_CELL;
      log.info("design walls", { attempt, all: Number(kept.all.toFixed(3)), worstCell: Number(kept.worstCell.toFixed(3)), driftedAt: kept.driftedAt });
      // Walls that drifted are corrected like a piece that did: the design
      // kept, the walls named where they moved. Only a near miss — a design
      // that redrew the plan is drawn again.
      // One correction a design: an edit of an edit came back hazy and pale.
      if (!held && kept.all >= 0.85 && !correcting) {
        const at = kept.driftedAt.length > 0 ? ` at the ${kept.driftedAt.join(", the ")}` : "";
        refusedDesigns.push({ image: done.image, reason: `its walls are not image 1's walls${at}: put every wall, door and window back exactly where image 1 has them, at their thickness` });
      }
    } else {
      edges = await structuralMatch(still.plain, done.image);
      masses = await massMatch(still.plain, done.image);
      held = edges >= FINISH_MIN_EDGES && masses >= FINISH_MIN_MASSES;
    }
    const score = Math.min(edges, masses + 0.1);
    log.info("finish attempt", { attempt, design, correcting: correcting != null, model: done.model, edges: Number(edges.toFixed(3)), masses: Number(masses.toFixed(3)) });
    if (!held || (best && score <= best.score)) continue;
    const verdict: Verdict = options.judge ? await options.judge(done.image) : null;
    const refused = typeof verdict === "string" ? verdict : (verdict?.reason ?? null);
    if (refused) {
      log.info("finish refused by the judge", { attempt, refused });
      // "no judge" has nothing to correct; a turned plan is redrawn.
      if (refused !== "no judge" && refused !== "turned or mirrored" && !correcting) {
        refusedDesigns.push({ image: done.image, reason: refused, ...(typeof verdict === "object" && verdict ? { marks: verdict.marks } : {}) });
      }
      continue;
    }
    best = { image: done.image, edges, masses, score };
    if (best.score >= (design ? DESIGN_MIN_WALLS : 0.7)) break;
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
  compare: (render: Buffer, painting: Buffer, inventory?: string) => Promise<FinishComparison | null>,
  inventory?: string,
  /**
   * Each piece the layout has, looked for where it stands in the painting:
   * the pieces missing there, or null when nobody answered.
   */
  spots?: (image: Buffer) => Promise<SpotFinding[] | null>,
): (image: Buffer) => Promise<Verdict> {
  return async (image) => {
    const [found, missing] = await Promise.all([compare(reference, image, inventory), spots ? spots(image) : Promise.resolve([])]);
    // No judge, no pass: a painting nobody checked does not ship.
    if (!found || !missing) return "no judge";
    if (found.turnedOrMirrored) return "turned or mirrored";
    if (missing.length > 0) return { reason: `not as the layout: ${missing.map((m) => m.reason).join("; ")}`, marks: missing };
    const reason = refusal(found, styleKit.audience === "haredi", spots != null);
    if (!reason) return null;
    if (spots) return reason;
    // The pieces named, for the correction that follows (see correctionPrompt).
    const details = [
      found.missingPieces.length > 0 && !reason.startsWith("missing") ? `missing: ${found.missingPieces.join(", ")}` : "",
      found.extraPieces.length > 0 && !reason.startsWith("extra") ? `extra: ${found.extraPieces.join(", ")}` : "",
    ].filter(Boolean);
    return details.length > 0 ? `${reason} (${details.join("; ")})` : reason;
  };
}

/**
 * What the comparison shown the whole flat refuses a painting for. Where each
 * piece is also looked for at its own spot, that check has the furniture: the
 * whole-flat judge called דירה 22's measured kitchen island an addition, the
 * correction took it out, and the design that came back passed.
 */
function refusal(found: FinishComparison, haredi: boolean, checkedBySpot: boolean): string | null {
  if (!checkedBySpot) {
    if (found.bedAdded) return "bed added";
    if (found.bedRemoved) return "bed removed";
    if (found.bedsInRender >= 0 && found.bedsInPainting >= 0 && found.bedsInRender !== found.bedsInPainting) return "beds counted otherwise";
    if (found.sofasInRender >= 0 && found.sofasInPainting > found.sofasInRender) return "sofa added";
    if (found.furnitureAdded) return "furniture added";
  }
  if (haredi && (found.bedWidened || found.doubleBed)) return "bed widened";
  if (!checkedBySpot) {
    if (found.extraPieces.length > 0) return `extra: ${found.extraPieces.join(", ")}`;
    if (found.missingPieces.length > 0) return `missing: ${found.missingPieces.join(", ")}`;
  }
  if (haredi && found.screenAdded) return "screen";
  if (found.textAdded) return "lettering";
  if (found.spaceAdded) return "space added";
  return null;
}
