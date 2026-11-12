import { toScanViews } from "@/lib/vmb/scan-view";

const c = (read: number, total: number) => ({ read, total });
const counts = { layers: c(2, 4), blocks: c(0, 1), entities: c(30, 40), hatches: c(1, 2) };
const at = new Date("2026-11-11T10:00:00Z");

describe("toScanViews", () => {
  it("keeps each file's latest round, in file order, with its read share", () => {
    const v = toScanViews([
      { fileName: "b.dxf", round: 1, counts, inkCoverage: null, unread: [], createdAt: at },
      { fileName: "a.dxf", round: 1, counts, inkCoverage: null, unread: [], createdAt: at },
      { fileName: "a.dxf", round: 2, counts: { ...counts, entities: c(38, 40) }, inkCoverage: 0.9, unread: [{ name: "X", count: 2, reason: "no_reader" }], createdAt: at },
    ]);
    expect(v.map((s) => [s.fileName, s.round])).toEqual([
      ["a.dxf", 2],
      ["b.dxf", 1],
    ]);
    expect(v[0]!.share).toBeCloseTo(0.95);
    expect(v[0]!.inkCoverage).toBe(0.9);
    expect(v[0]!.scannedAt).toBe(at.toISOString());
  });

  it("leaves out a row whose stored JSON does not parse, and gives no share for an empty sheet", () => {
    const v = toScanViews([
      { fileName: "bad.dxf", round: 1, counts: { layers: 3 }, inkCoverage: null, unread: [], createdAt: at },
      { fileName: "empty.dxf", round: 1, counts: { ...counts, entities: c(0, 0) }, inkCoverage: null, unread: [], createdAt: at },
    ]);
    expect(v.map((s) => s.fileName)).toEqual(["empty.dxf"]);
    expect(v[0]!.share).toBeNull();
  });
});
