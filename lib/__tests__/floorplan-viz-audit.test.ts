import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  gradeFloorplanStill,
  harediModestyFailures,
  surgicallyRemovableFailures,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";

/** דירה 14: four drawn beds across three sleeping rooms, an island with four stools. */
const layout = parseFloorplanLayout({
  rooms: [
    { name: "ח.שינה", kind: "bedroom", bedCount: 1, bbox: { x: 0.1, y: 0.05, w: 0.25, h: 0.2 } },
    { name: 'ממ"ד', kind: "mmd", bedCount: 1, bbox: { x: 0.02, y: 0.28, w: 0.24, h: 0.22 } },
    { name: "ח.שינה (2)", kind: "bedroom", bedCount: 2, bbox: { x: 0.15, y: 0.55, w: 0.3, h: 0.22 } },
    { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.06, w: 0.3, h: 0.25 } },
    { name: "ח.מגורים", kind: "living", bbox: { x: 0.3, y: 0.3, w: 0.35, h: 0.25 } },
    { name: "חדר רחצה", kind: "bathroom", bbox: { x: 0.3, y: 0.82, w: 0.2, h: 0.14 } },
  ],
  islandStoolCount: 4,
});

const clean: FloorplanVizAudit = {
  bedTotal: 4,
  bedroomCount: 3,
  diningTableCount: 1,
  islandStoolCount: 4,
  planBedTotal: 4,
  planBedroomCount: 3,
  planIslandStoolCount: 4,
  hasDoubleBed: false,
  screenCount: 0,
  kitchenSinkBasins: 2,
  planKitchenSinkBasins: 2,
  washerCount: 0,
  planWasherCount: 0,
  washersOnLeisureTerrace: 0,
  bathtubCount: 1,
  planBathtubCount: 1,
  kitchenFridgeMissing: false,
  openingsNotInPlan: 0,
  builtInsNotInPlan: 0,
  entranceFurnitureCount: 0,
  wetFixturesInDryRooms: 0,
  apartmentStairsNotInPlan: 0,
  seatingGroupCount: 1,
  planSeatingGroupCount: 1,
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
  notes: "",
};

