import {
  assessFloorplanRun,
  describeConfidence,
} from "@/lib/projects/floorplan-confidence";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

const bed: FurniturePiece = {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  widthCm: 90,
  depthCm: 200,
  kind: "bed",
};

const room = (
  kind: SegmentedRoom["kind"],
  over: Partial<SegmentedRoom> = {},
): SegmentedRoom =>
  ({
    rows: [],
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    areaM2: 10,
    kind,
    name: kind,
    bedCount: kind === "bedroom" ? 1 : 0,
    contents: [],
    ...over,
  }) as SegmentedRoom;

const good = {
  areaError: -0.005,
  unitsPerMetre: 58,
  wallCount: 37,
  furniture: [bed],
  fidelity: {
    blocks: [{ kind: "bed" as const, present: true, contrast: 12 }],
    missing: {},
    present: 1,
    total: 1,
  },
  rooms: [room("bedroom"), room("bathroom"), room("living")],
};

describe("assessFloorplanRun", () => {
  it("lets a sound run through", () => {
    const report = assessFloorplanRun(good);
    expect(report.ok).toBe(true);
    expect(report.hard).toEqual([]);
  });

  it("stops a run whose scale does not reproduce the sheet", () => {
    const report = assessFloorplanRun({ ...good, areaError: 0.14 });
    expect(report.ok).toBe(false);
    expect(report.hard.join(" ")).toMatch(/שגיאת שטח/);
  });

  it("stops a run whose beds are not bed-sized", () => {
    // The area can be satisfied by the wrong scale; a bed is the check from
    // outside it. A single bed is 200 cm.
    const report = assessFloorplanRun({
      ...good,
      furniture: [{ ...bed, depthCm: 300 }],
    });
    expect(report.ok).toBe(false);
    expect(report.hard.join(" ")).toMatch(/קנה המידה שגוי/);
  });

  it("stops a run that found no rooms and no bedroom", () => {
    expect(assessFloorplanRun({ ...good, rooms: [] }).ok).toBe(false);
    expect(
      assessFloorplanRun({ ...good, rooms: [room("living")] }).hard.join(" "),
    ).toMatch(/חדר שינה/);
  });

  it("stops a frame that lost a fifth of its furniture", () => {
    const report = assessFloorplanRun({
      ...good,
      fidelity: {
        blocks: [],
        missing: { seat: 6 },
        present: 14,
        total: 20,
      },
    });
    expect(report.ok).toBe(false);
    expect(report.hard.join(" ")).toMatch(/פריטי ריהוט חסרים/);
  });

  it("ships a frame that lost one, and says so", () => {
    const report = assessFloorplanRun({
      ...good,
      fidelity: {
        blocks: [{ kind: "seat", present: false, contrast: 1 }],
        missing: { seat: 1 },
        present: 19,
        total: 20,
      },
    });
    expect(report.ok).toBe(true);
    expect(report.soft.join(" ")).toMatch(/seat/);
  });

  it("stops a frame still wearing a coding colour", () => {
    expect(assessFloorplanRun({ ...good, coolTint: 0.03 }).ok).toBe(false);
  });

  it("says a raster result is estimated, and still ships it", () => {
    const report = assessFloorplanRun({ ...good, tier: "raster" });
    expect(report.ok).toBe(true);
    expect(report.soft.join(" ")).toMatch(/אינה CAD/);
    expect(describeConfidence(report)).toMatch(/משוער מרסטר/);
  });

  it("blocks rooms the flood could not separate", () => {
    const report = assessFloorplanRun({
      ...good,
      rooms: [
        room("bedroom", { mergedKinds: ["bedroom", "bathroom"] }),
        room("living"),
      ],
    });
    expect(report.ok).toBe(false);
    expect(report.hard.join(" ")).toMatch(/לא הופרדו/);
  });

  it("holds a CAD plate to the area limits the reference sheets set", () => {
    // דירה 21 locks 3.8% off with every room right: noted, not refused.
    const close = assessFloorplanRun({ ...good, areaError: 0.038 });
    expect(close.ok).toBe(true);
    expect(close.soft.join(" ")).toMatch(/שגיאת שטח 3.8%/);
    expect(assessFloorplanRun({ ...good, areaError: 0.013 }).soft).toEqual([]);
    expect(assessFloorplanRun({ ...good, areaError: 0.06 }).ok).toBe(false);
    expect(assessFloorplanRun({ ...good, areaError: 0.06, tier: "raster" }).ok).toBe(true);
    expect(assessFloorplanRun({ ...good, areaError: 0.09, tier: "raster" }).ok).toBe(false);
  });

  it("notes a terrace count that differs from the sheet's, without refusing", () => {
    const fewer = assessFloorplanRun({ ...good, printedTerraces: 2, foundTerraces: 1 });
    expect(fewer.ok).toBe(true);
    expect(fewer.soft.join(" ")).toMatch(/1 מתוך 2 מרפסות/);
    expect(assessFloorplanRun({ ...good, printedTerraces: 1, foundTerraces: 2 }).ok).toBe(true);
    expect(assessFloorplanRun({ ...good, printedTerraces: Number.NaN, foundTerraces: 1 }).ok).toBe(false);
  });

  it("refuses non-finite area and invalid scale values", () => {
    expect(assessFloorplanRun({ ...good, areaError: Number.NaN }).ok).toBe(false);
    expect(assessFloorplanRun({ ...good, unitsPerMetre: 0 }).ok).toBe(false);
    expect(
      assessFloorplanRun({
        ...good,
        fidelity: { blocks: [], missing: {}, present: Number.NaN, total: 20 },
      }).ok,
    ).toBe(false);
    expect(assessFloorplanRun({ ...good, wallCount: Number.NaN }).ok).toBe(false);
  });
});

describe("what the auditor disqualified the frame for", () => {
  it("stops a booklet on a defect the grader already caught", () => {
    // The gate was letting a frame through that the grader had scored 108 for
    // carrying a screen, because it only looked at its own measurements.
    const report = assessFloorplanRun({
      ...good,
      auditHardFailures: ["1 screen(s) in a haredi still"],
    });
    expect(report.ok).toBe(false);
    expect(report.hard).toContain("1 screen(s) in a haredi still");
  });
});
