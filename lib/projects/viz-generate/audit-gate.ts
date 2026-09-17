

import { createLogger } from "@/lib/logger";
import { recordAmbientFloorplanSpend } from "@/lib/projects/floorplan-spend";
import {
  type FloorplanLayout,
  type FloorplanVizImage,
} from "@/lib/projects/floorplan-layout";

import { hebrewFloorplanAuditIssue as idsHebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import {
  auditFloorplanStill,
  gradeFloorplanStill,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";
import {
  auditStillWithClaude,
  mergeClaudeModestyIntoAudit,
} from "@/lib/projects/floorplan-viz-modesty-claude";
import { isAnthropicConfigured } from "@/lib/ai-providers";

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
): Promise<{
  gemini: FloorplanVizAudit;
  audit: FloorplanVizAudit;
  grade: ReturnType<typeof gradeFloorplanStill>;
} | null> {
  const gemini = await auditFloorplanStill(still, ctx.plan);
  if (!gemini) return null;
  let audit = gemini;
  if (isAnthropicConfigured()) {
    const claude = await auditStillWithClaude(still, ctx.plan);
    if (claude) audit = mergeClaudeModestyIntoAudit(gemini, claude);
  }
  return {
    gemini,
    audit,
    grade: gradeFloorplanStill(audit, ctx.layout, { haredi: ctx.haredi }),
  };
}

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
 * Collect residual audit issues for the UI. Never throws — a paid frame ships
 * with a fix list instead of an empty error.
 */
export async function collectShipIssues(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  view: string,
): Promise<string[]> {
  const scored = await gradeStillForShip(still, ctx);
  if (!scored) return [];
  const hard = blockingHardFailures(scored.grade.hardFailures, scored.gemini);
  if (hard.length === 0) return [];
  log.warn("shipping photoreal with residual audit issues", { view, failures: hard });
  return hard;
}

/** Re-audit a saved still against its plan — for the UI "סרוק מול תוכנית" button. */
export async function rescanFloorplanStillIssues(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  haredi?: boolean;
}): Promise<string[]> {
  return collectShipIssues(
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

