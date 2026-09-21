import {
  addToLedger,
  recordAiUsage,
  runWithAiUsage,
  usageFromAnthropic,
  usageFromGemini,
  type AiUsageLedger,
} from "@/lib/ai-usage";
import { priceLedger, priceModelUsage } from "@/lib/ai-pricing";
import {
  emptyFloorplanSpend,
  mergeFloorplanSpend,
  runWithFloorplanSpend,
} from "@/lib/projects/floorplan-spend";
import {
  monthRange,
  summarizeAdminVizCosts,
  summarizeFloorplanVizCosts,
} from "@/lib/projects/floorplan-viz-costs";
import { tariffForScope } from "@/lib/projects/floorplan-viz-tariff";

const usage = (over: Partial<Parameters<typeof addToLedger>[2]> = {}) => ({
  calls: 1,
  inputTokens: 0,
  outputTokens: 0,
  imageTokens: 0,
  outputImages: 0,
  ...over,
});

describe("reading what a call used", () => {
  it("splits Gemini image tokens from text and counts thinking as output", () => {
    const response = {
      usageMetadata: {
        promptTokenCount: 3000,
        candidatesTokenCount: 1180,
        thoughtsTokenCount: 200,
        candidatesTokensDetails: [
          { modality: "IMAGE", tokenCount: 1120 },
          { modality: "TEXT", tokenCount: 60 },
        ],
      },
      candidates: [{ content: { parts: [{ inlineData: { data: "x" } }, { text: "ok" }] } }],
    };
    expect(usageFromGemini(response)).toEqual({
      inputTokens: 3000,
      outputTokens: 60 + 200,
      imageTokens: 1120,
      outputImages: 1,
    });
  });

  it("reads the older SDK, which nests the metadata under response", () => {
    const result = { response: { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } };
    expect(usageFromGemini(result).inputTokens).toBe(10);
    expect(usageFromGemini(result).outputTokens).toBe(5);
  });

  it("counts Anthropic cache reads and writes as input", () => {
    const json = {
      usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    };
    expect(usageFromAnthropic(json)).toMatchObject({ inputTokens: 1000, outputTokens: 40 });
  });

  it("records nothing outside a scope, and into the ledger inside one", async () => {
    recordAiUsage("gemini-3.7-flash", { inputTokens: 5 });
    const ledger: AiUsageLedger = {};
    await runWithAiUsage(ledger, async () => {
      recordAiUsage("gemini-3.7-flash", { inputTokens: 5, outputTokens: 2 });
      recordAiUsage("gemini-3.7-flash", { inputTokens: 1 });
    });
    expect(ledger["gemini-3.7-flash"]).toMatchObject({ calls: 2, inputTokens: 6, outputTokens: 2 });
  });

  it("puts a floorplan spend scope's calls on that run's ledger", async () => {
    const spend = emptyFloorplanSpend();
    await runWithFloorplanSpend(spend, async () => {
      recordAiUsage("claude-sonnet-5", { inputTokens: 10, outputTokens: 1 });
    });
    expect(spend.usage?.["claude-sonnet-5"]?.calls).toBe(1);
  });
});

describe("pricing it", () => {
  const sept = new Date("2026-09-22T12:00:00Z");

  it("prices a Pro image at Google's $120 per million image tokens", () => {
    // One 1K/2K picture is 1,120 tokens: $0.1344, which Google rounds to $0.134.
    const usd = priceModelUsage("gemini-3-pro-image", usage({ imageTokens: 1120 }), sept);
    expect(usd).toBeCloseTo(0.1344, 4);
  });

  it("falls back to the per-picture price when the token count is missing", () => {
    const usd = priceModelUsage("gemini-3-pro-image", usage({ outputImages: 2 }), sept);
    expect(usd).toBeCloseTo(0.268, 4);
  });

  it("prices a preview alias as its family", () => {
    expect(priceModelUsage("gemini-3-pro-image-preview", usage({ imageTokens: 1120 }), sept)).toBeCloseTo(
      0.1344,
      4,
    );
  });

  it("follows Google's scheduled Flash price change on 1 January 2027", () => {
    const flash = usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(priceModelUsage("gemini-3.7-flash", flash, sept)).toBeCloseTo(0.75 + 3.75, 6);
    expect(priceModelUsage("gemini-3.7-flash", flash, new Date("2027-01-01T00:00:00Z"))).toBeCloseTo(
      1.5 + 7.5,
      6,
    );
  });

  it("prices Claude Sonnet 5 at $2 in and $10 out", () => {
    const usd = priceModelUsage("claude-sonnet-5", usage({ inputTokens: 500_000, outputTokens: 100_000 }), sept);
    expect(usd).toBeCloseTo(1 + 1, 6);
  });

  it("reports a model with no listed price as unpriced, never as free", () => {
    const report = priceLedger({ "mistral-ocr-latest": usage({ calls: 3, inputTokens: 999 }) }, sept);
    expect(report.lines[0]!.usd).toBeNull();
    expect(report.unpricedCalls).toBe(3);
    expect(report.usd).toBe(0);
  });
});

