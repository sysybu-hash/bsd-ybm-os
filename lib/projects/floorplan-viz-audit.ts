import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { recordAiUsage, usageFromGemini } from "@/lib/ai-usage";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  deterministicGenerationConfig,
  getFloorplanLayoutModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";
import { layoutHasInternalStairs } from "@/lib/projects/floorplan-layout";

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
  /** Floor-standing washers/dryers visible in the still (count machines, not stacked pairs as one). */
  washerCount: number;
  /** Same count read off the PLAN — laundry / חדר שירות / bathroom washer symbols. */
  planWasherCount: number;
  /**
   * Washers standing on a leisure מרפסת / terrace (planters, railing, outdoor deck)
   * that is NOT labeled מרפסת שירות / שטח שרות. Service-balcony washers are OK.
   */
  washersOnLeisureTerrace: number;
  /** Bathtubs in the still. */
  bathtubCount: number;
  /** Bathtub symbols on the PLAN. 0 when the wet room draws a washer instead of a tub. */
  planBathtubCount: number;
  /**
   * Plan draws a fridge / מקרר rectangle in the kitchen, but the still has no
   * tall fridge cabinet there.
   */
  kitchenFridgeMissing: boolean;
  /** Openings cut into any wall — outer or internal — the plan draws as unbroken hatch. */
  openingsNotInPlan: number;
  /** Large fitted pieces standing where the sheet draws empty floor. */
  builtInsNotInPlan: number;
  /** Anything standing on the floor of the entrance or a circulation strip. */
  entranceFurnitureCount: number;
  /** Toilets, basins, baths or showers standing in a room that is not a wet room. */
  wetFixturesInDryRooms: number;
  /** Stair flights drawn inside the flat where the sheet puts them in the core. */
  apartmentStairsNotInPlan: number;
  /** Sofa/armchair groups in the still, and the number the plan draws. */
  seatingGroupCount: number;
  planSeatingGroupCount: number;
  hasBurnedText: boolean;
  hasCadMarks: boolean;
  emptyUnfurnishedRooms: number;
  /** Bedrooms the plan draws a bed in that the still left as empty floor. */
  emptyBedrooms: number;
  /** Outdoor decks grown to bedroom size, or larger than the printed pocket. */
  oversizedTerraces: number;
  /** Whole wings invented outside the drawn outline — counts alone never catch these. */
  roomsOutsidePlanOutline: number;
  /** Indoor living/kitchen/hall rendered as terrace paving. */
  indoorRoomsTurnedOutdoor: number;
  /** Two printed terrace pockets merged into one deck down a façade. */
  terracesMergedIntoOneDeck: boolean;
  /** Outdoor paving covers more of the plate than the living room. */
  outdoorPavingLargerThanLiving: boolean;
  /** Front door / מבואה rendered as a terrace that the plan does not draw. */
  entranceTurnedIntoTerrace: boolean;
  /**
   * Plan draws a front-door swing / triangle in the outer wall, but the still
   * has unbroken wall there — no door leaf, no opening, sealed apartment.
   */
  entranceDoorMissing: boolean;
  /** Hatched מרפסת rendered as an indoor room (wood floor, desk, sofa, bed). */
  terraceTurnedIntoIndoor: number;
  /** Terraces/decks in the still that the plan does not hatch. */
  inventedOutdoorSpaces: number;
  /**
   * Hatched מרפסת pockets on the PLAN that the STILL omitted (no outdoor paving
   * there — sealed wall, bookcase, or indoor floor instead).
   */
  omittedOutdoorSpaces: number;
  footprintMatchesPlan: boolean;
  /** The still is the plan flipped — a defect no amount of re-rolling notices. */
  mirroredVsPlan: boolean;
  /** How far the still is turned from the plan: 0, 90, 180 or 270 degrees. */
  rotationVsPlanDegrees: number;
  /** True when the still is flat coloured CAD blocks, not a photoreal brochure photo. */
  looksLikeCadMassing: boolean;
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
  "washerCount": 0,
  "planWasherCount": 0,
  "washersOnLeisureTerrace": 0,
  "bathtubCount": 0,
  "planBathtubCount": 0,
  "kitchenFridgeMissing": false,
  "openingsNotInPlan": 0,
  "builtInsNotInPlan": 0,
  "entranceFurnitureCount": 0,
  "wetFixturesInDryRooms": 0,
  "apartmentStairsNotInPlan": 0,
  "seatingGroupCount": 0,
  "planSeatingGroupCount": 0,
  "hasBurnedText": false,
  "hasCadMarks": false,
  "emptyUnfurnishedRooms": 0,
  "emptyBedrooms": 0,
  "oversizedTerraces": 0,
  "roomsOutsidePlanOutline": 0,
  "indoorRoomsTurnedOutdoor": 0,
  "terracesMergedIntoOneDeck": false,
  "outdoorPavingLargerThanLiving": false,
  "entranceTurnedIntoTerrace": false,
  "entranceDoorMissing": false,
  "terraceTurnedIntoIndoor": 0,
  "inventedOutdoorSpaces": 0,
  "omittedOutdoorSpaces": 0,
  "footprintMatchesPlan": false,
  "mirroredVsPlan": false,
  "rotationVsPlanDegrees": 0,
  "looksLikeCadMassing": false,
  "notes": "one short sentence naming the biggest difference from the plan"
}

