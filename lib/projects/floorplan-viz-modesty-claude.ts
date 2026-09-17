import { parseModelJsonText } from "@/lib/ai-document-json";
import {
  getAnthropicModelCandidates,
  isAnthropicConfigured,
  isAnthropicEligibleForModelFallback,
} from "@/lib/ai-providers";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { recordAmbientFloorplanSpend } from "@/lib/projects/floorplan-spend";
import type { FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";

const log = createLogger("floorplan-viz-modesty-claude");

/**
 * Claude is the second judge for EVERY style: Gemini draws and grades; Claude
 * re-checks the failures that make a still unusable. Either "guilty" is enough
 * to block shipping. Screen / double-bed fields are always collected; grading
 * only treats them as hard fails for a haredi audience.
 */
export type ClaudeModestyAudit = {
  screenCount: number;
  hasDoubleBed: boolean;
  mirroredVsPlan: boolean;
  rotationVsPlanDegrees: number;
  hasBurnedText: boolean;
  hasCadMarks: boolean;
  roomsOutsidePlanOutline: number;
  apartmentStairsNotInPlan: number;
  wetFixturesInDryRooms: number;
  inventedOutdoorSpaces: number;
  terraceTurnedIntoIndoor: number;
  emptyBedrooms: number;
  entranceDoorMissing: boolean;
  washersOnLeisureTerrace: number;
  washerCount: number;
  planWasherCount: number;
  bathtubCount: number;
  planBathtubCount: number;
  kitchenFridgeMissing: boolean;
  omittedOutdoorSpaces: number;
  notes: string;
  model: string;
};

const SECOND_JUDGE_INSTRUCTION = `
You are a strict second auditor for an Israeli apartment sales still.
This check runs for EVERY style kit — accuracy first.

Attachment 1 is the STILL (3D top-down or isometric photograph).
Attachment 2 is the SOURCE PLAN (reference).

Judge what is visible in the STILL against the plan. Prefer false positives
over misses on anything that would make the still unusable.

Return JSON only:
{
  "screenCount": 0,
  "hasDoubleBed": false,
  "mirroredVsPlan": false,
  "rotationVsPlanDegrees": 0,
  "hasBurnedText": false,
  "hasCadMarks": false,
  "roomsOutsidePlanOutline": 0,
  "apartmentStairsNotInPlan": 0,
  "wetFixturesInDryRooms": 0,
  "inventedOutdoorSpaces": 0,
  "terraceTurnedIntoIndoor": 0,
  "emptyBedrooms": 0,
  "entranceDoorMissing": false,
  "washersOnLeisureTerrace": 0,
  "washerCount": 0,
  "planWasherCount": 0,
  "bathtubCount": 0,
  "planBathtubCount": 0,
  "kitchenFridgeMissing": false,
  "omittedOutdoorSpaces": 0,
  "notes": "one short sentence"
}

Definitions:
- screenCount: every TV, monitor, laptop, tablet, phone, soundbar, freestanding
  pedestal screen, or dark rectangular display panel on a wall, stand, desk,
  nightstand or cabinet. A paper notebook is not a screen. 0 if none.
- hasDoubleBed: true if ANY mattress is a double/queen/king — wide mattress for
  two, two pillows side by side, two nightstands flanking one mattress, or a
  mattress that reads almost as wide as it is long. A twin is a long narrow
  90×200 cm rectangle with at most one nightstand.
- mirroredVsPlan: true if the still is the plan flipped left-right.
- rotationVsPlanDegrees: 0, 90, 180 or 270 — how far the still is turned from the plan.
- hasBurnedText / hasCadMarks: letters, digits, or 2D CAD marks left in the photo.
- roomsOutsidePlanOutline: whole rooms/wings outside the drawn flat outline.
- apartmentStairsNotInPlan: stair shafts / lift cores / ANY outdoor terrace steps
  rendered in the flat. Count them even on paving. 0 only if no treads at all.
- wetFixturesInDryRooms: toilet/basin/bath/shower in a room the plan draws dry.
- inventedOutdoorSpaces: outdoor decks the plan does not hatch.
- omittedOutdoorSpaces: printed מרפסת hatches on the plan that the still omitted
  entirely (sealed wall / bookcases instead of outdoor paving).
- terraceTurnedIntoIndoor: hatched מרפסת rendered as an indoor room.
- emptyBedrooms: plan bedrooms with a bed rectangle that have no mattress in the still.
- entranceDoorMissing: plan draws a front-door swing in an outer wall, but the still
  has unbroken solid wall there — no door leaf, sealed apartment. Balcony slider ≠ front door.
- washerCount / planWasherCount: floor-standing washers/dryers in still vs laundry
  symbols on the plan (bathroom, חדר שירות, מרפסת שירות).
- washersOnLeisureTerrace: washers on a leisure מרפסת that is NOT מרפסת שירות.
- bathtubCount / planBathtubCount: bathtubs in still vs tub symbols on the plan.
  A wet room with only a washer symbol has planBathtubCount 0.
- kitchenFridgeMissing: true ONLY if the plan clearly draws מקרר / fridge and the
  still kitchen has NO tall fridge cabinet. false if a tall fridge is visible, or
  if you are unsure.
`.trim();

function asInt(value: unknown, max = 20): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
}