describe("floorplan still audit", () => {
  it("passes a still whose counts match the plan", () => {
    expect(gradeFloorplanStill(clean, layout, { haredi: true })).toEqual({
      failures: [],
      hardFailures: [],
      score: 0,
    });
  });

  it("catches the six-beds-for-four case that shipped before", () => {
    const verdict = gradeFloorplanStill({ ...clean, bedTotal: 6 }, layout);
    expect(verdict.score).toBe(1);
    expect(verdict.failures[0]).toMatch(/beds 6, plan has 4/);
  });

  it("rejects a double bed only for a haredi audience", () => {
    const audit = { ...clean, hasDoubleBed: true };
    expect(gradeFloorplanStill(audit, layout, { haredi: true }).failures).toEqual([
      "a double bed in a haredi still",
    ]);
    expect(gradeFloorplanStill(audit, layout, { haredi: false }).failures).toEqual([]);
  });

  it("rejects burned-in text and surviving CAD annotation", () => {
    const verdict = gradeFloorplanStill(
      { ...clean, hasBurnedText: true, hasCadMarks: true },
      layout,
    );
    expect(verdict.hardFailures).toEqual([
      "letters or digits rendered into the image",
      "2D CAD annotation copied into the render",
    ]);
  });

  it("catches the two-dining-tables and unfurnished-room failures", () => {
    const verdict = gradeFloorplanStill(
      { ...clean, diningTableCount: 2, emptyUnfurnishedRooms: 1 },
      layout,
    );
    expect(verdict.failures).toHaveLength(2);
    expect(verdict.failures.join(" ")).toMatch(/dining tables/);
    expect(verdict.failures.join(" ")).toMatch(/unfurnished/);
  });

  it("scores worse the more that is wrong, so the caller can keep the least bad frame", () => {
    const oneOff = gradeFloorplanStill({ ...clean, bedTotal: 5 }, layout, { haredi: true });
    const manyOff = gradeFloorplanStill(
      { ...clean, bedTotal: 5, hasDoubleBed: true, hasBurnedText: true },
      layout,
      { haredi: true },
    );
    expect(manyOff.score).toBeGreaterThan(oneOff.score);
  });

  it("does not invent failures when the plan itself has no beds or island", () => {
    const bare = parseFloorplanLayout({ rooms: [{ name: "מחסן", kind: "other" }] });
    const nothingToCount = {
      ...clean,
      bedTotal: 0, bedroomCount: 0, islandStoolCount: 0,
      planBedTotal: 0, planBedroomCount: 0, planIslandStoolCount: 0,
    };
    expect(gradeFloorplanStill(nothingToCount, bare)).toEqual({
      failures: [],
      hardFailures: [],
      score: 0,
    });
  });

  it("grades no count at all when the two readings of the plan disagree", () => {
    // דירה 14: the sheet draws four island stools, the extractor read three.
    // A still showing four is correct and must not be failed for it.
    const thinLayout = parseFloorplanLayout({
      rooms: layout.rooms.map((r) => ({ ...r, bbox: r.bbox })),
      islandStoolCount: 3,
    });
    const verdict = gradeFloorplanStill({ ...clean, islandStoolCount: 4 }, thinLayout);
    expect(verdict.failures).toEqual([]);
  });

it("counts bedrooms off the extraction, which reads the printed room labels", () => {
    // The CAD sheet for דירה 14 labels four rooms חד.שינה — one of them the ממ"ד,
    // which does not look like a bedroom, so vision reads three and always has.
    // Preferring that reading made the grader pass stills that had dropped a
    // bedroom and would have failed one that got all four right.
    // The fixture has three sleeping rooms, one of them the ממ"ד; vision sees two.
    const verdict = gradeFloorplanStill({ ...clean, bedroomCount: 2, planBedroomCount: 2 }, layout);
    expect(verdict.failures).toContain("bedrooms 2, plan has 3");
    expect(verdict.hardFailures).toContain("bedrooms 2, plan has 3");
  });

  it("prefers layout bed symbols over a contradicted auditor plan read", () => {
    // Layout fixture has 4 beds; auditor says plan has 3. Prefer layout — skipping
    // used to ship wrong bed counts (דירה 23).
    const verdict = gradeFloorplanStill({ ...clean, bedTotal: 6, planBedTotal: 3 }, layout);
    expect(verdict.failures.join(" ")).toMatch(/beds 6, plan has 4/);
    expect(verdict.hardFailures.join(" ")).not.toMatch(/beds /);
  });

  it("falls back to the extraction when the auditor could not read the plan", () => {
    const blind = { ...clean, planBedTotal: 0, planBedroomCount: 0, planIslandStoolCount: 0, bedTotal: 9 };
    const verdict = gradeFloorplanStill(blind, layout);
    expect(verdict.failures.join(" ")).toMatch(/beds 9, plan has 4/);
  });

  it("rejects the invented wing that every count passed", () => {
    // דירה 14: bathroom, bedroom and laundry grown along the right side, in
    // space the plan leaves outside the flat. Bed and bedroom counts still matched.
    const verdict = gradeFloorplanStill(
      { ...clean, roomsOutsidePlanOutline: 3, footprintMatchesPlan: false },
      layout,
      { haredi: true },
    );
    // Inventing rooms outside the outline disqualifies the frame; the holistic
    // silhouette judgement beside it does not.
    expect(verdict.hardFailures).toEqual(["3 room(s) invented outside the plan outline"]);
    expect(verdict.failures[1]).toMatch(/footprint does not match/);
    expect(verdict.score).toBe(101);
  });

  it("rejects indoor living paved as a wraparound terrace", () => {
    const verdict = gradeFloorplanStill(
      {
        ...clean,
        indoorRoomsTurnedOutdoor: 1,
        terracesMergedIntoOneDeck: true,
        outdoorPavingLargerThanLiving: true,
      },
      layout,
    );
    expect(verdict.hardFailures).toEqual(
      expect.arrayContaining([
        "1 indoor room(s) rendered as outdoor paving",
        "printed terraces merged into one deck",
        "outdoor paving covers more of the plate than the living room",
      ]),
    );
  });

  it("rejects a hatched terrace furnished as an indoor sitting room", () => {
    const verdict = gradeFloorplanStill({ ...clean, terraceTurnedIntoIndoor: 1 }, layout);
    expect(verdict.hardFailures).toEqual([
      "1 hatched terrace(s) furnished as indoor rooms",
    ]);
  });

  it("rejects a terrace glued onto a wall the plan does not hatch", () => {
    const verdict = gradeFloorplanStill({ ...clean, inventedOutdoorSpaces: 1 }, layout);
    expect(verdict.hardFailures).toEqual([
      "1 terrace(s) invented where the plan has no hatch",
    ]);
  });

  it("rejects a rectangle drawn for a stepped plan even when nothing was added", () => {
    const verdict = gradeFloorplanStill({ ...clean, footprintMatchesPlan: false }, layout);
    expect(verdict.failures).toEqual(["footprint does not match the plan outline"]);
  });

  it("fails a mirrored still hard, though every count it has is right", () => {
    // How a flipped דירה 14 shipped as "every count matched": a mirror keeps the
    // bedrooms, beds, sinks and stools exactly right and moves them all to the
    // wrong side, so no counting check can see it.
    const verdict = gradeFloorplanStill({ ...clean, mirroredVsPlan: true }, layout);
    expect(verdict.hardFailures).toEqual(["the still is the plan mirrored left-to-right"]);
    expect(verdict.score).toBeGreaterThanOrEqual(100);
  });

it("fails a still turned 180 degrees, which the silhouette check cannot see", () => {
    // Four runs of דירה 14 came back turned, and the auditor said so in its notes
    // every time while footprintMatchesPlan stayed true — a silhouette rotated
    // through 180 degrees still matches itself.
    const verdict = gradeFloorplanStill(
      { ...clean, rotationVsPlanDegrees: 180, footprintMatchesPlan: true },
      layout,
    );
    expect(verdict.hardFailures).toEqual(["the still is turned 180 degrees from the plan"]);
  });

  it("does not call a correctly turned still rotated", () => {
    expect(gradeFloorplanStill({ ...clean, rotationVsPlanDegrees: 0 }, layout).failures).toEqual([]);
  });

  it("rejects a CAD block massing plate as a brochure still", () => {
    const verdict = gradeFloorplanStill({ ...clean, looksLikeCadMassing: true }, layout);
    expect(verdict.hardFailures).toEqual([
      "CAD block massing shipped instead of a photoreal still",
    ]);
  });

  it("does not call a correctly oriented still mirrored", () => {
    expect(gradeFloorplanStill(clean, layout).failures).toEqual([]);
  });
});

