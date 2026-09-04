import {
  isAnthropicConfigured,
  isDocAiConfigured,
  isGeminiConfigured,
  isMistralConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";
import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import { processDocumentAiRaw, processDocumentAiRawForScanMode } from "@/lib/ai-extract-docai";
import { extractDocumentWithMistral, extractTextWithMistralOCR } from "@/lib/ai-extract-mistral";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { isDocAiProcessorConfigured } from "@/lib/docai-processor-config";
import { getFloorplanLayoutModelChain } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import { geminiMultimodal } from "@/lib/tri-engine-extract";
import { floorplanLlmOcrJobs } from "@/lib/projects/floorplan-ocr-text";
import { floorplanSourceFileName } from "@/lib/projects/floorplan-photo-prep";
import { FLOORPLAN_PHOTO_LAYOUT_RULES } from "@/lib/projects/floorplan-photo-instructions";
import {
  combineOcrGrounding,
  extractDimensionStrings,
  extractRoomNameHits,
  mergeFloorplanLayouts,
  parseFloorplanLayout,
  isPlausiblePlanRoom,
  canonicalRoomName,
  type FloorplanLayout,
  type OcrGrounding,
} from "@/lib/projects/floorplan-layout";
import { EXTRACT_PIXEL_LOCK } from "@/lib/projects/floorplan-viz-lock";

const log = createLogger("floorplan-layout-extract");

const LAYOUT_INSTRUCTION = `
You are a licensed Israeli architect reading a floor plan (גרמושקה / תוכנית מכר / תוכנית דירה).
Extract ONLY what is visible. Do not invent rooms or dimensions.

Return JSON only:
{
  "title": string | null,
  "unitLabel": string | null,
  "floor": string | null,
  "ceilingHeightM": number | null,
  "north": string | null,
  "grossAreaM2": number | null,
  "rooms": [
    {
      "name": "exact Hebrew label from the drawing — REQUIRED, never null, never empty",
      "kind": "living" | "kitchen" | "bedroom" | "mmd" | "bathroom" | "balcony" | "circulation" | "utility" | "other",
      "widthM": number | null,
      "lengthM": number | null,
      "areaM2": number | null,
      "adjacentTo": string[],
      "bbox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
      "finishNotes": string | null,
      "bedCount": 0,
      "deskCount": 0,
      "contents": "empty | 1 twin bed | 2 twin beds + 2 desks | 2 desks + caster chairs | L-run + island + 3 stools | bathtub + toilet + sink",
      "confidence": 0.0
    }
  ],
  "openings": [
    { "kind": "door" | "window" | "opening", "widthM": number | null, "heightM": number | null, "room": string | null }
  ],
  "dimensionStrings": ["3.20", "2.45×3.10", "385"],
  "notes": string[],
  "islandStoolCount": 0,
  "internalStairs": {
    "present": false,
    "fromElevationM": 0,
    "toElevationM": null,
    "insideUnit": true,
    "notes": string | null
  },
  "requiresReview": true
}

Rules:
- "name" is REQUIRED on every room and must be a non-empty Hebrew string. A room whose name is null is discarded, so an unlabeled room MUST still carry an inferred Hebrew name (cooktop → מטבח, bathtub → חדר רחצה, toilet-only cubicle → שירותים, washer → ח.שרות, largest open dwelling space → סלון, tiled outdoor terrace → מרפסת, entry hall → מבואה). Never return null, "", "unnamed", or a bare kind as the name.
- "kind" has no office value. ח.עבודה / חדר עבודה is kind "other" — never "kitchen" (its long counter is a desk run) and never "bedroom" (it has no bed). מחסן is kind "other". ח.שרות / חדר שירות is kind "utility".
- Copy printed Hebrew labels (ח. מגורים, מטבח, ממ"ד, ח. שינה, אמבטיה, שירותים, חדר כביסה, ח.עבודה, מחסן, ח.שרות).
- Unlabeled rooms still count: cooktop → מטבח; bathtub → חדר רחצה; washer → חדר כביסה; largest open dwelling space → סלון; outdoor terrace with tiled hatching → מרפסת.
- חדר עבודה / ח.עבודה is an OFFICE (desks, caster chairs, NO bed). It is NOT a kitchen even if a long counter is drawn. Kitchen requires a cooktop and/or kitchen sink symbol. Do not put a second מטבח in that room.
- A room with a bed rectangle is ח. שינה (kind bedroom) even if a desk is also drawn. Never label that room ח.עבודה. One ח.עבודה per unit unless two labels are printed.
- מחסן is storage. ח.שרות / חדר שירות is laundry/service (kind utility): washer or shelves. It is NOT שירותים and NOT a bathroom. Never put a toilet pan, basin, or bathtub in that room's contents.
- Guest WC (שירותים) ONLY if a toilet pan is drawn inside its own closed cubicle with a door. Do not invent נטילת ידיים or שירותים at the entrance. A 90 cm mark is a door width. A wall niche without an oval basin is not a sink. Do not copy that pan into חדר שירות.
- Do not invent extra balconies. Living terrace (שטח המרפסת) and מרפסת גג are different only if both are printed. מרפסת גג is a SMALL service strip, not a deck wrapping the bedrooms. A façade with windows is not a balcony.
- Same label in several rooms → several objects with different bbox (three ח. שינה = three rooms).
- bbox is 0–1 of the FULL image (title block on the right included). Required for every room of THIS unit. Title/legend is not a room.
- Metres only when TWO orthogonal printed sides bound the room. One wall tick (364) is not the living size — leave width/length null.
- Building מעלית / חדר מדרגות outside the unit: omit from apartment rooms.
- Internal stair: present ONLY if a stair run (גרם מדרגות) is actually DRAWN inside the unit outline — parallel tread lines with a direction arrow. Printed elevations alone never establish one. Balcony and terrace levels differ from the flat by design, so a +11.42 flat with a +12.79 מרפסת is ONE floor, not a duplex; the same goes for a terrace at −0.10. A SINGLE elevation such as +9.64 repeated on every room is ONE floor — do not invent +8.06. If no treads are drawn, internalStairs.present is false and there is no stair room.
- floor = printed קומה (שלישית / 3). NEVER copy an elevation (+9.64) into floor.
- Bathtub room and laundry are separate when both are drawn. Do not add a third wet room. חלון ממ"ד is a window note on THE protected room — kind mmd, ONE room per unit, not a second ממ"ד and not a 4th bedroom.
- One drawn terrace = one balcony. A מ"ר number is not an extra balcony. 0.64 מ"ר is a tiny strip — do not read it as 6.4. Living terrace and a second terrace only if both are printed.
- grossAreaM2 = printed apartment area (111.29), not balcony area.
- Doors only where a swing is drawn. Do not flatten a duplex that is actually drawn. Do not invent a duplex that is not.
- OCR grounding is for numbers/labels, not a reason to skip unlabeled kitchen/bath/living.
- Furniture counts (count printed symbols, integer, do not guess):
  - bedCount = rectangular bed symbols in THAT room. 0 if none are drawn. 1 if one rectangle. 2 if two. A room whose printed width fits one rectangle stays bedCount 1.
  - deskCount = desk workstations / caster-star chairs. ח.עבודה is desks, not beds.
  - islandStoolCount = half-circle stools drawn at the kitchen island. 0 if none. Not dining chairs.
  - contents = short English list of the SYMBOLS in that room. empty if none. Count beds, desks, stools, tub vs shower tray, toilet, basin. Do not invent a TV, extra vanity, or walk-in shower.

${EXTRACT_PIXEL_LOCK}
`.trim();

function buildInstruction(ocr?: OcrGrounding, photo = false): string {
  const base = photo ? `${LAYOUT_INSTRUCTION}\n\n${FLOORPLAN_PHOTO_LAYOUT_RULES}` : LAYOUT_INSTRUCTION;
  if (!ocr?.text.trim()) return base;
  return `${base}

### OCR grounding (authoritative printed text — do not contradict):
\`\`\`
${ocr.text.slice(0, 24000)}
\`\`\`
Printed dimension tokens: ${ocr.dimensionStrings.slice(0, 80).join(", ") || "(none)"}
Printed room labels: ${ocr.roomNameHits.join(", ") || "(none)"}
`;
}

function groundingFromText(engine: string, text: string): OcrGrounding {
  return {
    engine,
    text,
    dimensionStrings: extractDimensionStrings(text),
    roomNameHits: extractRoomNameHits(text),
  };
}

async function runDocAiOcr(base64: string, mimeType: string): Promise<OcrGrounding> {
  const raw = isDocAiProcessorConfigured("OCR")
    ? await processDocumentAiRaw(base64, mimeType, "OCR")
    : await processDocumentAiRawForScanMode(base64, mimeType, "DRAWING_BOQ");
  return groundingFromText("document-ai", raw.fullText);
}

async function runVisionLayout(
  engine: "gemini" | "openai" | "anthropic" | "mistral",
  base64: string,
  mimeType: string,
  instruction: string,
): Promise<FloorplanLayout> {
  const fileName = floorplanSourceFileName(mimeType);
  if (engine === "gemini") {
    const raw = await geminiMultimodal(base64, mimeType, instruction, getFloorplanLayoutModelChain());
    return parseFloorplanLayout(raw);
  }
  if (engine === "openai") {
    const raw = await extractDocumentWithOpenAI(base64, mimeType, fileName, instruction);
    return parseFloorplanLayout(raw);
  }
  if (engine === "anthropic") {
    const raw = await extractDocumentWithAnthropic(base64, mimeType, fileName, instruction);
    return parseFloorplanLayout(raw);
  }
  const raw = await extractDocumentWithMistral(base64, mimeType, fileName, instruction);
  return parseFloorplanLayout(raw);
}

export type FloorplanLayoutExtractResult = {
  layout: FloorplanLayout;
  grounding: OcrGrounding;
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
};

export async function extractFloorplanLayout(
  base64: string,
  mimeType: string,
  options?: { photo?: boolean },
): Promise<FloorplanLayoutExtractResult> {
  const photo = options?.photo === true;
  const ocrJobs: Array<Promise<OcrGrounding>> = [];
  if (isDocAiConfigured()) ocrJobs.push(runDocAiOcr(base64, mimeType));
  if (isMistralConfigured()) {
    ocrJobs.push(
      extractTextWithMistralOCR(base64, mimeType).then((text) => groundingFromText("mistral-ocr", text)),
    );
  }
  for (const job of floorplanLlmOcrJobs(base64, mimeType, photo)) {
    ocrJobs.push(job.then((row) => groundingFromText(row.engine, row.text)));
  }

  const ocrSettled = await Promise.allSettled(ocrJobs);
  const ocrParts: OcrGrounding[] = [];
  const ocrEngines: string[] = [];
  ocrSettled.forEach((res) => {
    if (res.status !== "fulfilled") {
      log.warn("ocr engine failed", { error: res.reason instanceof Error ? res.reason.message : String(res.reason) });
      return;
    }
    ocrParts.push(res.value);
    ocrEngines.push(res.value.engine);
  });
  const grounding = combineOcrGrounding(ocrParts);
  const instruction = buildInstruction(grounding, photo);

  const vision: Array<{ name: string; run: () => Promise<FloorplanLayout> }> = [];
  if (isGeminiConfigured()) vision.push({ name: "gemini", run: () => runVisionLayout("gemini", base64, mimeType, instruction) });
  if (isOpenAiConfigured()) vision.push({ name: "openai", run: () => runVisionLayout("openai", base64, mimeType, instruction) });
  if (isAnthropicConfigured()) vision.push({ name: "anthropic", run: () => runVisionLayout("anthropic", base64, mimeType, instruction) });
  if (isMistralConfigured()) vision.push({ name: "mistral", run: () => runVisionLayout("mistral", base64, mimeType, instruction) });

  if (vision.length === 0 && ocrParts.length === 0) {
    throw new Error("אין מנועי AI מוגדרים לפענוח תוכנית");
  }

  const visionSettled = await Promise.allSettled(vision.map((v) => v.run()));
  const layouts: FloorplanLayout[] = [];
  const visionEngines: string[] = [];
  visionSettled.forEach((res, i) => {
    const name = vision[i]!.name;
    if (res.status !== "fulfilled") {
      log.warn("vision layout failed", { engine: name, error: res.reason instanceof Error ? res.reason.message : String(res.reason) });
      return;
    }
    layouts.push(res.value);
    visionEngines.push(name);
  });

  if (layouts.length === 0) {
    if (!grounding.text.trim()) throw new Error("פענוח תוכנית הדירה נכשל בכל המנועים");
    layouts.push(
      parseFloorplanLayout({
        rooms: grounding.roomNameHits.map((name) => ({ name: canonicalRoomName(name) })),
        dimensionStrings: grounding.dimensionStrings,
        notes: ["layout from OCR labels only — vision engines failed"],
      }),
    );
  }

  const layout = mergeFloorplanLayouts(layouts, grounding);
  if (layout.rooms.length === 0 && grounding.roomNameHits.length > 0) {
    layout.rooms = grounding.roomNameHits.map((name) => ({
      name: canonicalRoomName(name),
      source: "ocr_verified" as const,
      confidence: 0.7,
      engineHits: 1,
    }));
  }
  if (layout.rooms.length === 0 && layouts.length > 0) {
    const richest = layouts.reduce((acc, cur) => (cur.rooms.length > acc.rooms.length ? cur : acc));
    layout.rooms = richest.rooms.filter(isPlausiblePlanRoom).map((room) => ({
      ...room,
      source: "inferred" as const,
      confidence: room.confidence ?? 0.4,
      engineHits: room.engineHits ?? 1,
    }));
    layout.notes = [...layout.notes, "filtered single-engine layout"];
  }

  return {
    layout,
    grounding,
    enginesUsed: [...ocrEngines, ...visionEngines],
    ocrEngines,
    visionEngines,
  };
}
