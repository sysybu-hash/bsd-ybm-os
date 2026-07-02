import {
  GEMINI_BLUEPRINT_PRIMARY_MODEL,
  GEMINI_STABLE_TEXT_MODEL,
  getBlueprintAnalysisModelChain,
  getGeminiModelFallbackChain,
  getGeminiModelId,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";

describe("gemini-model-catalog", () => {
  it("uses gemini-3.5-flash as stable default", () => {
    expect(GEMINI_STABLE_TEXT_MODEL).toBe("gemini-3.5-flash");
    expect(GEMINI_BLUEPRINT_PRIMARY_MODEL).toBe("gemini-3.5-flash");
  });

  it("fallback chain does not use gemini-1.5 as primary", () => {
    const chain = getGeminiModelFallbackChain();
    expect(chain[0]).toBe(getGeminiModelId());
    expect(chain.some((m) => m.includes("gemini-1.5"))).toBe(false);
  });

  it("blueprint chain starts with 3.5-flash", () => {
    const chain = getBlueprintAnalysisModelChain();
    expect(chain[0]).toBe("gemini-3.5-flash");
    expect(chain.some((m) => m === "gemini-3-flash-preview")).toBe(false);
  });

  it("treats a 400 'unable to process input image' error as retryable so the fallback chain isn't abandoned", () => {
    const err = new Error(
      "[GoogleGenerativeAI Error]: [400 Bad Request] Unable to process input image.",
    );
    expect(isLikelyGeminiModelUnavailable(err)).toBe(true);
  });

  it("treats a generic 400 Bad Request as retryable", () => {
    const err = new Error("[400 Bad Request] Something went wrong.");
    expect(isLikelyGeminiModelUnavailable(err)).toBe(true);
  });
});
