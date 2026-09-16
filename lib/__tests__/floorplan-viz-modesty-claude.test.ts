import { mergeClaudeModestyIntoAudit } from "@/lib/projects/floorplan-viz-modesty-claude";
import { gradeFloorplanStill, harediModestyFailures, type FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

const base: FloorplanVizAudit = {
  bedTotal: 2,
  bedroomCount: 2,
  diningTableCount: 1,
  islandStoolCount: 0,
  planBedTotal: 2,
  planBedroomCount: 2,
  planIslandStoolCount: 0,
  hasDoubleBed: false,
  screenCount: 0,
  kitchenSinkBasins: 1,
  planKitchenSinkBasins: 1,
  washerCount: 0,
  planWasherCount: 0,
  washersOnLeisureTerrace: 0,
  bathtubCount: 0,
  planBathtubCount: 0,
  kitchenFridgeMissing: false,
  openingsNotInPlan: 0,
  builtInsNotInPlan: 0,
  entranceFurnitureCount: 0,
  wetFixturesInDryRooms: 0,
  apartmentStairsNotInPlan: 0,
  seatingGroupCount: 0,
  planSeatingGroupCount: 0,
  hasBurnedText: false,
  hasCadMarks: false,
  emptyUnfurnishedRooms: 0,
  emptyBedrooms: 0,
  oversizedTerraces: 0,
  roomsOutsidePlanOutline: 0,
  indoorRoomsTurnedOutdoor: 0,
  terracesMergedIntoOneDeck: false,
  outdoorPavingLargerThanLiving: false,
  entranceTurnedIntoTerrace: false,
  entranceDoorMissing: false,
  terraceTurnedIntoIndoor: 0,
  inventedOutdoorSpaces: 0,
  omittedOutdoorSpaces: 0,
  footprintMatchesPlan: true,
  mirroredVsPlan: false,
  rotationVsPlanDegrees: 0,
  looksLikeCadMassing: false,
  notes: "gemini clean",
};

const layout = parseFloorplanLayout({
  rooms: [
    { name: "ח.שינה", kind: "bedroom", bedCount: 1 },
    { name: "ח.שינה 2", kind: "bedroom", bedCount: 1 },
    { name: "סלון", kind: "living" },
  ],
});

const claudeClean = {
  screenCount: 0,
  hasDoubleBed: false,
  mirroredVsPlan: false,
  rotationVsPlanDegrees: 0,
  hasBurnedText: false,
  hasCadMarks: false,
  roomsOutsidePlanOutline: 0,
  apartmentStairsNotInPlan: 0,
  wetFixturesInDryRooms: 0,
  inventedOutdoorSpaces: 0,
  terraceTurnedIntoIndoor: 0,
  emptyBedrooms: 0,
  entranceDoorMissing: false,
  washersOnLeisureTerrace: 0,
  washerCount: 0,
  planWasherCount: 0,
  bathtubCount: 0,
  planBathtubCount: 0,
  kitchenFridgeMissing: false,
  omittedOutdoorSpaces: 0,
  notes: "",
};

describe("mergeClaudeModestyIntoAudit", () => {
  it("takes the higher screen count", () => {
    const merged = mergeClaudeModestyIntoAudit(
      { ...base, screenCount: 1 },
      {
        ...claudeClean,
        screenCount: 3,
        notes: "TVs in both bedrooms",
      },
    );
    expect(merged.screenCount).toBe(3);
    expect(merged.hasDoubleBed).toBe(false);
    expect(merged.notes).toMatch(/claude:/);
  });

  it("ORs hasDoubleBed so either judge blocks", () => {
    const merged = mergeClaudeModestyIntoAudit(base, {
      ...claudeClean,
      hasDoubleBed: true,
      notes: "master is a double",
    });
    expect(merged.hasDoubleBed).toBe(true);
    const verdict = gradeFloorplanStill(merged, layout, { haredi: true });
    expect(harediModestyFailures(verdict.hardFailures)).toEqual([
      "a double bed in a haredi still",
    ]);
  });

  it("takes Claude layout hard fails for every style", () => {
    const merged = mergeClaudeModestyIntoAudit(base, {
      ...claudeClean,
      mirroredVsPlan: true,
      roomsOutsidePlanOutline: 1,
      notes: "mirrored wing",
    });
    expect(merged.mirroredVsPlan).toBe(true);
    expect(merged.roomsOutsidePlanOutline).toBe(1);
    const general = gradeFloorplanStill(merged, layout, { haredi: false });
    expect(general.hardFailures).toContain("the still is the plan mirrored left-to-right");
  });

  it("keeps Gemini layout fields untouched", () => {
    const merged = mergeClaudeModestyIntoAudit(
      { ...base, bedTotal: 2, footprintMatchesPlan: true },
      {
        ...claudeClean,
        screenCount: 2,
        notes: "screens",
      },
    );
    expect(merged.bedTotal).toBe(2);
    expect(merged.footprintMatchesPlan).toBe(true);
    expect(merged.screenCount).toBe(2);
  });
});
