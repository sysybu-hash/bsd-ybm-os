import { measuredPlateMatchesSheet, measuredPlateQualityFailure } from "@/lib/projects/floorplan-viz-route";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";

const measured = (kind: string): SegmentedRoom =>
  ({ kind, name: kind, areaM2: 10, bedCount: 0, contents: [], rows: [], bounds: { x: 0, y: 0, width: 1, height: 1 } }) as unknown as SegmentedRoom;

const sheet = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "סלון" },
      { name: "מטבח" },
      { name: "חדר שינה" },
      { name: "חדר שינה" },
      { name: "חדר שינה" },
    ],
  });

describe("whether a measured plate is a measurement of this flat", () => {
  it("rejects a plate short of the bedrooms the sheet reads", () => {
    // 28-8-23-2: three bedrooms on the sheet, two on the plate, and no kitchen
    // anywhere. The plate passed its own audit and was still another flat.
    const plate = [measured("bedroom"), measured("bedroom"), measured("living"), measured("kitchen")];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(false);
  });

  it("rejects a plate with no kitchen where the sheet prints one", () => {
    const plate = [measured("bedroom"), measured("bedroom"), measured("bedroom"), measured("living")];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(false);
  });

  it("accepts a plate that shows the whole programme", () => {
    const plate = [
      measured("bedroom"),
      measured("bedroom"),
      measured("bedroom"),
      measured("living"),
      measured("kitchen"),
      measured("circulation"),
    ];
    expect(measuredPlateMatchesSheet(sheet(), plate)).toBe(true);
  });

  it("rejects mismatched bedrooms, shelter rooms, bathrooms, and balconies", () => {
    const completeSheet = parseFloorplanLayout({
      rooms: [
        { name: "סלון", kind: "living" },
        { name: "מטבח", kind: "kitchen" },
        { name: "חדר שינה 1", kind: "bedroom" },
        { name: 'ממ"ד', kind: "mmd" },
        { name: "חדר רחצה 1", kind: "bathroom" },
        { name: "חדר רחצה 2", kind: "bathroom" },
        { name: "מרפסת 1", kind: "balcony" },
      ],
    });
    const completePlate = [
      "living", "kitchen", "bedroom", "mmd", "bathroom", "bathroom", "balcony",
    ].map(measured);

    expect(measuredPlateMatchesSheet(completeSheet, completePlate)).toBe(true);
    expect(measuredPlateMatchesSheet(completeSheet, completePlate.filter((room) => room.kind !== "mmd"))).toBe(false);
    expect(measuredPlateMatchesSheet(completeSheet, [...completePlate, measured("bedroom")])).toBe(false);
    expect(measuredPlateMatchesSheet(completeSheet, completePlate.filter((room) => room.kind !== "balcony"))).toBe(false);
  });

  it("does not block a sheet it could not read", () => {
    const unread = parseFloorplanLayout({ rooms: [] });
    expect(measuredPlateMatchesSheet(unread, [measured("other")])).toBe(true);
  });

  it("blocks a matching plate when its own measured confidence fails", () => {
    const program = sheet();
    const plate = [
      measured("bedroom"), measured("bedroom"), measured("bedroom"),
      measured("living"), measured("kitchen"),
    ];
    expect(measuredPlateQualityFailure(program, plate, {
      tier: "cad",
      ok: false,
      hard: ["שגיאת שטח 4%"],
      soft: [],
    })).toContain("שגיאת שטח");
  });

  it("blocks a failed measured quality report even when sheet labels are unreadable", () => {
    const unread = parseFloorplanLayout({ rooms: [] });
    expect(measuredPlateQualityFailure(unread, [measured("other")], {
      tier: "cad",
      ok: false,
      hard: ["לא זוהו חדרים כלל"],
      soft: [],
    })).toContain("לא זוהו חדרים כלל");
  });

  it("does not require a roof terrace on the apartment's measured floor plate", () => {
    const program = parseFloorplanLayout({
      rooms: [
        { name: "סלון", kind: "living" },
        { name: "מטבח", kind: "kitchen" },
        { name: "חדר שינה", kind: "bedroom" },
        { name: "מרפסת", kind: "balcony" },
        { name: "מרפסת גג", kind: "balcony" },
      ],
    });
    const plate = [measured("living"), measured("kitchen"), measured("bedroom"), measured("balcony")];
    const truth = {
      grossM2: 60,
      bedrooms: 1,
      mmd: 0,
      bathrooms: 1,
      levelM: 12.79,
      terraces: [{ m2: 4.1, levelM: 12.79 }, { m2: 13.2, levelM: 15.94 }],
    };
    expect(measuredPlateMatchesSheet(program, plate, truth)).toBe(true);
  });

  it("accepts no same-level balcony when the sheet only prints a roof terrace", () => {
    const program = parseFloorplanLayout({
      rooms: [
        { name: "סלון", kind: "living" },
        { name: "מטבח", kind: "kitchen" },
        { name: "חדר שינה", kind: "bedroom" },
        { name: "מרפסת גג", kind: "balcony" },
      ],
    });
    const plate = [measured("living"), measured("kitchen"), measured("bedroom")];
    const truth = {
      grossM2: 60,
      bedrooms: 1,
      mmd: 0,
      bathrooms: 1,
      levelM: 12.79,
      terraces: [{ m2: 8, levelM: 14.36 }],
    };
    expect(measuredPlateMatchesSheet(program, plate, truth)).toBe(true);
  });
});
