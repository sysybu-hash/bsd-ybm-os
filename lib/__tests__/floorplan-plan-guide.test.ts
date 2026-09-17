import { layoutCanGuide, placedRoomsExtent, planPositionLabel } from "@/lib/projects/floorplan-plan-guide";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

const room = (name: string, x: number, y: number) => ({
  name,
  bbox: { x, y, w: 0.12, h: 0.1 },
});

describe("plan guide", () => {
  it("names the part of the flat a room sits in, against the flat's own span", () => {
    // 28-8-23-2, as the extractor read it: the flat covers x 0.22–0.79 of the
    // sheet. Against the page those rooms all read "centre"; against the flat
    // the kitchen is left and the living room right — which is the thing the
    // still got backwards.
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "מרפסת", bbox: { x: 0.22, y: 0.16, w: 0.55, h: 0.11 } },
        { name: "סלון", bbox: { x: 0.57, y: 0.27, w: 0.22, h: 0.23 } },
        { name: "מטבח", bbox: { x: 0.24, y: 0.3, w: 0.27, h: 0.11 } },
        { name: "ממ\"ד", bbox: { x: 0.37, y: 0.42, w: 0.17, h: 0.15 } },
        { name: "מחסן", bbox: { x: 0.47, y: 0.76, w: 0.2, h: 0.06 } },
      ],
    });
    const extent = placedRoomsExtent(layout.rooms);
    const where = (name: string) =>
      planPositionLabel(layout.rooms.find((r) => r.name === name)!, extent);
    expect(where("מטבח")).toBe("top-left");
    expect(where("סלון")).toBe("top-right");
    expect(where("ממ\"ד")).toBe("centre");
    expect(where("מחסן")).toBe("bottom-centre");
  });

  it("has no position for a room the extractor did not place", () => {
    const layout = parseFloorplanLayout({ rooms: [{ name: "מטבח" }] });
    expect(planPositionLabel(layout.rooms[0]!)).toBeNull();
  });

  it("guides only when most rooms are placed", () => {
    const placed = parseFloorplanLayout({
      rooms: [room("מטבח", 0.2, 0.2), room("סלון", 0.6, 0.2), room("חדר שינה", 0.2, 0.7)],
    });
    expect(layoutCanGuide(placed)).toBe(true);

    // Half a map is worse than none: the model would be told where three rooms
    // go and left to invent the other ten.
    const mostlyUnplaced = parseFloorplanLayout({
      rooms: [room("מטבח", 0.2, 0.2), { name: "סלון" }, { name: "חדר שינה" }, { name: "ממ\"ד" }],
    });
    expect(layoutCanGuide(mostlyUnplaced)).toBe(false);
  });
});
