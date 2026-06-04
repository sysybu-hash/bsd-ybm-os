import {
  computeBalancedRowSizes,
  splitIntoBalancedRows,
  LAUNCHER_QUICK_MAX_PER_ROW,
} from "@/lib/launcher/launcher-grid-layout";

describe("computeBalancedRowSizes", () => {
  it("returns empty for zero items", () => {
    expect(computeBalancedRowSizes(0)).toEqual([]);
  });

  it("returns single row for one item", () => {
    expect(computeBalancedRowSizes(1)).toEqual([1]);
  });

  it("splits even counts into two equal rows", () => {
    expect(computeBalancedRowSizes(6)).toEqual([3, 3]);
  });

  it("handles odd counts with a trailing singleton row", () => {
    expect(computeBalancedRowSizes(7)).toEqual([3, 3, 1]);
  });

  it("balances many items across multiple rows", () => {
    const sizes = computeBalancedRowSizes(20);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(20);
    expect(sizes.every((s) => s <= LAUNCHER_QUICK_MAX_PER_ROW)).toBe(true);
  });
});

describe("splitIntoBalancedRows", () => {
  it("chunks items according to balanced sizes", () => {
    const items = ["a", "b", "c", "d", "e"];
    const rows = splitIntoBalancedRows(items);
    expect(rows.flat()).toEqual(items);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.length <= LAUNCHER_QUICK_MAX_PER_ROW)).toBe(true);
  });
});
