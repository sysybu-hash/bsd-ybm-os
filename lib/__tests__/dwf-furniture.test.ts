import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { readDwfFurniture } from "@/lib/projects/dwf-furniture";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = (72 / 25.4) * 10;
const m = (v: number) => v * UPM;
const box = (x: number, y: number, w: number, h: number): VectorSegment[] => [
  { x1: m(x), y1: m(y), x2: m(x + w), y2: m(y), lineWidth: 0.2 },
  { x1: m(x + w), y1: m(y), x2: m(x + w), y2: m(y + h), lineWidth: 0.2 },
  { x1: m(x + w), y1: m(y + h), x2: m(x), y2: m(y + h), lineWidth: 0.2 },
  { x1: m(x), y1: m(y + h), x2: m(x), y2: m(y), lineWidth: 0.2 },
];
const cross = (x: number, y: number, w: number, h: number): VectorSegment[] => [
  { x1: m(x), y1: m(y), x2: m(x + w), y2: m(y + h), lineWidth: 0.2 },
  { x1: m(x + w), y1: m(y), x2: m(x), y2: m(y + h), lineWidth: 0.2 },
];
const sheet = (segments: VectorSegment[]): DwfGeometry => ({ pageWidth: m(20), pageHeight: m(20), segments, curves: [], walls: [], texts: [], fills: [], arcs: [] });

describe("furniture as a permit plan draws it", () => {
  const bedroom = () => "bedroom" as const;
  const everywhere = () => true;

  it("reads a box with an X as a wardrobe, not a bath", () => {
    const f = readDwfFurniture(sheet([...box(1, 1, 1.6, 0.6), ...cross(1, 1, 1.6, 0.6)]), UPM, bedroom, everywhere);
    expect(f.map((p) => p.kind)).toEqual(["storage"]);
  });

  it("reads two mattresses side by side as one double bed", () => {
    const f = readDwfFurniture(sheet([...box(2, 2, 0.6, 1.65), ...box(2.6, 2, 0.6, 1.65)]), UPM, bedroom, everywhere);
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("bed");
    expect(Math.round(f[0]!.widthCm)).toBe(120);
  });

  it("does not take the outline round a bed and a desk for a piece", () => {
    const f = readDwfFurniture(sheet([...box(1, 1, 2.8, 1.86), ...box(1, 1, 0.9, 1.9), ...box(2.6, 2.2, 1.2, 0.6)]), UPM, bedroom, everywhere);
    expect(f.map((p) => p.kind).sort()).toEqual(["bed", "desk"]);
  });
});
