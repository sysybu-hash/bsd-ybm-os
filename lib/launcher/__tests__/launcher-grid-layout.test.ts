import {
  computeBalancedRowSizes,
  splitIntoBalancedRows,
} from "@/lib/launcher/launcher-grid-layout";

describe("computeBalancedRowSizes", () => {
  it("returns empty for n=0", () => {
    expect(computeBalancedRowSizes(0)).toEqual([]);
  });

  it("balances 8 items as 4+4", () => {
    expect(computeBalancedRowSizes(8)).toEqual([4, 4]);
  });

  it("balances 9 items as 4+4+1", () => {
    expect(computeBalancedRowSizes(9)).toEqual([4, 4, 1]);
  });

  it("balances 10 items as 5+5", () => {
    expect(computeBalancedRowSizes(10)).toEqual([5, 5]);
  });

  it("balances 7 items as 3+3+1", () => {
    expect(computeBalancedRowSizes(7)).toEqual([3, 3, 1]);
  });

  it("balances 11 items as 5+5+1", () => {
    expect(computeBalancedRowSizes(11)).toEqual([5, 5, 1]);
  });
});

describe("splitIntoBalancedRows", () => {
  it("chunks items to match row sizes", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(splitIntoBalancedRows(items)).toEqual([
      ["a", "b", "c", "d"],
      ["e", "f", "g", "h"],
    ]);
  });

  it("preserves order for 9 items", () => {
    const items = Array.from({ length: 9 }, (_, i) => i);
    expect(splitIntoBalancedRows(items)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8],
    ]);
  });
});
