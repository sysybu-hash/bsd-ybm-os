import {
  emptyFloorplanSpend,
  formatFloorplanSpend,
  imageCallsForAttempts,
  recordAmbientFloorplanSpend,
  recordFloorplanSpend,
  runWithFloorplanSpend,
} from "@/lib/projects/floorplan-spend";

describe("floorplan spend", () => {
  it("counts calls made anywhere inside a spend scope, and none outside it", async () => {
    // Raster runs reported zero image calls: the generator never saw a counter.
    const spend = emptyFloorplanSpend();
    recordAmbientFloorplanSpend("image", "outside");
    await runWithFloorplanSpend(spend, async () => {
      recordAmbientFloorplanSpend("image", "gemini-a");
      await Promise.all([
        Promise.resolve().then(() => recordAmbientFloorplanSpend("audit", "claude-audit")),
        new Promise<void>((resolve) =>
          setTimeout(() => {
            recordAmbientFloorplanSpend("image", "gemini-a");
            resolve();
          }, 1),
        ),
      ]);
    });
    expect(spend.imageCalls).toBe(2);
    expect(spend.auditCalls).toBe(1);
    expect(spend.byModel.outside).toBeUndefined();
  });

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
