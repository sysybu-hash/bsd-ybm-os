import {
  EXTRACT_PIXEL_LOCK,
  PIXEL_LOCK,
  PRESENTATION_LOCK,
  floorplanExtractFingerprint,
  floorplanVizInputFingerprint,
  nearestGeminiImageAspect,
} from "@/lib/projects/floorplan-viz-lock";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { buildVizPrompt, CAD_MASSING_LOCK, ENTRANCE_LOCK, floorplanOverviewAttachments, GEOMETRY_LOCK, SALES_BROCHURE_BRIEF } from "@/lib/projects/floorplan-viz-generate";
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
    expect(prompt.startsWith(SALES_BROCHURE_BRIEF)).toBe(true);
    expect(prompt).toMatch(/Lived-in props/);
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

  it("locks CAD massing as the first attachment so walls come from geometry", () => {
    const prompt = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "סלון", kind: "living", source: "ocr_verified" }] }),
      { kind: "overview" },
      { geometryLock: true },
    );
    expect(prompt).toContain(CAD_MASSING_LOCK);
    expect(CAD_MASSING_LOCK).toMatch(/FIRST image is the apartment/);
    expect(CAD_MASSING_LOCK).toMatch(/Do not invent a different unit/);
    expect(CAD_MASSING_LOCK).toMatch(/מבואה/);
    expect(CAD_MASSING_LOCK).toMatch(/sheet wins/);
    expect(CAD_MASSING_LOCK).toMatch(/מרפסת stays outdoor/);
    const attachments = floorplanOverviewAttachments({
      plan: { mimeType: "application/pdf", base64: "plan" },
      ink: "ink",
      geometryLock: { mimeType: "image/jpeg", base64: "cad" },
    });
    expect(attachments.map((row) => row.base64)).toEqual(["cad", "plan", "ink"]);
  });

  it("puts this flat's own washed drawing ahead of the measured plate", () => {
    // The plate alone is blocks, and the model read it as a suggestion: on
    // דירה 21 it moved the kitchen into the living room. The ink leads, the
    // plate stands behind it for size and for what each enclosure is.
    const attachments = floorplanOverviewAttachments({
      plan: { mimeType: "application/pdf", base64: "plan" },
      tintedPlan: { mimeType: "image/jpeg", base64: "washed" },
      geometryLock: { mimeType: "image/jpeg", base64: "cad" },
    });
    expect(attachments.map((row) => row.base64)).toEqual(["washed", "cad", "plan"]);
  });

  it("names printed terrace pockets and forbids paving the living volume", () => {
    const prompt = buildVizPrompt(
      parseFloorplanLayout({
        rooms: [
          { name: "סלון", kind: "living", source: "ocr_verified" },
          { name: "מרפסת 1", kind: "balcony", areaM2: 4.1, source: "ocr_verified" },
          { name: "מרפסת 2", kind: "balcony", areaM2: 5.12, source: "ocr_verified" },
        ],
      }),
      { kind: "overview" },
    );
    expect(prompt).toMatch(/4\.10/);
    expect(prompt).toMatch(/5\.12/);
    expect(prompt).toMatch(/Do not convert them to outdoor paving/);
    expect(prompt).toMatch(/ANY façade/);
    expect(prompt).toMatch(/Indoor living, kitchen, hall and entrance/);
  });

  it("forbids turning the front door into a terrace", () => {
    const prompt = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "סלון", kind: "living", source: "ocr_verified" }] }),
      { kind: "overview" },
    );
    expect(prompt).toContain(ENTRANCE_LOCK);
    expect(ENTRANCE_LOCK).toMatch(/מבואה/);
    expect(ENTRANCE_LOCK).toMatch(/It is NOT a terrace/);
  });

  it("does not tell the model the apartment has zero beds when bedrooms have no count", () => {
    const prompt = buildVizPrompt(
      parseFloorplanLayout({
        rooms: [
          { name: "חדר שינה", kind: "bedroom" },
          { name: 'ממ"ד', kind: "mmd", bedCount: 0 },
          { name: "מרפסת", kind: "balcony", areaM2: 4.6 },
        ],
      }),
      { kind: "overview" },
    );
    expect(prompt).toMatch(/copy the drawn bed — never empty/);
    expect(prompt).toMatch(/no beds/);
    expect(prompt).not.toMatch(/TOTAL BEDS IN THE WHOLE APARTMENT: exactly 0/);
    expect(prompt).toMatch(/none may be an empty floor/);
    expect(prompt).toMatch(/as deep as a doorway/);
    expect(prompt).toMatch(/do not add a sofa or armchair/);
    expect(GEOMETRY_LOCK).toMatch(/If the sheet draws only a dining table, there is no sofa/);
  });
});
