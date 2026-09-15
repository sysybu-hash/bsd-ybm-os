
import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import {
  isBuildingCoreRoom,
  roomsForVisualization,
  type FloorplanLayout,
  type FloorplanVizImage,
  type FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";

import {
  gradeFloorplanStill,
  harediModestyFailures,
} from "@/lib/projects/floorplan-viz-audit";

import {
  clampFloorplanVizEditRegion,
  editRegionPromptBlock,
  type FloorplanVizEditRegion,
} from "@/lib/projects/floorplan-viz-edit-region";
import {
  overlayFloorplanVizEditRegion,
  stripMagentaLocatorFromJpeg,
  compositeFloorplanVizEditRegion,
} from "@/lib/projects/floorplan-viz-edit-region-overlay";
import { buildRoomMassingJpeg } from "@/lib/projects/floorplan-photo-prep";
import {
  HAREDI_BED_PROMPT,
  HAREDI_MODESTY_PROMPT,
  resolveFloorplanVizStyle,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";

import {
  auditStill,
  collectShipIssues,
} from "@/lib/projects/viz-generate/audit-gate";
import {
  ONE_FRAME,
  aspectRatioForPlan,
} from "@/lib/projects/viz-generate/prompts";
import { generateOneImage } from "@/lib/projects/viz-generate/gemini";
import { remedyFor } from "@/lib/projects/viz-generate/jobs";
import { buildWallHint } from "@/lib/projects/viz-generate/attempts";

const log = createLogger("floorplan-viz-generate");
export const FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX = 8000;

export function sanitizeFloorplanVizEditInstruction(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX);
}

export function buildStillEditPrompt(
  _layout: FloorplanLayout,
  _view: { kind: FloorplanVizViewId; roomName?: string },
  instruction: string,
  options?: { styleKit?: FloorplanVizStyleKit; region?: FloorplanVizEditRegion | null },
): string {
  const kit = options?.styleKit ?? resolveFloorplanVizStyle();
  const locator = options?.region ? `\n${editRegionPromptBlock(options.region)}\n` : "";
  const haredi = kit.audience === "haredi";
  const improve = /SURGICAL IMPROVE/i.test(instruction);
  const planRole = options?.region
    ? "The SECOND attached image is a BLACK MASK with a magenta locator rectangle — it is not the apartment. Change ONLY what sits inside that rectangle on the FIRST image. Pixels outside it must match the FIRST image exactly. Do not copy the magenta stroke."
    : improve
      ? "Next attached images include the original sales plan (and optional wall/massing hints). The plan is AUTHORITATIVE for walls, doors, מרפסת pockets and room identity — fix the still TO MATCH the plan. Do not invent a foyer where the sheet draws מרפסת. Do not invent laundry where the sheet draws none."
      : "Next attached image is the original sales plan, for fixture identity only — do not rebuild the flat from it.";
  return `SURGICAL EDIT — the FIRST attached image is the finished still. It is already the apartment. Do not start from scratch. Do not restage.

USER REQUEST (do this, nothing else):
"""
${instruction}
"""
${locator}
Keep the same camera, framing, walls, rooms, furniture, materials and golden-hour light except where the request changes them. A revision that comes back cooler, greyer, or with new furniture the first image did not have is a failed revision.
${planRole}
Do not add a sofa, TV, laptop, extra bed, extra desk, or terrace the first image does not already have, unless the user asked for that OR the sales plan requires restoring a printed מרפסת / door the still got wrong.
${haredi ? HAREDI_MODESTY_PROMPT : "Do not invent a TV, laptop, tablet, or dark rectangular slab on a desk, nightstand or wall unless the user asked for a screen."}

STYLE reminder (finishes of the existing furniture only — do not restage rooms):
${kit.promptBlock}

${ONE_FRAME} No captions. No title block.`;
}

async function stripHarediModestyFromStill(
  still: { mimeType: string; base64: string },
  plan: { mimeType: string; base64: string },
  layout: FloorplanLayout,
): Promise<{ mimeType: string; base64: string }> {
  const before = await auditStill(still, plan, true);
  if (!before) return still;
  const beforeGrade = gradeFloorplanStill(before, layout, { haredi: true });
  const targets = harediModestyFailures(beforeGrade.hardFailures);
  if (targets.length === 0) return still;
  const prompt = `SURGICAL EDIT — the FIRST image is the finished still.
Fix ONLY the modesty failures below. Same camera, same golden-hour light, same walls and rooms.
${targets.map((f) => `- ${f}\n  -> ${remedyFor(f)}`).join("\n")}
${HAREDI_MODESTY_PROMPT}
${HAREDI_BED_PROMPT}
${ONE_FRAME}`;
  try {
    const img = await generateOneImage(prompt, [still, plan], {
      aspectRatio: await aspectRatioForPlan(plan.base64, plan.mimeType),
    });
    const cleaned = await stripMagentaLocatorFromJpeg(img);
    const after = await auditStill(cleaned, plan, true);
    if (!after) return still;
    const afterGrade = gradeFloorplanStill(after, layout, { haredi: true });
    return afterGrade.score < beforeGrade.score ? cleaned : still;
  } catch (err: unknown) {
    log.warn("haredi modesty strip after edit failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return still;
  }
}

export async function editFloorplanStill(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  instruction: string;
  styleKit?: FloorplanVizStyleKit;
  photo?: boolean;
  region?: FloorplanVizEditRegion | null;
}): Promise<{ mimeType: string; base64: string }> {
  const instruction = sanitizeFloorplanVizEditInstruction(params.instruction);
  if (!instruction) throw new Error("חסרה בקשת עריכה");
  const region = clampFloorplanVizEditRegion(params.region);
  const hint = await buildWallHint(params.plan.base64, params.plan.mimeType, params.photo === true);
  const ink = hint?.image ?? null;
  const massingRooms = roomsForVisualization(params.layout).filter((r) => !isBuildingCoreRoom(r));
  const massing = await buildRoomMassingJpeg(params.plan.base64, massingRooms);
  const marked = region ? await overlayFloorplanVizEditRegion(params.still, region) : null;
  const attachments: Array<{ mimeType: string; base64: string }> = [
    { mimeType: params.still.mimeType, base64: params.still.base64 },
    ...(marked ? [marked] : []),
    { mimeType: params.plan.mimeType, base64: params.plan.base64 },
    ...(ink ? [{ mimeType: "image/jpeg", base64: ink }] : []),
    ...(massing ? [{ mimeType: "image/jpeg", base64: massing }] : []),
  ];
  const generated = await generateOneImage(
    buildStillEditPrompt(
      params.layout,
      { kind: params.still.viewId, roomName: params.still.roomName },
      instruction,
      { styleKit: params.styleKit, region },
    ),
    attachments,
    { aspectRatio: await aspectRatioForPlan(params.plan.base64, params.plan.mimeType) },
  );
  let result = await stripMagentaLocatorFromJpeg(generated);
  if (region) {
    result = await compositeFloorplanVizEditRegion(params.still, result, region);
  }
  if (params.styleKit?.audience === "haredi") {
    result = await stripHarediModestyFromStill(result, params.plan, params.layout);
  }
  return result;
}

/** "שפר תמונה" — surgical fix of residual audit issues on the existing frame. */
/** Failures that mean walls/openings must change — not a paint-over. */
function isStructuralFloorplanFailure(failure: string): boolean {
  return /front door missing|stair flight|invented outside|terrace\(s\) invented|terrace\(s\) grown|outdoor paving|indoor room\(s\) rendered|turned into a terrace|entrance turned|roomsOutside|mirrored|turned \d+ degrees|CAD block massing|footprint/i.test(
    failure,
  );
}

function mergeImproveFailures(
  stored: string[],
  fresh: string[],
  layout: FloorplanLayout,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of [...fresh, ...stored]) {
    const key = f.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  const hasStructural = out.some(isStructuralFloorplanFailure);
  const onlyModesty =
    out.length > 0 && out.every((f) => /screen|double bed/i.test(f));
  // When the UI only packed a screen (דירה 21), still force entrance + stairs.
  if (!hasStructural || onlyModesty) {
    if (!out.some((f) => /front door missing/i.test(f))) {
      out.push("front door missing where the plan draws the entrance");
    }
    if (!out.some((f) => /stair flight/i.test(f))) {
      out.push("1 stair flight(s) inside a flat the plan draws on one level");
    }
  }
  // Do not auto-inject "delete terrace" here. On דירה 21 it competed with
  // invented-room fixes; on דירה 22 the sheet prints 3.3+8.0 m² pockets that
  // truth tags as a higher ⊕ — forcing delete wiped a real balcony.
  if (out.length === 0) {
    out.push(
      "front door missing where the plan draws the entrance",
      "1 stair flight(s) inside a flat the plan draws on one level",
    );
  }
  return prioritizeImproveFailures(out);
}

/** Outline / entrance first; terrace deletes last so they cannot steal the edit. */
function prioritizeImproveFailures(failures: string[]): string[] {
  const rank = (f: string): number => {
    if (/invented outside|roomsOutside/i.test(f)) return 0;
    if (/front door missing|stair flight/i.test(f)) return 1;
    if (/washer|bathtub|fridge|wet fixture/i.test(f)) return 2;
    if (/terrace|outdoor paving|indoor room/i.test(f)) return 9;
    return 5;
  };
  return [...failures].sort((a, b) => rank(a) - rank(b));
}

export function buildFloorplanImproveInstruction(failures: string[]): string {
  const fixingInventedRooms = failures.some((f) => /invented outside|roomsOutside/i.test(f));
  const fixingTerrace = failures.some((f) => /terrace|furnished as indoor|outdoor paving/i.test(f));
  const fixingEntrance = failures.some((f) => /front door missing|entrance/i.test(f));
  // While fixing an invented indoor wing, drop terrace-delete lines entirely —
  // they competed with the outline fix and wiped a balcony on דירה 21.
  const focused = fixingInventedRooms
    ? failures.filter((f) => !/terrace\(s\) invented|terrace\(s\) grown|outdoor paving covers/i.test(f))
    : failures;
  const lines = focused
    .slice(0, 4)
    .map((f) => `- ${f}\n  -> ${remedyFor(f)}`)
    .join("\n");
  const keepTerraces = fixingInventedRooms
    ? `
CRITICAL: The defect is an INDOOR wing/corridor glued OUTSIDE the apartment outline (often beside the entrance / stair core). Delete THAT indoor strip only. Do NOT delete, shrink, or erase any מרפסת / balcony as a substitute. Do not trade outdoor paving for the invented rooms.`
    : "";
  const terraceVsEntrance =
    fixingTerrace && fixingEntrance
      ? `
CRITICAL (דירה-style sheets): מרפסת and כניסה are DIFFERENT walls. Find שטח המרפסת hatch on the sheet — restore that pocket as outdoor paving at the printed m². Find the entrance swing on a DIFFERENT outer wall — put the door THERE only. Never turn a balcony into a foyer; never put the front door on a מרפסת façade.`
      : fixingTerrace
        ? `
CRITICAL: Restore printed מרפסת pockets from the sheet (size + place). Delete invented laundry/foyer furniture in those pockets. Do not invent an entrance hall there.`
        : "";
  return `SURGICAL IMPROVE — the FIRST image is the finished still of THIS apartment. The NEXT attachment is the sales plan (authoritative).
Output ONE bird's-eye cutaway frame only — same camera height, same golden-hour light, same overall footprint.
FORBIDDEN: exterior street/porch elevation, duplex collage, two stacked panels, a different house, reinventing the flat from memory, turning מרפסת into מבואה.
Fix ONLY these defects (prefer deleting wrong things over rebuilding rooms):
${lines}
Keep every wall and room the plan already matches. Do not invent a porch, façade of glass doors, or a second building.${keepTerraces}${terraceVsEntrance}`;
}

/**
 * Reject improve outputs that abandoned the sales still (dual panels / house exterior).
 * Cheap pixel heuristic — does not need another paid auditor call.
 */
async function looksLikeAbandonedFloorplanStill(
  before: { base64: string },
  after: { base64: string },
): Promise<boolean> {
  try {
    const [bMeta, aMeta] = await Promise.all([
      sharp(Buffer.from(before.base64, "base64")).metadata(),
      sharp(Buffer.from(after.base64, "base64")).metadata(),
    ]);
    const bw = bMeta.width ?? 0;
    const bh = bMeta.height ?? 0;
    const aw = aMeta.width ?? 0;
    const ah = aMeta.height ?? 0;
    if (aw < 32 || ah < 32) return true;
    // Two-panel brochure (exterior over plan) is much taller than the original cutaway.
    if (bh > 0 && ah / Math.max(bh, 1) > 1.45 && ah / Math.max(aw, 1) > 1.35) return true;
    // Extreme aspect flip vs the source still.
    if (bw > 0 && bh > 0) {
      const bRatio = bw / bh;
      const aRatio = aw / ah;
      if (bRatio > 0.2 && (aRatio / bRatio > 2.2 || bRatio / aRatio > 2.2)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** "שפר תמונה" — surgical fix of residual audit issues on the existing still. */
export async function improveFloorplanStill(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  styleKit?: FloorplanVizStyleKit;
  photo?: boolean;
  failures?: string[];
  /** When set, fix only these lines — no auto-injected stairs/terrace extras. */
  selectedOnly?: boolean;
}): Promise<{ mimeType: string; base64: string; auditIssues?: string[] }> {
  const haredi = params.styleKit?.audience === "haredi";
  const ctx = {
    layout: params.layout,
    plan: params.plan,
    haredi: haredi === true,
  };
  const fresh = await collectShipIssues(params.still, ctx, params.still.labelHe);
  const selected = (params.failures ?? []).map((f) => f.trim()).filter(Boolean);
  const failures =
    params.selectedOnly && selected.length > 0
      ? prioritizeImproveFailures(selected)
      : mergeImproveFailures(selected.length ? selected : (params.still.auditIssues ?? []), fresh, params.layout);
  const beforeScore = fresh.length;
  const instruction = buildFloorplanImproveInstruction(failures);
  // Never use a free "walls may change / rebuild" path — that produced a
  // different house with an exterior+plan collage on דירה 21.
  const edited = await editFloorplanStill({
    layout: params.layout,
    still: params.still,
    plan: params.plan,
    instruction,
    styleKit: params.styleKit,
    photo: params.photo,
  });
  if (await looksLikeAbandonedFloorplanStill(params.still, edited)) {
    log.warn("improve abandoned the cutaway still; keeping prior frame", {
      view: params.still.labelHe,
    });
    return {
      mimeType: params.still.mimeType,
      base64: params.still.base64,
      auditIssues: failures.length ? failures : params.still.auditIssues,
    };
  }
  const residual = await collectShipIssues(edited, ctx, params.still.labelHe);
  // If the "fix" is worse, keep the paid frame the user already had.
  if (residual.length > beforeScore + 1) {
    log.warn("improve scored worse than before; keeping prior frame", {
      view: params.still.labelHe,
      before: beforeScore,
      after: residual.length,
    });
    return {
      mimeType: params.still.mimeType,
      base64: params.still.base64,
      auditIssues: failures.length ? failures : params.still.auditIssues,
    };
  }
  return {
    ...edited,
    auditIssues: residual.length ? residual : undefined,
  };
}

