/**
 * @jest-environment node
 */
import { packHouseReading, unpackHouseReading } from "@/lib/projects/building/house-reading-pack";

describe("a model's reading, kept small between steps", () => {
  const segments = Array.from({ length: 100 }, (_, i) => ({ x1: i + 0.123456789, y1: 2, x2: i, y2: 3.5, stroke: 0, ...(i % 7 === 0 ? { layer: "A-WALL" } : {}) }));
  const reading = { strip: { segments, fills: [{ pts: [[1.000001, 2], [3, 4]] as Array<[number, number]>, rgb: 255 }], texts: [{ text: "כיתה", x: 1, y: 2 }] }, public: true };

  it("comes back as it went, to a ten-thousandth of a point", () => {
    const back = unpackHouseReading<typeof reading>(packHouseReading(reading));
    expect(back.public).toBe(true);
    expect(back.strip.texts).toEqual(reading.strip.texts);
    expect(back.strip.fills).toEqual([{ pts: [[1, 2], [3, 4]], rgb: 255 }]);
    expect(back.strip.segments).toHaveLength(100);
    expect(back.strip.segments[0]).toEqual({ x1: 0.1235, y1: 2, x2: 0, y2: 3.5, stroke: 0, layer: "A-WALL" });
    expect(back.strip.segments[1]).toEqual({ x1: 1.1235, y1: 2, x2: 1, y2: 3.5, stroke: 0 });
  });

  it("keeps long lists as columns, and reads a reading stored plain", () => {
    expect(packHouseReading(reading).length).toBeLessThan(JSON.stringify(reading).length / 2);
    expect(unpackHouseReading(Buffer.from(JSON.stringify(reading)))).toEqual(reading);
  });
});
