jest.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
jest.mock("@/lib/gemini-api-key", () => ({ getGeminiApiKey: () => "" }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => [],
  getBlueprintAnalysisModelChain: () => ["gemini-test"],
  isLikelyGeminiModelUnavailable: () => false,
}));

import {
  assignInstanceIds,
  canonicalRoomName,
  capExtraMmdRooms,
  capExtraKitchenRooms,
  capExtraStudyRooms,
  demoteStudyRoomsWithBeds,
  extractDimensionStrings,
  extractElevationMarkers,
  extractFloorLabel,
  extractGrossAreaM2,
  extractRoomNameHits,
  extractUnitLabel,
  inferInternalStairsFromOcr,
  inferRoomKind,
  isApartmentStairRoom,
  isElevationFloorToken,
  isPlanAnnotation,
  layoutHasInternalStairs,
  mergeFloorplanLayouts,
  parseFloorplanLayout,
  parsePlanLengthM,
  parseCount,
  roomsForInteriorViz,
  roomsForVisualization,
  sanitizeFloorLabel,
  correctDroppedLeadingZero,
  isPlausiblePlanRoom,
  isStudyRoom,
  isStorageOrServiceRoom,
  isGuestWcRoom,
  stripWetFixturesFromUtility,
  layoutForVisualization,
  pruneHallucinatedPlanRooms,
  canonicalizeFloorplanLayout,
  type FloorplanLayout,
  type OcrGrounding,
} from "@/lib/projects/floorplan-layout";
import { FLOORPLAN_OCR_TEXT_INSTRUCTION, FLOORPLAN_PHOTO_OCR_RULES, floorplanOcrTextInstruction } from "@/lib/projects/floorplan-ocr-text";
import { FLOORPLAN_PHOTO_LAYOUT_RULES } from "@/lib/projects/floorplan-photo-instructions";
import { docAiLocationCandidates, isRetryableDocAiProcessorError } from "@/lib/docai-processor-config";
import { buildVizPrompt } from "@/lib/projects/floorplan-viz-generate";

const grounding: OcrGrounding = {
  engine: "document-ai+mistral-ocr",
  text: 'דירה 14 סלון ח. מגורים 4.10 מטבח 3.20 ח. שינה ממ"ד מרפסת 103.29 מ"ר',
  dimensionStrings: ["4.10", "3.20", "2.70", "385"],
  roomNameHits: ["סלון", "ח. מגורים", "מטבח", "ח. שינה", 'ממ"ד', "מרפסת"],
};

function layout(partial: Partial<FloorplanLayout> & { rooms: FloorplanLayout["rooms"] }): FloorplanLayout {
  return {
    rooms: partial.rooms,
    openings: partial.openings ?? [],
    dimensionStrings: partial.dimensionStrings ?? [],
    notes: partial.notes ?? [],
    islandStoolCount: partial.islandStoolCount,
    requiresReview: true,
    title: partial.title,
    unitLabel: partial.unitLabel,
    ceilingHeightM: partial.ceilingHeightM,
    grossAreaM2: partial.grossAreaM2,
    internalStairs: partial.internalStairs,
  };
}

