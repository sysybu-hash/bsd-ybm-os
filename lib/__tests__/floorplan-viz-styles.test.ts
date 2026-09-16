jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { buildVizPrompt } from "@/lib/projects/floorplan-viz-generate";
import {
  applyHarediModesty,
  buildCustomStyleKitFromAnswers,
  floorplanVizStyleThumbSrc,
  FLOORPLAN_VIZ_PRESET_IDS,
  FLOORPLAN_VIZ_PRESETS,
  HAREDI_MODESTY_PROMPT,
  resolveFloorplanVizStyle,
} from "@/lib/projects/floorplan-viz-styles";

const sample = parseFloorplanLayout({
  rooms: [{ name: "סלון", source: "ocr_verified", kind: "living" }],
});

describe("floorplan viz style kits", () => {
  it("maps every preset to a public thumbnail path", () => {
    for (const id of FLOORPLAN_VIZ_PRESET_IDS) {
      expect(floorplanVizStyleThumbSrc(id)).toBe(`/floorplan-viz/styles/${id}.jpg`);
    }
    expect(floorplanVizStyleThumbSrc("custom")).toBeNull();
  });

  it("falls back to contemporary when styleId is unknown", () => {
    const kit = resolveFloorplanVizStyle("not-a-style");
    expect(kit.id).toBe("contemporary");
    expect(kit.promptBlock).toMatch(/contemporary Israeli/i);
    expect(kit.promptBlock).not.toMatch(/Shabbat/i);
  });

  it("puts haredi modesty into classic and modern kits", () => {
    for (const id of ["haredi_classic", "haredi_modern"] as const) {
      const kit = FLOORPLAN_VIZ_PRESETS[id];
      expect(kit.promptBlock).toMatch(/NOT antique/i);
      expect(kit.promptBlock).toMatch(/2020s/i);
      expect(kit.promptBlock).not.toMatch(/heavy modest drapes/i);
      expect(kit.promptBlock).not.toMatch(/Dark stained wood/i);
      expect(kit.labelHe).toMatch(/חדשני/);
      const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: kit });
      expect(prompt).toMatch(/no people/i);
      expect(prompt).toMatch(/No televisions/i);
      expect(prompt).toMatch(/NO SCREENS/i);
      expect(prompt).toMatch(/thin black bar/i);
      expect(prompt).toMatch(/sefarim/i);
      expect(prompt).toMatch(/Shabbat/i);
      expect(prompt).toMatch(/Mezuzah/i);
      expect(prompt).toMatch(/no readable Hebrew or Latin text/i);
      expect(prompt).toMatch(/NOT antique/i);
      expect(prompt).toMatch(/innovative/i);
      expect(prompt).toMatch(/LIVED-IN HOME/i);
      expect(prompt).toMatch(/fruit bowl/i);
      expect(prompt).toMatch(/never a double/i);
      expect(prompt).toMatch(/Copy the NUMBER and POSITION of bed rectangles/i);
      expect(prompt).toMatch(/not a hostel/i);
      expect(prompt).toMatch(/double-bowl/i);
      expect(prompt).toMatch(/do NOT add a sink/i);
      expect(prompt).toMatch(/CONTENTS/);
      expect(prompt).toMatch(/media wall/i);
      expect(prompt).not.toMatch(/TV is allowed only as a thin screen/i);
      expect(prompt).not.toMatch(/overrides a single-bed/i);
      expect(prompt).not.toMatch(/Every bedroom \/ ממ"ד = two twin beds/i);
    }
  });

  it("does not stage a Shabbat table inside a bathroom or kitchen interior", () => {
    const kit = FLOORPLAN_VIZ_PRESETS.haredi_classic;
    const bathLayout = parseFloorplanLayout({
      rooms: [{ name: "חדר רחצה", source: "ocr_verified", kind: "bathroom" }],
    });
    const bath = buildVizPrompt(bathLayout, { kind: "interior", roomName: "חדר רחצה" }, { styleKit: kit });
    expect(bath).toMatch(/bathroom only/i);
    expect(bath).toMatch(/Do NOT place a Shabbat table/i);
    expect(bath).not.toMatch(/STAGING \(living/);
    const kitchenLayout = parseFloorplanLayout({
      rooms: [{ name: "מטבח", source: "ocr_verified", kind: "kitchen" }],
    });
    const kitchen = buildVizPrompt(kitchenLayout, { kind: "interior", roomName: "מטבח" }, { styleKit: kit });
    expect(kitchen).toMatch(/kitchen only/i);
    expect(kitchen).toMatch(/double-bowl/i);
    expect(kitchen).toMatch(/island sink/i);
    expect(kitchen).not.toMatch(/dual sinks if/i);
    expect(kitchen).not.toMatch(/STAGING \(living/);
    const bedLayout = parseFloorplanLayout({
      rooms: [{ name: "חדר שינה", source: "ocr_verified", kind: "bedroom" }],
    });
    const bed = buildVizPrompt(bedLayout, { kind: "interior", roomName: "חדר שינה" }, { styleKit: kit });
    expect(bed).toMatch(/copy drawn bed rectangles/i);
    expect(bed).toMatch(/never a double/i);
    expect(bed).not.toMatch(/TWO separate twin beds with a visible gap, two duvets, wardrobe/i);
  });

  it("does not force a Shabbat table on a general contemporary kit", () => {
    const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary });
    expect(prompt).toMatch(/contemporary Israeli/i);
    expect(prompt).not.toMatch(/Shabbat/i);
    expect(prompt).not.toMatch(/sefarim/i);
  });

  it("applies plan-trace calibration to every preset, not only haredi", () => {
    for (const id of FLOORPLAN_VIZ_PRESET_IDS) {
      const kit = FLOORPLAN_VIZ_PRESETS[id];
      const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: kit });
      expect(prompt).toMatch(/PLAN TRACE/);
      expect(prompt).toMatch(/GEOMETRY/);
      expect(prompt).toMatch(/double-bowl/i);
      expect(prompt).toMatch(/do NOT add a sink/i);
      expect(prompt).toMatch(/FURNITURE LOCK/);
      if (kit.audience !== "haredi") {
        expect(prompt).not.toMatch(/never a double \/ queen/i);
        expect(prompt).not.toMatch(/Shabbat/i);
      }
    }
    const kitchen = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "מטבח", source: "ocr_verified", kind: "kitchen" }] }),
      { kind: "interior", roomName: "מטבח" },
      { styleKit: FLOORPLAN_VIZ_PRESETS.luxury },
    );
    expect(kitchen).toMatch(/PLAN TRACE/);
    expect(kitchen).toMatch(/copy the drawn run/i);
    expect(kitchen).toMatch(/island sink/i);
  });

  it("does not license a sofa or a laptop the plan does not draw", () => {
    for (const id of FLOORPLAN_VIZ_PRESET_IDS) {
      const kit = FLOORPLAN_VIZ_PRESETS[id];
      const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: kit });
      expect(prompt).toMatch(/do not add a sofa/i);
      expect(prompt).toMatch(/laptop|NO SCREENS|TV only if the plan/i);
      if (kit.audience === "haredi") {
        expect(prompt).toMatch(/NO SCREENS/);
        expect(prompt).toMatch(/ZERO screens|dark slab/i);
      }
    }
  });

  it("locks beds out of living on overview for every kit", () => {
    const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary });
    expect(prompt).toMatch(/FURNITURE LOCK/);
    expect(prompt).toMatch(/Never put a bed in living/i);
    const traced = buildVizPrompt(sample, { kind: "overview" });
    expect(traced).toMatch(/attached drawing is the only layout/i);
    expect(traced).toMatch(/photorealistic/i);
    expect(traced).toMatch(/LIVED-IN HOME/i);
    const vacant = buildVizPrompt(sample, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.developer_white });
    expect(vacant).not.toMatch(/LIVED-IN HOME/i);
    expect(vacant).toMatch(/almost empty rooms/i);
  });

  it("appends haredi rules to a custom kit when the audience is haredi", () => {
    const kit = buildCustomStyleKitFromAnswers({
      freeText: "עץ אלון וטרקוטה",
      audience: "haredi",
      mood: "light",
    });
    expect(kit.audience).toBe("haredi");
    expect(kit.promptBlock).toContain(HAREDI_MODESTY_PROMPT);
    expect(kit.promptBlock).toMatch(/NOT antique/i);
    expect(kit.promptBlock).toMatch(/2020s/i);
    expect(applyHarediModesty(kit).promptBlock).toBe(kit.promptBlock);
    const prompt = buildVizPrompt(sample, { kind: "interior", roomName: "סלון" }, { styleKit: kit });
    expect(prompt).toMatch(/No televisions/i);
    expect(prompt).toMatch(/sefarim/i);
  });

  it("keeps a general custom kit free of haredi staging", () => {
    const kit = buildCustomStyleKitFromAnswers({
      freeText: "לופט תעשייתי",
      audience: "general",
      mood: "luxury",
    });
    expect(kit.promptBlock).not.toMatch(/Shabbat/i);
    expect(kit.promptBlock).toMatch(/Premium stone/i);
  });

  it("lists extracted bed and stool counts instead of hostel-packing haredi bedrooms", () => {
    const layout = parseFloorplanLayout({
      islandStoolCount: 3,
      rooms: [
        {
          name: "ח. שינה",
          kind: "bedroom",
          widthM: 2.57,
          lengthM: 3.44,
          bedCount: 1,
          contents: "1 twin bed",
          source: "ocr_verified",
          bbox: { x: 0.05, y: 0.1, w: 0.15, h: 0.14 },
        },
        {
          name: "ח. שינה",
          kind: "bedroom",
          widthM: 3.58,
          lengthM: 4.3,
          bedCount: 2,
          source: "ocr_verified",
          bbox: { x: 0.05, y: 0.55, w: 0.2, h: 0.18 },
        },
        {
          name: 'ממ"ד',
          kind: "mmd",
          bedCount: 0,
          source: "ocr_verified",
          bbox: { x: 0.4, y: 0.3, w: 0.15, h: 0.15 },
        },
        {
          name: "חדר עבודה",
          kind: "other",
          deskCount: 2,
          source: "ocr_verified",
          bbox: { x: 0.05, y: 0.32, w: 0.15, h: 0.14 },
        },
        { name: "מטבח", kind: "kitchen", source: "ocr_verified" },
      ],
    });
    const prompt = buildVizPrompt(layout, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic });
    const clientLockAt = prompt.indexOf("CLIENT LOCK");
    expect(clientLockAt).toBeGreaterThan(-1);
    expect(clientLockAt).toBeLessThan(prompt.indexOf("PIXEL LOCK"));
    expect(prompt).toMatch(/NO SCREENS|no televisions/i);
    expect(prompt).toMatch(/NEVER a double|no double bed/i);
    expect(prompt).toMatch(/1 twin bed/);
    expect(prompt).toMatch(/2 twin beds/);
    expect(prompt).toMatch(/no beds/);
    expect(prompt).toMatch(/2 desks/);
    expect(prompt).toMatch(/Island stools: exactly 3/);
    expect(prompt).toMatch(/not a hostel/i);
    expect(prompt).toMatch(/ONE modest flush contemporary cabinet/i);
    expect(prompt).not.toMatch(/overrides a single-bed/i);
  });

  it("asks the image model to extrude the sales sheet, not a labeled room map", () => {
    const prompt = buildVizPrompt(sample, { kind: "overview" }, {
      styleKit: FLOORPLAN_VIZ_PRESETS.contemporary,
      massingMap: true,
    });
    expect(prompt).toMatch(/original sales sheet/i);
    expect(prompt).toMatch(/WALLS ONLY/i);
    expect(prompt).toMatch(/looks empty/i);
    expect(prompt).toMatch(/Do not generate a generic apartment/i);
    expect(prompt).toMatch(/Do not swap kitchen and living/i);
    expect(prompt).toMatch(/ZERO numbers/i);
    expect(prompt).toMatch(/CONTENTS/);
    expect(prompt).not.toMatch(/map IS the floor plate/i);
    expect(prompt).not.toMatch(/extrude these blocks/i);
  });

  it("locks pixel-exact copy and drops approximate prompt language", () => {
    const prompt = buildVizPrompt(sample, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary });
    expect(prompt).toMatch(/PIXEL LOCK/);
    expect(prompt).toMatch(/ORIENTATION LOCK/);
    expect(prompt).toMatch(/PRESENTATION LOCK/);
    expect(prompt).toMatch(/CLOSED doors/);
    expect(prompt).toMatch(/empty tiled/i);
    expect(prompt).toMatch(/CAD entrance arrow/i);
    expect(prompt).toMatch(/Do not mirror/i);
    expect(prompt).toMatch(/SAME side of the frame/i);
    expect(prompt).toMatch(/Copy the dark wall graph 1:1/);
    expect(prompt).not.toMatch(/~2\.5/);
    expect(prompt).not.toMatch(/often 3/);
    expect(prompt).not.toMatch(/approximately #/i);
    expect(prompt).not.toMatch(/usually a U-stair/i);
    const again = buildVizPrompt(sample, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary });
    expect(again).toBe(prompt);
  });

  it("forbids a toilet in חדר שירות / laundry", () => {
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "ח.שרות", kind: "utility", contents: "washer", source: "ocr_verified" },
        { name: "שירותים", kind: "bathroom", source: "ocr_verified" },
      ],
    });
    const prompt = buildVizPrompt(layout, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary });
    expect(prompt).toMatch(/NEVER a toilet/i);
    expect(prompt).toMatch(/washer or shelves/i);
    expect(prompt).not.toMatch(/Storage = shelves\. No kitchen, no bathroom fixtures, no beds\./);
  });
});