describe("modesty and fixtures the counts were missing", () => {
  it("fails a haredi still that has any screen at all", () => {
    // דירה 16 shipped with a dark panel on a wall in every bedroom, and passed:
    // the modesty prompt forbids screens but nothing was counting them.
    const verdict = gradeFloorplanStill({ ...clean, screenCount: 4 }, layout, { haredi: true });
    expect(verdict.failures).toEqual(["4 screen(s) in a haredi still"]);
  });

  it("leaves screens alone for a general-audience still", () => {
    expect(gradeFloorplanStill({ ...clean, screenCount: 2 }, layout).failures).toEqual([]);
  });

  it("fails a single-bowl kitchen where the plan draws a double", () => {
    const verdict = gradeFloorplanStill({ ...clean, kitchenSinkBasins: 1 }, layout);
    expect(verdict.failures[0]).toMatch(/kitchen sink basins 1, plan draws 2/);
  });

  it("says nothing about sinks when the auditor could not read them off the plan", () => {
    const blind = { ...clean, kitchenSinkBasins: 1, planKitchenSinkBasins: 0 };
    expect(gradeFloorplanStill(blind, layout).failures).toEqual([]);
  });
});

describe("harediModestyFailures", () => {
  it("picks screens and double beds out of the hard list", () => {
    expect(
      harediModestyFailures([
        "2 screen(s) in a haredi still",
        "a double bed in a haredi still",
        "the still is the plan mirrored left-to-right",
        "letters or digits rendered into the image",
      ]),
    ).toEqual(["2 screen(s) in a haredi still", "a double bed in a haredi still"]);
  });

  it("is empty when the hard list has no modesty items", () => {
    expect(harediModestyFailures(["rooms outside the plan outline"])).toEqual([]);
  });
});

