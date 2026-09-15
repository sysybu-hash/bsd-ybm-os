import { parseFloorplanLayout, type FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import {
  buildStillEditPrompt,
  sanitizeFloorplanVizEditInstruction,
} from "@/lib/projects/floorplan-viz-generate";
import {
  floorplanVizStillFilePath,
  floorplanVizViewKey,
  groupFloorplanVizAttempts,
  hebrewFloorplanAuditIssue,
  markFloorplanVizAttemptSelected,
  packFloorplanVizStillMeta,
  parseFloorplanVizViewId,
  replaceFloorplanVizAttempt,
  selectedFloorplanVizImages,
  selectedFromAttemptGroup,
  titleFromFloorplanLayout,
  unpackFloorplanVizStillMeta,
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

  it("packs and unpacks audit issues in editPrompt", () => {
    const packed = packFloorplanVizStillMeta({
      auditIssues: ["1 screen(s) in a haredi still", "letters or digits burned into the image"],
    });
    expect(packed).toContain("@@auditIssues@@");
    const meta = unpackFloorplanVizStillMeta(packed);
    expect(meta.auditIssues).toEqual([
      "1 screen(s) in a haredi still",
      "letters or digits burned into the image",
    ]);
    expect(hebrewFloorplanAuditIssue("1 screen(s) in a haredi still")).toBe(
      "מסך/טלוויזיה בהדמיה חרדית",
    );
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

describe("floorplan viz attempts", () => {
  const overview = (id: string, attemptIndex: number, selected: boolean): FloorplanVizImage => ({
    id,
    viewId: "overview",
    labelHe: "כל התוכנית — מבט על",
    mimeType: "image/jpeg",
    base64: id,
    selected,
    attemptIndex,
    createdAt: `2026-09-10T00:0${attemptIndex}:00.000Z`,
  });

  it("groups stills of the same view so the operator can pick one", () => {
    const groups = groupFloorplanVizAttempts([
      overview("a", 1, false),
      overview("b", 2, true),
      {
        id: "geo",
        viewId: "overview",
        roomName: "גיאומטריה",
        labelHe: "גיאומטריה",
        mimeType: "image/jpeg",
        base64: "g",
        selected: true,
        attemptIndex: 1,
      },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.attempts.map((row) => row.id)).toEqual(["a", "b"]);
    expect(selectedFromAttemptGroup(groups[0]!).id).toBe("b");
    expect(selectedFloorplanVizImages(groups.flatMap((g) => g.attempts)).map((row) => row.id)).toEqual(["b", "geo"]);
  });

  it("keeps the previous still when a new attempt is added", () => {
    const images = replaceFloorplanVizAttempt(
      [overview("a", 1, true)],
      overview("b", 2, true),
    );
    expect(images.map((row) => ({ id: row.id, selected: row.selected }))).toEqual([
      { id: "a", selected: false },
      { id: "b", selected: true },
    ]);
  });

  it("marks an older attempt as the one used in the booklet", () => {
    const images = markFloorplanVizAttemptSelected(
      [overview("a", 1, false), overview("b", 2, true)],
      "a",
    );
    expect(images.find((row) => row.id === "a")?.selected).toBe(true);
    expect(images.find((row) => row.id === "b")?.selected).toBe(false);
  });
});

describe("floorplan viz still edit prompt", () => {
  it("trims and caps the user instruction", () => {
    expect(sanitizeFloorplanVizEditInstruction("  תוריד את המסך  ")).toBe("תוריד את המסך");
    expect(sanitizeFloorplanVizEditInstruction("x".repeat(9000)).length).toBe(8000);
  });

  it("keeps the current still, plan lock, and the user request", () => {
    const prompt = buildStillEditPrompt(
      layout,
      { kind: "interior", roomName: "סלון" },
      "תוריד את המסך מהשולחן",
      { styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic },
    );
    expect(prompt).toContain("SURGICAL EDIT");
    expect(prompt).toContain("USER REQUEST");
    expect(prompt).toContain("תוריד את המסך מהשולחן");
    expect(prompt).toContain("NO SCREENS");
    expect(prompt).not.toMatch(/LIVED-IN HOME/);
    expect(prompt).not.toMatch(/STAGE BY ROOM KIND/);
    expect(prompt).not.toMatch(/PLAN TRACE/);
  });
});