Definitions, applied strictly:
- bedTotal: every mattress in the still. Two twins side by side count as 2. A single wide mattress counts as 1.
- bedroomCount: enclosed rooms containing at least one bed.
- diningTableCount: dining tables with chairs around them. A kitchen island with stools is NOT a dining table.
- islandStoolCount: stools tucked at the kitchen island. 0 if there is no island.
- hasDoubleBed: true if ANY bed is a double/queen/king — one wide mattress meant for two, two pillows side by side, two nightstands flanking one mattress, a mattress with nightstands on BOTH long sides, or a mattress that reads almost as wide as it is long. A twin is a long narrow 90×200 cm rectangle with at most one nightstand. Two mattresses pushed together under one headboard also count.
- screenCount: how many screens appear anywhere in the still — a wall-mounted TV, a freestanding TV on a pedestal or low stand facing a bed or sofa, a monitor, a laptop, a tablet, a phone, a soundbar, or any dark rectangular panel on a wall/cabinet/desk that reads as a display. From bird's-eye a closed laptop is a dark rounded rectangle on a desk or nightstand; a dark panel on a wall, stand or cabinet is a TV. Count each. A paper notebook is not a screen. 0 if there are none.
- kitchenSinkBasins: basins in the kitchen sink run of the STILL. A double-bowl sink is 2 basins in one fixture. Count basins, not fixtures.
- planKitchenSinkBasins: the same count read off the PLAN — the drawn sink basins on the kitchen counter. A double-bowl is 2.
- washerCount: every floor-standing washing machine or dryer visible in the STILL — white box appliance with a circular door, on a balcony, in a bathroom, or in חדר שירות. Count each machine. A stacked washer+dryer is 2.
- planWasherCount: the same count on the PLAN — square/circle laundry symbols labeled מכונת כביסה / כביסה, or a washer drawn in a wet room / חדר שירות / מרפסת שירות. 0 if the sheet draws none.
- washersOnLeisureTerrace: how many of those still washers sit on a leisure outdoor מרפסת (hatched terrace with railing/planters that is NOT מרפסת שירות / שטח שרות). Washers belong only where the plan puts them (bathroom, חדר שירות, or a labeled service balcony). 0 if every washer is indoors or on a true service balcony.
- bathtubCount: freestanding or built-in bathtubs in the STILL. A shower tray is not a bathtub.
- planBathtubCount: bathtub symbols on the PLAN. A wet room that draws only a toilet + basin + washer (no tub outline) has planBathtubCount 0.
- kitchenFridgeMissing: true ONLY if the PLAN clearly draws a tall fridge / מקרר
  rectangle in the kitchen AND the STILL kitchen has NO tall fridge cabinet at all
  (only low counters / cooktop / sink, nothing fridge-height). false if ANY tall
  metallic or panel fridge cabinet is visible in the kitchen — even without a
  brand logo. Do not set true when unsure.