describe("surgicallyRemovableFailures", () => {
  it("treats burned text as removable for every audience", () => {
    expect(
      surgicallyRemovableFailures(["letters or digits rendered into the image"], { haredi: false }),
    ).toEqual(["letters or digits rendered into the image"]);
  });

  it("keeps screens removable only for haredi", () => {
    expect(surgicallyRemovableFailures(["1 screen(s) in a haredi still"], { haredi: false })).toEqual(
      [],
    );
    expect(surgicallyRemovableFailures(["1 screen(s) in a haredi still"], { haredi: true })).toEqual([
      "1 screen(s) in a haredi still",
    ]);
  });
});

describe("what the least-bad frame is allowed to be", () => {
  it("prefers many count mismatches over one double bed", () => {
    // The still that went out had a double bed in three of four bedrooms,
    // because one modesty failure scored lower than three count mismatches.
    const modest = gradeFloorplanStill(
      { ...clean, bedTotal: 6, bedroomCount: 5, islandStoolCount: 1 },
      layout,
      { haredi: true },
    );
    const immodest = gradeFloorplanStill({ ...clean, hasDoubleBed: true }, layout, {
      haredi: true,
    });
    expect(modest.failures.length).toBeGreaterThan(immodest.failures.length);
    expect(modest.score).toBeLessThan(immodest.score);
  });

  it("prefers one screen over two", () => {
    const one = gradeFloorplanStill({ ...clean, screenCount: 1 }, layout, { haredi: true });
    const two = gradeFloorplanStill({ ...clean, screenCount: 1, hasDoubleBed: true }, layout, {
      haredi: true,
    });
    expect(one.score).toBeLessThan(two.score);
  });

  it("keeps counting soft failures so the best of a bad batch still wins", () => {
    const fewer = gradeFloorplanStill({ ...clean, bedTotal: 5 }, layout);
    const more = gradeFloorplanStill({ ...clean, bedTotal: 5, diningTableCount: 3 }, layout);
    expect(fewer.score).toBeLessThan(more.score);
  });
});

describe("an invented wing against everything else", () => {
  it("loses to a frame that stays inside the outline but miscounts", () => {
    const invented = gradeFloorplanStill(
      { ...clean, roomsOutsidePlanOutline: 1, footprintMatchesPlan: false },
      layout,
      { haredi: true },
    );
    const miscounted = gradeFloorplanStill(
      { ...clean, bedTotal: 7, bedroomCount: 6, islandStoolCount: 0, diningTableCount: 3 },
      layout,
      { haredi: true },
    );
    expect(miscounted.failures.length).toBeGreaterThan(invented.failures.length);
    expect(miscounted.score).toBeLessThan(invented.score);
  });

  it("ranks below a frame that invents nothing and is merely immodest", () => {
    const invented = gradeFloorplanStill(
      { ...clean, roomsOutsidePlanOutline: 2, hasDoubleBed: true },
      layout,
      { haredi: true },
    );
    const immodest = gradeFloorplanStill({ ...clean, hasDoubleBed: true }, layout, {
      haredi: true,
    });
    expect(immodest.score).toBeLessThan(invented.score);
  });
});

describe("what the still added that the sheet never drew", () => {
  it("counts an opening cut into a wall the plan draws solid", () => {
    // A bathroom opened onto the service balcony, with a solid wall on the sheet.
    const verdict = gradeFloorplanStill({ ...clean, openingsNotInPlan: 1 }, layout);
    expect(verdict.failures).toEqual([
      "1 opening(s) cut into a wall the plan draws solid",
    ]);
    // A drafting error, not a frame the client cannot use.
    expect(verdict.hardFailures).toEqual([]);
  });

  it("counts what is standing on the entrance floor", () => {
    // A table opposite the door and a shelving unit beside it, on a strip the
    // sheet draws empty.
    const verdict = gradeFloorplanStill({ ...clean, entranceFurnitureCount: 2 }, layout);
    expect(verdict.failures).toEqual(["2 piece(s) of furniture in the entrance"]);
  });

  it("counts a fitted unit standing where the sheet draws empty floor", () => {
    const verdict = gradeFloorplanStill({ ...clean, builtInsNotInPlan: 1 }, layout);
    expect(verdict.failures).toEqual(["1 fitted unit(s) the plan does not draw"]);
    expect(verdict.hardFailures).toEqual([]);
  });

  it("counts a second lounge at the entrance", () => {
    const verdict = gradeFloorplanStill({ ...clean, seatingGroupCount: 2 }, layout);
    expect(verdict.failures).toEqual(["2 seating group(s), plan draws 1"]);
  });

  it("does not complain when the still has fewer seating groups than drawn", () => {
    // Under-furnishing is caught by the unfurnished-room check, not here.
    expect(gradeFloorplanStill({ ...clean, seatingGroupCount: 0 }, layout).failures).toEqual([]);
  });

  it("rejects a sofa when the plan is dining-only", () => {
    const verdict = gradeFloorplanStill(
      { ...clean, seatingGroupCount: 1, planSeatingGroupCount: 0 },
      layout,
    );
    expect(verdict.failures).toEqual(["1 seating group(s), plan draws 0"]);
    expect(verdict.hardFailures).toEqual([]);
  });
});