function anthropicMediaPart(
  base64: string,
  mimeType: string,
):
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } } {
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  const mediaType =
    mimeType === "image/jpg" || mimeType === "image/jpeg"
      ? "image/jpeg"
      : mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/gif"
        ? mimeType
        : "image/jpeg";
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: base64 },
  };
}

/**
 * Merge Claude's second vote into Gemini's audit — usually the more severe reading.
 * Double-bed uses OR for repair targeting; the ship gate drops Claude-only
 * double-bed flags so a false positive cannot discard a paid frame.
 */
export function mergeClaudeModestyIntoAudit(
  gemini: FloorplanVizAudit,
  claude: Omit<ClaudeModestyAudit, "model">,
): FloorplanVizAudit {
  const notes = [gemini.notes, claude.notes ? `claude: ${claude.notes}` : ""]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 300);
  const claudeRot = [90, 180, 270].includes(claude.rotationVsPlanDegrees)
    ? claude.rotationVsPlanDegrees
    : 0;
  return {
    ...gemini,
    screenCount: Math.max(gemini.screenCount, claude.screenCount),
    hasDoubleBed: gemini.hasDoubleBed || claude.hasDoubleBed,
    mirroredVsPlan: gemini.mirroredVsPlan || claude.mirroredVsPlan,
    rotationVsPlanDegrees: gemini.rotationVsPlanDegrees || claudeRot,
    hasBurnedText: gemini.hasBurnedText || claude.hasBurnedText,
    hasCadMarks: gemini.hasCadMarks || claude.hasCadMarks,
    roomsOutsidePlanOutline: Math.max(gemini.roomsOutsidePlanOutline, claude.roomsOutsidePlanOutline),
    apartmentStairsNotInPlan: Math.max(
      gemini.apartmentStairsNotInPlan,
      claude.apartmentStairsNotInPlan,
    ),
    wetFixturesInDryRooms: Math.max(gemini.wetFixturesInDryRooms, claude.wetFixturesInDryRooms),
    inventedOutdoorSpaces: Math.max(gemini.inventedOutdoorSpaces, claude.inventedOutdoorSpaces),
    omittedOutdoorSpaces: Math.max(
      gemini.omittedOutdoorSpaces ?? 0,
      claude.omittedOutdoorSpaces ?? 0,
    ),
    terraceTurnedIntoIndoor: Math.max(gemini.terraceTurnedIntoIndoor, claude.terraceTurnedIntoIndoor),
    emptyBedrooms: Math.max(gemini.emptyBedrooms, claude.emptyBedrooms),
    entranceDoorMissing: gemini.entranceDoorMissing || claude.entranceDoorMissing === true,
    washersOnLeisureTerrace: Math.max(
      gemini.washersOnLeisureTerrace ?? 0,
      claude.washersOnLeisureTerrace ?? 0,
    ),
    // Both judges must agree — Gemini alone false-positived a visible fridge on דירה 22.
    kitchenFridgeMissing:
      gemini.kitchenFridgeMissing === true && claude.kitchenFridgeMissing === true,
    // Appliance counts stay on Gemini unless Claude sees a worse invention.
    washerCount: Math.max(gemini.washerCount ?? 0, claude.washerCount ?? 0),
    planWasherCount: gemini.planWasherCount ?? 0,
    bathtubCount: Math.max(gemini.bathtubCount ?? 0, claude.bathtubCount ?? 0),
    planBathtubCount: gemini.planBathtubCount ?? 0,
    notes,
  };
}