- hasBurnedText: true ONLY if readable room names, dimension strings, area figures, or a title-block caption are burned into the photograph. Blank book spines, wood grain, rug patterns, and abstract shelf texture that do not resolve into readable letters do NOT count. false if the only "text-like" marks are unmarked sefarim spines.
- hasCadMarks: true if any 2D drawing annotation survived into the render — a solid black entrance triangle, a north arrow, dimension ticks, or hatch drawn flat on a floor.
- emptyUnfurnishedRooms: enclosed rooms with floor and walls but no furniture at all.
- emptyBedrooms: rooms the PLAN draws as a bedroom with a bed rectangle that in the STILL have no mattress. A wardrobe-only room where the sheet draws a bed is 1. Empty ממ"ד that the sheet draws empty is NOT counted. 0 if every drawn bed has a mattress.
- oversizedTerraces: how many outdoor decks in the STILL are as large as a bedroom, or clearly larger than the printed terrace pocket. A 4–5 m² doorway-deep strip grown to bedroom size is 1. A roof terrace pulled onto this floor and merged with a same-level pocket counts as 1. 0 if every terrace stays a small hatched strip.
- planBedTotal: bed rectangles drawn on the PLAN. A wide double rectangle counts as 1.
- planBedroomCount: rooms on the PLAN containing at least one bed rectangle.
- planIslandStoolCount: half-circle stools drawn at the kitchen island on the PLAN. 0 if none.
- openingsNotInPlan: walk EVERY wall, outer and internal. Count openings in the STILL — windows, doorways, pass-throughs — that sit where the plan draws unbroken wall hatch. A bathroom opened onto the service balcony beside it, when the sheet draws a solid wall between them, is one. An opening the plan does draw is not counted, however it is styled.
- apartmentStairsNotInPlan: count EVERY stair flight visible in the STILL — a concrete shaft, lift-core treads, OR open outdoor steps / stair run on a terrace or balcony. Invented roof stairs on paving are the usual miss and MUST be counted. 0 ONLY if there are no treads anywhere in the photograph. Do not exempt "outdoor terrace steps".
- wetFixturesInDryRooms: toilets, basins, bathtubs and showers standing in a room that is NOT a bathroom on the plan — a toilet beside a bed, a basin on a bedroom wall, a bath in a living room. Count each fixture. Judge the room by what the plan draws there, not by how the still tiled the floor: a bedroom whose floor came out tiled is still a bedroom. 0 if every wet fixture is inside a room the sheet draws pans or basins in.
- entranceFurnitureCount: pieces standing ON THE FLOOR of the entrance hall or a circulation strip that the plan draws as empty — a table, a desk, a chair, a console, a sideboard, a shelving unit, a bookcase, a sofa, a plant stand. Find the front door first, then look at the space just inside it. A mirror or coat hooks mounted on the wall are NOT counted. 0 if that floor is clear.
- builtInsNotInPlan: large fitted pieces in the STILL standing where the sheet draws empty floor — a bookcase, a sefarim cabinet, a wardrobe, a media unit, a shelving wall. The entrance and the circulation strips are where these keep appearing. Count each one. NOT counted: a slim hall console, a mirror, a coat hook, or small props sitting on furniture that is drawn — those are allowed staging.
- seatingGroupCount: LOUNGE groups in the STILL — a sofa, or a pair of armchairs, gathered around a rug or a coffee table. One such gathering is one group, and an entrance hall with a sofa and a rug in it counts as a group of its own. NOT a seating group: a dining table with chairs around it, a desk with a chair, stools at a kitchen island, or chairs on a terrace.
- planSeatingGroupCount: the same count on the PLAN, from the drawn sofa and armchair symbols. 0 if the living room is dining-only (table and chairs, no sofa).