describe("floorplan layout grounding", () => {
  it("extracts Israeli dimension tokens including centimetre integers", () => {
    const dims = extractDimensionStrings("סלון 4.10×3.20 מ'  חלון 90 ס\"מ  קיר 385 330 1050");
    expect(dims.some((d) => d.includes("4.10"))).toBe(true);
    expect(dims.some((d) => /90/.test(d))).toBe(true);
    expect(dims).toContain("385");
    expect(dims).toContain("330");
    expect(dims).toContain("1050");
  });

  it("converts plan centimetres to meters", () => {
    expect(parsePlanLengthM(385)).toBeCloseTo(3.85, 2);
    expect(parsePlanLengthM(3.2)).toBeCloseTo(3.2, 2);
  });

  it("parses furniture symbol counts including empty rooms", () => {
    expect(parseCount(0)).toBe(0);
    expect(parseCount(3)).toBe(3);
    expect(parseCount("2")).toBe(2);
    expect(parseCount(99)).toBeUndefined();
  });

  it("finds printed Hebrew room labels including abbreviations", () => {
    expect(extractRoomNameHits('מטבח וח. מגורים וממ"ד')).toEqual(
      expect.arrayContaining(["מטבח", "ח. מגורים", 'ממ"ד']),
    );
  });

  it("classifies circulation so elevator is not an interior view", () => {
    expect(inferRoomKind("מעלית")).toBe("circulation");
    expect(inferRoomKind("ח. שינה")).toBe("bedroom");
    expect(inferRoomKind("שטח מקורה")).toBe("balcony");
    expect(inferRoomKind("גרם מדרגות")).toBe("circulation");
    expect(inferRoomKind("מדרגות פנים")).toBe("circulation");
    expect(isApartmentStairRoom({ name: "מדרגות פנים", kind: "circulation" })).toBe(true);
    expect(isApartmentStairRoom({ name: "מעלית", kind: "circulation" })).toBe(false);
    expect(isApartmentStairRoom({ name: "חדר מדרגות", kind: "circulation" })).toBe(false);
  });

  it("treats דירה N as a unit label, not a room", () => {
    expect(isPlanAnnotation("דירה 1")).toBe(true);
    expect(extractUnitLabel('דירה 1 סלון מטבח 330')).toBe("דירה 1");
    const merged = mergeFloorplanLayouts(
      [layout({ rooms: [{ name: "דירה 1" }, { name: "מטבח", widthM: 3.3, lengthM: 2.9 }] })],
      {
        engine: "ocr",
        text: "דירה 1 מטבח 330",
        dimensionStrings: ["330"],
        roomNameHits: ["מטבח"],
      },
    );
    expect(merged.unitLabel).toBe("דירה 1");
    expect(merged.rooms.map((r) => r.name)).not.toContain("דירה 1");
    expect(merged.rooms.map((r) => r.name)).toContain("מטבח");
  });

  it("keeps three bedrooms with the same label as three rooms when bboxes differ", () => {
    const a = layout({
      rooms: [
        { name: "ח. שינה", bbox: { x: 0.05, y: 0.1, w: 0.2, h: 0.18 } },
        { name: "ח. שינה", bbox: { x: 0.05, y: 0.35, w: 0.2, h: 0.18 } },
        { name: "ח. שינה", bbox: { x: 0.05, y: 0.6, w: 0.2, h: 0.18 } },
      ],
    });
    const b = layout({
      rooms: [
        { name: "חדר שינה", bbox: { x: 0.04, y: 0.11, w: 0.21, h: 0.17 } },
        { name: "חדר שינה", bbox: { x: 0.06, y: 0.36, w: 0.19, h: 0.19 } },
        { name: "חדר שינה", bbox: { x: 0.05, y: 0.61, w: 0.2, h: 0.17 } },
      ],
    });
    const merged = mergeFloorplanLayouts([a, b], grounding);
    const bedrooms = merged.rooms.filter((r) => inferRoomKind(r.name) === "bedroom");
    expect(bedrooms.length).toBe(3);
  });

  it("merges bed, desk, and island stool counts from vision engines", () => {
    const a = layout({
      islandStoolCount: 3,
      rooms: [
        {
          name: "ח. שינה",
          kind: "bedroom",
          bedCount: 1,
          contents: "1 twin bed",
          bbox: { x: 0.05, y: 0.1, w: 0.18, h: 0.16 },
        },
        {
          name: "חדר עבודה",
          kind: "other",
          deskCount: 2,
          bbox: { x: 0.05, y: 0.32, w: 0.16, h: 0.14 },
        },
      ],
    });
    const b = layout({
      islandStoolCount: 3,
      rooms: [
        {
          name: "חדר שינה",
          kind: "bedroom",
          bedCount: 1,
          contents: "1 twin bed",
          bbox: { x: 0.06, y: 0.11, w: 0.17, h: 0.15 },
        },
        {
          name: "ח.עבודה",
          kind: "other",
          deskCount: 2,
          bbox: { x: 0.05, y: 0.33, w: 0.15, h: 0.13 },
        },
      ],
    });
    const merged = mergeFloorplanLayouts([a, b], {
      engine: "ocr",
      text: "ח. שינה חדר עבודה מטבח",
      dimensionStrings: [],
      roomNameHits: ["ח. שינה", "חדר עבודה"],
    });
    const bed = merged.rooms.find((r) => inferRoomKind(r.name) === "bedroom");
    const office = merged.rooms.find((r) => r.name.includes("עבודה"));
    expect(bed?.bedCount).toBe(1);
    expect(bed?.contents).toBe("1 twin bed");
    expect(office?.deskCount).toBe(2);
    expect(merged.islandStoolCount).toBe(3);
  });

  it("assigns instance indexes by bbox order", () => {
    const tagged = assignInstanceIds([
      { name: "ח. שינה", bbox: { x: 0.1, y: 0.6, w: 0.2, h: 0.2 } },
      { name: "ח. שינה", bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    ]);
    expect(tagged.find((r) => r.bbox?.y === 0.1)?.instanceIndex).toBe(0);
    expect(tagged.find((r) => r.bbox?.y === 0.6)?.instanceIndex).toBe(1);
  });

  it("drops a hallucinated room that OCR never printed and only one engine saw", () => {
    const a = layout({
      rooms: [
        { name: "סלון", widthM: 4.1, lengthM: 3.2, areaM2: 13.12 },
        { name: "אולם אירועים", widthM: 12, lengthM: 8 },
      ],
    });
    const merged = mergeFloorplanLayouts([a], grounding);
    expect(merged.rooms.map((r) => r.name)).toContain("סלון");
    expect(merged.rooms.map((r) => r.name)).not.toContain("אולם אירועים");
  });

  it("keeps a room when two vision engines agree even if OCR missed the label", () => {
    const a = layout({ rooms: [{ name: "חדר עבודה", widthM: 2.7, lengthM: 2.7 }] });
    const b = layout({ rooms: [{ name: "חדר עבודה", widthM: 2.72, lengthM: 2.68 }] });
    const merged = mergeFloorplanLayouts([a, b], grounding);
    const room = merged.rooms.find((r) => r.name.includes("חדר עבודה") || r.name.includes("עבודה"));
    expect(room?.source).toBe("consensus");
    expect(room?.widthM).toBeCloseTo(2.71, 1);
  });

  it("marks OCR-overlapping rooms as ocr_verified", () => {
    const a = layout({ rooms: [{ name: "מטבח", widthM: 3.2, lengthM: 2.7 }] });
    const merged = mergeFloorplanLayouts([a], grounding);
    expect(merged.rooms.find((r) => r.name === "מטבח")?.source).toBe("ocr_verified");
  });

  it("does not send inferred-only rooms or studio language into the image prompt", () => {
    const parsed = parseFloorplanLayout({
      rooms: [
        { name: "סלון", widthM: 4.1, lengthM: 3.2, source: "ocr_verified", kind: "living" },
        { name: "בריכה", widthM: 8, lengthM: 4, source: "inferred" },
      ],
    });
    const prompt = buildVizPrompt(parsed, { kind: "overview" });
    expect(prompt).toMatch(/living/);
    expect(prompt).not.toContain("בריכה");
    expect(prompt).toMatch(/NOT a studio/i);
    expect(prompt).toMatch(/sunroom/i);
    expect(prompt).toMatch(/solid/i);
    expect(roomsForVisualization(parsed).map((r) => r.name)).toEqual(["סלון"]);
  });

  it("keeps single-engine rooms as inferred when OCR is empty", () => {
    const emptyOcr: OcrGrounding = { engine: "none", text: "", dimensionStrings: [], roomNameHits: [] };
    const a = layout({
      rooms: [
        { name: "מטבח", widthM: 3.2, lengthM: 2.7 },
        { name: "ח. שינה", widthM: 3.5, lengthM: 3.1 },
        { name: "שטח מקורה" },
        { name: "מעלית" },
        { name: "אולם אירועים", widthM: 12, lengthM: 8 },
      ],
    });
    const merged = mergeFloorplanLayouts([a], emptyOcr);
    expect(merged.rooms.map((r) => r.name)).toEqual(expect.arrayContaining(["מטבח", "חדר שינה"]));
    expect(merged.rooms.map((r) => r.name)).not.toContain("שטח מקורה");
    expect(merged.rooms.map((r) => r.name)).not.toContain("מעלית");
    expect(merged.rooms.map((r) => r.name)).not.toContain("אולם אירועים");
    expect(merged.rooms.every((r) => r.source === "inferred")).toBe(true);
    expect(merged.rooms.find((r) => r.name === "מטבח")?.widthM).toBeCloseTo(3.2, 1);
    expect(roomsForVisualization(merged).length).toBe(2);
    expect(roomsForInteriorViz(merged).map((r) => r.name)).toEqual(expect.arrayContaining(["מטבח", "חדר שינה"]));
  });

  it("still drops a one-engine hallucination when OCR exists", () => {
    const a = layout({
      rooms: [
        { name: "מטבח", widthM: 3.2, lengthM: 2.7 },
        { name: "אולם אירועים", widthM: 12, lengthM: 8 },
      ],
    });
    const merged = mergeFloorplanLayouts([a], grounding);
    expect(merged.rooms.map((r) => r.name)).toContain("מטבח");
    expect(merged.rooms.map((r) => r.name)).not.toContain("אולם אירועים");
  });

  it("skips elevator interiors but keeps them on the plan list when OCR printed them", () => {
    const parsed = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", source: "ocr_verified", kind: "kitchen" },
        { name: "מעלית", source: "ocr_verified", kind: "circulation" },
        { name: "מרפסת", source: "ocr_verified", kind: "balcony" },
      ],
    });
    expect(roomsForVisualization(parsed).map((r) => r.name)).toEqual(expect.arrayContaining(["מטבח", "מרפסת"]));
    expect(roomsForVisualization(parsed).map((r) => r.name)).not.toContain("מעלית");
    expect(roomsForInteriorViz(parsed).map((r) => r.name)).toEqual(["מטבח"]);
    const interior = buildVizPrompt(parsed, { kind: "interior", roomName: "מטבח" });
    expect(interior).toContain("NOT a studio");
    expect(interior).toContain("מטבח");
    expect(interior).toMatch(/invent doors/i);
    expect(interior).toMatch(/CROP of this one room/i);
    expect(interior).toMatch(/island\/peninsula/i);
    expect(interior).not.toMatch(/EXACT INVENTORY/);
    // The balcony must not be the subject of a kitchen interior. Checked on the
    // subject line rather than the whole prompt, because the global plan-trace
    // rules name מרפסת when they explain that a terrace is not a room.
    expect(interior).toMatch(/inside "מטבח"/);
    expect(interior).not.toMatch(/inside "מרפסת"/);
  });

  it("keeps unlabeled kitchen/living/bath from fixtures when OCR only saw bedrooms", () => {
    const photoOcr: OcrGrounding = {
      engine: "ocr",
      text: 'דירה 1 ח. שינה ממ"ד 330 290',
      dimensionStrings: ["330", "290"],
      roomNameHits: ["ח. שינה", 'ממ"ד'],
    };
    const a = layout({
      rooms: [
        { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.1, y: 0.05, w: 0.2, h: 0.18 }, widthM: 3.1, lengthM: 3.6 },
        { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.35, y: 0.05, w: 0.18, h: 0.16 }, widthM: 2.4, lengthM: 3 },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.35, w: 0.2, h: 0.2 } },
        { name: "סלון", kind: "living", bbox: { x: 0.2, y: 0.5, w: 0.45, h: 0.35 } },
        { name: "חדר רחצה", kind: "bathroom", bbox: { x: 0.05, y: 0.35, w: 0.15, h: 0.18 } },
        { name: "אולם אירועים", widthM: 12, lengthM: 8 },
      ],
    });
    const merged = mergeFloorplanLayouts([a], photoOcr);
    const names = merged.rooms.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["מטבח", "סלון", "חדר רחצה", "חדר שינה", 'ממ"ד']));
    expect(names).not.toContain("אולם אירועים");
    expect(roomsForVisualization(merged).map((r) => r.name)).toEqual(
      expect.arrayContaining(["מטבח", "סלון", "חדר רחצה"]),
    );
    expect(roomsForInteriorViz(merged).map((r) => r.name)).toEqual(
      expect.arrayContaining(["מטבח", "סלון", "חדר רחצה"]),
    );
  });

  it("reads elevation markers and infers an internal stair to another floor", () => {
    const elevs = extractElevationMarkers("דירה 1 ±0.00 מטבח +1.26 מרפסת -0.10 גרעין −0.05");
    expect(elevs).toEqual(expect.arrayContaining([0, 1.26, -0.1, -0.05]));
    // Elevations locate a stair, they do not prove one: every flat sits at a
    // different level from its terrace. דירה 18 (+11.42 flat, +12.79 מרפסת) read
    // as a duplex on markers alone and grew a phantom "מדרגות פנים" room.
    expect(inferInternalStairsFromOcr("±0.00 +1.26 -0.10")).toBeUndefined();
    expect(inferInternalStairsFromOcr("+11.42 שטח המרפסת +12.79")).toBeUndefined();
    // A building stairwell says nothing about this flat either.
    expect(inferInternalStairsFromOcr("חדר מדרגות ±0.00 +1.26")).toBeUndefined();

    const inferred = inferInternalStairsFromOcr("מדרגות פנים ±0.00 +1.26 -0.10");
    expect(inferred?.present).toBe(true);
    expect(inferred?.toElevationM).toBeCloseTo(1.26, 2);
    expect(inferInternalStairsFromOcr("מדרגות פנים ±0.00 -0.10")).toBeUndefined();

    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "מטבח", kind: "kitchen", bbox: { x: 0.5, y: 0.3, w: 0.2, h: 0.2 } },
            { name: "סלון", kind: "living", bbox: { x: 0.2, y: 0.55, w: 0.4, h: 0.3 } },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: "דירה 1 סלון מטבח מדרגות פנים ±0.00 +1.26 -0.10",
        dimensionStrings: [],
        roomNameHits: ["סלון", "מטבח"],
      },
    );
    expect(merged.internalStairs?.present).toBe(true);
    expect(merged.internalStairs?.toElevationM).toBeCloseTo(1.26, 2);
    expect(layoutHasInternalStairs(merged)).toBe(true);
    expect(merged.rooms.map((r) => r.name)).toContain("מדרגות פנים");
    expect(roomsForVisualization(merged).map((r) => r.name)).toContain("מדרגות פנים");
    expect(roomsForInteriorViz(merged).map((r) => r.name)).not.toContain("מדרגות פנים");

    const prompt = buildVizPrompt(merged, { kind: "overview" });
    expect(prompt).toMatch(/MULTI-LEVEL/i);
    expect(prompt).toMatch(/\+1\.26/);
    expect(prompt).toMatch(/מדרגות פנים/);
    expect(prompt).toMatch(/do NOT flatten/i);
    expect(prompt).not.toMatch(/Do not invent an internal stair/i);
    expect(prompt).toMatch(/EXACT INVENTORY/);
    expect(prompt).toMatch(/Do NOT add extra bedrooms/i);
  });

  it("infers a duplex stair from absolute elevations like +8.06 / +9.64", () => {
    const inferred = inferInternalStairsFromOcr("מדרגות +8.06 +9.64 מעלית ח. מגורים");
    expect(inferred?.present).toBe(true);
    expect(inferred?.fromElevationM).toBeCloseTo(8.06, 2);
    expect(inferred?.toElevationM).toBeCloseTo(9.64, 2);
    expect(extractGrossAreaM2('שטח דירה 111.29 מ"ר מרפסת 11.60 מ"ר')).toBeCloseTo(111.29, 2);
    expect(canonicalRoomName("שטח המרפסת")).toBe("מרפסת");

    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "ח. מגורים", kind: "living", bbox: { x: 0.3, y: 0.4, w: 0.3, h: 0.25 } },
            { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.35, w: 0.2, h: 0.18 } },
            { name: "מעלית", kind: "circulation", bbox: { x: 0.45, y: 0.85, w: 0.08, h: 0.08 } },
            { name: "שטח המרפסת", kind: "balcony", bbox: { x: 0.35, y: 0.05, w: 0.35, h: 0.12 } },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: 'דירה 14 מדרגות +8.06 +9.64 מטבח ח. מגורים שטח המרפסת שטח דירה 111.29 מ"ר',
        dimensionStrings: ["111.29"],
        roomNameHits: ["מטבח", "ח. מגורים", "מדרגות", "מרפסת"],
      },
    );
    expect(merged.internalStairs?.present).toBe(true);
    expect(merged.internalStairs?.fromElevationM).toBeCloseTo(8.06, 2);
    expect(merged.internalStairs?.toElevationM).toBeCloseTo(9.64, 2);
    expect(merged.grossAreaM2).toBeCloseTo(111.29, 2);
    expect(merged.rooms.map((r) => r.name)).toContain("מדרגות פנים");
    expect(merged.rooms.map((r) => r.name)).toContain("מרפסת");
    expect(merged.rooms.map((r) => r.name)).not.toContain("שטח המרפסת");
    const prompt = buildVizPrompt(merged, { kind: "overview" });
    expect(prompt).toMatch(/MULTI-LEVEL/i);
    expect(prompt).toMatch(/8\.06/);
    expect(prompt).toMatch(/9\.64/);
    expect(prompt).toMatch(/EXACT INVENTORY/);
    expect(prompt).toMatch(/elevator/i);
  });

  it("prefers OCR +8.06 / +9.64 when vision collapses both elevations to 9.64", () => {
    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [{ name: "ח. מגורים", kind: "living", widthM: 5.33, lengthM: 3.64, areaM2: 19.4 }],
          internalStairs: { present: true, fromElevationM: 9.64, toElevationM: 9.64, insideUnit: true },
        }),
      ],
      {
        engine: "ocr",
        text: 'דירה 14 מדרגות +8.06 +9.64 שטח דירה 111.29 מ"ר ח. מגורים מטבח',
        dimensionStrings: ["111.29", "5.33", "3.64"],
        roomNameHits: ["ח. מגורים", "מטבח", "מדרגות"],
      },
    );
    expect(merged.internalStairs?.fromElevationM).toBeCloseTo(8.06, 2);
    expect(merged.internalStairs?.toElevationM).toBeCloseTo(9.64, 2);
    const living = merged.rooms.find((r) => (r.kind ?? inferRoomKind(r.name)) === "living");
    expect(living?.widthM).toBeUndefined();
    expect(living?.areaM2).toBeUndefined();
    const prompt = buildVizPrompt(merged, { kind: "overview" });
    expect(prompt).toMatch(/8\.06/);
    expect(prompt).not.toMatch(/from \+9\.64 m to \+9\.64 m/);
    expect(prompt).toMatch(/FURNITURE LOCK/);
    expect(prompt).toMatch(/keep the living volume LARGE/i);
  });

  it("keeps a single-engine unlabeled internal stair when the drawing shows it", () => {
    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "מטבח", kind: "kitchen", bbox: { x: 0.5, y: 0.3, w: 0.2, h: 0.2 } },
            {
              name: "מדרגות פנים",
              kind: "circulation",
              bbox: { x: 0.45, y: 0.28, w: 0.12, h: 0.18 },
            },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: "דירה 1 מטבח",
        dimensionStrings: [],
        roomNameHits: ["מטבח"],
      },
    );
    expect(merged.rooms.map((r) => r.name)).toContain("מדרגות פנים");
    expect(merged.internalStairs?.present).toBe(true);
  });

  it("collapses a mixed bedroom/MMD label to a single ממ\"ד", () => {
    expect(canonicalRoomName('חדר שינה (ממ"ד)')).toBe('ממ"ד');
    const parsed = parseFloorplanLayout({
      rooms: [{ name: 'חדר שינה (ממ"ד)', kind: "bedroom", bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }],
    });
    expect(parsed.rooms[0]?.name).toBe('ממ"ד');
    expect(parsed.rooms[0]?.kind).toBe("mmd");
  });

  it("drops a overlapping bedroom that is the same box as the ממ\"ד", () => {
    const photoOcr: OcrGrounding = {
      engine: "ocr",
      text: 'ממ"ד ח. שינה',
      dimensionStrings: [],
      roomNameHits: ["ח. שינה", 'ממ"ד'],
    };
    const a = layout({
      rooms: [
        { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, source: "ocr_verified" },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.12, y: 0.12, w: 0.18, h: 0.18 } },
      ],
    });
    const merged = mergeFloorplanLayouts([a], photoOcr);
    const kinds = merged.rooms.map((r) => r.kind ?? inferRoomKind(r.name));
    expect(kinds.filter((k) => k === "mmd").length).toBe(1);
    expect(kinds.filter((k) => k === "bedroom").length).toBe(0);
  });

  it("keeps laundry in inventory and two wet rooms as separate bathrooms", () => {
    const parsed = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", kind: "kitchen", source: "ocr_verified" },
        { name: "חדר כביסה", kind: "utility", source: "ocr_verified" },
        { name: "שירותים", kind: "bathroom", source: "ocr_verified" },
        { name: "חדר רחצה", kind: "bathroom", source: "ocr_verified" },
      ],
    });
    expect(roomsForVisualization(parsed).map((r) => r.name)).toEqual(
      expect.arrayContaining(["מטבח", "חדר כביסה", "שירותים", "חדר רחצה"]),
    );
    expect(roomsForInteriorViz(parsed).map((r) => r.name)).not.toContain("חדר כביסה");
    expect(roomsForInteriorViz(parsed).filter((r) => inferRoomKind(r.name) === "bathroom")).toHaveLength(2);
  });

  it("does not invent a duplex from a vision-only +9.64 with no OCR pair", () => {
    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "ח. מגורים", kind: "living", bbox: { x: 0.3, y: 0.4, w: 0.3, h: 0.25 } },
            { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.35, w: 0.2, h: 0.18 } },
          ],
          internalStairs: { present: true, fromElevationM: 9.64, toElevationM: 9.64, insideUnit: true },
          floor: "9.64+",
        }),
      ],
      {
        engine: "ocr",
        text: 'דירה 14 קומה שלישית ח. מגורים מטבח +9.64 שטח דירה 111.29 מ"ר',
        dimensionStrings: ["111.29", "9.64"],
        roomNameHits: ["ח. מגורים", "מטבח"],
      },
    );
    expect(merged.internalStairs).toBeUndefined();
    expect(merged.rooms.map((r) => r.name)).not.toContain("מדרגות פנים");
    expect(merged.floor).toBe("קומה שלישית");
    expect(layoutHasInternalStairs(merged)).toBe(false);
    const prompt = buildVizPrompt(merged, { kind: "overview" });
    expect(prompt).not.toMatch(/MULTI-LEVEL/i);
  });

  it("corrects balcony 6.4 that is printed 0.64 and drops the strip from 3D inventory", () => {
    expect(correctDroppedLeadingZero(6.4, 'מרפסת 0.64 מ"ר')).toBeCloseTo(0.64, 2);
    const merged = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "סלון", kind: "living", bbox: { x: 0.2, y: 0.4, w: 0.4, h: 0.3 } },
            { name: "מרפסת", kind: "balcony", areaM2: 6.4, bbox: { x: 0.2, y: 0.05, w: 0.08, h: 0.08 } },
            { name: "מרפסת (2)", kind: "balcony", areaM2: 4.1, bbox: { x: 0.3, y: 0.02, w: 0.35, h: 0.12 } },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: 'סלון מרפסת 0.64 מ"ר 4.10',
        dimensionStrings: ["0.64", "4.10"],
        roomNameHits: ["סלון", "מרפסת"],
      },
    );
    const tiny = merged.rooms.find((r) => r.areaM2 != null && r.areaM2 < 1);
    expect(tiny?.areaM2).toBeCloseTo(0.64, 2);
    expect(roomsForVisualization(merged).filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony")).toHaveLength(
      1,
    );
  });

  it("promotes a bedroom with חלון ממ\"ד notes to ממ\"ד", () => {
    const parsed = parseFloorplanLayout({
      rooms: [{ name: "ח. שינה", kind: "bedroom", finishNotes: 'חלון ממ"ד הזזה', bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }],
    });
    expect(parsed.rooms[0]?.name).toBe('ממ"ד');
    expect(parsed.rooms[0]?.kind).toBe("mmd");
    expect(sanitizeFloorLabel("+9.64")).toBeUndefined();
    expect(sanitizeFloorLabel("9.64+", "קומה שלישית ח. מגורים")).toBe("קומה שלישית");
    expect(extractFloorLabel("דירה 14 קומה שלישית")).toBe("קומה שלישית");
    expect(isElevationFloorToken("9.64+")).toBe(true);

    const fourBeds = mergeFloorplanLayouts(
      [
        layout({
          rooms: [
            { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.05, y: 0.1, w: 0.15, h: 0.15 } },
            { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.05, y: 0.3, w: 0.15, h: 0.15 } },
            { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.05, y: 0.5, w: 0.15, h: 0.15 } },
            { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.05, y: 0.7, w: 0.15, h: 0.15 } },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: 'ח. שינה ממ"ד',
        dimensionStrings: [],
        roomNameHits: ["ח. שינה", 'ממ"ד'],
      },
    );
    const kinds = fourBeds.rooms.map((r) => r.kind ?? inferRoomKind(r.name));
    expect(kinds.filter((k) => k === "mmd")).toHaveLength(1);
    expect(kinds.filter((k) => k === "bedroom")).toHaveLength(3);
  });

  it("does not turn חלון ממ\"ד into a second protected room", () => {
    const two = capExtraMmdRooms(
      [
        { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.35, w: 0.18, h: 0.16 }, source: "ocr_verified" },
        { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.08, w: 0.16, h: 0.14 }, source: "ocr_verified" },
        { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.35, y: 0.08, w: 0.16, h: 0.14 } },
      ],
      1,
    );
    expect(two.filter((r) => r.kind === "mmd")).toHaveLength(1);
    expect(two.filter((r) => r.kind === "bedroom").length).toBeGreaterThanOrEqual(2);

    const merged = mergeFloorplanLayouts(
      [
        layout({
          grossAreaM2: 111.29,
          rooms: [
            { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.35, w: 0.18, h: 0.16 } },
            { name: "ח. שינה", kind: "bedroom", finishNotes: 'חלון ממ"ד הזזה', bbox: { x: 0.1, y: 0.08, w: 0.16, h: 0.14 } },
            { name: "ח. שינה", kind: "bedroom", bbox: { x: 0.32, y: 0.08, w: 0.16, h: 0.14 } },
          ],
        }),
      ],
      {
        engine: "ocr",
        text: 'דירה 14 ח. שינה ממ"ד חלון ממ"ד הזזה 111.29 מ"ר',
        dimensionStrings: ["111.29"],
        roomNameHits: ["ח. שינה", 'ממ"ד'],
      },
    );
    expect(merged.rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "mmd")).toHaveLength(1);
    const bath = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "חדר רחצה", kind: "bathroom", source: "ocr_verified" }] }),
      { kind: "interior", roomName: "חדר רחצה" },
    );
    expect(bath).toMatch(/bathtub stays a bathtub/i);
    expect(bath).toMatch(/walk-in shower/i);
    const iso = buildVizPrompt(merged, { kind: "isometric" });
    expect(iso).toMatch(/approved cutaway/i);
    expect(iso).toMatch(/building core/i);
  });

  it("drops a vision-invented guest WC and extra living balcony when OCR never printed them", () => {
    expect(canonicalRoomName("שטח מרפסת גג")).toBe("מרפסת גג");
    const a = layout({
      rooms: [
        { name: "ח. מגורים", kind: "living", bbox: { x: 0.3, y: 0.4, w: 0.3, h: 0.25 } },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.35, w: 0.2, h: 0.18 } },
        { name: "חדר רחצה", kind: "bathroom", bbox: { x: 0.4, y: 0.7, w: 0.18, h: 0.16 } },
        { name: "שירותים", kind: "bathroom", bbox: { x: 0.62, y: 0.72, w: 0.08, h: 0.1 } },
        { name: "שטח המרפסת", kind: "balcony", areaM2: 4.1, bbox: { x: 0.35, y: 0.02, w: 0.3, h: 0.1 } },
        { name: "מרפסת", kind: "balcony", areaM2: 4.64, bbox: { x: 0.02, y: 0.2, w: 0.08, h: 0.5 } },
        { name: "מרפסת גג", kind: "balcony", areaM2: 3.16, bbox: { x: 0.15, y: 0.78, w: 0.12, h: 0.08 } },
      ],
    });
    const b = layout({ rooms: a.rooms });
    const merged = mergeFloorplanLayouts([a, b], {
      engine: "ocr",
      text: 'דירה 14 ח. מגורים מטבח שטח המרפסת 4.10 מ"ר מרפסת גג 3.16 מ"ר חדר רחצה',
      dimensionStrings: ["4.10", "3.16"],
      roomNameHits: ["ח. מגורים", "מטבח", "מרפסת", "חדר רחצה"],
    });
    const names = merged.rooms.map((r) => r.name);
    expect(names).not.toContain("שירותים");
    expect(names).toContain("חדר רחצה");
    expect(names).toContain("מרפסת");
    expect(names).toContain("מרפסת גג");
    const livingBalc = merged.rooms.filter(
      (r) => (r.kind ?? inferRoomKind(r.name)) === "balcony" && !/גג/.test(r.name),
    );
    expect(livingBalc).toHaveLength(1);
    expect(livingBalc[0]?.areaM2).toBeCloseTo(4.1, 1);
    const prompt = buildVizPrompt(merged, { kind: "overview" });
    expect(prompt).toMatch(/do not invent an entrance sink/i);
    expect(prompt).toMatch(/wraparound/i);
    expect(prompt).not.toMatch(/guest WC exists/i);
  });
});

