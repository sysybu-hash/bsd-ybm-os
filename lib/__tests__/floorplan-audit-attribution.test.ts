import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  FLOORPLAN_AUDIT_PROMPT_VERSION,
  gradeFloorplanStill,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";
import { parseFloorplanVizAuditMeta } from "@/lib/projects/floorplan-viz-audit-meta";
import {
  FLOORPLAN_SECOND_JUDGE_PROMPT_VERSION,
  mergeClaudeModestyIntoAudit,
  type ClaudeModestyAudit,
} from "@/lib/projects/floorplan-viz-modesty-claude";
import { attributeShipAudit, withShipAudit } from "@/lib/projects/viz-generate/audit-gate";

const layout = parseFloorplanLayout({
  rooms: [
    { name: "ח.שינה", kind: "bedroom", bedCount: 1 },
    { name: "מטבח", kind: "kitchen" },
    { name: "ח.מגורים", kind: "living" },
    { name: "חדר רחצה", kind: "bathroom" },
  ],
});

/** A still Gemini finds nothing wrong with. */
const gemini: FloorplanVizAudit = {
  bedTotal: 1, bedroomCount: 1, diningTableCount: 1, islandStoolCount: 0,
  planBedTotal: 1, planBedroomCount: 1, planIslandStoolCount: 0,
  hasDoubleBed: false, screenCount: 0,
  kitchenSinkBasins: 1, planKitchenSinkBasins: 1,
  washerCount: 0, planWasherCount: 0, washersOnLeisureTerrace: 0,
  bathtubCount: 0, planBathtubCount: 0, kitchenFridgeMissing: false,
  openingsNotInPlan: 0, planDoorsSealed: 0, builtInsNotInPlan: 0, entranceFurnitureCount: 0,
  wetFixturesInDryRooms: 0, apartmentStairsNotInPlan: 0,
  seatingGroupCount: 1, planSeatingGroupCount: 1,
  hasBurnedText: false, hasCadMarks: false, emptyUnfurnishedRooms: 0, emptyBedrooms: 0,
  oversizedTerraces: 0, roomsOutsidePlanOutline: 0, indoorRoomsTurnedOutdoor: 0,
  terracesMergedIntoOneDeck: false, outdoorPavingLargerThanLiving: false,
  entranceTurnedIntoTerrace: false, entranceDoorMissing: false, terraceTurnedIntoIndoor: 0,
  inventedOutdoorSpaces: 0, omittedOutdoorSpaces: 0, footprintMatchesPlan: true,
  mirroredVsPlan: false, rotationVsPlanDegrees: 0, looksLikeCadMassing: false,
  notes: "", model: "gemini-test",
};

/** The second judge sees a screen and a room outside the outline. */
const claude: ClaudeModestyAudit = {
  screenCount: 1, hasDoubleBed: false, mirroredVsPlan: false, rotationVsPlanDegrees: 0,
  hasBurnedText: false, hasCadMarks: false, roomsOutsidePlanOutline: 1,
  apartmentStairsNotInPlan: 0, wetFixturesInDryRooms: 0, inventedOutdoorSpaces: 0,
  terraceTurnedIntoIndoor: 0, emptyBedrooms: 0, entranceDoorMissing: false,
  washersOnLeisureTerrace: 0, washerCount: 0, planWasherCount: 0, bathtubCount: 0,
  planBathtubCount: 0, kitchenFridgeMissing: false, omittedOutdoorSpaces: 0,
  notes: "", model: "claude-test",
};

const scored = (withClaude: boolean) => {
  const audit = withClaude ? mergeClaudeModestyIntoAudit(gemini, claude) : gemini;
  return {
    gemini,
    claude: withClaude ? claude : null,
    audit,
    grade: gradeFloorplanStill(audit, layout, { haredi: true }),
  };
};

describe("who found what in a ship audit", () => {
  it("names each finding's auditor, model and prompt version", () => {
    const meta = attributeShipAudit({
      scored: scored(true),
      moved: ["room moved: the kitchen"],
      layout,
      haredi: true,
      startedAt: 1_000,
      finishedAt: 3_500,
    });
    expect(meta.gemini).toEqual({
      model: "gemini-test",
      promptVersion: FLOORPLAN_AUDIT_PROMPT_VERSION,
      hard: [],
    });
    expect(meta.claude?.model).toBe("claude-test");
    expect(meta.claude?.promptVersion).toBe(FLOORPLAN_SECOND_JUDGE_PROMPT_VERSION);
    expect(meta.claude?.added.join(" ")).toMatch(/outside the plan outline/);
    expect(meta.claude?.added.join(" ")).toMatch(/screen/);
    expect(meta.placement).toEqual(["room moved: the kitchen"]);
    expect(meta.ms).toBe(2_500);
    expect(meta.at).toBe(new Date(3_500).toISOString());
  });

  it("lists what the gate set aside: a screen only Claude saw", () => {
    const meta = attributeShipAudit({
      scored: scored(true), moved: [], layout, haredi: true, startedAt: 0, finishedAt: 0,
    });
    expect(meta.dropped).toHaveLength(1);
    expect(meta.dropped[0]).toMatch(/screen/);
  });

  it("records no second judge when Claude did not answer, and no auditor when Gemini did not", () => {
    expect(
      attributeShipAudit({ scored: scored(false), moved: [], layout, haredi: true, startedAt: 0, finishedAt: 0 })
        .claude,
    ).toBeNull();
    const none = attributeShipAudit({
      scored: null, moved: ["room moved: the kitchen"], layout, haredi: true, startedAt: 0, finishedAt: 0,
    });
    expect(none.gemini).toBeNull();
    expect(none.placement).toEqual(["room moved: the kitchen"]);
  });

  it("round-trips through the stored column, and drops anything malformed", () => {
    const meta = attributeShipAudit({
      scored: scored(true), moved: [], layout, haredi: true, startedAt: 0, finishedAt: 10,
    });
    expect(parseFloorplanVizAuditMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
    expect(parseFloorplanVizAuditMeta({ v: 2 })).toBeUndefined();
    expect(parseFloorplanVizAuditMeta(null)).toBeUndefined();
  });

  it("saves issues, status and attribution from the same scan", () => {
    const meta = attributeShipAudit({
      scored: scored(false), moved: [], layout, haredi: true, startedAt: 0, finishedAt: 0,
    });
    const img = { mimeType: "image/jpeg", base64: "x" };
    expect(withShipAudit(img, { issues: [], meta })).toMatchObject({ auditStatus: "passed", auditMeta: meta });
    expect(withShipAudit(img, { issues: ["mirrored plan"], meta })).toMatchObject({
      auditIssues: ["mirrored plan"],
      auditStatus: "needs_review",
    });
  });
});