describe("a wet fixture in a dry room", () => {
  it("disqualifies the frame outright", () => {
    // A toilet beside a bed is not one item on a list of counts.
    const verdict = gradeFloorplanStill({ ...clean, wetFixturesInDryRooms: 2 }, layout);
    expect(verdict.failures).toEqual([
      "2 wet fixture(s) in a room the plan draws dry",
    ]);
    expect(verdict.hardFailures).toEqual([
      "2 wet fixture(s) in a room the plan draws dry",
    ]);
  });

  it("outranks any number of count mismatches", () => {
    const wet = gradeFloorplanStill({ ...clean, wetFixturesInDryRooms: 1 }, layout);
    const miscounted = gradeFloorplanStill(
      { ...clean, bedTotal: 9, bedroomCount: 7, islandStoolCount: 0, diningTableCount: 4 },
      layout,
    );
    expect(miscounted.failures.length).toBeGreaterThan(wet.failures.length);
    expect(miscounted.score).toBeLessThan(wet.score);
  });
});

describe("the building's stairwell pulled inside the flat", () => {
  it("disqualifies the frame", () => {
    const verdict = gradeFloorplanStill({ ...clean, apartmentStairsNotInPlan: 1 }, layout);
    expect(verdict.hardFailures).toEqual([
      "1 stair flight(s) inside a flat the plan draws on one level",
    ]);
    expect(surgicallyRemovableFailures(verdict.hardFailures)).toEqual([
      "1 stair flight(s) inside a flat the plan draws on one level",
    ]);
  });

  it("outranks a frame that merely miscounts", () => {
    const stairs = gradeFloorplanStill({ ...clean, apartmentStairsNotInPlan: 1 }, layout);
    const miscounted = gradeFloorplanStill(
      { ...clean, bedTotal: 8, bedroomCount: 6, islandStoolCount: 0 },
      layout,
    );
    expect(miscounted.score).toBeLessThan(stairs.score);
  });
});

describe("grading against the geometry that produced the still", () => {
  const audit = (over: Record<string, unknown>) =>
    ({
      roomsOutsidePlanOutline: 0,
      footprintMatchesPlan: true,
      mirroredVsPlan: false,
      rotationVsPlanDegrees: 0,
      hasBurnedText: false,
      hasCadMarks: false,
      hasDoubleBed: false,
      screenCount: 0,
      kitchenSinkBasins: 0,
      planKitchenSinkBasins: 0,
      bedTotal: 4,
      planBedTotal: 3,
      bedroomCount: 4,
      planBedroomCount: 4,
      diningTableCount: 1,
      islandStoolCount: 0,
      planIslandStoolCount: 0,
      openingsNotInPlan: 0,
      builtInsNotInPlan: 0,
      ...over,
    }) as never;
  const layout = { rooms: [], islandStoolCount: 0 } as never;

  it("takes the block count as the target, over a contradicted plan read", () => {
    // Four bed blocks went into the render, so a still showing four is right,
    // whatever the auditor believes the sheet says.
    const verdict = gradeFloorplanStill(audit({}), layout, { drawn: { beds: 4 } });
    expect(verdict.failures.join(" ")).not.toMatch(/beds/);
  });

  it("fails a still that dropped a bed the geometry drew", () => {
    const verdict = gradeFloorplanStill(audit({ bedTotal: 3 }), layout, {
      drawn: { beds: 4 },
    });
    expect(verdict.failures.join(" ")).toMatch(/beds 3, the geometry draws 4/);
    expect(verdict.hardFailures.join(" ")).toMatch(/beds 3, the geometry draws 4/);
  });

  it("falls back to the plan readings when no geometry count is given", () => {
    // Empty layout → use auditor planBedTotal (3). Extra beds stay soft.
    const verdict = gradeFloorplanStill(audit({ bedTotal: 99 }), layout, {});
    expect(verdict.failures.join(" ")).toMatch(/beds 99/);
    expect(verdict.hardFailures.join(" ")).not.toMatch(/beds 99/);
  });
});

