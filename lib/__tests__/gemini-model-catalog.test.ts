import {
  AI_ENGINE_CATALOG_UPDATED_AT,
  GEMINI_BLUEPRINT_PRIMARY_MODEL,
  GEMINI_IMAGE_PRIMARY_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_LIVE_PRIMARY_MODEL,
  GEMINI_PREMIUM_TEXT_MODEL,
  GEMINI_STABLE_TEXT_MODEL,
  getBlueprintAnalysisModelChain,
  getFloorplanLayoutModelChain,
  getFloorplanVizModelChain,
  getGeminiModelFallbackChain,
  getGeminiModelId,
  isLikelyGeminiModelUnavailable,
  resolveGeminiImageModelId,
  resolveGeminiModelId,
} from "@/lib/gemini-model";
import {
  ANTHROPIC_FLAGSHIP_MODEL,
  GROQ_FLAGSHIP_MODEL,
  MISTRAL_VISION_FLAGSHIP,
  OPENAI_FLAGSHIP_MODEL,
  getAnthropicModelCandidates,
  getGroqModel,
  getMistralVisionModelCandidates,
  getOpenAiChatTextModelCandidates,
} from "@/lib/ai-providers";

describe("gemini-model-catalog", () => {
  it("uses gemini-3.7-flash as stable default", () => {
    expect(AI_ENGINE_CATALOG_UPDATED_AT).toBe("2026-09-03");
    expect(GEMINI_STABLE_TEXT_MODEL).toBe("gemini-3.7-flash");
    expect(GEMINI_BLUEPRINT_PRIMARY_MODEL).toBe("gemini-3.7-flash");
    expect(GEMINI_LITE_MODEL).toBe("gemini-3.5-flash-lite");
    expect(GEMINI_PREMIUM_TEXT_MODEL).toBe("gemini-3.1-pro-preview");
  });

  it("fallback chain does not use gemini-1.5 or gemini-2.5 as primary", () => {
    const chain = getGeminiModelFallbackChain();
    expect(chain[0]).toBe(getGeminiModelId());
    expect(chain.some((m) => m.includes("gemini-1.5"))).toBe(false);
    expect(chain.some((m) => m.includes("gemini-2.5"))).toBe(false);
  });

  // Calibrated 04/09/2026: Flash matched Pro on every graded trap at a quarter of
  // the latency, and Gemini is only one of four consensus votes in the extractor.
  it("floorplan layout extract prefers current Flash, keeping Pro as fallback", () => {
    const chain = getFloorplanLayoutModelChain();
    expect(chain[0]).toBe(GEMINI_STABLE_TEXT_MODEL);
    expect(chain).toContain(GEMINI_PREMIUM_TEXT_MODEL);
    expect(chain.indexOf(GEMINI_STABLE_TEXT_MODEL)).toBeLessThan(
      chain.indexOf(GEMINI_PREMIUM_TEXT_MODEL),
    );
  });

  it("floorplan image chain uses Nano Banana Pro then GA Flash Image", () => {
    expect(GEMINI_IMAGE_PRIMARY_MODEL).toBe("gemini-3.1-flash-image");
    const chain = getFloorplanVizModelChain();
    expect(chain[0]).toBe("gemini-3-pro-image");
    expect(chain).toContain("gemini-3.1-flash-image");
    expect(chain).toContain("gemini-3.1-flash-lite-image");
    expect(chain).not.toContain("gemini-3.1-flash-image-preview");
    expect(chain).not.toContain("gemini-2.5-flash-image");
  });

  it("blueprint chain prefers current Flash and skips preview alias", () => {
    const chain = getBlueprintAnalysisModelChain();
    expect(chain).toContain("gemini-3.7-flash");
    expect(chain).toContain("gemini-3.6-flash");
    expect(chain.some((m) => m === "gemini-3-flash-preview")).toBe(false);
    expect(chain.some((m) => m.includes("gemini-2.5"))).toBe(false);
  });

  it("maps retired Gemini IDs onto current models", () => {
    expect(resolveGeminiModelId("gemini-2.5-flash")).toBe("gemini-3.7-flash");
    expect(resolveGeminiModelId("gemini-2.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModelId("gemini-3.1-pro-stable")).toBe("gemini-3.1-pro-preview");
    expect(resolveGeminiModelId("gemini-3.1-flash-live-preview")).toBe(
      "gemini-3.1-flash-live-preview",
    );
    expect(resolveGeminiModelId("gemini-2.5-flash-live-preview")).toBe(
      GEMINI_LIVE_PRIMARY_MODEL,
    );
    expect(resolveGeminiImageModelId("gemini-3.1-flash-image-preview")).toBe(
      "gemini-3.1-flash-image",
    );
    expect(resolveGeminiImageModelId("gemini-3-pro-image-preview")).toBe("gemini-3-pro-image");
  });

  it("defaults Live primary to 3.1 flash live preview", () => {
    expect(GEMINI_LIVE_PRIMARY_MODEL).toBe("gemini-3.1-flash-live-preview");
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

describe("cross-vendor engine catalog", () => {
  it("uses current OpenAI / Anthropic / Groq / Mistral flagships", () => {
    expect(OPENAI_FLAGSHIP_MODEL).toBe("gpt-5.6-sol");
    expect(ANTHROPIC_FLAGSHIP_MODEL).toBe("claude-sonnet-5");
    expect(GROQ_FLAGSHIP_MODEL).toBe("openai/gpt-oss-120b");
    expect(MISTRAL_VISION_FLAGSHIP).toBe("mistral-medium-3-5");
  });

  it("drops retired OpenAI and Anthropic IDs from fallback chains", () => {
    const openai = getOpenAiChatTextModelCandidates();
    expect(openai).toContain("gpt-5.6-sol");
    expect(openai).not.toContain("gpt-4o");
    expect(openai).not.toContain("gpt-4o-mini");

    const claude = getAnthropicModelCandidates();
    expect(claude).toContain("claude-sonnet-5");
    expect(claude).not.toContain("claude-3-5-sonnet-20241022");
    expect(claude).not.toContain("claude-3-5-haiku-20241022");
  });

  it("does not keep Groq Llama 3.3 as the live default", () => {
    expect(getGroqModel()).not.toBe("llama-3.3-70b-versatile");
  });

  it("maps Pixtral onto Mistral Medium 3.5", () => {
    const chain = getMistralVisionModelCandidates("pixtral-large-latest");
    expect(chain[0]).toBe("mistral-medium-3-5");
    expect(chain).not.toContain("pixtral-large-latest");
    expect(chain).not.toContain("pixtral-12b-2409");
  });
});
