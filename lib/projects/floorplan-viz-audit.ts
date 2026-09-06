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
  /** Any TV, monitor, laptop or tablet on show — forbidden outright for a haredi client. */
  screenCount: number;
  kitchenSinkBasins: number;
  planKitchenSinkBasins: number;
  /** Openings cut into any wall — outer or internal — the plan draws as unbroken hatch. */
  openingsNotInPlan: number;
  /** Large fitted pieces standing where the sheet draws empty floor. */
  builtInsNotInPlan: number;
  /** Anything standing on the floor of the entrance or a circulation strip. */
  entranceFurnitureCount: number;
  /** Sofa/armchair groups in the still, and the number the plan draws. */
  seatingGroupCount: number;
  planSeatingGroupCount: number;
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
  "screenCount": 0,
  "kitchenSinkBasins": 0,
  "planKitchenSinkBasins": 0,
  "openingsNotInPlan": 0,
  "builtInsNotInPlan": 0,
  "entranceFurnitureCount": 0,
  "seatingGroupCount": 0,
  "planSeatingGroupCount": 0,
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
- screenCount: how many screens appear anywhere in the still — a wall-mounted TV, a monitor, a laptop, a tablet. Count a dark rectangular panel mounted on a wall or standing on a media unit as a screen. 0 if there are none.
- kitchenSinkBasins: basins in the kitchen sink run of the STILL. A double-bowl sink is 2 basins in one fixture. Count basins, not fixtures.
- planKitchenSinkBasins: the same count read off the PLAN — the drawn sink basins on the kitchen counter. A double-bowl is 2.
- hasBurnedText: true if ANY letters or digits are rendered inside the image (room names, dimensions, labels, a title block).
- hasCadMarks: true if any 2D drawing annotation survived into the render — a solid black entrance triangle, a north arrow, dimension ticks, or hatch drawn flat on a floor.
- emptyUnfurnishedRooms: enclosed rooms with floor and walls but no furniture at all.
- planBedTotal: bed rectangles drawn on the PLAN. A wide double rectangle counts as 1.
- planBedroomCount: rooms on the PLAN containing at least one bed rectangle.
- planIslandStoolCount: half-circle stools drawn at the kitchen island on the PLAN. 0 if none.
- openingsNotInPlan: walk EVERY wall, outer and internal. Count openings in the STILL — windows, doorways, pass-throughs — that sit where the plan draws unbroken wall hatch. A bathroom opened onto the service balcony beside it, when the sheet draws a solid wall between them, is one. An opening the plan does draw is not counted, however it is styled.
- entranceFurnitureCount: pieces standing ON THE FLOOR of the entrance hall or a circulation strip that the plan draws as empty — a table, a desk, a chair, a console, a sideboard, a shelving unit, a bookcase, a sofa, a plant stand. Find the front door first, then look at the space just inside it. A mirror or coat hooks mounted on the wall are NOT counted. 0 if that floor is clear.
- builtInsNotInPlan: large fitted pieces in the STILL standing where the sheet draws empty floor — a bookcase, a sefarim cabinet, a wardrobe, a media unit, a shelving wall. The entrance and the circulation strips are where these keep appearing. Count each one. NOT counted: a slim hall console, a mirror, a coat hook, or small props sitting on furniture that is drawn — those are allowed staging.
- seatingGroupCount: LOUNGE groups in the STILL — a sofa, or a pair of armchairs, gathered around a rug or a coffee table. One such gathering is one group, and an entrance hall with a sofa and a rug in it counts as a group of its own. NOT a seating group: a dining table with chairs around it, a desk with a chair, stools at a kitchen island, or chairs on a terrace.
- planSeatingGroupCount: the same count on the PLAN, from the drawn sofa and armchair symbols. Usually 1, in the living room.

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
        screenCount: asInt(raw.screenCount, 20),
        kitchenSinkBasins: asInt(raw.kitchenSinkBasins, 8),
        planKitchenSinkBasins: asInt(raw.planKitchenSinkBasins, 8),
        openingsNotInPlan: asInt(raw.openingsNotInPlan, 30),
        builtInsNotInPlan: asInt(raw.builtInsNotInPlan, 30),
        entranceFurnitureCount: asInt(raw.entranceFurnitureCount, 20),
        seatingGroupCount: asInt(raw.seatingGroupCount, 10),
        planSeatingGroupCount: asInt(raw.planSeatingGroupCount, 10),
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

