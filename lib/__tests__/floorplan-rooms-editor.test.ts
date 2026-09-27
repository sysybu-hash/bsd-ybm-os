import { fromDraft, toDraft } from "@/components/os/widgets/floorplan-viz/FloorplanVizRoomsDetails";
import type { FloorplanRoom } from "@/lib/projects/floorplan-layout";

const read: FloorplanRoom[] = [
  { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.31, w: 0.16, h: 0.15 }, bedCount: 1 },
  { name: "מרפסת שירות", kind: "balcony", bbox: { x: 0.23, y: 0.7, w: 0.08, h: 0.1 } },
];

describe("the room editor's save", () => {
  it("keeps a room's place on the sheet when its kind is corrected", () => {
    const rows = toDraft(read);
    rows[0] = { ...rows[0]!, name: 'ממ"ד', kind: "mmd" };
    rows[1] = { ...rows[1]!, name: "מרפסת", area: "3.16" };
    const saved = fromDraft(rows)!;
    expect(saved[0]).toMatchObject({ name: 'ממ"ד', kind: "mmd", bbox: read[0]!.bbox, bedCount: 1 });
    expect(saved[1]).toMatchObject({ name: "מרפסת", areaM2: 3.16, bbox: read[1]!.bbox });
  });

  it("adds a room the read missed, and refuses a nameless row or a bad area", () => {
    const rows = [...toDraft(read), { key: "n", name: "מרפסת", kind: "balcony" as const, area: "6.4" }];
    expect(fromDraft(rows)?.[2]).toEqual({ name: "מרפסת", kind: "balcony", areaM2: 6.4 });
    expect(fromDraft([{ key: "n", name: " ", kind: "balcony", area: "" }])).toBeNull();
    expect(fromDraft([{ key: "n", name: "מרפסת", kind: "balcony", area: "-2" }])).toBeNull();
  });

  it("saves the beds a person counted, and refuses a count that is not a whole number", () => {
    const rows = toDraft(read);
    rows[0] = { ...rows[0]!, beds: "2" };
    expect(fromDraft(rows)?.[0]?.bedCount).toBe(2);
    rows[0] = { ...rows[0]!, beds: "" };
    expect(fromDraft(rows)?.[0]?.bedCount).toBeUndefined();
    rows[0] = { ...rows[0]!, beds: "1.5" };
    expect(fromDraft(rows)).toBeNull();
  });
});
