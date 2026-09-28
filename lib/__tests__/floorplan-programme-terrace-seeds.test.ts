import { programmeTerraceSeeds } from "@/lib/projects/floorplan-build";
import { applyProgrammeMmdLabel, type SegmentedRoom } from "@/lib/projects/floorplan-segment";

describe("programmeTerraceSeeds", () => {
  const page = { width: 1000, height: 2000 };
  const extent = { x: 100, y: 100, width: 800, height: 1700 };

  it("maps balcony box centres to drawing coordinates and carries the stated area", () => {
    expect(
      programmeTerraceSeeds(
        {
          rooms: [
            {
              name: "מרפסת שמש",
              areaM2: 6.4,
              bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
            },
          ],
        },
        page,
        extent,
        [],
        50,
      ),
    ).toEqual([{ x: 250, y: 650, value: 6.4 }]);
  });

  it("seeds no terrace the programme reads at another level than the flat", () => {
    // דירה 22 draws two terraces at +14.36 beside a flat at +11.42.
    const room = (levelM: number) => ({
      name: "מרפסת",
      kind: "balcony" as const,
      areaM2: 8,
      levelM,
      bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
    });
    expect(programmeTerraceSeeds({ unitLevelM: 11.42, rooms: [room(14.36)] }, page, extent, [], 50)).toEqual([]);
    expect(programmeTerraceSeeds({ unitLevelM: 11.42, rooms: [room(11.42)] }, page, extent, [], 50)).toEqual([
      { x: 250, y: 650, value: 8 },
    ]);
  });

  it("does not duplicate a balcony already seeded by a printed area label", () => {
    expect(
      programmeTerraceSeeds(
        {
          rooms: [
            {
              name: "מרפסת",
              areaM2: 4.1,
              bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 },
            },
          ],
        },
        page,
        extent,
        [{ x: 250, y: 650, value: 4.1 }],
        50,
      ),
    ).toEqual([]);
  });

  it("rejects non-balconies, missing measurements, implausible areas, and seeds outside the flat", () => {
    expect(
      programmeTerraceSeeds(
        {
          rooms: [
            { name: "חדר שינה", areaM2: 8, bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 } },
            { name: "מרפסת", bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 } },
            { name: "מרפסת", areaM2: 1.2, bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 } },
            { name: "מרפסת", areaM2: 6, bbox: { x: 0.95, y: 0.95, w: 0.02, h: 0.02 } },
          ],
        },
        page,
        extent,
        [],
        50,
      ),
    ).toEqual([]);
  });
});

describe("applyProgrammeMmdLabel", () => {
  const room = (x: number, kind: "bedroom" | "mmd" = "bedroom"): SegmentedRoom => ({
    rows: [
      { y: 100, spans: [[x, x + 100]] },
      { y: 110, spans: [[x, x + 100]] },
      { y: 120, spans: [[x, x + 100]] },
    ],
    bounds: { x, y: 100, width: 100, height: 30 },
    areaM2: 9,
    kind,
    name: kind === "mmd" ? 'ממ"ד' : "ח.שינה",
    bedCount: 1,
    contents: [],
  });

  it("uses a trusted MMD label only when it lands in exactly one measured bedroom", () => {
    const result = applyProgrammeMmdLabel(
      [room(100), room(300)],
      [
        {
          name: 'ממ"ד',
          areaM2: 9,
          source: "ocr_verified",
          bbox: { x: 0.31, y: 0.0525, w: 0.02, h: 0.005 },
        },
      ],
      { width: 1000, height: 2000 },
    );
    expect(result.map((entry) => entry.kind)).toEqual(["bedroom", "mmd"]);
  });

  it("does not apply an unverified or ambiguous label", () => {
    const label = {
      name: 'ממ"ד',
      areaM2: 9,
      bbox: { x: 0.2, y: 0.0525, w: 0.02, h: 0.005 },
    };
    expect(
      applyProgrammeMmdLabel([room(100)], [{ ...label, source: "inferred" }], {
        width: 1000,
        height: 2000,
      })[0]?.kind,
    ).toBe("bedroom");
    expect(
      applyProgrammeMmdLabel([room(100), room(100)], [{ ...label, source: "ocr_verified" }], {
        width: 1000,
        height: 2000,
      }).map((entry) => entry.kind),
    ).toEqual(["bedroom", "bedroom"]);
  });
});

describe("the levels the programme reads", () => {
  it("keeps the flat's level and each terrace's, as printed", async () => {
    const { parseFloorplanLayout } = await import("@/lib/projects/floorplan-layout");
    const layout = parseFloorplanLayout({
      unitLevelM: "+11.42",
      rooms: [
        { name: "מרפסת", kind: "balcony", levelM: "+14.36", bbox: { x: 0.2, y: 0.3, w: 0.1, h: 0.05 } },
        { name: "סלון", kind: "living", levelM: null },
      ],
    });
    expect(layout.unitLevelM).toBe(11.42);
    expect(layout.rooms[0]!.levelM).toBe(14.36);
    expect(layout.rooms[1]!.levelM).toBeUndefined();
  });
});
