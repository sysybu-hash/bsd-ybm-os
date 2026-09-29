import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import { splitStrip, unitMarks } from "@/lib/projects/sheet-split";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const seg = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({ x1, y1, x2, y2, lineWidth: 1 });
/** A drawing: a square of lines, 400 points across, at x0. */
const drawing = (x0: number): VectorSegment[] => {
  const out: VectorSegment[] = [];
  for (let k = 0; k <= 400; k += 40) out.push(seg(x0, 100 + k, x0 + 400, 100 + k), seg(x0 + k, 100, x0 + k, 500));
  return out;
};
const text = (x: number, y: number, t: string, height = 8): PlacedText => ({ x, y, text: t, height });

/** Three drawings on a strip, white between them, framed by two lines its whole length. */
function strip(texts: PlacedText[]): DwfGeometry {
  return {
    pageWidth: 3000,
    pageHeight: 800,
    segments: [...drawing(100), ...drawing(1100), ...drawing(2100), seg(0, 20, 3000, 20), seg(0, 780, 3000, 780)],
    curves: [],
    walls: [],
    texts,
    fills: [],
    arcs: [],
  };
}

describe("a permit strip, cut into its drawings", () => {
  const sheets = splitStrip(
    strip([
      // An elevation, titled under it.
      text(300, 490, "דרומית", 20),
      text(330, 490, " ", 20),
      text(400, 490, "חזית", 20),
      // A floor plan: room names, and apartment numbers set larger, each alone.
      ...["סלון", "מטבח", "שינה", "שינה", "מרפסת", "לובי"].map((t, k) => text(1150 + k * 50, 300, t)),
      text(1200, 200, "1", 13),
      text(1450, 200, "2", 13),
      // A third number with a level mark set beside it, smaller.
      text(1300, 400, "3", 13),
      text(1280, 400, "+", 8),
      text(1265, 400, "14.75", 8),
      // A permit form, known by an ID number.
      text(2200, 300, "123456789"),
    ]),
  );

  it("finds each drawing and leaves the strip's frame out", () => {
    expect(sheets).toHaveLength(3);
    expect(sheets.map((s) => s.box.x)).toEqual([...sheets.map((s) => s.box.x)].sort((a, b) => a - b));
  });

  it("reads an elevation by its title, in reading order", () => {
    expect(sheets[0]).toMatchObject({ kind: "elevation", title: "חזית דרומית" });
  });

  it("knows a floor by its rooms and its apartment numbers", () => {
    expect(sheets[1]).toMatchObject({ kind: "floor", units: [1, 2, 3] });
  });

  it("marks the permit form and passes nothing on from it", () => {
    expect(sheets[2]).toMatchObject({ kind: "form", title: null });
  });
});

describe("where a floor plan's apartment numbers stand", () => {
  it("gives each number's middle, for the flat to be read from", () => {
    const marks = unitMarks([text(100, 100, "סלון"), text(200, 100, "שינה"), text(150, 200, "7", 13)]);
    expect(marks).toEqual([{ unit: 7, x: 150, y: 193.5 }]);
  });
});
