import { activeShare, costReport, engineWorkspace, type CostInputs } from "@/lib/vmb/costs";

const NOV = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") };

const base = (over: Partial<CostInputs> = {}): CostInputs => ({ range: NOV, ai: [], jobs: [], storageBytes: 0, payments: [], fixed: [], rates: {}, usdToIls: 4, ...over });

describe("VMB cost report", () => {
  it("reads the office off the engine's feature tag", () => {
    expect(engineWorkspace("vmb-engine:w1")).toBe("w1");
    expect(engineWorkspace("chat")).toBeNull();
  });

  it("counts a fixed cost only for the days it ran", () => {
    expect(activeShare({ startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: null }, NOV)).toBe(1);
    expect(activeShare({ startsOn: new Date("2026-11-16T00:00:00Z"), endsOn: null }, NOV)).toBe(0.5);
    expect(activeShare({ startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: new Date("2026-10-01T00:00:00Z") }, NOV)).toBe(0);
  });

  it("is zero, with nothing missing, when nothing happened", () => {
    const r = costReport(base());
    expect(r.totalMinor).toBe(0);
    expect(r.missing).toEqual([]);
    expect(r.perBookletMinor).toBeNull();
  });

  it("leaves a line unpriced, and says which rate it waits for, instead of guessing", () => {
    const r = costReport(base({ jobs: [{ workspaceId: "w1", computeMs: 3_600_000, dwgConversions: 4, delivered: true, picturesPainted: 0 }] }));
    const dwg = r.lines.find((l) => l.key === "dwg")!;
    expect(dwg).toMatchObject({ minor: null, qty: 4, missing: ["dwgConversionUsd"] });
    expect(r.lines.find((l) => l.key === "compute")!.missing).toEqual(["computeUsdPerHour"]);
    expect(r.missing).toEqual(["dwgConversionUsd", "computeUsdPerHour"]);
    expect(r.totalMinor).toBe(0);
  });

  it("prices conversions and compute at the entered rates, in agorot, and charges them to the office", () => {
    const r = costReport(
      base({
        rates: { dwgConversionUsd: 0.5, computeUsdPerHour: 2 },
        jobs: [
          { workspaceId: "w1", computeMs: 1_800_000, dwgConversions: 4, delivered: true, picturesPainted: 0 },
          { workspaceId: "w2", computeMs: 0, dwgConversions: 0, delivered: false, picturesPainted: 0 },
        ],
      }),
    );
    // 4 × $0.5 = $2 → ₪8; half an hour at $2 = $1 → ₪4.
    expect(r.lines.find((l) => l.key === "dwg")!.minor).toBe(800);
    expect(r.lines.find((l) => l.key === "compute")!.minor).toBe(400);
    expect(r.totalMinor).toBe(1200);
    expect(r.perBookletMinor).toBe(1200);
    expect(r.offices).toEqual([{ workspaceId: "w1", costMinor: 1200, revenueMinor: 0, booklets: 1 }]);
  });

  it("takes the gateway's cut from PayPal payments only", () => {
    const r = costReport(
      base({
        rates: { paypalPercent: 3.4, paypalFixedIls: 1.2 },
        payments: [
          { workspaceId: "w1", gateway: "paypal", amountMinor: 1_770_000 },
          { workspaceId: "w2", gateway: "manual", amountMinor: 1_770_000 },
        ],
      }),
    );
    expect(r.lines.find((l) => l.key === "gateway")).toMatchObject({ minor: 60_180 + 120, qty: 1 });
    expect(r.revenueMinor).toBe(3_540_000);
    expect(r.marginMinor).toBe(3_540_000 - 60_300);
  });

  it("adds the fixed costs for the month, dollars at the day's rate", () => {
    const r = costReport(
      base({
        range: { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") },
        fixed: [
          { id: "a", vendor: "Hosting", amountMinor: 2000, currency: "USD", startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: null },
          { id: "b", vendor: "Domain", amountMinor: 5000, currency: "ILS", startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: null },
        ],
      }),
    );
    // A 30-day range is one month: $20 → ₪80, and ₪50.
    expect(r.fixedRows).toEqual([
      { id: "a", vendor: "Hosting", minor: 8000 },
      { id: "b", vendor: "Domain", minor: 5000 },
    ]);
    expect(r.lines.find((l) => l.key === "fixed")!.minor).toBe(13_000);
  });

  it("says the exchange rate is missing rather than showing dollars as shekels", () => {
    const r = costReport(base({ usdToIls: null, fixed: [{ id: "a", vendor: "Hosting", amountMinor: 2000, currency: "USD", startsOn: new Date("2026-01-01T00:00:00Z"), endsOn: null }] }));
    expect(r.fixedRows[0]!.minor).toBeNull();
    expect(r.missing).toContain("usdToIls");
  });

  it("counts calls to a model that is not on the price list as unpriced", () => {
    const r = costReport(base({ ai: [{ feature: "vmb-engine:w1", model: "no-such-model", organizationId: null, environment: "production", calls: 3, inputTokens: 10, outputTokens: 10, imageTokens: 0, outputImages: 0 }] }));
    expect(r.aiUnpricedCalls).toBe(3);
    expect(r.lines.find((l) => l.key === "ai")).toMatchObject({ minor: 0, qty: 3 });
  });
});
