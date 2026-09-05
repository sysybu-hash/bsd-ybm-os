import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  deterministicGenerationConfig,
  getFloorplanLayoutModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";

const log = createLogger("floorplan-viz-audit");

/**
 * What a still is worth is decided by counting, not by how good it looks.
 *
 * The same sales sheet read six times gave four, four, six, five, four and five
 * bedrooms, and even the best still of that batch carried six beds where the
 * drawing has four. Neither the extractor nor the image model is stable enough
 * to trust a single pass, so a generated still is measured against the layout
 * that produced it and re-rolled when the numbers disagree.
 */
export type FloorplanVizAudit = {
  bedTotal: number;
  bedroomCount: number;
  diningTableCount: number;
  islandStoolCount: number;
  /** The same counts read off the SOURCE PLAN, so grading does not inherit extraction errors. */
  planBedTotal: number;
  planBedroomCount: number;
  planIslandStoolCount: number;
  hasDoubleBed: boolean;
  hasBurnedText: boolean;
  hasCadMarks: boolean;
  emptyUnfurnishedRooms: number;
  /** Whole wings invented outside the drawn outline — counts alone never catch these. */
  roomsOutsidePlanOutline: number;
  footprintMatchesPlan: boolean;
  notes: string;
};

const AUDIT_INSTRUCTION = `
You are auditing a 3D still that was generated from an Israeli floor plan.

Attachment 1 is the STILL (the render being audited).
Attachment 2 is the SOURCE PLAN it was supposed to follow.

Count what is actually visible IN THE STILL. Do not describe the plan, and do
not report what the still should have contained. Integers only, no estimates.

Count the SAME things twice: once in the still, once in the plan. The plan is
the reference; the still is what was produced from it.

Return JSON only:
{
  "bedTotal": 0,
  "bedroomCount": 0,
  "diningTableCount": 0,
  "islandStoolCount": 0,
  "planBedTotal": 0,
  "planBedroomCount": 0,
  "planIslandStoolCount": 0,
  "hasDoubleBed": false,
  "hasBurnedText": false,
  "hasCadMarks": false,
  "emptyUnfurnishedRooms": 0,
  "roomsOutsidePlanOutline": 0,
  "footprintMatchesPlan": false,
  "notes": "one short sentence naming the biggest difference from the plan"
}

Definitions, applied strictly:
- bedTotal: every mattress in the still. Two twins side by side count as 2. A single wide mattress counts as 1.
- bedroomCount: enclosed rooms containing at least one bed.
- diningTableCount: dining tables with chairs around them. A kitchen island with stools is NOT a dining table.
- islandStoolCount: stools tucked at the kitchen island. 0 if there is no island.
- hasDoubleBed: true if ANY bed is a double/queen/king — one wide mattress meant for two, or two mattresses pushed together under one headboard.
- hasBurnedText: true if ANY letters or digits are rendered inside the image (room names, dimensions, labels, a title block).
- hasCadMarks: true if any 2D drawing annotation survived into the render — a solid black entrance triangle, a north arrow, dimension ticks, or hatch drawn flat on a floor.
- emptyUnfurnishedRooms: enclosed rooms with floor and walls but no furniture at all.
- planBedTotal: bed rectangles drawn on the PLAN. A wide double rectangle counts as 1.
- planBedroomCount: rooms on the PLAN containing at least one bed rectangle.
- planIslandStoolCount: half-circle stools drawn at the kitchen island on the PLAN. 0 if none.

Then compare the two OUTLINES, which is the check that matters most:
- Trace the apartment's outer boundary on the plan. Note every step, notch and protrusion, and note where the boundary cuts IN so that an area is outside the flat.
- roomsOutsidePlanOutline: how many enclosed rooms in the STILL sit in space the plan leaves OUTSIDE the apartment. A whole wing of rooms added along one side is the failure this is for. Count each invented room. 0 if the still stays inside the drawn boundary.
- footprintMatchesPlan: true only if the still's silhouette is the plan's silhouette — same steps, same notches, same side that the boundary cuts into. A still that fills out a plain rectangle where the plan is stepped is false. A still that grows an extra wing is false.
- Judge the outline by shape alone. Rotation of the whole frame is not what this field is about, and furnishing differences are not either.
`.trim();

function asInt(value: unknown, max = 60): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), max);
}

