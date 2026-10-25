/**
 * @jest-environment node
 */
import { settleStoreyLevels } from "@/lib/projects/building/from-dwf-sheet";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

const sheetMarking = (marks: string[]) =>
  ({ pageWidth: 1000, pageHeight: 1000, segments: [], curves: [], fills: [], arcs: [], texts: marks.map((text, i) => ({ x: 100 + i * 120, y: 100, text, height: 8 })) }) as unknown as DwfGeometry;

describe("a house's storeys, each a storey under the next", () => {
  it("takes the floor's mark, not its stair landing's, where the landing is marked more", () => {
    // The Wolf seminary's ground floor: ±0.00 twice, the landing's +1.76 three times; the first floor at +2.65.
    const ground = { level: 1.76, roof: false, sheet: sheetMarking(["+0.00", "+0.00", "+1.76", "+1.76", "+1.76"]) };
    const first = { level: 2.65, roof: false, sheet: sheetMarking(["+2.65", "+3.36", "+5.04"]) };
    expect(settleStoreyLevels([first, ground]).map((f) => f.level)).toEqual([0, 2.65]);
  });

  it("leaves storeys a storey apart as they are", () => {
    const floors = [
      { level: 0, roof: false, sheet: sheetMarking(["+0.00"]) },
      { level: 2.97, roof: false, sheet: sheetMarking(["+2.97"]) },
      { level: 5.84, roof: true, sheet: sheetMarking(["+5.84"]) },
    ];
    expect(settleStoreyLevels(floors).map((f) => f.level)).toEqual([0, 2.97, 5.84]);
  });
});
