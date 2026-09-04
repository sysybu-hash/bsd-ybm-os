import {
  EXTRACT_PIXEL_LOCK,
  PIXEL_LOCK,
  PRESENTATION_LOCK,
  floorplanExtractFingerprint,
  floorplanVizInputFingerprint,
  nearestGeminiImageAspect,
} from "@/lib/projects/floorplan-viz-lock";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { buildVizPrompt } from "@/lib/projects/floorplan-viz-generate";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

describe("floorplan viz lock", () => {
  it("hashes the same plan bytes and style to the same fingerprint", () => {
    const plan = "cGxhbg==";
    const kit = FLOORPLAN_VIZ_PRESETS.haredi_classic;
    const a = floorplanVizInputFingerprint({
      planBase64: plan,
      mimeType: "application/pdf",
      planKind: "sales-sheet",
      scope: "full",
      styleKit: kit,
    });
    const b = floorplanVizInputFingerprint({
      planBase64: plan,
      mimeType: "application/pdf",
      planKind: "sales-sheet",
      scope: "full",
      styleKit: kit,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(
      floorplanExtractFingerprint({
        planBase64: plan,
        mimeType: "application/pdf",
        planKind: "sales-sheet",
      }),
    ).toBe(
      floorplanExtractFingerprint({
        planBase64: plan,
        mimeType: "application/pdf",
        planKind: "sales-sheet",
      }),
    );
    expect(
      floorplanVizInputFingerprint({
        planBase64: plan,
        mimeType: "application/pdf",
        planKind: "sales-sheet",
        scope: "full",
        styleKit: FLOORPLAN_VIZ_PRESETS.contemporary,
      }),
    ).not.toBe(a);
  });

  it("picks a stable Gemini aspect from the sheet size", () => {
    expect(nearestGeminiImageAspect(1600, 1200)).toBe("4:3");
    expect(nearestGeminiImageAspect(1200, 1600)).toBe("3:4");
    expect(nearestGeminiImageAspect(1920, 1080)).toBe("16:9");
  });

  it("keeps extract and viz locks free of approximate counts", () => {
    expect(EXTRACT_PIXEL_LOCK).toMatch(/PIXEL LOCK/);
    expect(PIXEL_LOCK).toMatch(/PIXEL LOCK/);
    expect(EXTRACT_PIXEL_LOCK).not.toMatch(/often 3/);
    expect(PIXEL_LOCK).not.toMatch(/~2\.5/);
    const prompt = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "סלון", kind: "living", source: "ocr_verified" }] }),
      { kind: "overview" },
      { styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic },
    );
    expect(prompt).toContain(PIXEL_LOCK);
    expect(prompt).toContain(PRESENTATION_LOCK);
    expect(prompt).not.toMatch(/~30–50/);
  });

  it("forbids CAD overlays and empty wet rooms in the presentation lock", () => {
    expect(PRESENTATION_LOCK).toMatch(/PRESENTATION LOCK/);
    expect(PRESENTATION_LOCK).toMatch(/entrance triangles/i);
    expect(PRESENTATION_LOCK).toMatch(/CLOSED doors/);
    expect(PRESENTATION_LOCK).toMatch(/empty tiled void/i);
    expect(PRESENTATION_LOCK).toMatch(/U-kitchen/);
    expect(PIXEL_LOCK).toMatch(/toilet pan/i);
  });
});
