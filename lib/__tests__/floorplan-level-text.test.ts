import { levelTextAt, sameLevelText } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * A level figure drawn as strokes to the right of its ⊕ mark: "+", digits as
 * crude strokes, a point. `glyphs` picks which digit shapes, so two figures
 * can be the same or differ; `size` is the text height.
 */
const SHAPES: Record<string, Array<[number, number, number, number]>> = {
  "+": [[0, 0.5, 0.6, 0.5], [0.3, 0.2, 0.3, 0.8]],
  "1": [[0.3, 0, 0.3, 1], [0.1, 1, 0.5, 1], [0.1, 0.2, 0.3, 0]],
  "2": [[0, 0.2, 0.3, 0], [0.3, 0, 0.6, 0.2], [0.6, 0.2, 0, 1], [0, 1, 0.6, 1]],
  "4": [[0.45, 0, 0, 0.7], [0, 0.7, 0.6, 0.7], [0.45, 0, 0.45, 1]],
  "7": [[0, 0, 0.6, 0], [0.6, 0, 0.2, 1]],
  "9": [[0.6, 0.5, 0, 0.5], [0, 0.5, 0, 0], [0, 0, 0.6, 0], [0.6, 0, 0.6, 1]],
  ".": [[0.1, 0.9, 0.1, 1]],
};
function figure(text: string, x0: number, baseline: number, size: number, lineWidth = 4): VectorSegment[] {
  const out: VectorSegment[] = [];
  [...text].forEach((ch, i) => {
    for (const [a, b, c, d] of SHAPES[ch] ?? []) {
      const x = x0 + i * 0.75 * size;
      out.push({ x1: x + a * size, y1: baseline - size + b * size, x2: x + c * size, y2: baseline - size + d * size, lineWidth });
    }
  });
  return out;
}

describe("the level printed beside a ⊕, compared stroke for stroke", () => {
  it("knows the label's small +11.42 for the terrace's large one", () => {
    // דירה 18: the label sets its level at half the terrace's size.
    const label = { x: 100, y: 100, r: 5 };
    const terrace = { x: 500, y: 500, r: 11 };
    const a = levelTextAt(label, figure("+11.42", 108, 98, 7), []);
    const b = levelTextAt(terrace, figure("+11.42", 518, 496, 14), []);
    expect(a && b && sameLevelText(a, b)).toBe(true);
  });

  it("tells +11.42 from +12.79", () => {
    const a = levelTextAt({ x: 100, y: 100, r: 10 }, figure("+11.42", 112, 97, 14), []);
    const b = levelTextAt({ x: 500, y: 100, r: 10 }, figure("+12.79", 512, 97, 14), []);
    expect(a && b && sameLevelText(a, b)).toBe(false);
  });

  it("reads the figure through a terrace's paving, drawn in a lighter pen", () => {
    const mark = { x: 100, y: 100, r: 10 };
    const joints: VectorSegment[] = [];
    for (let i = 0; i < 40; i++) joints.push({ x1: 112 + i * 2, y1: 80, x2: 112 + i * 2, y2: 95, lineWidth: 2 });
    const text = levelTextAt(mark, [...joints, ...figure("+11.42", 112, 97, 14)], []);
    const clean = levelTextAt(mark, figure("+11.42", 112, 97, 14), []);
    expect(text && clean && sameLevelText(text, clean)).toBe(true);
  });

  it("leaves out the line above — the label's area — and keeps the figure", () => {
    const mark = { x: 100, y: 100, r: 10 };
    const withArea = [...figure("+11.42", 112, 97, 12), ...figure("+12.79", 112, 78, 6)];
    const a = levelTextAt(mark, withArea, []);
    const b = levelTextAt(mark, figure("+11.42", 112, 97, 12), []);
    expect(a && b && sameLevelText(a, b)).toBe(true);
  });

  it("finds nothing where no figure is printed", () => {
    expect(levelTextAt({ x: 100, y: 100, r: 10 }, [], [])).toBeNull();
  });
});
