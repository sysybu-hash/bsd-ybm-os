import {
  computeProfessionalGrid,
  computeProfessionalLayout,
  computeProfessionalRowSizes,
  isLayoutWithinBounds,
  layoutHasNoOverlaps,
} from "@/lib/workspace/screen-layout-generator";

const BOUNDS = { width: 1400, height: 900 };
const NARROW = { width: 820, height: 900 };

function ids(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `w-${i}` }));
}

function cellsFromLayout(
  layout: Map<string, { position: { x: number; y: number }; size: { width: number; height: number } }>,
) {
  return [...layout.values()];
}

describe("computeProfessionalRowSizes", () => {
  it("matches wide-screen spec for 2–6 windows", () => {
    expect(computeProfessionalRowSizes(2)).toEqual([2]);
    expect(computeProfessionalRowSizes(3)).toEqual([3]);
    expect(computeProfessionalRowSizes(4)).toEqual([2, 2]);
    expect(computeProfessionalRowSizes(5)).toEqual([3, 2]);
    expect(computeProfessionalRowSizes(6)).toEqual([3, 3]);
  });
});

describe("computeProfessionalGrid", () => {
  it("uses 2+1 on narrow workspace for 3 windows", () => {
    expect(computeProfessionalGrid(3, NARROW).map((r) => r.cols)).toEqual([2, 1]);
  });

  it("uses 2x3 for 6 windows on tall narrow layout", () => {
    const tall = { width: 820, height: 1200 };
    expect(computeProfessionalGrid(6, tall).map((r) => r.cols)).toEqual([2, 2, 2]);
  });
});

describe("computeProfessionalLayout", () => {
  it("lays out 2 windows in two equal columns without overlap", () => {
    const layout = computeProfessionalLayout(ids(2), BOUNDS);
    const cells = cellsFromLayout(layout);
    expect(cells).toHaveLength(2);
    expect(cells[0]!.size.width).toBe(cells[1]!.size.width);
    expect(cells[0]!.position.y).toBe(cells[1]!.position.y);
    expect(cells[0]!.position.x).toBeLessThan(cells[1]!.position.x);
    expect(layoutHasNoOverlaps(cells)).toBe(true);
    expect(isLayoutWithinBounds(cells, BOUNDS)).toBe(true);
  });

  it("lays out 3 windows in three equal columns on wide workspace", () => {
    const layout = computeProfessionalLayout(ids(3), BOUNDS);
    const cells = cellsFromLayout(layout);
    const xs = ["w-0", "w-1", "w-2"].map((id) => layout.get(id)!.position.x);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(layout.get("w-0")!.size.width).toBe(layout.get("w-1")!.size.width);
    expect(layoutHasNoOverlaps(cells)).toBe(true);
    expect(isLayoutWithinBounds(cells, BOUNDS)).toBe(true);
  });

  it("lays out 4 windows in 2x2 equal quadrants", () => {
    const layout = computeProfessionalLayout(ids(4), BOUNDS);
    const cells = cellsFromLayout(layout);
    const w0 = layout.get("w-0")!;
    const w1 = layout.get("w-1")!;
    const w2 = layout.get("w-2")!;
    const w3 = layout.get("w-3")!;
    expect(w0.position.y).toBe(w1.position.y);
    expect(w2.position.y).toBe(w3.position.y);
    expect(w0.position.y).toBeLessThan(w2.position.y);
    expect(w0.position.x).toBeLessThan(w1.position.x);
    expect(w2.position.x).toBeLessThan(w3.position.x);
    expect(w0.size.width).toBe(w1.size.width);
    expect(w0.size.height).toBe(w2.size.height);
    expect(layoutHasNoOverlaps(cells)).toBe(true);
    expect(isLayoutWithinBounds(cells, BOUNDS)).toBe(true);
  });

  it("lays out 6 windows in 3x2 on wide workspace", () => {
    const layout = computeProfessionalLayout(ids(6), BOUNDS);
    const cells = cellsFromLayout(layout);
    const top = [layout.get("w-0")!, layout.get("w-1")!, layout.get("w-2")!];
    const bottom = [layout.get("w-3")!, layout.get("w-4")!, layout.get("w-5")!];
    expect(top.every((c) => c.position.y === top[0]!.position.y)).toBe(true);
    expect(bottom.every((c) => c.position.y === bottom[0]!.position.y)).toBe(true);
    expect(top[0]!.position.y).toBeLessThan(bottom[0]!.position.y);
    expect(layoutHasNoOverlaps(cells)).toBe(true);
    expect(isLayoutWithinBounds(cells, BOUNDS)).toBe(true);
  });

  it("fills workspace: combined tile area uses most of inner bounds", () => {
    const layout = computeProfessionalLayout(ids(4), BOUNDS);
    const cells = cellsFromLayout(layout);
    const maxRight = Math.max(...cells.map((c) => c.position.x + c.size.width));
    const maxBottom = Math.max(...cells.map((c) => c.position.y + c.size.height));
    expect(maxRight).toBeGreaterThan(BOUNDS.width * 0.75);
    expect(maxBottom).toBeGreaterThan(BOUNDS.height * 0.65);
  });

  it("centers a single large window within bounds", () => {
    const layout = computeProfessionalLayout(ids(1), BOUNDS);
    const cell = layout.get("w-0")!;
    expect(cell.size.width).toBeGreaterThan(BOUNDS.width * 0.85);
    expect(cell.size.height).toBeGreaterThan(BOUNDS.height * 0.85);
    expect(cell.position.x).toBeGreaterThan(0);
    expect(cell.position.y).toBeGreaterThan(0);
    expect(isLayoutWithinBounds([cell], BOUNDS)).toBe(true);
  });

  it("never overlaps for 5 windows on wide layout", () => {
    const layout = computeProfessionalLayout(ids(5), BOUNDS);
    const cells = cellsFromLayout(layout);
    expect(layoutHasNoOverlaps(cells)).toBe(true);
    expect(isLayoutWithinBounds(cells, BOUNDS)).toBe(true);
  });
});
