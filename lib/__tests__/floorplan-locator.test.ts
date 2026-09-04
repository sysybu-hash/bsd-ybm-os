import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  expandBbox,
  findRoomForLocator,
  interiorCropPad,
  locatorFocusForGeneration,
  locatorFocusForView,
  remapLayoutToCrop,
  unionBboxes,
  unitCropFromLayout,
  isTrustworthyRoomGeometry,
} from "@/lib/projects/floorplan-locator";

describe("floorplan locator map", () => {
  it("crops an interior to that room bbox with padding", () => {
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", bbox: { x: 0.2, y: 0.3, w: 0.2, h: 0.2 } },
        { name: "סלון", bbox: { x: 0.5, y: 0.1, w: 0.3, h: 0.4 } },
      ],
    });
    const focus = locatorFocusForView(layout, "interior", "מטבח");
    expect(focus.highlight).toEqual({ x: 0.2, y: 0.3, w: 0.2, h: 0.2 });
    expect(focus.crop.x).toBeLessThan(0.2);
    expect(focus.crop.x + focus.crop.w).toBeGreaterThan(0.4);
    expect(findRoomForLocator(layout, "פנים — מטבח")?.name).toBe("מטבח");
    const gen = locatorFocusForGeneration(layout, "interior", "מטבח");
    expect(gen.crop.w).toBeLessThan(focus.crop.w);
    expect(interiorCropPad("bedroom")).toBeLessThan(interiorCropPad("living"));
  });

  it("uses the union of rooms for whole-plan views", () => {
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
        { name: "סלון", bbox: { x: 0.5, y: 0.4, w: 0.3, h: 0.3 } },
      ],
    });
    const union = unionBboxes(layout.rooms.map((r) => r.bbox!));
    expect(union?.x).toBeCloseTo(0.1, 5);
    expect(union?.y).toBeCloseTo(0.1, 5);
    expect(union?.w).toBeCloseTo(0.7, 5);
    expect(union?.h).toBeCloseTo(0.6, 5);
    const focus = locatorFocusForView(layout, "overview");
    expect(focus.highlight).toEqual(union);
  });

  it("expands a bbox without leaving 0–1", () => {
    const expanded = expandBbox({ x: 0, y: 0.9, w: 0.1, h: 0.1 }, 0.2);
    expect(expanded.x).toBe(0);
    expect(expanded.y + expanded.h).toBeLessThanOrEqual(1);
  });

  it("crops the title-block side on a portrait sales sheet and remaps room bboxes", () => {
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "סלון", kind: "living", bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.35 } },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.1, y: 0.56, w: 0.25, h: 0.2 } },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.37, y: 0.56, w: 0.28, h: 0.24 } },
        { name: "מעלית", kind: "circulation", bbox: { x: 0.82, y: 0.8, w: 0.12, h: 0.12 } },
      ],
    });
    const fromRooms = unitCropFromLayout(layout);
    expect(fromRooms.x + fromRooms.w).toBeLessThan(0.82);
    const fallback = unitCropFromLayout(parseFloorplanLayout({ rooms: [{ name: "סלון", kind: "living" }] }), {
      portraitSheet: true,
    });
    expect(fallback).toEqual({ x: 0, y: 0, w: 0.74, h: 1 });
    const remapped = remapLayoutToCrop(layout, fallback);
    const living = remapped.rooms.find((r) => r.name === "סלון");
    expect(living?.bbox?.x).toBeCloseTo(0.1 / 0.74, 2);
    expect(living?.bbox?.w).toBeCloseTo(0.4 / 0.74, 2);
  });

  // Geometry taken from two real runs. sales-28-1 was read cleanly; דירה 18 was
  // the read that cropped a bedroom and both terraces off the sheet.
  describe("room-geometry trust", () => {
    const trustworthy = parseFloorplanLayout({
      rooms: [
        { name: "סלון", kind: "living", bbox: { x: 0.52, y: 0.11, w: 0.3, h: 0.35 } },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.2, y: 0.12, w: 0.28, h: 0.22 } },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.14, y: 0.62, w: 0.24, h: 0.22 } },
        { name: "חדר רחצה", kind: "bathroom", bbox: { x: 0.6, y: 0.48, w: 0.16, h: 0.14 } },
      ],
    });

    it("accepts rooms that tile the plane", () => {
      expect(isTrustworthyRoomGeometry(trustworthy)).toBe(true);
      const crop = unitCropFromLayout(trustworthy);
      expect(crop.w).toBeLessThan(1);
    });

    it("rejects a read that left a room unplaced", () => {
      const layout = parseFloorplanLayout({
        rooms: [
          ...trustworthy.rooms.map((r) => ({ ...r, bbox: r.bbox })),
          { name: "מדרגות פנים", kind: "circulation" },
        ],
      });
      expect(isTrustworthyRoomGeometry(layout)).toBe(false);
      expect(unitCropFromLayout(layout)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });

    it("rejects nested rooms and keeps the whole sheet", () => {
      // דירה 18: the bathroom came back sitting inside the balcony.
      const layout = parseFloorplanLayout({
        rooms: [
          { name: "חדר מגורים", kind: "living", bbox: { x: 0.16, y: 0.12, w: 0.39, h: 0.28 } },
          { name: "מטבח", kind: "kitchen", bbox: { x: 0.04, y: 0.23, w: 0.25, h: 0.24 } },
          { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.32, y: 0.44, w: 0.27, h: 0.29 } },
          { name: "מרפסת", kind: "balcony", bbox: { x: 0.31, y: 0.5, w: 0.41, h: 0.11 } },
          { name: "חדר אמבטיה", kind: "bathroom", bbox: { x: 0.38, y: 0.5, w: 0.14, h: 0.16 } },
        ],
      });
      expect(isTrustworthyRoomGeometry(layout)).toBe(false);
      const crop = unitCropFromLayout(layout);
      expect(crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });

    it("does not crop when too few rooms were placed", () => {
      const layout = parseFloorplanLayout({
        rooms: [{ name: "סלון", kind: "living", bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.35 } }],
      });
      expect(isTrustworthyRoomGeometry(layout)).toBe(false);
    });
  });
});