describe("adding up a run and a month", () => {
  it("merges a follow-up edit into the run's bill", () => {
    const first = emptyFloorplanSpend();
    first.imageCalls = 4;
    first.usage = { "gemini-3-pro-image": usage({ calls: 4, imageTokens: 4480 }) };
    const edit = emptyFloorplanSpend();
    edit.imageCalls = 1;
    edit.usage = { "gemini-3-pro-image": usage({ imageTokens: 1120 }) };
    const merged = mergeFloorplanSpend(first, edit);
    expect(merged.imageCalls).toBe(5);
    expect(merged.usage?.["gemini-3-pro-image"]).toMatchObject({ calls: 5, imageTokens: 5600 });
  });

  it("totals measured runs and keeps older runs out of the sum", () => {
    const range = monthRange("2026-09");
    const summary = summarizeFloorplanVizCosts(
      [
        {
          id: "a",
          title: "new",
          createdAt: new Date("2026-09-20T10:00:00Z"),
          enginesJson: { spend: { ...emptyFloorplanSpend(), usageComplete: true, usage: { "gemini-3-pro-image": usage({ imageTokens: 1120 }) } } },
        },
        {
          id: "b",
          title: "old",
          createdAt: new Date("2026-09-02T10:00:00Z"),
          enginesJson: { spend: { imageCalls: 4, auditCalls: 5, extractCalls: 4, byModel: {} } },
        },
      ],
      range,
    );
    expect(summary.usd).toBeCloseTo(0.1344, 4);
    expect(summary.measuredRuns).toBe(1);
    expect(summary.unmeasuredRuns).toBe(1);
    expect(summary.runs.find((r) => r.runId === "b")!.usd).toBeNull();
    expect(summary.averageUsdPerRun).toBeCloseTo(0.1344, 4);
  });

  it("does not let an edit on an old run pass for the cost of the run", () => {
    const old = { imageCalls: 4, auditCalls: 5, extractCalls: 4, byModel: {} };
    const edit = { ...emptyFloorplanSpend(), usage: { "gemini-3-pro-image": usage({ imageTokens: 1120 }) } };
    const merged = mergeFloorplanSpend(old, edit);
    expect(merged.usageComplete).toBe(false);
    const summary = summarizeFloorplanVizCosts(
      [{ id: "x", title: "x", createdAt: new Date("2026-09-10T00:00:00Z"), enginesJson: { spend: merged } }],
      monthRange("2026-09"),
    );
    expect(summary.runs[0]!.usd).toBeNull();
    expect(summary.unmeasuredRuns).toBe(1);
  });

  it("reads a month as the first instant of it to the first of the next", () => {
    const range = monthRange("2026-12");
    expect(range.from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(range.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthRange("garbage", new Date("2026-09-22T00:00:00Z")).month).toBe("2026-09");
  });
});

describe("the admin's margin", () => {
  const range = monthRange("2026-09");
  const row = (id: string, scope: string, imageTokens: number | null, org = "o1") => ({
    id,
    title: id,
    createdAt: new Date("2026-09-10T10:00:00Z"),
    scope,
    organizationId: org,
    organizationName: org.toUpperCase(),
    stillCount: 1,
    enginesJson: {
      spend:
        imageTokens == null
          ? { imageCalls: 4, auditCalls: 5, extractCalls: 4, byModel: {} }
          : { ...emptyFloorplanSpend(), usageComplete: true, usage: { "gemini-3-pro-image": usage({ imageTokens }) } },
    },
  });

  it("prices a one-visual booklet at ₪200 and a full one at ₪300", () => {
    expect(tariffForScope("overview")).toBe(200);
    expect(tariffForScope("full")).toBe(300);
    expect(tariffForScope("rooms")).toBe(300);
  });

  it("takes cost from revenue on measured runs only", () => {
    // $1 = ₪3.7, and 1,120 image tokens is $0.1344.
    const summary = summarizeAdminVizCosts(
      [row("a", "overview", 1120), row("b", "full", 1120), row("c", "full", null, "o2")],
      range,
      tariffForScope,
      { usdToIls: 3.7, date: "2026-09-22" },
    );
    expect(summary.revenueIls).toBe(800);
    expect(summary.measuredRevenueIls).toBe(500);
    expect(summary.costIls).toBeCloseTo(2 * 0.1344 * 3.7, 6);
    expect(summary.marginIls).toBeCloseTo(500 - 2 * 0.1344 * 3.7, 6);
    const c = summary.runs.find((r) => r.runId === "c")!;
    expect(c.usd).toBeNull();
    expect(c.marginIls).toBeNull();
    expect(summary.byOrganization.map((o) => o.organizationId)).toEqual(["o1", "o2"]);
  });

  it("gives no margin at all when there is no rate, rather than a guessed one", () => {
    const summary = summarizeAdminVizCosts([row("a", "overview", 1120)], range, tariffForScope, null);
    expect(summary.costIls).toBeNull();
    expect(summary.marginIls).toBeNull();
    expect(summary.usd).toBeCloseTo(0.1344, 4);
  });
});

describe("the Flash image price, read off the Standard tier", () => {
  it("is $60 per million image tokens — $0.067 for a 1K picture", () => {
    const usd = priceModelUsage(
      "gemini-3.1-flash-image",
      usage({ inputTokens: 1_000_000, outputTokens: 1_000_000, imageTokens: 1120 }),
      new Date("2026-09-22T00:00:00Z"),
    );
    expect(usd).toBeCloseTo(0.5 + 3 + 0.0672, 4);
  });
});

describe("our own test runs are not sales", () => {
  const range = monthRange("2026-09");
  const measured = { spend: { ...emptyFloorplanSpend(), usageComplete: true, usage: { "gemini-3-pro-image": usage({ imageTokens: 1120 }) } } };
  const base = { title: "t", createdAt: new Date("2026-09-10T00:00:00Z"), organizationId: "o", organizationName: "O", stillCount: 1 };

  it("costs an admin's run but counts no revenue for it", () => {
    const summary = summarizeAdminVizCosts(
      [
        { ...base, id: "ours", scope: "full", enginesJson: measured, internal: true },
        { ...base, id: "theirs", scope: "overview", enginesJson: measured, internal: false },
      ],
      range,
      tariffForScope,
      { usdToIls: 3, date: "2026-09-21" },
    );
    expect(summary.revenueIls).toBe(200);
    expect(summary.internalRuns).toBe(1);
    expect(summary.internalUsd).toBeCloseTo(0.1344, 4);
    // The margin is on the customer's run alone.
    expect(summary.marginIls).toBeCloseTo(200 - 0.1344 * 3, 4);
    expect(summary.runs.find((r) => r.runId === "ours")!.marginIls).toBeNull();
  });

  it("shows no margin, not a zero one, before any customer run is measured", () => {
    const summary = summarizeAdminVizCosts(
      [{ ...base, id: "old", scope: "overview", enginesJson: { spend: { imageCalls: 4, auditCalls: 1, extractCalls: 1, byModel: {} } } }],
      range,
      tariffForScope,
      { usdToIls: 3, date: "2026-09-21" },
    );
    expect(summary.marginIls).toBeNull();
  });
});
