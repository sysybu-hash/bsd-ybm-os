import {
  enginePhaseLabelHe,
  formatTelemetrySummaryHe,
  hasSuccessfulEngine,
} from "@/lib/scan-telemetry-display";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";

describe("scan-telemetry-display", () => {
  it("labels Hebrew phases", () => {
    expect(enginePhaseLabelHe("ok")).toBe("תקין");
    expect(enginePhaseLabelHe("error")).toBe("שגיאה");
  });

  it("summarizes active engines", () => {
    const t: TriEngineTelemetry = {
      documentAI: { phase: "ok" },
      gemini: { phase: "running" },
      gpt: { phase: "idle" },
    };
    const summary = formatTelemetrySummaryHe(t);
    expect(summary).toContain("Document AI");
    expect(summary).toContain("תקין");
    expect(summary).toContain("Gemini");
  });

  it("hasSuccessfulEngine when any ok", () => {
    expect(
      hasSuccessfulEngine({
        documentAI: { phase: "skipped" },
        gemini: { phase: "ok" },
        gpt: { phase: "error" },
      }),
    ).toBe(true);
  });
});