describe("floorplan OCR fallbacks", () => {
  it("asks Gemini/OpenAI OCR to copy printed Hebrew labels and dimensions", () => {
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/גרמושקה/);
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/ממ"ד/);
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/plain/i);
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/elevation/i);
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/\+8\.06/);
    expect(FLOORPLAN_OCR_TEXT_INSTRUCTION).toMatch(/ח\.עבודה/);
  });

  it("treats חדר עבודה as a real plan room and does not turn it into a second kitchen", () => {
    expect(extractRoomNameHits("מטבח ח.עבודה מחסן ח.שינה")).toEqual(
      expect.arrayContaining(["מטבח", "חדר עבודה", "מחסן", "ח. שינה"]),
    );
    expect(isPlausiblePlanRoom({ name: "חדר עבודה" })).toBe(true);
    const parsed = parseFloorplanLayout({
      rooms: [
        { name: "מטבח", kind: "kitchen", source: "ocr_verified", areaM2: 14 },
        { name: "ח.עבודה", kind: "other", source: "ocr_verified", areaM2: 7.8 },
        { name: "מחסן", kind: "utility", source: "ocr_verified", areaM2: 5 },
        { name: "ח. שינה", kind: "bedroom", source: "ocr_verified" },
      ],
    });
    expect(roomsForVisualization(parsed).map((r) => r.name)).toEqual(
      expect.arrayContaining(["מטבח", "חדר עבודה", "מחסן", "חדר שינה"]),
    );
    expect(roomsForInteriorViz(parsed).map((r) => r.name)).not.toContain("חדר עבודה");
    expect(roomsForInteriorViz(parsed).map((r) => r.name)).not.toContain("מחסן");

    const extraKitchen = pruneHallucinatedPlanRooms(
      [
        { name: "מטבח", kind: "kitchen", areaM2: 15, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
        { name: "מטבחון", kind: "kitchen", areaM2: 6, bbox: { x: 0.1, y: 0.4, w: 0.12, h: 0.12 } },
      ],
      {
        engine: "ocr",
        text: "דירה 1 מטבח ח.עבודה ח. שינה ממ\"ד",
        dimensionStrings: [],
        roomNameHits: ["מטבח", "חדר עבודה", "ח. שינה", 'ממ"ד'],
      },
    );
    expect(extraKitchen.filter((r) => (r.kind ?? "") === "kitchen")).toHaveLength(1);
    expect(extraKitchen.some((r) => r.name.includes("עבודה"))).toBe(true);

    const capped = capExtraKitchenRooms(
      [
        { name: "מטבח", kind: "kitchen", areaM2: 14 },
        { name: "מטבח", kind: "kitchen", areaM2: 7 },
      ],
      1,
    );
    expect(capped.filter((r) => r.kind === "kitchen")).toHaveLength(1);
    expect(capped.some((r) => r.name === "חדר עבודה")).toBe(true);

    const clonedOffice = capExtraStudyRooms(
      [
        { name: "חדר עבודה", kind: "other", areaM2: 8 },
        { name: "חדר עבודה", kind: "other", areaM2: 7 },
        { name: "חדר שינה", kind: "bedroom" },
      ],
      1,
    );
    expect(clonedOffice.filter(isStudyRoom)).toHaveLength(1);
    expect(clonedOffice.filter((r) => r.kind === "bedroom")).toHaveLength(2);

    const mislabelled = demoteStudyRoomsWithBeds([
      { name: "חדר עבודה", kind: "other", deskCount: 1, bedCount: 1 },
      { name: "חדר עבודה", kind: "other", deskCount: 2 },
    ]);
    expect(mislabelled.filter(isStudyRoom)).toHaveLength(1);
    expect(mislabelled.some((r) => r.kind === "bedroom" && r.bedCount === 1)).toBe(true);

    const prompt = buildVizPrompt(parsed, { kind: "overview" });
    expect(prompt).toMatch(/office\/study 1/i);
    expect(prompt).toMatch(/kitchen 1 \(exactly 1/i);
    expect(prompt).toMatch(/desks WITHOUT a bed/i);
    expect(prompt).toMatch(/Desk-only rooms/i);
    expect(prompt).toMatch(/NEVER clone a second office/i);
    expect(prompt).toMatch(/ZERO letters/i);
    expect(prompt).toMatch(/NO STAIR/i);
    expect(prompt).toMatch(/second kitchen/i);
    expect(prompt).not.toMatch(/Internal stair YES/i);
    expect(prompt).not.toContain("חדר עבודה");
  });

  it("adds photo-of-paper rules for phone snapshots", () => {
    expect(FLOORPLAN_PHOTO_OCR_RULES).toMatch(/phone photo/i);
    expect(FLOORPLAN_PHOTO_OCR_RULES).toMatch(/330/);
    expect(floorplanOcrTextInstruction(true)).toMatch(/handwritten/i);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/Photograph/);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/centimetres/i);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/ink smear/i);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/מדרגות פנים/);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/\+8\.06/);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/Do not invent an entrance sink/);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).toMatch(/wraparound/i);
    expect(FLOORPLAN_PHOTO_LAYOUT_RULES).not.toMatch(/Typical Israeli apartment/);
    const prompt = buildVizPrompt(
      parseFloorplanLayout({ rooms: [{ name: "מטבח", source: "ocr_verified", kind: "kitchen" }] }),
      { kind: "overview" },
      { photo: true },
    );
    expect(prompt).toMatch(/photograph of a paper drawing/i);
    expect(prompt).toMatch(/pale grid/i);
  });

  it("tries Document AI in eu then us when location is not set", () => {
    const locs = docAiLocationCandidates();
    expect(locs).toEqual(expect.arrayContaining(["eu", "us"]));
    expect(isRetryableDocAiProcessorError("billing to be enabled")).toBe(true);
    expect(isRetryableDocAiProcessorError("PERMISSION_DENIED")).toBe(true);
  });
});

