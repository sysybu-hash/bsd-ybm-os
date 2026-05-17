import { resolveTriEnginePlan } from "@/lib/scan-engine-router";

describe("resolveTriEnginePlan", () => {
  it("AUTO + INVOICE_FINANCIAL → MULTI_PARALLEL", () => {
    const plan = resolveTriEnginePlan("INVOICE_FINANCIAL", "AUTO");
    expect(plan.effectiveRunMode).toBe("MULTI_PARALLEL");
    expect(plan.providerChain).toEqual(["docai", "gemini", "openai"]);
  });

  it("preserves explicit SINGLE_GEMINI", () => {
    const plan = resolveTriEnginePlan("GENERAL_DOCUMENT", "SINGLE_GEMINI");
    expect(plan.effectiveRunMode).toBe("SINGLE_GEMINI");
    expect(plan.providerChain).toEqual(["SINGLE_GEMINI"]);
  });
});
