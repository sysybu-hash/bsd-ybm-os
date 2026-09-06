import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { gradeFloorplanStill, type FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";

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
  openingsNotInPlan: 0,
  builtInsNotInPlan: 0,
  entranceFurnitureCount: 0,
  seatingGroupCount: 1,
  planSeatingGroupCount: 1,
  hasBurnedText: false,
  hasCadMarks: false,
  emptyUnfurnishedRooms: 0,
  roomsOutsidePlanOutline: 0,
  footprintMatchesPlan: true,
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
    expect(verdict.failures).toHaveLength(2);
    // Burned text is disqualifying; a stray CAD mark is not.
    expect(verdict.hardFailures).toEqual(["letters or digits rendered into the image"]);
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

  it("believes the plan over the extraction when the two disagree", () => {
    // דירה 14: the sheet draws four island stools, the extractor read three.
    // A still showing four is correct and must not be failed for it.
    const thinLayout = parseFloorplanLayout({
      rooms: layout.rooms.map((r) => ({ ...r, bbox: r.bbox })),
      islandStoolCount: 3,
    });
    const verdict = gradeFloorplanStill({ ...clean, islandStoolCount: 4 }, thinLayout);
    expect(verdict.failures).toEqual([]);
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

  it("rejects a rectangle drawn for a stepped plan even when nothing was added", () => {
    const verdict = gradeFloorplanStill({ ...clean, footprintMatchesPlan: false }, layout);
    expect(verdict.failures).toEqual(["footprint does not match the plan outline"]);
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

  it("says nothing about seating when the plan drew none to compare against", () => {
    const verdict = gradeFloorplanStill(
      { ...clean, seatingGroupCount: 3, planSeatingGroupCount: 0 },
      layout,
    );
    expect(verdict.failures).toEqual([]);
  });
});