/** @deprecated use auditStillWithClaude — kept as alias for callers/tests */
export async function auditHarediModestyWithClaude(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
): Promise<ClaudeModestyAudit | null> {
  return auditStillWithClaude(still, plan);
}

/**
 * Claude second-judge for every style. Returns null when Anthropic is not
 * configured or every candidate model fails.
 */
export async function auditStillWithClaude(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
): Promise<ClaudeModestyAudit | null> {
  if (!isAnthropicConfigured()) return null;
  recordAmbientFloorplanSpend("audit", "claude-audit");
  const key = env.ANTHROPIC_API_KEY!.trim();
  const models = getAnthropicModelCandidates();
  let lastErr: Error | null = null;

  for (const model of models) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 768,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                anthropicMediaPart(still.base64, still.mimeType),
                anthropicMediaPart(plan.base64, plan.mimeType),
                { type: "text", text: SECOND_JUDGE_INSTRUCTION },
              ],
            },
          ],
        }),
      });

      const body = await res.text().catch(() => res.statusText);
      if (!res.ok) {
        lastErr = new Error(`Anthropic second-judge: ${res.status} ${body.slice(0, 400)}`);
        if (isAnthropicEligibleForModelFallback(res.status, body)) continue;
        log.warn("claude still audit failed", { model, error: lastErr.message });
        return null;
      }

      const parsed = JSON.parse(body) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = parsed.content?.find((c) => c.type === "text")?.text ?? body;
      const raw = parseModelJsonText(text);
      const rot = Number(raw.rotationVsPlanDegrees);
      const audit: ClaudeModestyAudit = {
        screenCount: asInt(raw.screenCount, 20),
        hasDoubleBed: raw.hasDoubleBed === true,
        mirroredVsPlan: raw.mirroredVsPlan === true,
        rotationVsPlanDegrees: [90, 180, 270].includes(rot) ? rot : 0,
        hasBurnedText: raw.hasBurnedText === true,
        hasCadMarks: raw.hasCadMarks === true,
        roomsOutsidePlanOutline: asInt(raw.roomsOutsidePlanOutline, 30),
        apartmentStairsNotInPlan: asInt(raw.apartmentStairsNotInPlan, 10),
        wetFixturesInDryRooms: asInt(raw.wetFixturesInDryRooms, 20),
        inventedOutdoorSpaces: asInt(raw.inventedOutdoorSpaces, 10),
        terraceTurnedIntoIndoor: asInt(raw.terraceTurnedIntoIndoor, 10),
        emptyBedrooms: asInt(raw.emptyBedrooms, 10),
        entranceDoorMissing: raw.entranceDoorMissing === true,
        washersOnLeisureTerrace: asInt(raw.washersOnLeisureTerrace, 20),
        washerCount: asInt(raw.washerCount, 20),
        planWasherCount: asInt(raw.planWasherCount, 20),
        bathtubCount: asInt(raw.bathtubCount, 10),
        planBathtubCount: asInt(raw.planBathtubCount, 10),
        kitchenFridgeMissing: raw.kitchenFridgeMissing === true,
        omittedOutdoorSpaces: asInt(raw.omittedOutdoorSpaces, 10),
        notes: typeof raw.notes === "string" ? raw.notes.slice(0, 200) : "",
        model,
      };
      log.info("claude still audit", {
        model,
        screenCount: audit.screenCount,
        hasDoubleBed: audit.hasDoubleBed,
        mirroredVsPlan: audit.mirroredVsPlan,
        entranceDoorMissing: audit.entranceDoorMissing,
        washersOnLeisureTerrace: audit.washersOnLeisureTerrace,
        kitchenFridgeMissing: audit.kitchenFridgeMissing,
        roomsOutsidePlanOutline: audit.roomsOutsidePlanOutline,
      });
      return audit;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      log.warn("claude still audit error", { model, error: lastErr.message });
    }
  }

  void lastErr;
  return null;
}