describe("canonicalizeFloorplanLayout", () => {
  it("rounds metrics and sorts rooms so the same extract always serializes the same way", () => {
    const a = canonicalizeFloorplanLayout(
      parseFloorplanLayout({
        grossAreaM2: 111.294,
        rooms: [
          { name: "מטבח", kind: "kitchen", widthM: 3.201, bbox: { x: 0.12, y: 0.08, w: 0.2, h: 0.15 } },
          { name: "סלון", kind: "living", widthM: 4.104, bbox: { x: 0.4, y: 0.08, w: 0.3, h: 0.2 } },
        ],
        notes: ["b", "a"],
        dimensionStrings: ["3.20", "4.10"],
      }),
    );
    const b = canonicalizeFloorplanLayout(
      parseFloorplanLayout({
        grossAreaM2: 111.294,
        rooms: [
          { name: "סלון", kind: "living", widthM: 4.104, bbox: { x: 0.4, y: 0.08, w: 0.3, h: 0.2 } },
          { name: "מטבח", kind: "kitchen", widthM: 3.201, bbox: { x: 0.12, y: 0.08, w: 0.2, h: 0.15 } },
        ],
        notes: ["a", "b"],
        dimensionStrings: ["4.10", "3.20"],
      }),
    );
    expect(a.grossAreaM2).toBe(111.29);
    expect(a.rooms.map((r) => r.name)).toEqual(["מטבח", "סלון"]);
    expect(a.rooms[0]?.widthM).toBe(3.2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(canonicalizeFloorplanLayout(a))).toBe(JSON.stringify(a));
  });
});

