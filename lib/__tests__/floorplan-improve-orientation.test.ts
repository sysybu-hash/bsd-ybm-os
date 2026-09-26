/**
 * "Improve" is a surgical edit that keeps every wall. A turned or mirrored flat
 * cannot be repainted into place, and on דירה 14 asking for it produced five
 * paid attempts that changed nothing. Such a request is refused before any
 * model is called.
 */
const collectShipIssues = jest.fn();
const collectShipAudit = jest.fn();
const generateOneImage = jest.fn();

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));
jest.mock("@/lib/projects/viz-generate/audit-gate", () => ({
  collectShipIssues: (...args: unknown[]) => collectShipIssues(...args),
  collectShipAudit: (...args: unknown[]) => collectShipAudit(...args),
}));
jest.mock("@/lib/projects/viz-generate/gemini", () => ({
  generateOneImage: (...args: unknown[]) => generateOneImage(...args),
}));

import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { improveFloorplanStill } from "@/lib/projects/viz-generate/edit";

const params = (failures: string[]) => ({
  layout: parseFloorplanLayout({ rooms: [{ name: "סלון" }] }),
  still: { viewId: "overview" as const, labelHe: "מבט על", mimeType: "image/jpeg", base64: "x" },
  plan: { mimeType: "image/jpeg", base64: "p" },
  failures,
  selectedOnly: true,
});

describe("improve and a turned or mirrored flat", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses an improve asked only to turn or unflip the flat, paying nothing", async () => {
    const result = await improveFloorplanStill(
      params(["the still is turned 180 degrees from the plan", "the still is the plan mirrored left-to-right"]),
    );
    expect(result).toMatchObject({ attemptProduced: false, rejectedCode: "viz_improve_needs_regenerate" });
    expect(collectShipIssues).not.toHaveBeenCalled();
    expect(generateOneImage).not.toHaveBeenCalled();
  });
});