Then compare the two OUTLINES, which is the check that matters most:
- Trace the apartment's outer boundary on the plan. Note every step, notch and protrusion, and note where the boundary cuts IN so that an area is outside the flat.
- roomsOutsidePlanOutline: how many enclosed rooms in the STILL sit in space the plan leaves OUTSIDE the apartment. A whole wing of rooms added along one side is the failure this is for. Also count a room whose walls do not exist on the sheet (invented partition creating an extra bedroom/bath). Count each invented room. 0 if the still stays inside the drawn boundary and keeps the same room graph.
- indoorRoomsTurnedOutdoor: how many rooms the PLAN draws as indoor (living, kitchen, hall, entrance/מבואה, bedroom, bathroom) that the STILL rendered as outdoor terrace — pale paving, planters, open to the sky, a deck. The usual miss is paving the living/kitchen volume and running a wraparound deck down that wall. 0 if indoor rooms still have indoor floors under a roof.
- terracesMergedIntoOneDeck: true if the still joins two (or more) printed terrace pockets into one continuous outdoor deck along a façade. Separate hatched pockets on the plan must stay separate.
- outdoorPavingLargerThanLiving: true if the outdoor paving in the still covers more of the floor plate than the living room does. Printed terraces on these sheets are small strips (about 4–6 m²), never a courtyard.
- entranceTurnedIntoTerrace: true if the PLAN's front door / כניסה / מבואה (the swing in the outer wall next to חדר מדרגות or מעלית) was replaced in the STILL by outdoor paving, planters, or an open deck. The entrance is an indoor hall with a door. A terrace at that spot that the sheet does not hatch as מרפסת is this failure. A black CAD entrance triangle drawn on paving is this failure too — that mark is not an indoor hall.
- entranceDoorMissing: true if the PLAN draws a front-door swing, door leaf, or entrance triangle in an OUTER wall (usually next to חדר מדרגות / מעלית / the corridor), but the STILL shows unbroken solid wall there with no door leaf and no doorway. A sealed apartment you cannot enter is this failure. A balcony sliding door is NOT the front door. false only if a real door leaf or clear doorway sits where the plan puts the entrance.
- terraceTurnedIntoIndoor: how many pockets the PLAN hatches as מרפסת / terrace (brick or paving, a printed area figure) that the STILL furnished as an indoor room — wood floor, a sofa, a desk, a bed, a sitting nook. Stairs on a terrace up to a higher elevation are still a terrace, not a room. 0 if every hatched terrace stays outdoor paving.
- inventedOutdoorSpaces: how many terraces, decks or roof sitting areas in the STILL sit on a façade the PLAN does not hatch as מרפסת at THIS floor's ⊕ elevation. A furnished terrace stuck on the living room's north wall when the sheet has no same-level pocket there is one. A roof terrace (different ⊕) pulled onto this plate with dining furniture or stairs is one. 0 if every outdoor space matches a printed same-level hatch.
- omittedOutdoorSpaces: how many pockets the PLAN hatches as מרפסת / שטח המרפסת (brick/grid paving + printed m² figure) that the STILL completely omitted — no outdoor paving there at all. Typical miss: a 3.3 m² living balcony sealed as a solid outer wall with curtains, or filled with bookcases. Count each missing pocket. 0 if every printed מרפסת hatch still appears as outdoor paving in the still (size may be imperfect).
- mirroredVsPlan: true if the still is the plan flipped left-to-right (or right-to-left). Check a feature you can place with certainty — which side the entrance door is on, which side the kitchen is on — and compare it to the plan. A mirrored still has all the right rooms in all the wrong places, so it survives every count-based check; say so here.
- rotationVsPlanDegrees: how far the still is turned from the plan — 0, 90, 180 or 270, counter-clockwise. Use the same landmarks: if the plan puts the bathrooms at the bottom and the kitchen upper-right and the still puts the bathrooms at the top and the kitchen on the left, that is 180. Report this separately from mirroredVsPlan; a still can be turned without being flipped, and a silhouette can still match while turned.
- looksLikeCadMassing: true if the STILL is NOT a photoreal photograph of a furnished apartment — flat untextured coloured blocks for furniture, solid blue wet fixtures, brown slab beds with no bedding, no wood grain, no pillows, no lamps, no real-room shadows. A sales brochure still is false. A CAD / game-map / schematic plate is true.
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
      recordAiUsage(modelId, usageFromGemini(result));
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
        washerCount: asInt(raw.washerCount, 20),
        planWasherCount: asInt(raw.planWasherCount, 20),
        washersOnLeisureTerrace: asInt(raw.washersOnLeisureTerrace, 20),
        bathtubCount: asInt(raw.bathtubCount, 10),
        planBathtubCount: asInt(raw.planBathtubCount, 10),
        kitchenFridgeMissing: raw.kitchenFridgeMissing === true,
        openingsNotInPlan: asInt(raw.openingsNotInPlan, 30),
        builtInsNotInPlan: asInt(raw.builtInsNotInPlan, 30),
        entranceFurnitureCount: asInt(raw.entranceFurnitureCount, 20),
        wetFixturesInDryRooms: asInt(raw.wetFixturesInDryRooms, 20),
        apartmentStairsNotInPlan: asInt(raw.apartmentStairsNotInPlan, 10),
        seatingGroupCount: asInt(raw.seatingGroupCount, 10),
        planSeatingGroupCount: asInt(raw.planSeatingGroupCount, 10),
        hasBurnedText: raw.hasBurnedText === true,
        hasCadMarks: raw.hasCadMarks === true,
        emptyUnfurnishedRooms: asInt(raw.emptyUnfurnishedRooms, 30),
        emptyBedrooms: asInt(raw.emptyBedrooms, 10),
        oversizedTerraces: asInt(raw.oversizedTerraces, 10),
        roomsOutsidePlanOutline: asInt(raw.roomsOutsidePlanOutline, 30),
        indoorRoomsTurnedOutdoor: asInt(raw.indoorRoomsTurnedOutdoor, 20),
        terracesMergedIntoOneDeck: raw.terracesMergedIntoOneDeck === true,
        outdoorPavingLargerThanLiving: raw.outdoorPavingLargerThanLiving === true,
        entranceTurnedIntoTerrace: raw.entranceTurnedIntoTerrace === true,
        entranceDoorMissing: raw.entranceDoorMissing === true,
        terraceTurnedIntoIndoor: asInt(raw.terraceTurnedIntoIndoor, 10),
        inventedOutdoorSpaces: asInt(raw.inventedOutdoorSpaces, 10),
        omittedOutdoorSpaces: asInt(raw.omittedOutdoorSpaces, 10),
        footprintMatchesPlan: raw.footprintMatchesPlan === true,
        mirroredVsPlan: raw.mirroredVsPlan === true,
        rotationVsPlanDegrees: [90, 180, 270].includes(Number(raw.rotationVsPlanDegrees))
          ? Number(raw.rotationVsPlanDegrees)
          : 0,
        looksLikeCadMassing: raw.looksLikeCadMassing === true,
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
 * flat, and so does a toilet beside a bed — a still that invents a wing is not a still of this apartment. They are
 * weighted to dominate any number of soft failures.
 */
