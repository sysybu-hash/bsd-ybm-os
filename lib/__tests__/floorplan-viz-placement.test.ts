import {
  expectedRoomPlacements,
  gradePlacement,
  placementFailureText,
} from "@/lib/projects/floorplan-viz-placement";
import { isStructuralAuditFailure } from "@/lib/projects/floorplan-viz-structural";
import { hebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));

// דירה 14 as the production run read it, 22 September.
const DIRA_14 = parseFloorplanLayout({
  rooms: [
    { name: "מגורים ומטבח", kind: "living" },
    { name: "מרפסת", kind: "balcony", bbox: { x: 0.34, y: 0.25, w: 0.19, h: 0.08 } },
    { name: "חדר שינה", kind: "bedroom", bedCount: 1, bbox: { x: 0.17, y: 0.19, w: 0.18, h: 0.13 } },
    { name: "חדר שינה", kind: "bedroom", bedCount: 1, bbox: { x: 0.1, y: 0.31, w: 0.16, h: 0.15 } },
    { name: "חדר שינה", kind: "bedroom", bedCount: 1, bbox: { x: 0.24, y: 0.49, w: 0.2, h: 0.1 } },
    { name: "חדר שינה", kind: "bedroom", bedCount: 1, bbox: { x: 0.24, y: 0.59, w: 0.2, h: 0.12 } },
    { name: "אמבטיה", kind: "bathroom", bbox: { x: 0.24, y: 0.7, w: 0.15, h: 0.1 } },
    { name: "שירותים", kind: "bathroom", bbox: { x: 0.38, y: 0.7, w: 0.09, h: 0.1 } },
    { name: "מרפסת שירות", kind: "balcony", bbox: { x: 0.23, y: 0.7, w: 0.08, h: 0.1 } },
  ],
});

describe("where each room is", () => {
  const rooms = expectedRoomPlacements(DIRA_14);

  it("checks the bedrooms and baths, not the balconies or an unplaced room", () => {
    expect(rooms.map((r) => r.expected)).toEqual(["sleeping", "sleeping", "sleeping", "sleeping", "wet", "wet"]);
    for (const r of rooms) {
      expect(r.box.x).toBeGreaterThanOrEqual(0);
      expect(r.box.x + r.box.w).toBeLessThanOrEqual(1.0001);
    }
  });

  it("flags the kitchen painted where the plan has a bedroom", () => {
    const answer = {
      regions: rooms.map((r, i) => ({
        id: r.id,
        found: i === 2 ? "kitchen" : r.expected === "wet" ? "bathroom" : "bedroom",
        has: i !== 2,
      })),
    };
    const moved = gradePlacement(rooms, answer);
    expect(moved).toHaveLength(1);
    const text = placementFailureText(moved[0]!);
    expect(text).toMatch(/^room moved: the middle \w+ of the flat should be a bedroom, the still shows kitchen/);
    // It steers the next frame, but it does not stop a booklet: measured over
    // three runs of five sheets, the placement verdicts were wrong far more
    // often than they were right. See floorplan-viz-structural.ts.
    expect(isStructuralAuditFailure(text)).toBe(false);
    expect(hebrewFloorplanAuditIssue(text)).toMatch(/^חדר זז: .*אמור להיות חדר שינה, ובהדמיה מטבח$/);
  });

  it("treats an open-plan kitchen and living room as one space", () => {
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.5, y: 0.1, w: 0.4, h: 0.3 } },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } },
      ],
    });
    const placed = expectedRoomPlacements(layout);
    const answer = {
      regions: [
        { id: placed[0]!.id, found: "living", has: true },
        { id: placed[1]!.id, found: "bedroom", has: true },
      ],
    };
    expect(gradePlacement(placed, answer)).toEqual([]);
  });

  it("says nothing when the bed is still inside the region, only off its middle", () => {
    // דירה 20: the still's own walls shift each room by a few percent, so the
    // midpoint of a bedroom's region landed in the living room beside it.
    const answer = {
      regions: rooms.map((r, i) => ({
        id: r.id,
        found: i === 2 ? "living" : r.expected === "wet" ? "bathroom" : "bedroom",
        has: true,
      })),
    };
    expect(gradePlacement(rooms, answer)).toEqual([]);
  });

  it("does not take the auditor's uncertainty for a verdict", () => {
    const answer = { regions: rooms.map((r) => ({ id: r.id, found: "unclear", has: false })) };
    expect(gradePlacement(rooms, answer)).toEqual([]);
  });

  it("counts a laundry nook where a room should be — the lost entrance of דירה 14", () => {
    const answer = {
      regions: rooms.map((r, i) => ({
        id: r.id,
        found: i === 0 ? "laundry" : r.expected === "wet" ? "bathroom" : "bedroom",
        has: i !== 0,
      })),
    };
    expect(gradePlacement(rooms, answer)).toHaveLength(1);
  });
});
