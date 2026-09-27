import {
  enrichLayoutForBooklet,
  printedTruthFromSheet,
} from "@/lib/projects/floorplan-booklet-rooms";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

/**
 * דירה 14 prints its 6.4 m² terrace as outlines, so the text layer only yields
 * 4.10 and 3.16. A room list a person saved with all three terraces has to
 * reach the booklet's table intact.
 */
const confirmed = parseFloorplanLayout({
  grossAreaM2: 111.29,
  rooms: [
    { name: "מגורים", kind: "living", source: "confirmed" },
    { name: "מטבח", kind: "kitchen", source: "confirmed" },
    { name: "חדר שינה", kind: "bedroom", source: "confirmed" },
    { name: "חדר שינה", kind: "bedroom", source: "confirmed" },
    { name: "חדר שינה", kind: "bedroom", source: "confirmed" },
    { name: 'ממ"ד', kind: "mmd", source: "confirmed" },
    { name: "אמבטיה", kind: "bathroom", source: "confirmed" },
    { name: "שירותים", kind: "bathroom", source: "confirmed" },
    { name: "מרפסת", kind: "balcony", areaM2: 4.1, source: "confirmed" },
    { name: "מרפסת", kind: "balcony", areaM2: 6.4, source: "confirmed" },
    { name: "מרפסת", kind: "balcony", areaM2: 3.16, source: "confirmed" },
  ],
});

/** What the sheet's text layer gives: two of the three terrace areas. */
const textAreas = [{ x: 483, y: 478, value: 4.1 }, { x: 312, y: 1312, value: 3.16 }];

describe("a room list a person confirmed, in the booklet", () => {
  it("keeps all three terraces and the ממ\"ד, over the sheet's partial text", () => {
    const truth = printedTruthFromSheet(confirmed, { areas: textAreas }, 111.29);
    expect(truth).toMatchObject({ bedrooms: 3, mmd: 1, bathrooms: 2 });
    expect(truth?.terraces.map((t) => t.m2).sort((a, b) => a - b)).toEqual([3.16, 4.1, 6.4]);
    const rooms = enrichLayoutForBooklet(confirmed, { truth }).rooms;
    const balconies = rooms.filter((r) => r.kind === "balcony").map((r) => r.areaM2).sort();
    expect(balconies).toEqual([3.16, 4.1, 6.4]);
    expect(rooms.filter((r) => r.kind === "mmd")).toHaveLength(1);
  });
});
