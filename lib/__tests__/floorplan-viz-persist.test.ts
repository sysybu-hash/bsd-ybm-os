import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  buildStillEditPrompt,
  sanitizeFloorplanVizEditInstruction,
} from "@/lib/projects/floorplan-viz-generate";
import {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  parseFloorplanVizViewId,
  titleFromFloorplanLayout,
} from "@/lib/projects/floorplan-viz-ids";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

const layout = parseFloorplanLayout({
  unitLabel: "דירה 14",
  rooms: [{ name: "סלון", kind: "living", source: "ocr_verified" }],
});

describe("floorplan viz persistence helpers", () => {
  it("builds a stable view key per still", () => {
    expect(floorplanVizViewKey("overview")).toBe("overview:");
    expect(floorplanVizViewKey("interior", "מטבח")).toBe("interior:מטבח");
  });

  it("titles a run from the printed unit label", () => {
    expect(titleFromFloorplanLayout(layout, "fallback")).toBe("דירה 14");
    expect(titleFromFloorplanLayout(parseFloorplanLayout({}), "plan-1")).toBe("plan-1");
  });

  it("parses view ids and still file paths", () => {
    expect(parseFloorplanVizViewId("overview")).toBe("overview");
    expect(parseFloorplanVizViewId("unknown")).toBe("interior");
    expect(floorplanVizStillFilePath("run1", "still2")).toBe(
      "/api/projects/visualize-floorplan/run1/stills/still2/file",
    );
  });
});

describe("floorplan viz still edit prompt", () => {
  it("trims and caps the user instruction", () => {
    expect(sanitizeFloorplanVizEditInstruction("  תוריד את המסך  ")).toBe("תוריד את המסך");
    expect(sanitizeFloorplanVizEditInstruction("x".repeat(3000)).length).toBe(2000);
  });

  it("keeps the current still, plan lock, and the user request", () => {
    const prompt = buildStillEditPrompt(
      layout,
      { kind: "interior", roomName: "סלון" },
      "תוריד את המסך מהשולחן",
      { styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic },
    );
    expect(prompt).toContain("CURRENT still");
    expect(prompt).toContain("PLAN TRACE");
    expect(prompt).toContain("GEOMETRY");
    expect(prompt).toContain("תוריד את המסך מהשולחן");
    expect(prompt).toContain("NO SCREENS");
  });
});
