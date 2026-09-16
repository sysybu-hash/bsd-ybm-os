import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import { type FloorplanLayout } from "@/lib/projects/floorplan-layout";

import {
  gradeFloorplanStill,
  harediModestyFailures,
  surgicallyRemovableFailures,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";

import {
  buildVectorWallJpeg,
  extractPdfPageRaster,
} from "@/lib/projects/floorplan-vector";

import {
  buildFootprintSilhouetteJpeg,
  buildInkWallJpeg,
} from "@/lib/projects/floorplan-photo-prep";

import {
  auditStill,
  blockingHardFailures,
  collectShipIssues,
  gradeStillForShip,
} from "@/lib/projects/viz-generate/audit-gate";
import {
  ONE_FRAME,
  SALES_BROCHURE_BRIEF,
} from "@/lib/projects/viz-generate/prompts";
import { generateOneImage } from "@/lib/projects/viz-generate/gemini";
import {
  GOOD_ENOUGH_SCORE,
  MAX_AUDITED_ATTEMPTS,
  remedyFor,
  type VizJob,
} from "@/lib/projects/viz-generate/jobs";

const log = createLogger("floorplan-viz-generate");
import type { WallHintKind } from "@/lib/projects/viz-generate/prompts";

export async function buildWallHint(
  base64: string,
  mimeType: string,
  photo: boolean,
): Promise<{ image: string; kind: WallHintKind } | null> {
  if (photo) return null;
  let raster = base64;
  if (mimeType === "application/pdf") {
    const vector = await buildVectorWallJpeg(Buffer.from(base64, "base64"));
    if (vector) return { image: vector, kind: "vector-walls" };
    // Not every PDF is a CAD export. דירה 14 is a scan wrapped in a PDF — one
    // image operator, no paths — and sharp cannot decode a PDF, so the raster
    // fallbacks below were being handed bytes they could do nothing with and
    // every one returned null. The sheet then reached the image model with no
    // wall hint at all, and the still grew an entire invented wing of rooms
    // down its right side. Pull the embedded scan out first.
    const embedded = await extractPdfPageRaster(Buffer.from(base64, "base64"));
    if (!embedded) return null;
    raster = embedded;
  }
  // No vectors to trace — a scan. Pulling individual walls out of a raster was
  // tried twice and made the result worse both times, so hand over the one thing
  // a raster does give up reliably: the outline. The footprint is also what the
  // audit complains about most on these sheets.
  const silhouette = await buildFootprintSilhouetteJpeg(raster);
  if (silhouette) return { image: silhouette, kind: "footprint" };
  const ink = await buildInkWallJpeg(raster);
  return ink ? { image: ink, kind: "ink" } : null;
}

/**
 * Put a flipped or turned frame back the way the plan draws it.
 *
 * Orientation is the one family of defects with an exact inverse: flop a mirror,
 * rotate a turn, and every room lands back on the side the plan puts it, with
 * nothing else about the still touched. Re-rolling does not have that property —
 * four consecutive runs of דירה 14 came back mirrored, turned, mirrored and
 * turned again, so the retry budget was being spent resampling an orientation
 * the model will not hold. Verified on run three: flopping it took
 * mirroredVsPlan true -> false and the score 302 -> 101.
 *
 * Rotation was the more expensive half to find. The auditor had been writing
 * "the render is rotated 180 degrees" into its notes while every graded field
 * said the frame was clean, footprintMatchesPlan included — a silhouette turned
 * through 180 degrees still matches itself. It needed its own field before it
 * could be corrected.
 *
 * Nothing here reads as text — the caption bar is stamped after the audit — so
 * there is no lettering to come back reversed.
 *
 * Returns null unless the fix actually clears the verdict and improves the
 * score, so a misfired call cannot make a frame worse.
 */
async function reorientToPlan(
  img: { mimeType: string; base64: string },
  audit: { mirroredVsPlan: boolean; rotationVsPlanDegrees: number },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  before: { score: number },
  view: string,
): Promise<{ img: { mimeType: string; base64: string }; score: number } | null> {
  let pipeline = sharp(Buffer.from(img.base64, "base64"));
  if (audit.mirroredVsPlan) pipeline = pipeline.flop();
  // The audit reports how far the still is turned from the plan, so turn it back.
  if (audit.rotationVsPlanDegrees !== 0) pipeline = pipeline.rotate(audit.rotationVsPlanDegrees);

  const buf = await pipeline.jpeg({ quality: 94 }).toBuffer();
  const fixed = { mimeType: "image/jpeg", base64: buf.toString("base64") };

  const after = await auditStill(fixed, ctx.plan, ctx.haredi);
  if (!after || after.mirroredVsPlan || after.rotationVsPlanDegrees !== 0) return null;
  const graded = gradeFloorplanStill(after, ctx.layout, { haredi: ctx.haredi });
  if (graded.score >= before.score) return null;
  log.info("reoriented a still to the plan", {
    view,
    flopped: audit.mirroredVsPlan,
    turned: audit.rotationVsPlanDegrees,
    from: before.score,
    to: graded.score,
  });
  return { img: fixed, score: graded.score };
}

/**
 * Audit protects layout. This pass protects the brochure look the audit
 * cannot see: vacant white 3D that scored well still fails the client.
 * Keep the audited frame if the warmth pass makes the audit worse.
 */
export async function warmLook(
  img: { mimeType: string; base64: string },
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<{ mimeType: string; base64: string }> {
  const prompt = `${SALES_BROCHURE_BRIEF}

WARMTH FINISH — the FIRST attached image is this apartment, already laid out correctly.
Repaint materials and light only. Do not move walls, doors, windows, furniture, or the camera.
Golden-hour ~3000K. Every lamp ON with a visible amber pool. Honey oak grain, cream plaster, an area rug, pillows, a fruit bowl, a kettle.
Not a vacant white 3D model. Not cooler, greyer or flatter than a family home tonight.
${job.prompt.includes("MODESTY") ? "Keep the modesty rules: no screens, twins only, no people. Do not invent a TV, laptop, or double bed." : ""}
${ONE_FRAME}`;
  try {
    const warmed = await generateOneImage(prompt, [img, ...attachments], { aspectRatio });
    const before = await auditStill(img, ctx.plan, ctx.haredi);
    const after = await auditStill(warmed, ctx.plan, ctx.haredi);
    if (!after) return warmed;
    if (!before) return warmed;
    const beforeGrade = gradeFloorplanStill(before, ctx.layout, { haredi: ctx.haredi });
    const afterGrade = gradeFloorplanStill(after, ctx.layout, { haredi: ctx.haredi });
    if (
      ctx.haredi &&
      harediModestyFailures(afterGrade.hardFailures).length >
        harediModestyFailures(beforeGrade.hardFailures).length
    ) {
      log.warn("warmth pass reintroduced modesty failures; keeping the audited frame", {
        view: job.labelHe,
        failures: harediModestyFailures(afterGrade.hardFailures),
      });
      return img;
    }
    if (
      ctx.haredi &&
      harediModestyFailures(afterGrade.hardFailures).length > 0 &&
      harediModestyFailures(beforeGrade.hardFailures).length === 0
    ) {
      log.warn("warmth pass broke a clean modesty frame; keeping the audited frame", {
        view: job.labelHe,
        failures: harediModestyFailures(afterGrade.hardFailures),
      });
      return img;
    }
    if (afterGrade.score > beforeGrade.score + 15 || afterGrade.hardFailures.length > beforeGrade.hardFailures.length) {
      log.warn("warmth pass hurt the layout audit; keeping the audited frame", {
        view: job.labelHe,
        before: beforeGrade.score,
        after: afterGrade.score,
      });
      return img;
    }
    log.info("warmth pass kept", { view: job.labelHe, before: beforeGrade.score, after: afterGrade.score });
    return warmed;
  } catch (err: unknown) {
    log.warn("warmth pass failed", {
      view: job.labelHe,
      error: err instanceof Error ? err.message : String(err),
    });
    return img;
  }
}

export async function generateAuditedImage(
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: {
    layout: FloorplanLayout;
    plan: { base64: string; mimeType: string };
    haredi: boolean;
  },
): Promise<{ mimeType: string; base64: string; auditIssues?: string[] }> {
  const auditable = job.viewId === "overview" || job.viewId === "isometric";
  let best: {
    img: { mimeType: string; base64: string };
    score: number;
    failures: string[];
    hardFailures: string[];
    audit: FloorplanVizAudit;
  } | null = null;
  let lastFailures: string[] = [];

  for (let attempt = 1; attempt <= (auditable ? MAX_AUDITED_ATTEMPTS : 1); attempt++) {
    // A blind re-roll just samples the same distribution again. Telling the model
    // what the previous frame got wrong turns the retry into a correction.
    const prompt = lastFailures.length
      ? `${job.prompt}

PREVIOUS ATTEMPT REJECTED — an audit compared your last frame against the plan.
Each line is what was wrong, then what to do about it:
${lastFailures
          .map((f) => `- ${f}\n  -> ${remedyFor(f)}`)
          .join("\n")}
Fix exactly these and keep everything the audit did not complain about.`
      : job.prompt;
    const img = await generateOneImage(prompt, attachments, { aspectRatio });
    if (!auditable) return img;

    const audit = await auditStill(img, ctx.plan, ctx.haredi);
    if (!audit) return img; // No auditor available — ship what we have rather than stall.

    const { failures, hardFailures, score } = gradeFloorplanStill(audit, ctx.layout, {
      haredi: ctx.haredi,
    });
    if (failures.length === 0) {
      log.info("still passed audit", { view: job.labelHe, attempt });
      const issues = await collectShipIssues(img, ctx, job.labelHe);
      return { ...img, auditIssues: issues.length ? issues : undefined };
    }
    log.warn("still failed audit", { view: job.labelHe, attempt, failures, hardFailures });
    lastFailures = failures;
    if (!best || score < best.score) best = { img, score, failures, hardFailures, audit };
    if (score <= GOOD_ENOUGH_SCORE) {
      log.info("still good enough, stopping re-rolls", { view: job.labelHe, attempt, failures });
      const issues = await collectShipIssues(img, ctx, job.labelHe);
      return { ...img, auditIssues: issues.length ? issues : undefined };
    }
  }

  const misoriented = /mirrored|turned \d+ degrees/i;
  if (best?.audit && best.hardFailures.some((f) => misoriented.test(f))) {
    const fixed = await reorientToPlan(best.img, best.audit, ctx, best, job.labelHe);
    if (fixed) {
      best = {
        ...best,
        img: fixed.img,
        score: fixed.score,
        hardFailures: best.hardFailures.filter((f) => !misoriented.test(f)),
        failures: best.failures.filter((f) => !misoriented.test(f)),
      };
    }
  }

  if (best) {
    let candidate = best;
    for (let door = 1; door <= 2; door++) {
      const repaired = await repairRemovableFailures(candidate, job, attachments, aspectRatio, ctx);
      if (repaired) {
        const scored = await gradeStillForShip(repaired, ctx);
        if (scored) {
          const hard = blockingHardFailures(scored.grade.hardFailures, scored.gemini);
          candidate = {
            img: repaired,
            score: scored.grade.score,
            failures: scored.grade.failures,
            hardFailures: hard,
            audit: scored.audit,
          };
          if (hard.length === 0) {
            return { ...repaired, auditIssues: undefined };
          }
          continue;
        }
        candidate = { ...candidate, img: repaired };
      }
      break;
    }
    const issues = await collectShipIssues(candidate.img, ctx, job.labelHe);
    log.warn("shipping least-bad still", {
      view: job.labelHe,
      failures: candidate.failures,
      residual: issues,
    });
    return {
      ...candidate.img,
      auditIssues: issues.length ? issues : undefined,
    };
  }
  throw new Error("יצירת ההדמיה נכשלה");
}

const MAX_SURGICAL_REPAIRS = 3;

/**
 * Surgical pass for hard failures that do not need a full re-roll: burned text,
 * CAD marks, and (for haredi) screens / double beds. Keeps a paid outline that
 * already matches the plan instead of throwing it away.
 */
async function repairRemovableFailures(
  best: {
    img: { mimeType: string; base64: string };
    score: number;
    failures: string[];
    hardFailures: string[];
  },
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<{ mimeType: string; base64: string } | null> {
  let current = best;
  let improvedImg: { mimeType: string; base64: string } | null = null;

  for (let pass = 1; pass <= MAX_SURGICAL_REPAIRS; pass++) {
    const targets = surgicallyRemovableFailures(current.hardFailures, { haredi: ctx.haredi });
    if (targets.length === 0) return improvedImg;

    const prompt = `${job.prompt}

REPAIR PASS — the FIRST attached image is a frame of this apartment that is
correct in every other respect. Reproduce it exactly: same walls, same outline,
same rooms, same furniture, same materials, same camera. Keep its light exactly:
the same golden-hour warmth, the same lit lamps and amber pools, the same warm
white balance — a cooler, greyer or flatter frame is a failed repair.
Change only this:
${targets.map((f) => `- ${f}\n  -> ${remedyFor(f)}`).join("\n")}
Nothing else in the picture may move, appear or disappear.`;

    try {
      const img = await generateOneImage(prompt, [current.img, ...attachments], { aspectRatio });
      // Grade the way the ship gate does (Gemini + Claude) so a Claude-only
      // double bed is still a repair target, not a surprise refuse after pay.
      const scored = await gradeStillForShip(img, ctx);
      if (!scored) return improvedImg;
      const verdict = scored.grade;
      const beforeRemovable = surgicallyRemovableFailures(current.hardFailures, {
        haredi: ctx.haredi,
      }).length;
      const afterRemovable = surgicallyRemovableFailures(verdict.hardFailures, {
        haredi: ctx.haredi,
      }).length;
      if (verdict.score >= current.score && afterRemovable >= beforeRemovable) {
        log.warn("repair pass did not improve the frame", {
          view: job.labelHe,
          pass,
          before: current.score,
          after: verdict.score,
          failures: verdict.failures,
        });
        return improvedImg;
      }
      log.info("repair pass improved the frame", {
        view: job.labelHe,
        pass,
        before: current.score,
        after: verdict.score,
        failures: verdict.failures,
      });
      current = {
        img,
        score: verdict.score,
        failures: verdict.failures,
        hardFailures: verdict.hardFailures,
      };
      improvedImg = img;
    } catch (err: unknown) {
      log.warn("repair pass failed", {
        view: job.labelHe,
        pass,
        error: err instanceof Error ? err.message : String(err),
      });
      return improvedImg;
    }
  }

  return improvedImg;
}