const HARD_FAILURE_WEIGHT = 100;

/**
 * Hard failures a haredi client must never see in a shipped still.
 * Screens and double beds are removable with a surgical repair; layout
 * failures need a re-roll.
 */
export function harediModestyFailures(hardFailures: string[]): string[] {
  return hardFailures.filter((f) => /screen|double bed/i.test(f));
}

/**
 * Hard failures that a surgical edit can fix without redrawing the flat.
 * Text / CAD marks for every style; screens and double beds for haredi.
 */
export function surgicallyRemovableFailures(
  hardFailures: string[],
  options?: { haredi?: boolean },
): string[] {
  return hardFailures.filter((f) => {
    if (/front door missing|stair flight|terrace\(s\) invented|terrace\(s\) grown|printed terrace\(s\) missing|invented outside|furnished as indoor|washer|bathtub/i.test(f)) {
      return true;
    }
    if (/letters or digits|CAD annotation/i.test(f)) return true;
    if (options?.haredi && /screen|double bed/i.test(f)) return true;
    return false;
  });
}

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
  options?: {
    haredi?: boolean;
    /**
     * What the geometry render actually contains, when the still was made from
     * one. This outranks both readings of the plan, and not as a third opinion:
     * the model was handed an image with exactly this many bed blocks in it and
     * asked to change nothing but the materials, so the count is a fact about
     * the input rather than an interpretation of the sheet. Both plan readings
     * are interpretations, and on דירה 14 they disagree — the auditor sees three
     * beds where the extractor sees six — which leaves the grader with no target
     * at all and every frame passing the bed check.
     */
    drawn?: { beds?: number };
  },
): AuditVerdict {
  const rooms = layout.rooms ?? [];
  const extractedBeds = rooms.reduce((sum, room) => sum + (room.bedCount ?? 0), 0);
  const extractedBedrooms = rooms.filter((room) => {
    if (room.kind === "bedroom") return true;
    if (room.kind === "mmd") return (room.bedCount ?? 0) > 0;
    return false;
  }).length;

  // Which reading of the plan to grade against.
  //
  // This used to be "the auditor's read wins wherever it has one", after the
  // extractor miscounted island stools on דירה 14. That was the wrong lesson.
  // On the CAD sheet for the same flat the auditor reads the plan as three
  // bedrooms and three beds; the sheet labels four rooms חד.שינה and draws six
  // beds. So the grader was comparing every still against a target that was
  // itself wrong, which is worse than not checking: it passed stills that had
  // dropped the ממ"ד and would have failed one that got all four rooms right.
  //
  // Split it by what each source is actually doing. A bedroom count comes off
  // printed room labels, which the extractor reads from the CAD text — that is
  // authoritative, and it is exactly the count vision keeps getting wrong,
  // because the ממ"ד does not look like a bedroom. Beds and stools are both
  // sources counting drawn symbols, and both are fallible; when they disagree
  // the honest answer is that we do not know the target, so skip that check
  // rather than invent one. The plan is a fixed object — two readings that
  // disagree mean neither has earned the right to fail a still.
  const expectedBedrooms = extractedBedrooms > 0 ? extractedBedrooms : audit.planBedroomCount;
  // Exact agreement or nothing. Splitting the difference would just be a third
  // guess: on stools the extraction is the one that was wrong (3 where the sheet
  // draws 4), on beds the auditor is (3 where it draws 6), so neither side can be
  // preferred on principle. One of them missing entirely is different — then
  // there is only one reading and no contradiction to resolve.
  const agreed = (extracted: number, seen: number): number | null => {
    if (extracted <= 0) return seen > 0 ? seen : null;
    if (seen <= 0) return extracted;
    return extracted === seen ? extracted : null;
  };
  const drawnBeds = options?.drawn?.beds ?? 0;
  // Prefer layout bed symbols when present. Skipping on extractor↔auditor
  // disagreement let דירה 23 ship with 2 beds where the sheet draws 3.
  const expectedBeds =
    drawnBeds > 0
      ? drawnBeds
      : extractedBeds > 0
        ? extractedBeds
        : audit.planBedTotal > 0
          ? audit.planBedTotal
          : null;

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
  if ((audit.indoorRoomsTurnedOutdoor ?? 0) > 0) {
    hard(`${audit.indoorRoomsTurnedOutdoor} indoor room(s) rendered as outdoor paving`);
  }
  if (audit.terracesMergedIntoOneDeck) {
    hard("printed terraces merged into one deck");
  }
  if (audit.outdoorPavingLargerThanLiving) {
    hard("outdoor paving covers more of the plate than the living room");
  }
  if (audit.entranceTurnedIntoTerrace) {
    hard("entrance turned into a terrace the plan does not draw");
  }
  if (audit.entranceDoorMissing) {
    hard("front door missing where the plan draws the entrance");
  }
  if ((audit.terraceTurnedIntoIndoor ?? 0) > 0) {
    hard(`${audit.terraceTurnedIntoIndoor} hatched terrace(s) furnished as indoor rooms`);
  }
  if ((audit.inventedOutdoorSpaces ?? 0) > 0) {
    hard(`${audit.inventedOutdoorSpaces} terrace(s) invented where the plan has no hatch`);
  }
  if ((audit.omittedOutdoorSpaces ?? 0) > 0) {
    hard(`${audit.omittedOutdoorSpaces} printed terrace(s) missing from the still`);
  }
  if ((audit.oversizedTerraces ?? 0) > 0) {
    hard(`${audit.oversizedTerraces} terrace(s) grown larger than the printed pocket`);
  }
  if ((audit.emptyBedrooms ?? 0) > 0) {
    hard(`${audit.emptyBedrooms} bedroom(s) left without a bed`);
  }
  // Soft alone was how דירה 23 shipped a sealed rectangle with no 3.3 m² balcony:
  // counts matched, footprintMatchesPlan was false, and nothing hard-blocked.
  if (!audit.footprintMatchesPlan) {
    if ((audit.omittedOutdoorSpaces ?? 0) > 0 || (audit.inventedOutdoorSpaces ?? 0) > 0) {
      hard("footprint does not match the plan outline");
    } else {
      failures.push("footprint does not match the plan outline");
    }
  }  // Hard, unlike footprintMatchesPlan next to it. That one is a holistic judgement
  // that comes back false on nearly every frame, so promoting it would flatten the
  // ranking. A mirror is a specific, checkable fact, and it is the one defect that
  // passes every count we have — right rooms, right beds, right sinks, all on the
  // wrong side — which is exactly how a flipped plan shipped as "every count matched".
  if (audit.mirroredVsPlan) hard("the still is the plan mirrored left-to-right");
  // Hard for the same reason as the mirror, and added for the same reason too
  // late: the auditor had been writing "the render is rotated 180 degrees" into
  // its free-text notes on run after run of דירה 14 while every field said the
  // frame was fine — footprintMatchesPlan included, because a silhouette turned
  // through 180 still matches itself.
  if (audit.rotationVsPlanDegrees !== 0) {
    hard(`the still is turned ${audit.rotationVsPlanDegrees} degrees from the plan`);
  }
  if (audit.hasBurnedText) hard("letters or digits rendered into the image");
  if (audit.hasCadMarks) hard("2D CAD annotation copied into the render");
  if (audit.looksLikeCadMassing) hard("CAD block massing shipped instead of a photoreal still");
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
  // Appliance fidelity — דירה 21 shipped with a bathtub where the sheet draws a
  // washer, four washers dumped onto leisure terraces, and no kitchen fridge.
  // None of those were fields, so every count-based check passed.
  if ((audit.washersOnLeisureTerrace ?? 0) > 0) {
    hard(
      `${audit.washersOnLeisureTerrace} washer(s) on a leisure terrace — laundry belongs indoors or on מרפסת שירות only`,
    );
  }
  if ((audit.washerCount ?? 0) !== (audit.planWasherCount ?? 0)) {
    hard(`washers ${audit.washerCount}, plan draws ${audit.planWasherCount}`);
  }
  if ((audit.bathtubCount ?? 0) > (audit.planBathtubCount ?? 0)) {
    hard(`bathtubs ${audit.bathtubCount}, plan draws ${audit.planBathtubCount}`);
  }
  if (audit.kitchenFridgeMissing) {
    // Soft: vision keeps flagging a present fridge (דירה 22). Show via rescan /
    // packed soft list only when we promote — for now do not hard-block on it.
    failures.push("kitchen fridge missing where the plan draws מקרר");
  }
  if (expectedBeds !== null && expectedBeds > 0 && audit.bedTotal !== expectedBeds) {
    const bedsMsg =
      drawnBeds > 0
        ? `beds ${audit.bedTotal}, the geometry draws ${expectedBeds}`
        : `beds ${audit.bedTotal}, plan has ${expectedBeds}`;
    if (audit.bedTotal < expectedBeds) hard(bedsMsg);
    else failures.push(bedsMsg);
  }
  if (expectedBedrooms > 0 && audit.bedroomCount !== expectedBedrooms) {
    const roomsMsg = `bedrooms ${audit.bedroomCount}, plan has ${expectedBedrooms}`;
    if (audit.bedroomCount < expectedBedrooms) hard(roomsMsg);
    else failures.push(roomsMsg);
  }
  if (audit.diningTableCount > 1) {
    failures.push(`${audit.diningTableCount} dining tables, a flat has one`);
  }
  const expectedStools = agreed(layout.islandStoolCount ?? 0, audit.planIslandStoolCount);
  if (expectedStools !== null && expectedStools > 0 && audit.islandStoolCount !== expectedStools) {
    failures.push(`island stools ${audit.islandStoolCount}, plan has ${expectedStools}`);
  }
  if (audit.openingsNotInPlan > 0) {
    failures.push(`${audit.openingsNotInPlan} opening(s) cut into a wall the plan draws solid`);
  }
  if (audit.builtInsNotInPlan > 0) {
    failures.push(`${audit.builtInsNotInPlan} fitted unit(s) the plan does not draw`);
  }
  if (audit.apartmentStairsNotInPlan > 0) {
    // Terrace steps used to be exempted in the auditor prompt, so invented roof
    // stairs on דירה 20/21 shipped as "clean". Only flats that print מדרגות פנים
    // may keep stair treads.
    if (!layoutHasInternalStairs(layout)) {
      hard(
        `${audit.apartmentStairsNotInPlan} stair flight(s) inside a flat the plan draws on one level`,
      );
    } else {
      failures.push(
        `${audit.apartmentStairsNotInPlan} stair flight(s) — check they match the printed מדרגות פנים only`,
      );
    }
  }
  if (audit.wetFixturesInDryRooms > 0) {
    hard(`${audit.wetFixturesInDryRooms} wet fixture(s) in a room the plan draws dry`);
  }
  if (audit.entranceFurnitureCount > 0) {
    failures.push(`${audit.entranceFurnitureCount} piece(s) of furniture in the entrance`);
  }
  if ((audit.seatingGroupCount ?? 0) > (audit.planSeatingGroupCount ?? 0)) {
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
