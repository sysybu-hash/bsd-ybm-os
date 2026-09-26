

import { createLogger } from "@/lib/logger";
import { recordAmbientFloorplanSpend } from "@/lib/projects/floorplan-spend";
import {
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";

import { hebrewFloorplanAuditIssue as idsHebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import {
  auditFloorplanStill,
  FLOORPLAN_AUDIT_PROMPT_VERSION,
  gradeFloorplanStill,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";
import {
  auditStillWithClaude,
  FLOORPLAN_SECOND_JUDGE_PROMPT_VERSION,
  mergeClaudeModestyIntoAudit,
  type ClaudeModestyAudit,
} from "@/lib/projects/floorplan-viz-modesty-claude";
import type { FloorplanVizAuditMeta } from "@/lib/projects/floorplan-viz-audit-meta";
import { isAnthropicConfigured } from "@/lib/ai-providers";
import { checkRoomPlacement } from "@/lib/projects/floorplan-viz-placement";

const log = createLogger("floorplan-viz-generate");

/**
 * Gemini layout audit (every attempt). Claude is the door judge only —
 * calling it on every re-roll burned money and discarded paid frames when
 * Claude was briefly unavailable.
 */
export async function auditStill(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
  _haredi: boolean,
): Promise<FloorplanVizAudit | null> {
  recordAmbientFloorplanSpend("audit", "gemini-audit");
  return auditFloorplanStill(still, plan);
}

/**
 * Final grade for a still: Gemini always, Claude merged when configured.
 * Used by the ship gate and by surgical repair so a Claude-only double bed
 * is fixed before we throw away a paid frame.
 */
export async function gradeStillForShip(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<ShipGrade | null> {
  const gemini = await auditFloorplanStill(still, ctx.plan);
  if (!gemini) return null;
  let audit = gemini;
  let claude: ClaudeModestyAudit | null = null;
  if (isAnthropicConfigured()) {
    claude = await auditStillWithClaude(still, ctx.plan);
    if (claude) audit = mergeClaudeModestyIntoAudit(gemini, claude);
  }
  return {
    gemini,
    claude,
    audit,
    grade: gradeFloorplanStill(audit, ctx.layout, { haredi: ctx.haredi }),
  };
}

export type ShipGrade = {
  gemini: FloorplanVizAudit;
  /** The second judge's own answer, kept apart so its findings can be named. */
  claude: ClaudeModestyAudit | null;
  audit: FloorplanVizAudit;
  grade: ReturnType<typeof gradeFloorplanStill>;
};

/**
 * Hard fails that still block shipping after repair.
 * Claude-only double-bed / screen flags are dropped — they burned paid frames
 * when Gemini already cleared those props (דירה 19 loops).
 */
export function blockingHardFailures(
  hardFailures: string[],
  gemini: FloorplanVizAudit,
): string[] {
  return hardFailures.filter((f) => {
    if (/double bed/i.test(f) && !gemini.hasDoubleBed) return false;
    if (/screen/i.test(f) && gemini.screenCount === 0) return false;
    return true;
  });
}

/**
 * The issues that count against a still: the hard failures Gemini stands
 * behind, and rooms painted where the plan does not put them.
 *
 * Soft failures stay out. Two scans of the same frame disagree on them, and a
 * list that moves on its own cannot gate an improvement ("nothing new was
 * added") or a booklet.
 */
export function shipBlockingIssues(
  scored: { gemini: FloorplanVizAudit; grade: { hardFailures: string[] } } | null,
  moved: string[] | null | undefined,
): string[] {
  const blocked = scored ? blockingHardFailures(scored.grade.hardFailures, scored.gemini) : [];
  return [...new Set([...blocked, ...(moved ?? [])])];
}

/**
 * Which auditor stands behind each finding of one scan.
 *
 * Gemini's hard failures are graded from its answer alone; whatever the merged
 * grade adds on top came from the Claude second judge. Findings the gate sets
 * aside are listed too, so a missing finding can be explained as well.
 */
export function attributeShipAudit(params: {
  scored: ShipGrade | null;
  moved: string[] | null | undefined;
  layout: FloorplanLayout;
  haredi: boolean;
  startedAt: number;
  finishedAt: number;
}): FloorplanVizAuditMeta {
  const { scored } = params;
  const geminiHard = scored
    ? gradeFloorplanStill(scored.gemini, params.layout, { haredi: params.haredi }).hardFailures
    : [];
  const mergedHard = scored?.grade.hardFailures ?? [];
  const blocked = scored ? blockingHardFailures(mergedHard, scored.gemini) : [];
  return {
    v: 1,
    at: new Date(params.finishedAt).toISOString(),
    ms: Math.max(0, Math.round(params.finishedAt - params.startedAt)),
    gemini: scored
      ? { model: scored.gemini.model, promptVersion: FLOORPLAN_AUDIT_PROMPT_VERSION, hard: geminiHard }
      : null,
    claude: scored?.claude
      ? {
          model: scored.claude.model,
          promptVersion: FLOORPLAN_SECOND_JUDGE_PROMPT_VERSION,
          added: mergedHard.filter((failure) => !geminiHard.includes(failure)),
        }
      : null,
    placement: params.moved ?? [],
    dropped: mergedHard.filter((failure) => !blocked.includes(failure)),
  };
}

/**
 * Audit a still for shipping: the issues that count against it, and who found
 * them. Never throws — a paid frame ships with a fix list instead of an error.
 */
export async function collectShipAudit(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  view: string,
): Promise<{ issues: string[]; meta: FloorplanVizAuditMeta }> {
  const startedAt = Date.now();
  const [scored, moved] = await Promise.all([
    gradeStillForShip(still, ctx),
    // Where each room is, which the counts above cannot see.
    checkRoomPlacement(still, ctx.layout),
  ]);
  const meta = attributeShipAudit({
    scored,
    moved,
    layout: ctx.layout,
    haredi: ctx.haredi,
    startedAt,
    finishedAt: Date.now(),
  });
  const issues = shipBlockingIssues(scored, moved);
  if (issues.length > 0) {
    log.warn("shipping photoreal with residual audit issues", { view, failures: issues });
  }
  return { issues, meta };
}

/** The issues alone, for callers that do not save the still. */
export async function collectShipIssues(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  view: string,
): Promise<string[]> {
  return (await collectShipAudit(still, ctx, view)).issues;
}

/** The fields a saved still carries from one ship audit. */
export function withShipAudit<T extends object>(
  img: T,
  audit: { issues: string[]; meta: FloorplanVizAuditMeta },
): T & {
  auditIssues?: string[];
  auditStatus: "passed" | "needs_review";
  auditMeta: FloorplanVizAuditMeta;
} {
  return {
    ...img,
    auditIssues: audit.issues.length ? audit.issues : undefined,
    auditStatus: audit.issues.length ? "needs_review" : "passed",
    auditMeta: audit.meta,
  };
}

/** Re-audit a saved still against its plan — for the UI "סרוק מול תוכנית" button. */
export async function rescanFloorplanStillAudit(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  haredi?: boolean;
}): Promise<{ issues: string[]; meta: FloorplanVizAuditMeta }> {
  return collectShipAudit(
    params.still,
    {
      layout: params.layout,
      plan: params.plan,
      haredi: params.haredi === true,
    },
    params.still.labelHe,
  );
}

export function hebrewFloorplanAuditIssue(failure: string): string {
  return idsHebrewFloorplanAuditIssue(failure);
}