describe("empty bedrooms and oversized terraces", () => {
  it("disqualifies a master left as empty floor", () => {
    const verdict = gradeFloorplanStill({ ...clean, emptyBedrooms: 1, bedroomCount: 2 }, layout);
    expect(verdict.hardFailures).toEqual([
      "1 bedroom(s) left without a bed",
      "bedrooms 2, plan has 3",
    ]);
  });

  it("disqualifies a doorway-deep terrace grown to bedroom size", () => {
    const verdict = gradeFloorplanStill({ ...clean, oversizedTerraces: 1 }, layout);
    expect(verdict.hardFailures).toEqual([
      "1 terrace(s) grown larger than the printed pocket",
    ]);
  });

  it("disqualifies a sealed flat that dropped the printed balcony", () => {
    const verdict = gradeFloorplanStill(
      { ...clean, omittedOutdoorSpaces: 1, footprintMatchesPlan: false },
      layout,
    );
    expect(verdict.hardFailures).toEqual(
      expect.arrayContaining([
        "1 printed terrace(s) missing from the still",
        "footprint does not match the plan outline",
      ]),
    );
  });

  it("disqualifies a sealed flat with no front door leaf", () => {
    const verdict = gradeFloorplanStill({ ...clean, entranceDoorMissing: true }, layout);
    expect(verdict.hardFailures).toEqual([
      "front door missing where the plan draws the entrance",
    ]);
    expect(
      surgicallyRemovableFailures(verdict.hardFailures),
    ).toEqual(["front door missing where the plan draws the entrance"]);
  });

  it("still treats a storage room left empty as a soft miss", () => {
    const verdict = gradeFloorplanStill({ ...clean, emptyUnfurnishedRooms: 1 }, layout);
    expect(verdict.failures).toEqual(["1 room(s) left unfurnished"]);
    expect(verdict.hardFailures).toEqual([]);
  });

  it("disqualifies דירה-21 style: washers on leisure terraces, invented tub, missing fridge", () => {
    const verdict = gradeFloorplanStill(
      {
        ...clean,
        washerCount: 6,
        planWasherCount: 1,
        washersOnLeisureTerrace: 4,
        bathtubCount: 1,
        planBathtubCount: 0,
        kitchenFridgeMissing: true,
      },
      layout,
    );
    expect(verdict.hardFailures).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/washer\(s\) on a leisure terrace/),
        expect.stringMatching(/washers 6, plan draws 1/),
        expect.stringMatching(/bathtubs 1, plan draws 0/),
      ]),
    );
    expect(verdict.hardFailures.join(" ")).not.toMatch(/kitchen fridge/);
    expect(verdict.failures.join(" ")).toMatch(/kitchen fridge/);
    expect(
      surgicallyRemovableFailures(verdict.hardFailures).join(" "),
    ).toMatch(/washer|bathtub/);
  });

  it("expects a bed in every extracted bedroom even when bedCount is missing", () => {
    const twoBeds = parseFloorplanLayout({
      rooms: [
        { name: "חדר שינה 1", kind: "bedroom" },
        { name: "חדר שינה 2", kind: "bedroom" },
        { name: "מגורים", kind: "living" },
      ],
    });
    const verdict = gradeFloorplanStill(
      { ...clean, bedTotal: 2, bedroomCount: 1, planBedTotal: 2, planBedroomCount: 0 },
      twoBeds,
    );
    expect(verdict.hardFailures).toContain("bedrooms 1, plan has 2");
  });
});