export type AuditVerdict = {
  failures: string[];
  score: number;
  /** Failures that disqualify a frame outright, whatever else is right about it. */
  hardFailures: string[];
};

/**
 * Some failures are not one item on a list.
 *
 * Scoring by failure count shipped a still with a double bed in three of its
 * four bedrooms, because one modesty failure counted less than three count
 * mismatches. For a haredi client a double bed, a screen or Hebrew text burned
 * into the frame makes the still unusable no matter how well everything else
 * lines up, and so does a room standing in space the plan leaves outside the
 * flat — a still that invents a wing is not a still of this apartment. They are
 * weighted to dominate any number of soft failures.
 */
const HARD_FAILURE_WEIGHT = 100;

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
  const hardFailures: string[] = [];
  const hard = (message: string) => {
    failures.push(message);
    hardFailures.push(message);
  };
  // Geometry first. דירה 14 came back with an entire invented right-hand wing —
  // a bathroom, a bedroom and a laundry in space the plan leaves outside the
  // flat — and every count still matched, so counting alone passed it.
  if (audit.roomsOutsidePlanOutline > 0) {
    hard(`${audit.roomsOutsidePlanOutline} room(s) invented outside the plan outline`);
  }
  // Deliberately soft, unlike the invented rooms above. This one is a holistic
  // judgement about a silhouette and it comes back false on nearly every frame,
  // so promoting it would flatten the ranking and leave nothing to choose by.
  // A counted room standing in space the plan leaves outside the flat is the
  // specific, checkable version of the same complaint.
  if (!audit.footprintMatchesPlan) failures.push("footprint does not match the plan outline");
  if (audit.hasBurnedText) hard("letters or digits rendered into the image");
  if (audit.hasCadMarks) failures.push("2D CAD annotation copied into the render");
  if (options?.haredi && audit.hasDoubleBed) hard("a double bed in a haredi still");
  // Screens were passing unnoticed: the modesty prompt forbids them outright,
  // but nothing counted them, and a still with a TV in every bedroom went out
  // having passed every other check.
  if (options?.haredi && audit.screenCount > 0) {
    hard(`${audit.screenCount} screen(s) in a haredi still`);
  }
  if (audit.planKitchenSinkBasins > 0 && audit.kitchenSinkBasins !== audit.planKitchenSinkBasins) {
    failures.push(
      `kitchen sink basins ${audit.kitchenSinkBasins}, plan draws ${audit.planKitchenSinkBasins}`,
    );
  }
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
  if (audit.openingsNotInPlan > 0) {
    failures.push(`${audit.openingsNotInPlan} opening(s) cut into a wall the plan draws solid`);
  }
  if (audit.builtInsNotInPlan > 0) {
    failures.push(`${audit.builtInsNotInPlan} fitted unit(s) the plan does not draw`);
  }
  if (audit.entranceFurnitureCount > 0) {
    failures.push(`${audit.entranceFurnitureCount} piece(s) of furniture in the entrance`);
  }
  if (audit.planSeatingGroupCount > 0 && audit.seatingGroupCount > audit.planSeatingGroupCount) {
    failures.push(
      `${audit.seatingGroupCount} seating group(s), plan draws ${audit.planSeatingGroupCount}`,
    );
  }
  if (audit.emptyUnfurnishedRooms > 0) {
    failures.push(`${audit.emptyUnfurnishedRooms} room(s) left unfurnished`);
  }
  const soft = failures.length - hardFailures.length;
  return { failures, hardFailures, score: hardFailures.length * HARD_FAILURE_WEIGHT + soft };
}