describe("laundry / חדר שירות vs שירותים", () => {
  it("treats ח.שרות as utility laundry, not a guest WC", () => {
    expect(inferRoomKind("ח.שרות")).toBe("utility");
    expect(inferRoomKind("חדר שירות")).toBe("utility");
    expect(inferRoomKind("שירותים")).toBe("bathroom");
    expect(isStorageOrServiceRoom({ name: "ח.שרות" })).toBe(true);
    expect(isStorageOrServiceRoom({ name: "חדר כביסה", kind: "utility" })).toBe(true);
    expect(isGuestWcRoom({ name: "שירותים", kind: "bathroom" })).toBe(true);
    expect(isStorageOrServiceRoom({ name: "שירותים", kind: "bathroom" })).toBe(false);
  });

  it("strips a hallucinated toilet from laundry contents before visualization", () => {
    const stripped = stripWetFixturesFromUtility({
      name: "ח.שרות",
      kind: "other",
      contents: "washer + toilet + sink",
    });
    expect(stripped.kind).toBe("utility");
    expect(stripped.contents).toMatch(/washer/i);
    expect(stripped.contents).not.toMatch(/toilet|sink/i);

    const viz = layoutForVisualization(
      parseFloorplanLayout({
        rooms: [{ name: "ח.שרות", kind: "utility", contents: "toilet", source: "ocr_verified" }],
      }),
    );
    expect(viz.rooms[0]?.contents).toBe("washer");
    const prompt = buildVizPrompt(viz, { kind: "overview" });
    expect(prompt).toMatch(/Do not push a toilet into that room/i);
    expect(prompt).toMatch(/חדר שירות is not שירותים/);
  });
});

describe("a printed area without a decimal point", () => {
  it("reads a bare integer, after two sheets printed 57 מ\"ר", () => {
    // דירה 19 and דירה 23 both print the gross area as a whole number, and
    // requiring a decimal returned undefined for them — no area, no scale lock,
    // no render.
    expect(extractGrossAreaM2('שטח דירה 57 מ"ר')).toBe(57);
  });

  it("still prefers the largest plausible figure on the sheet", () => {
    expect(extractGrossAreaM2('מרפסת 8 מ"ר שטח דירה 57 מ"ר')).toBe(57);
  });

  it("still refuses a figure outside a flat's range", () => {
    // A bare integer must not let a terrace or a dimension through.
    expect(extractGrossAreaM2('מרפסת 8 מ"ר')).toBeUndefined();
    expect(extractGrossAreaM2('900 מ"ר')).toBeUndefined();
  });
});
