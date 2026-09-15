import {
  emptyFloorplanSpend,
  formatFloorplanSpend,
  imageCallsForAttempts,
  recordFloorplanSpend,
} from "@/lib/projects/floorplan-spend";

describe("floorplan spend", () => {
  it("counts image, audit and extract calls by model", () => {
    // Without this, "how much is a booklet" was a guess. Two image calls
    // per finish is the measured cost of placement then recolour.
    const spend = emptyFloorplanSpend();
    recordFloorplanSpend(spend, "image", "gemini-a");
    recordFloorplanSpend(spend, "image", "gemini-a");
    recordFloorplanSpend(spend, "audit", "auditor");
    recordFloorplanSpend(spend, "extract", "layout-lean");
    expect(spend.imageCalls).toBe(2);
    expect(spend.auditCalls).toBe(1);
    expect(spend.extractCalls).toBe(1);
    expect(spend.byModel["gemini-a"]).toBe(2);
    expect(formatFloorplanSpend(spend)).toMatch(/2 image/);
    expect(imageCallsForAttempts(6)).toBe(12);
  });
});
