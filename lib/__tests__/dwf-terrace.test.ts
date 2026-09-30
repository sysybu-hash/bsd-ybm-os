import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import { readDwfTerraces } from "@/lib/projects/dwf-terrace";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = (72 / 25.4) * 10;
const CM = 2;
const m = (v: number) => v * UPM;
const px = (metres: number) => Math.round((metres * 100) / CM);
const line = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({ x1: m(x1), y1: m(y1), x2: m(x2), y2: m(y2), lineWidth: 0.2 });

/**
 * A 10 × 10 m sheet: one flat's living room (room 2, flat 5) behind a wall
 * along y = 4 m with a window from 4 to 6 m, and the world outside (room 1).
 */
function floor(): DwfFloor {
  const cols = px(10) + 1;
  const rows = px(10) + 1;
  const wall = new Uint8Array(cols * rows);
  const room = new Int32Array(cols * rows).fill(1);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = y * cols + x;
      const inX = x >= px(1) && x <= px(9);
      if (inX && y >= px(4) && y < px(4.2)) wall[k] = x >= px(4) && x < px(6) ? 2 : 1;
      else if (y < px(4.2) && (Math.abs(x - px(1)) < px(0.1) || Math.abs(x - px(9)) < px(0.1))) wall[k] = 1;
      if (wall[k]) room[k] = 0;
      else if (inX && y < px(4)) room[k] = 2;
    }
  }
  return {
    cols,
    rows,
    cm: CM,
    unitsPerMetre: UPM,
    wall,
    room,
    outside: 1,
    rooms: [{ id: 2, areaM2: 32, kind: "living", names: ["סלון"] }],
    apartments: [{ unit: 5, rooms: [2] }],
  };
}

/** A parapet drawn as two lines 5 cm apart, round a terrace from x 2 to 8, down to y 7. */
const parapet = (): VectorSegment[] => [
  line(2, 7, 8, 7),
  line(2, 7.05, 8, 7.05),
  line(2, 4.2, 2, 7.05),
  line(1.95, 4.2, 1.95, 7.05),
  line(8, 4.2, 8, 7.05),
  line(8.05, 4.2, 8.05, 7.05),
];
/** Tiles on a 60 cm module: single lines, which a terrace floods through. */
const tiles = (): VectorSegment[] => [2.6, 3.2, 3.8, 4.4, 5, 5.6, 6.2, 6.8, 7.4].map((x) => line(x, 4.2, x, 7));
const text = (x: number, y: number, t: string): PlacedText => ({ x: m(x), y: m(y), text: t, height: m(0.25) });
const sheet = (segments: VectorSegment[], texts: PlacedText[]): DwfGeometry => ({ pageWidth: m(10), pageHeight: m(10), segments, curves: [], walls: [], texts, fills: [], arcs: [] });

describe("terraces as a permit plan draws them", () => {
  it("floods a terrace to its parapet through the tiles and gives it to the flat behind the window", () => {
    const t = readDwfTerraces(floor(), sheet([...parapet(), ...tiles()], [text(5, 5.5, "מרפסת מקורה"), text(5, 5.9, 'בשטח של כ-16.40 מ"ר')]));
    expect(t).toHaveLength(1);
    expect(t[0]!.unit).toBe(5);
    expect(t[0]!.covered).toBe(true);
    expect(t[0]!.printedM2).toBe(16.4);
    // 6 m by 2.8 m, less the lines' own pixels.
    expect(t[0]!.areaM2).toBeGreaterThan(15);
    expect(t[0]!.areaM2).toBeLessThan(17);
  });

  it("does not take an enclosure open to the world for a terrace", () => {
    expect(readDwfTerraces(floor(), sheet(tiles(), [text(5, 5.5, "מרפסת")]))).toEqual([]);
  });

  it("does not read the floor below's terrace, marked with its level", () => {
    expect(readDwfTerraces(floor(), sheet(parapet(), [text(5, 5.5, "מרפסת + 2.93")]))).toEqual([]);
  });
});
