import {
  featureFromRequest,
  pendingAiUsageEvents,
  providerOf,
  recordAiUsage,
  runWithAiRequest,
} from "@/lib/ai-usage";
import { summarizeSiteAiCosts, type UsageGroupRow } from "@/lib/ai-cost-summary";
import { priceModelUsage } from "@/lib/ai-pricing";

const row = (over: Partial<UsageGroupRow>): UsageGroupRow => ({
  feature: "/api/x",
  model: "gemini-3.7-flash",
  organizationId: "org1",
  environment: "production",
  calls: 1,
  inputTokens: 0,
  outputTokens: 0,
  imageTokens: 0,
  outputImages: 0,
  ...over,
});

describe("billing every call to a customer and a screen", () => {
  it("attaches the request's organisation and route to each call", async () => {
    let seen: ReturnType<typeof pendingAiUsageEvents> = [];
    await runWithAiRequest({ organizationId: "org1", feature: "/api/crm/semantic-search" }, async () => {
      recordAiUsage("models/gemini-3.7-flash", { inputTokens: 100, outputTokens: 10 });
      recordAiUsage("claude-sonnet-4-6", { inputTokens: 5 });
      seen = [...pendingAiUsageEvents()];
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      organizationId: "org1",
      feature: "/api/crm/semantic-search",
      provider: "google",
      // The older SDK's "models/" prefix is gone, so the price list matches.
      model: "gemini-3.7-flash",
      inputTokens: 100,
    });
    expect(seen[1]!.provider).toBe("anthropic");
  });

  it("names a route without its record ids, so one screen is one line", () => {
    // Only the URL is read; the test environment has no global Request.
    const req = { url: "https://x.test/api/projects/visualize-floorplan/cmu9pby6i0001gm0a57vwumqq/stills/cmu9pby7h0003gm0agboxg2ig?q=1" } as Request;
    expect(featureFromRequest(req)).toBe("/api/projects/visualize-floorplan/:id/stills/:id");
  });

  it("tells the providers apart, Groq's hosted OpenAI models included", () => {
    expect(providerOf("gemini-3-pro-image")).toBe("google");
    expect(providerOf("claude-opus-5")).toBe("anthropic");
    expect(providerOf("gpt-5.6-sol")).toBe("openai");
    expect(providerOf("groq:openai/gpt-oss-120b")).toBe("groq");
    expect(providerOf("mistral-medium-3-5")).toBe("mistral");
  });
});

describe("the site's bill", () => {
  const at = new Date("2026-09-01T00:00:00Z");

  it("prices OpenAI and Groq from their own pages", () => {
    const u = { calls: 1, inputTokens: 1_000_000, outputTokens: 1_000_000, imageTokens: 0, outputImages: 0 };
    expect(priceModelUsage("gpt-5.6-sol", u, at)).toBeCloseTo(24, 6);
    expect(priceModelUsage("groq:openai/gpt-oss-120b", u, at)).toBeCloseTo(0.75, 6);
  });

  it("cuts it by screen, customer and environment, and adds up to the same total", () => {
    const summary = summarizeSiteAiCosts(
      [
        row({ feature: "/api/projects/visualize-floorplan", model: "gemini-3-pro-image", imageTokens: 1120 }),
        row({ feature: "/api/ai/chat", inputTokens: 1_000_000, outputTokens: 0, organizationId: "org2" }),
        row({ feature: "cron:financial-insights", organizationId: null, environment: "production", inputTokens: 1_000_000 }),
        row({ feature: "/api/ai/chat", model: "mistral-small-latest", calls: 3, environment: "preview" }),
      ],
      at,
      { org1: "Acme", org2: "Beta" },
    );
    const total = 0.1344 + 0.75 + 0.75;
    expect(summary.usd).toBeCloseTo(total, 4);
    expect(summary.byFeature.reduce((n, s) => n + s.usd, 0)).toBeCloseTo(total, 4);
    expect(summary.byOrganization.reduce((n, s) => n + s.usd, 0)).toBeCloseTo(total, 4);
    expect(summary.byOrganization.find((s) => s.key === "org1")!.name).toBe("Acme");
    expect(summary.byOrganization.find((s) => s.key === "")!.name).toBe("");
    expect(summary.unpricedCalls).toBe(3);
    expect(summary.byEnvironment.find((s) => s.key === "preview")!.unpricedCalls).toBe(3);
    expect(summary.calls).toBe(6);
  });
});