export async function auditFloorplanStill(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
): Promise<FloorplanVizAudit | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelId of getFloorplanLayoutModelChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: AUDIT_INSTRUCTION },
              { inlineData: { data: still.base64, mimeType: still.mimeType } },
              { inlineData: { data: plan.base64, mimeType: plan.mimeType } },
            ],
          },
        ],
        generationConfig: deterministicGenerationConfig({ responseMimeType: "application/json" }),
      });
      const raw = parseModelJsonText(result.response.text());
      return {
        bedTotal: asInt(raw.bedTotal),
        bedroomCount: asInt(raw.bedroomCount),
        diningTableCount: asInt(raw.diningTableCount, 10),
        islandStoolCount: asInt(raw.islandStoolCount, 20),
        planBedTotal: asInt(raw.planBedTotal),
        planBedroomCount: asInt(raw.planBedroomCount),
        planIslandStoolCount: asInt(raw.planIslandStoolCount, 20),
        hasDoubleBed: raw.hasDoubleBed === true,
        hasBurnedText: raw.hasBurnedText === true,
        hasCadMarks: raw.hasCadMarks === true,
        emptyUnfurnishedRooms: asInt(raw.emptyUnfurnishedRooms, 30),
        roomsOutsidePlanOutline: asInt(raw.roomsOutsidePlanOutline, 30),
        footprintMatchesPlan: raw.footprintMatchesPlan === true,
        notes: typeof raw.notes === "string" ? raw.notes.slice(0, 300) : "",
      };
    } catch (err: unknown) {
      if (isLikelyGeminiModelUnavailable(err)) continue;
      log.warn("audit failed", { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }
  return null;
}

export type AuditVerdict = { failures: string[]; score: number };

/**
 * Grades an audit against the layout the still was generated from.
 *
 * `score` counts failures, so lower is better and the caller can keep the least
 * bad attempt when no attempt is clean. Modesty and annotation failures are
 * listed alongside count failures — a still that reads as a brochure but shows
 * a double bed is not usable for a haredi client.
 */
export function gradeFloorplanStill(
  audit: FloorplanVizAudit,
  layout: FloorplanLayout,
  options?: { haredi?: boolean },
): AuditVerdict {
  const rooms = layout.rooms ?? [];
  // The plan is the reference, not the extraction. On דירה 14 the extractor read
  // three island stools where the sheet draws four, and grading against it
  // rejected a still that had actually got the stools right. Where the auditor
  // could read a count straight off the plan, that count wins; the extraction is
  // only the fallback for anything it could not see.
  const extractedBeds = rooms.reduce((sum, room) => sum + (room.bedCount ?? 0), 0);
  const extractedBedrooms = rooms.filter(
    (room) => (room.kind === "bedroom" || room.kind === "mmd") && (room.bedCount ?? 0) > 0,
  ).length;
  const expectedBeds = audit.planBedTotal > 0 ? audit.planBedTotal : extractedBeds;
  const expectedBedrooms =
    audit.planBedroomCount > 0 ? audit.planBedroomCount : extractedBedrooms;

  const failures: string[] = [];
  // Geometry first. דירה 14 came back with an entire invented right-hand wing —
  // a bathroom, a bedroom and a laundry in space the plan leaves outside the
  // flat — and every count still matched, so counting alone passed it.
  if (audit.roomsOutsidePlanOutline > 0) {
    failures.push(`${audit.roomsOutsidePlanOutline} room(s) invented outside the plan outline`);
  }
  if (!audit.footprintMatchesPlan) failures.push("footprint does not match the plan outline");
  if (audit.hasBurnedText) failures.push("letters or digits rendered into the image");
  if (audit.hasCadMarks) failures.push("2D CAD annotation copied into the render");
  if (options?.haredi && audit.hasDoubleBed) failures.push("a double bed in a haredi still");
  if (expectedBeds > 0 && audit.bedTotal !== expectedBeds) {
    failures.push(`beds ${audit.bedTotal}, plan has ${expectedBeds}`);
  }
  if (expectedBedrooms > 0 && audit.bedroomCount !== expectedBedrooms) {
    failures.push(`bedrooms ${audit.bedroomCount}, plan has ${expectedBedrooms}`);
  }
  if (audit.diningTableCount > 1) {
    failures.push(`${audit.diningTableCount} dining tables, a flat has one`);
  }
  const expectedStools =
    audit.planIslandStoolCount > 0 ? audit.planIslandStoolCount : layout.islandStoolCount ?? 0;
  if (expectedStools > 0 && audit.islandStoolCount !== expectedStools) {
    failures.push(`island stools ${audit.islandStoolCount}, plan has ${expectedStools}`);
  }
  if (audit.emptyUnfurnishedRooms > 0) {
    failures.push(`${audit.emptyUnfurnishedRooms} room(s) left unfurnished`);
  }
  return { failures, score: failures.length };
}
