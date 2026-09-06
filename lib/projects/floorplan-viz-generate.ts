import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import { getFloorplanVizModelChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import {
  inferRoomKind,
  isApartmentStairRoom,
  isBuildingCoreRoom,
  isGuestWcRoom,
  isStorageOrServiceRoom,
  isStudyRoom,
  layoutHasInternalStairs,
  layoutForVisualization,
  canonicalizeFloorplanLayout,
  roomsForVisualization,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanRoomKind,
  type FloorplanVizImage,
  type FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";
import { locatorFocusForGeneration } from "@/lib/projects/floorplan-locator";
import { auditFloorplanStill, gradeFloorplanStill } from "@/lib/projects/floorplan-viz-audit";
import { buildVectorWallJpeg, extractPdfPageRaster } from "@/lib/projects/floorplan-vector";
import { stampFieldsFromLayout, stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import {
  buildFootprintSilhouetteJpeg,
  buildInkWallJpeg,
  buildRoomMassingJpeg,
  cropFloorplanRasterToUnit,
} from "@/lib/projects/floorplan-photo-prep";
import {
  KITCHEN_SINK_LOCK,
  PLAN_TRACE_LOCK,
  resolveFloorplanVizStyle,
  stylePromptForView,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";
import {
  listFloorplanVizJobs,
  type FloorplanVizJobSpec,
  type FloorplanVizScope,
} from "@/lib/projects/floorplan-viz-scope";
import {
  nearestGeminiImageAspect,
  ORIENTATION_LOCK,
  PIXEL_LOCK,
  PRESENTATION_LOCK,
} from "@/lib/projects/floorplan-viz-lock";

export type { FloorplanVizScope };
export { listFloorplanVizJobs, parseFloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

const log = createLogger("floorplan-viz-generate");

const IMAGE_CONCURRENCY = 2;

/**
 * The aspect ratio has to come from the sheet, not from the model's default.
 *
 * sharp cannot decode a PDF, so this used to return undefined for every PDF
 * upload and Gemini fell back to its own framing — landscape. A portrait sales
 * sheet then came back squeezed into a landscape frame with the flat rotated,
 * which is exactly the ORIENTATION_LOCK the prompt spends a paragraph on.
 * pdf-lib reads the page box without rendering anything.
 */
async function aspectRatioForPlan(base64: string, mimeType?: string): Promise<string | undefined> {
  const bytes = Buffer.from(base64, "base64");
  if (mimeType === "application/pdf" || bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      const page = doc.getPage(0);
      if (page) {
        const { width, height } = page.getSize();
        // /Rotate is applied at display time and getSize() reports the unrotated
        // box. Nine of ten sheets in a real batch carried /Rotate 270, so
        // ignoring it called every portrait plan landscape.
        const quarterTurned = Math.abs(page.getRotation().angle % 180) === 90;
        const w = quarterTurned ? height : width;
        const h = quarterTurned ? width : height;
        if (w > 0 && h > 0) return nearestGeminiImageAspect(w, h);
      }
    } catch {
      /* Encrypted or malformed — fall through and let Gemini frame it. */
    }
    return undefined;
  }
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.width && meta.height) return nearestGeminiImageAspect(meta.width, meta.height);
  } catch {
    /* Not a raster sharp can decode — Gemini picks from the attached sheet. */
  }
  return undefined;
}

function roomRole(room: FloorplanRoom): string {
  if (isStudyRoom(room)) return "office";
  if (isStorageOrServiceRoom(room)) return "storage";
  if (isApartmentStairRoom(room)) return "stair";
  return room.kind ?? inferRoomKind(room.name);
}

function fmtMeters(n: number): string {
  return n.toFixed(2);
}

function roomLine(room: FloorplanRoom, index?: number): string {
  const role = roomRole(room);
  const bits = [index != null ? `${index}. ${role}` : `${role}`];
  if (room.widthM && room.lengthM) bits.push(`${fmtMeters(room.widthM)}×${fmtMeters(room.lengthM)} m`);
  else if (room.areaM2) bits.push(`${fmtMeters(room.areaM2)} m²`);
  if (room.bedCount != null) {
    bits.push(
      room.bedCount === 0 ? "no beds" : room.bedCount === 1 ? "1 twin bed" : `${room.bedCount} twin beds`,
    );
  }
  if (room.deskCount != null && room.deskCount > 0) {
    bits.push(`${room.deskCount} desk${room.deskCount === 1 ? "" : "s"}`);
  }
  if (room.contents) bits.push(room.contents);
  return `- ${bits.join(" · ")}`;
}

function countKind(rooms: FloorplanRoom[], kind: FloorplanRoomKind): number {
  return rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === kind).length;
}

function inventoryBlock(layout: FloorplanLayout, haredi = false): string {
  const rooms = roomsForVisualization(layout).filter((r) => !isBuildingCoreRoom(r));
  const stairs = layoutHasInternalStairs(layout);
  const nKitchen = countKind(rooms, "kitchen");
  const nBed = countKind(rooms, "bedroom");
  const nStudy = rooms.filter(isStudyRoom).length;
  const nStorage = rooms.filter(isStorageOrServiceRoom).length;
  // Per-room counts alone did not hold: דירה 14 has four drawn beds and came
  // back with six. A single total is something the model can check its own
  // output against before it finishes the frame.
  const totalBeds = rooms.reduce((sum, room) => sum + (room.bedCount ?? 0), 0);
  return [
    "EXACT INVENTORY — copy these enclosed spaces from the drawing, nothing else:",
    `living ${countKind(rooms, "living")}, kitchen ${nKitchen} (exactly ${nKitchen} — do not add another), bedroom ${nBed} (exactly ${nBed}), mmd ${countKind(rooms, "mmd")}, bathroom ${countKind(rooms, "bathroom")}, balcony ${countKind(rooms, "balcony")}, office/study ${nStudy}, storage ${nStorage}`,
    `TOTAL BEDS IN THE WHOLE APARTMENT: exactly ${totalBeds}. Count every bed you have drawn before finishing: the sum across all rooms must be ${totalBeds}, not ${totalBeds + 1} and not ${totalBeds + 2}. A room listed with 1 twin bed gets one bed and no second one.`,
    stairs
      ? "Internal stair YES — real treads in the plan location. Do NOT add extra bedrooms. Elevator is outside the unit."
      : "Internal stair NO. Omit any stair, elevator, or grey shaft outside the dwelling outline. Do not extrude hatched 35 cm walls into a stairwell. Do not invent treads.",
    nStudy > 0
      ? `Office count is ${nStudy} — desks WITHOUT a bed in that one enclosed room only. Desk-only rooms in the photograph must equal ${nStudy}, not ${nStudy + 1}. NEVER clone a second office. NEVER a cooktop or sink there. NEVER beds in the office.`
      : "Do not invent an office. A bedroom with a small desk stays a bedroom.",
    nStudy > 0
      ? "A bedroom with a desk still has its bed(s). Two stacked rooms by the kitchen are not two offices unless office count is 2."
      : "",
    nStorage > 0
      ? "Storage / laundry / חדר שירות: washer or shelves ONLY. NEVER a toilet, basin, bathtub, or shower. חדר שירות is not שירותים. NEVER a second kitchen, extra office, or extra bedroom."
      : "",
    layout.islandStoolCount != null
      ? `Island stools: exactly ${layout.islandStoolCount} half-circle seats. Do not add more.`
      : "Island stools: copy the half-circle count on the island. Do not add extras.",
    haredi
      ? "Beds: copy rectangles from the drawing. One rectangle = one twin. Two = two twins in those positions. Empty ממ\"ד = empty. Never a double. Never pack extra beds into a narrow room."
      : "Beds: copy rectangles from the drawing. One stays one; two twins stay two twins. Empty ממ\"ד = empty. Never pack extra beds into a narrow room.",
    "Do NOT add extra bedrooms. Do NOT add a second kitchen. Do NOT add a second office.",
    "The wall tracing is walls only and looks empty — copy furniture from the sales sheet, not from that tracing.",
  ]
    .filter(Boolean)
    .join("\n");
}

function balconyCount(rooms: FloorplanRoom[]): number {
  return rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony").length;
}

function internalStairHint(layout: FloorplanLayout): string {
  if (!layoutHasInternalStairs(layout)) {
    return "NO STAIR in this apartment. Building core (מעלית / חדר מדרגות) stays outside the unit — omit shafts and do not invent a concrete stair volume.";
  }
  const stairs = layout.internalStairs;
  const from = stairs?.fromElevationM;
  const to = stairs?.toElevationM;
  const elev =
    from != null && to != null && to - from >= 0.8
      ? ` (${from >= 0 ? "+" : ""}${from.toFixed(2)} → ${to >= 0 ? "+" : ""}${to.toFixed(2)})`
      : "";
  return `MULTI-LEVEL: מדרגות פנים${elev} on the attached plan at the printed stair location. Model real treads. Do NOT flatten. Do not put a bedroom where the stair is.`;
}

const ONE_FRAME =
  "Output ONE photorealistic sales-brochure photograph. Forbidden: collage, grid, triptych, stacked panels, labeled schematic, CAD arrows, empty tiled bathrooms, open closet rails, dollhouse with room names painted on floors.";

export const GEOMETRY_LOCK = `
GEOMETRY — the sales drawing is the only floor plate:
- Extrude the printed wall graph 1:1, same orientation as the sheet. Do not invent a corridor apartment from memory.
- Do not mirror the unit. Do not swap kitchen and living. Do not drop the ממ"ד. Do not invent a walk-in closet wing. Do not weld an island into a U-kitchen unless those walls are drawn.
- Kitchen stays where the cooktop/sink run is drawn. Living/dining stays where the sofa and dining table are drawn. Bedrooms stay where the bed rectangles are drawn.
- Color tints on a copy of the sheet are identification hints only. If a tint rectangle disagrees with a drawn wall, follow the wall.
- Furniture follows CAD symbols: one dining table if one is drawn, island stools as drawn, office = enclosed desks, empty ממ"ד stays empty.
- Do not 3D-print CAD annotations (entrance arrows, north marks, ticks, hatch). Closet hatch = cabinets with doors. Wet pans = toilets/basins/tubs in those rooms.
- ZERO numbers, letters, or color-block captions on the photograph.
`.trim();

function viewHint(
  layout: FloorplanLayout,
  view: { kind: FloorplanVizViewId; roomName?: string },
  haredi = false,
): string {
  const rooms = roomsForVisualization(layout);
  const nBalc = balconyCount(rooms);
  const nStudy = rooms.filter(isStudyRoom).length;
  const nStorage = rooms.filter(isStorageOrServiceRoom).length;
  const bathrooms = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bathroom");
  if (view.kind === "overview") {
    return [
      "Photoreal bird's-eye 3D of the attached plan, same orientation, walls cut at 1.2 m. Do not mirror. Do not put living on the opposite side from the sheet.",
      "Trace the wall graph from the drawing. Continuous walls stay solid. A door exists only where the plan shows a swing.",
      "Show ONLY this apartment. Crop away title block, adjacent units, and building core. Do not attach a stair tower to the unit.",
      "Beds only inside rooms listed as bedroom or mmd. No bed in living, hall, kitchen, office, storage, or on a stair.",
      nStudy > 0
        ? `Exactly ${nStudy} office(s). Desk-only rooms (caster chairs, no bed) in the output must equal ${nStudy}. A bedroom with a desk is still a bedroom — put the drawn bed in it. Do not turn it into a second office.`
        : "No office in this unit.",
      internalStairHint(layout),
      nBalc <= 1
        ? "At most one outdoor terrace, only where the plan shows tiled hatching. No wraparound deck. No glass sunroom."
        : `Exactly ${nBalc} outdoor terraces as drawn — small, in the printed locations. No wraparound deck along the bedroom façade. No glass sunroom.`,
      bathrooms.some(isGuestWcRoom)
        ? "A guest WC exists only if the plan draws a toilet pan in a closed cubicle."
        : "No guest WC. Do not invent an entrance sink. A 90 cm mark is a door. A wall niche without an oval basin fixture is empty — not נטילת ידיים, not a toilet room.",
      `Exactly ${countKind(rooms, "kitchen")} kitchen run(s) with cooktop/sink. Do not put a second kitchen in the office, hall, or storage.`,
      nStorage > 0
        ? "חדר שירות / laundry is a washer or shelves. Do not push a toilet into that room."
        : "",
      "Kitchen sinks: copy the plan. A double-bowl sink is ONE fixture on the drawn counter. Do not add a second or third sink. No island sink unless the plan draws a basin on the island. An L-run stays L; do not weld the island into a U-kitchen.",
      "Copy furniture symbols from the plan: dining table size, island stool count, closet blocks, bed rectangles. A bedroom whose printed width fits one bed rectangle stays one twin. Empty ממ\"ד stays empty. Style must not change fixture or furniture count.",
      "Hatched closet rectangles become built-in cabinets with CLOSED doors. Bathrooms show the drawn toilet, basin, and tub — never empty tiled rooms. Omit the CAD entrance arrow.",
      "ZERO letters on the output. Do not paint Hebrew or Latin room names, numbers, or captions on floors or walls.",
    ].join(" ");
  }
  if (view.kind === "isometric") {
    return [
      "Photoreal isometric cutaway of the same apartment, same orientation as the attached plan.",
      "If a photoreal bird's-eye still is attached after the drawing, it is the approved cutaway of THIS unit — match its walls, rooms, and openings. Do not add stairs, extra WC, extra bedroom, or terraces that are not in that still.",
      "Extrude the drawn walls. Do not invent doors. Do not invent wings.",
      "Beds only in bedrooms / ממ\"ד.",
      internalStairHint(layout),
      "Building מעלית / חדר מדרגות next to the entrance is a grey core OUTSIDE the unit — no apartment stair treads there.",
      nBalc <= 1 ? "Do not invent a second outdoor space or a wraparound deck." : `Keep exactly ${nBalc} small terraces as drawn, no wraparound deck.`,
      bathrooms.some(isGuestWcRoom)
        ? "Guest WC only if drawn as a cubicle."
        : "No powder room at the entrance. Do not invent a sink or toilet by the front door unless a basin or pan is drawn.",
      "No text on the image.",
    ].join(" ");
  }
  const focus = view.roomName ?? "";
  const kind = rooms.find((r) => r.name === focus)?.kind ?? inferRoomKind(focus);
  return [
    `Photoreal eye-level photo standing only inside "${focus}" (${kind}).`,
    "This is NOT a studio. Other rooms stay behind walls.",
    interiorGeometryRules(kind, haredi),
    kind !== "bedroom" && kind !== "mmd" ? "Do not place a bed in this room." : "Bedroom only — no kitchen in this volume.",
    kind === "kitchen" ? "Kitchen only — no bed, no Shabbat table, no sofa." : "",
    kind === "bathroom" ? "Bathroom only — no dining table, no sofa, no kitchen." : "",
    kind === "living" ? "Living/dining only. Keep the living volume LARGE as drawn." : "",
    kind === "utility" ? "Laundry / storage only. Washer or shelves. NEVER a toilet — this is חדר שירות, not שירותים." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function interiorGeometryRules(kind: FloorplanRoomKind, haredi = false): string {
  const common = [
    "The attached image is a CROP of this one room from the sales plan (a thickened wall tracing of the same crop may follow). Trace the crop 1:1.",
    "Trace THIS crop 1:1. Do not reconstruct a generic apartment room from memory.",
    "Do not paint CAD dimensions, elevation numbers, or Hebrew labels on walls or floors.",
    "A façade window is not a balcony. Outdoor terrace only if THIS crop contains tiled balcony hatching.",
    "Do not invent doors. Do not add partition walls that are not drawn.",
  ];
  if (kind === "bathroom") {
    common.push(
      "Copy wet fixtures from the crop: bathtub stays a bathtub. Do not add a walk-in shower unless a shower tray is drawn. One toilet only. The toilet pan, oval basin, and tub MUST be visible. Never an empty tiled bathroom. Laundry symbol is a washer, not another wet room.",
    );
  } else if (kind === "kitchen") {
    common.push(
      "Copy the drawn run. A freestanding island/peninsula stays separate — do not weld it to the walls into a U-shape. Kitchen sink: only where the crop draws it. A double-bowl is ONE fixture. No island sink unless a basin is drawn on the island.",
    );
  } else if (kind === "living") {
    common.push(
      "If the crop shows an open living/kitchen volume, keep it open. Do not add a floor-to-ceiling bookcase wall that splits kitchen from dining.",
    );
  } else if (kind === "bedroom" || kind === "mmd") {
    common.push(
      haredi
        ? "HAREDI BEDS: never a double. Copy bed rectangles from THIS crop. One drawn bed = one twin. Two drawn twins = two twins with a visible gap in those positions. Do not add extra beds. Empty room stays empty. Desk if drawn: books and a lamp, never a monitor. ממ\"ד has a small protected window, not a sliding terrace wall."
        : "Copy bed count from the crop (two twins stay two twins, not one double). ממ\"ד has a small protected window, not a sliding terrace wall.",
    );
  } else if (kind === "utility") {
    common.push(
      "Laundry / storage only. Copy a washer or shelves if drawn. NEVER a toilet, bathtub, or basin — חדר שירות is not שירותים.",
    );
  }
  return common.join(" ");
}

export function buildVizPrompt(
  layout: FloorplanLayout,
  view: { kind: FloorplanVizViewId; roomName?: string },
  options?: {
    photo?: boolean;
    styleKit?: FloorplanVizStyleKit;
    inkWall?: boolean;
    massingMap?: boolean;
    /** What the second attachment actually is, so the prompt describes it truthfully. */
    hintKind?: WallHintKind;
  },
): string {
  layout = canonicalizeFloorplanLayout(layout);
  const rooms = roomsForVisualization(layout);
  const kit = options?.styleKit ?? resolveFloorplanVizStyle();
  const focusKind =
    view.kind === "interior"
      ? (rooms.find((r) => r.name === view.roomName)?.kind ?? inferRoomKind(view.roomName ?? ""))
      : undefined;
  const photoBit = options?.photo
    ? "The attached image is a photograph of a paper drawing. Use the thick dark wall lines. Ignore paper texture, shadows, the pale grid, ink blobs, and the table around the sheet."
    : "The attached image is a CAD / sales drawing (not a photo of crumpled paper). Trace the printed wall graph 1:1. Do not reconstruct a generic apartment.";
  const areaBit = layout.grossAreaM2 != null ? `${layout.grossAreaM2.toFixed(2)} m²` : "unknown area";

  if (view.kind === "interior") {
    const focus = view.roomName ?? "";
    const room = rooms.find((r) => r.name === focus);
    const kind = room?.kind ?? inferRoomKind(focus);
    const measure = room ? roomLine(room).replace(/^- /, "") : `${focus} [${kind}]`;
    return `Photograph the interior of ONE room from the attached Israeli sales-plan crop.

${PIXEL_LOCK}

${ORIENTATION_LOCK}

${PRESENTATION_LOCK}

${interiorGeometryRules(kind, kit.audience === "haredi")}
${options?.photo ? "The crop is from a photograph of a paper drawing. Use the thick dark wall lines. Ignore paper texture and the pale grid." : ""}

This is NOT a studio. Stand only inside "${focus}" (${kind}) — ${measure}.
Other rooms stay behind walls. Do not draw the whole apartment. Do not list or label other rooms.
${kind !== "bedroom" && kind !== "mmd" ? "Do not place a bed in this room." : "Bedroom / ממ\"ד only — no kitchen in this volume."}
${kind === "kitchen" ? "Kitchen only — no bed, no Shabbat table, no sofa." : ""}
${kind === "bathroom" ? "Bathroom only — no dining table, no sofa, no kitchen." : ""}
${kind === "living" ? "Living/dining only. Keep the living volume LARGE as drawn." : ""}
${kind === "utility" ? "Laundry / storage only. Washer or shelves. NEVER a toilet — this is חדר שירות, not שירותים." : ""}

STYLE (finishes only — do not change walls):
${stylePromptForView(kit, { kind: view.kind, roomKind: focusKind })}

${ONE_FRAME} No captions. No title block.`;
  }

  const roomBlock = rooms.map((room, i) => roomLine(room, i + 1)).join("\n") || "- (copy rooms from the drawing)";
  const mapBit = options?.massingMap
    ? "Attachment order: (1) original sales sheet — walls AND furniture symbols; (2) thickened wall tracing (WALLS ONLY, looks empty — do not copy that emptiness); (3) translucent color tints on the same sheet — identification hints only. Do not paint numbers onto the photograph."
    : options?.inkWall
      ? "Attachment order: (1) original sales sheet — walls AND furniture symbols; (2) thickened wall tracing (WALLS ONLY, looks empty — copy furniture from the sheet, not from the tracing)."
      : "";

  return `Turn the attached Israeli apartment sales plan into a photorealistic 3D still.

${PIXEL_LOCK}

${ORIENTATION_LOCK}

${GEOMETRY_LOCK}

${PRESENTATION_LOCK}

FORBIDDEN in the output photograph: letters, digits, captions, room names, dimension strings. The drawing's Hebrew is for you to read only.

The attached drawing is the only layout. Copy its walls, rooms, doors, windows, fixtures and stair 1:1. Style kit is finishes only. Do not generate a generic apartment from memory.
Ignore the title/legend strip on the side.

${photoBit}
${mapBit}

${layout.unitLabel ?? "apartment"} · ${layout.floor ?? ""} · ${areaBit} · ceiling ${layout.ceilingHeightM ?? 2.7} m
This is NOT a studio. Keep the living volume LARGE as drawn.

${inventoryBlock(layout, kit.audience === "haredi")}

Rooms (do not write these words on the image):
${roomBlock}

VIEW:
${viewHint(layout, view, kit.audience === "haredi")}

STYLE (finishes only — do not change walls):
${stylePromptForView(kit, { kind: view.kind, roomKind: focusKind })}

${ONE_FRAME} No captions. No title block. ZERO text on floors.`;
}

function collectInlineImages(response: unknown): Array<{ mimeType: string; base64: string }> {
  const images: Array<{ mimeType: string; base64: string }> = [];
  const root = response as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  for (const part of root.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data;
    if (!data) continue;
    images.push({
      mimeType: part.inlineData?.mimeType?.trim() || "image/png",
      base64: data,
    });
  }
  return images;
}

async function generateOneImage(
  prompt: string,
  attachments: Array<{ mimeType: string; base64: string }>,
  options?: { aspectRatio?: string },
): Promise<{ mimeType: string; base64: string }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("חסר מפתח Gemini ליצירת הדמיה");
  const client = new GoogleGenAI({ apiKey });
  let lastErr: unknown = null;
  const imageParts = attachments
    .filter((img) => img.base64)
    .map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));

  for (const model of getFloorplanVizModelChain()) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [...imageParts, { text: prompt }],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(options?.aspectRatio
            ? { imageConfig: { aspectRatio: options.aspectRatio } }
            : {}),
        },
      });
      const images = collectInlineImages(response);
      const first = images[0];
      if (first) return first;
      lastErr = new Error(`Gemini image (${model}) לא החזיר תמונה`);
    } catch (err: unknown) {
      lastErr = err;
      log.warn("image model failed", {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isLikelyGeminiModelUnavailable(err)) continue;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("יצירת ההדמיה נכשלה");
}

export const FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX = 2000;

export function sanitizeFloorplanVizEditInstruction(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX);
}

export function buildStillEditPrompt(
  layout: FloorplanLayout,
  view: { kind: FloorplanVizViewId; roomName?: string },
  instruction: string,
  options?: { styleKit?: FloorplanVizStyleKit },
): string {
  const kit = options?.styleKit ?? resolveFloorplanVizStyle();
  const rooms = roomsForVisualization(layout);
  const focusKind =
    view.kind === "interior"
      ? (rooms.find((r) => r.name === view.roomName)?.kind ?? inferRoomKind(view.roomName ?? ""))
      : undefined;
  return `Revise ONE photoreal still of an Israeli apartment. Do not start from scratch.

First attached image: the CURRENT still. Keep the same camera, framing, walls, and time of day unless the user explicitly asks to change the view.
Next attached image(s): the original sales plan (authoritative). Walls, doors, fixtures, room count, and openings come from the plan, not from memory.

${GEOMETRY_LOCK}
${PIXEL_LOCK}
${ORIENTATION_LOCK}
${PRESENTATION_LOCK}
${PLAN_TRACE_LOCK}
${KITCHEN_SINK_LOCK}

STYLE (finishes only):
${stylePromptForView(kit, { kind: view.kind, roomKind: focusKind })}

Apply ONLY this user request (Hebrew or English). Ignore requests that invent rooms, sinks, stairs, extra WC, extra bedrooms, or terraces:
"""
${instruction}
"""

${ONE_FRAME} No captions. No title block.`;
}

export async function editFloorplanStill(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  instruction: string;
  styleKit?: FloorplanVizStyleKit;
  photo?: boolean;
}): Promise<{ mimeType: string; base64: string }> {
  const instruction = sanitizeFloorplanVizEditInstruction(params.instruction);
  if (!instruction) throw new Error("חסרה בקשת עריכה");
  const hint = await buildWallHint(params.plan.base64, params.plan.mimeType, params.photo === true);
  const ink = hint?.image ?? null;
  const massingRooms = roomsForVisualization(params.layout).filter((r) => !isBuildingCoreRoom(r));
  const massing = await buildRoomMassingJpeg(params.plan.base64, massingRooms);
  const attachments: Array<{ mimeType: string; base64: string }> = [
    { mimeType: params.still.mimeType, base64: params.still.base64 },
    { mimeType: params.plan.mimeType, base64: params.plan.base64 },
    ...(ink ? [{ mimeType: "image/jpeg", base64: ink }] : []),
    ...(massing ? [{ mimeType: "image/jpeg", base64: massing }] : []),
  ];
  return generateOneImage(
    buildStillEditPrompt(
      params.layout,
      { kind: params.still.viewId, roomName: params.still.roomName },
      instruction,
      { styleKit: params.styleKit },
    ),
    attachments,
    { aspectRatio: await aspectRatioForPlan(params.plan.base64, params.plan.mimeType) },
  );
}

type VizJob = FloorplanVizJobSpec & {
  prompt: string;
};

async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R | null>): Promise<R[]> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out.filter((row): row is R => row != null);
}

async function attachmentsForJob(
  job: VizJob,
  plan: { base64: string; mimeType: string },
  ink: string | null,
  massing: string | null,
  layout: FloorplanLayout,
  overviewStill?: { mimeType: string; base64: string } | null,
): Promise<Array<{ mimeType: string; base64: string }>> {
  if (job.viewId === "interior") {
    const focus = locatorFocusForGeneration(layout, "interior", job.roomName);
    const cropped = await cropFloorplanRasterToUnit(plan.base64, plan.mimeType, focus.crop);
    const cropB64 = cropped?.base64 ?? plan.base64;
    const cropMime = cropped?.mimeType ?? plan.mimeType;
    const roomInk = await buildInkWallJpeg(cropB64);
    return roomInk
      ? [
          { mimeType: cropMime, base64: cropB64 },
          { mimeType: "image/jpeg", base64: roomInk },
        ]
      : [{ mimeType: cropMime, base64: cropB64 }];
  }
  const planAtt: Array<{ mimeType: string; base64: string }> = [
    { mimeType: plan.mimeType, base64: plan.base64 },
  ];
  if (ink) planAtt.push({ mimeType: "image/jpeg", base64: ink });
  if (massing) planAtt.push({ mimeType: "image/jpeg", base64: massing });
  if (job.viewId === "isometric" && overviewStill?.base64) {
    planAtt.push(overviewStill);
  }
  return planAtt;
}


/**
 * Turns an audit failure into an instruction.
 *
 * Echoing "1 screen(s) in a haredi still" back at the model told it something
 * was wrong and nothing about what to do instead, and it drew a screen again on
 * all three attempts. Naming the fix — take the panel off the wall, leave the
 * wall bare — is what the retry actually needs.
 */
function remedyFor(failure: string): string {
  if (/screen/i.test(failure)) {
    return "Remove every screen AND whatever it rests on. Take the dark panel off the wall, delete the media unit facing the sofa, and clear every desk, shelf and bedside table of anything dark and rectangular — a closed laptop counts. A desk keeps only closed books, a lamp and a pen cup; the wall stays bare or takes a framed landscape.";
  }
  if (/kitchen sink basins/i.test(failure)) {
    return "Redraw the kitchen sink with exactly the basin count the plan draws — a double-bowl sink is two basins side by side in one counter cut-out, not one large basin.";
  }
  if (/island stools/i.test(failure)) {
    return "Put exactly the drawn number of stools at the island, evenly spaced along its long side.";
  }
  if (/double bed/i.test(failure)) {
    return "Replace every wide mattress with a single 90x200 twin along the long wall — a long narrow rectangle, more than twice as long as it is wide, with one pillow and its own headboard. A drawn double rectangle is a sleeping zone, not a furniture spec, and the master bedroom is not an exception.";
  }
  if (/invented outside|footprint/i.test(failure)) {
    return "Trace the apartment's outer boundary from the plan before furnishing anything, and stay inside it. Do not extend a wing, room or bathroom into space the plan leaves outside the flat, and do not turn a hatched terrace into a room — a paved area with its own area figure stays an open terrace with a railing.";
  }
  if (/beds \d|bedrooms \d/i.test(failure)) {
    return "Count the beds you have drawn before finishing and match the plan exactly — no extra bed to fill a room, no room left without the bed the plan draws in it.";
  }
  if (/unfurnished/i.test(failure)) {
    return "Furnish every enclosed room. An empty floor with bare walls is not acceptable unless the plan draws the room empty.";
  }
  if (/CAD annotation/i.test(failure)) {
    return "Drop every 2D drawing mark: no black entrance triangle, no north arrow, no dimension ticks, no flat hatch on a floor.";
  }
  if (/letters or digits/i.test(failure)) {
    return "Remove all text. No room names, no dimensions, no labels anywhere in the frame.";
  }
  return "Correct this against the plan.";
}

/** How many times a failed audit is worth re-rolling before shipping the least bad frame. */
const MAX_AUDITED_ATTEMPTS = 3;

/**
 * Generate, count what came back, and re-roll when the counts disagree.
 *
 * Only the whole-plan views are audited. An interior close-up shows one room, so
 * apartment-wide counts say nothing about it, and auditing it would spend a
 * vision call to learn nothing.
 */
/**
 * The wall hint the model traces. A PDF carries its walls as vectors, so they can
 * be handed over exactly; a scan only has ink to threshold, which keeps the
 * furniture and dimension chains along with the walls.
 */
export type WallHintKind = "vector-walls" | "footprint" | "ink";

async function buildWallHint(
  base64: string,
  mimeType: string,
  photo: boolean,
): Promise<{ image: string; kind: WallHintKind } | null> {
  if (photo) return null;
  let raster = base64;
  if (mimeType === "application/pdf") {
    const vector = await buildVectorWallJpeg(Buffer.from(base64, "base64"));
    if (vector) return { image: vector, kind: "vector-walls" };
    // Not every PDF is a CAD export. דירה 14 is a scan wrapped in a PDF — one
    // image operator, no paths — and sharp cannot decode a PDF, so the raster
    // fallbacks below were being handed bytes they could do nothing with and
    // every one returned null. The sheet then reached the image model with no
    // wall hint at all, and the still grew an entire invented wing of rooms
    // down its right side. Pull the embedded scan out first.
    const embedded = await extractPdfPageRaster(Buffer.from(base64, "base64"));
    if (!embedded) return null;
    raster = embedded;
  }
  // No vectors to trace — a scan. Pulling individual walls out of a raster was
  // tried twice and made the result worse both times, so hand over the one thing
  // a raster does give up reliably: the outline. The footprint is also what the
  // audit complains about most on these sheets.
  const silhouette = await buildFootprintSilhouetteJpeg(raster);
  if (silhouette) return { image: silhouette, kind: "footprint" };
  const ink = await buildInkWallJpeg(raster);
  return ink ? { image: ink, kind: "ink" } : null;
}

async function generateAuditedImage(
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: {
    layout: FloorplanLayout;
    plan: { base64: string; mimeType: string };
    haredi: boolean;
  },
): Promise<{ mimeType: string; base64: string }> {
  const auditable = job.viewId === "overview" || job.viewId === "isometric";
  let best: { img: { mimeType: string; base64: string }; score: number; failures: string[] } | null = null;
  let lastFailures: string[] = [];

  for (let attempt = 1; attempt <= (auditable ? MAX_AUDITED_ATTEMPTS : 1); attempt++) {
    // A blind re-roll just samples the same distribution again. Telling the model
    // what the previous frame got wrong turns the retry into a correction.
    const prompt = lastFailures.length
      ? `${job.prompt}

PREVIOUS ATTEMPT REJECTED — an audit compared your last frame against the plan.
Each line is what was wrong, then what to do about it:
${lastFailures
          .map((f) => `- ${f}\n  -> ${remedyFor(f)}`)
          .join("\n")}
Fix exactly these and keep everything the audit did not complain about.`
      : job.prompt;
    const img = await generateOneImage(prompt, attachments, { aspectRatio });
    if (!auditable) return img;

    const audit = await auditFloorplanStill(img, ctx.plan);
    if (!audit) return img; // No auditor available — ship what we have rather than stall.

    const { failures, hardFailures, score } = gradeFloorplanStill(audit, ctx.layout, {
      haredi: ctx.haredi,
    });
    if (failures.length === 0) {
      log.info("still passed audit", { view: job.labelHe, attempt });
      return img;
    }
    log.warn("still failed audit", { view: job.labelHe, attempt, failures, hardFailures });
    lastFailures = failures;
    if (!best || score < best.score) best = { img, score, failures };
  }

  if (best) {
    // The score weights a modesty or text failure far above any count mismatch,
    // so this only ships one when every attempt had one.
    log.warn("shipping least-bad still", { view: job.labelHe, failures: best.failures });
    return best.img;
  }
  throw new Error("יצירת ההדמיה נכשלה");
}

export async function generateFloorplanVisuals(
  layout: FloorplanLayout,
  base64: string,
  mimeType: string,
  options?: {
    photo?: boolean;
    styleKit?: FloorplanVizStyleKit;
    scope?: FloorplanVizScope;
    existingImages?: Array<{ viewId: string; roomName?: string }>;
  },
): Promise<FloorplanVizImage[]> {
  const vizLayout = layoutForVisualization(layout);
  const specs = listFloorplanVizJobs(vizLayout, options?.scope ?? "full", options?.existingImages);
  if (specs.length === 0) {
    throw new Error("אין הדמיות נוספות לייצר");
  }
  const hint = await buildWallHint(base64, mimeType, options?.photo === true);
  const ink = hint?.image ?? null;
  const massing = null;
  const aspectRatio = await aspectRatioForPlan(base64, mimeType);
  const overviewOpts = {
    ...options,
    inkWall: Boolean(ink),
    massingMap: Boolean(massing),
    hintKind: hint?.kind,
  };
  const jobs: VizJob[] = specs.map((spec) => ({
    ...spec,
    prompt:
      spec.viewId === "interior"
        ? buildVizPrompt(vizLayout, { kind: "interior", roomName: spec.roomName }, options)
        : buildVizPrompt(vizLayout, { kind: spec.viewId }, overviewOpts),
  }));

  const runJob = async (
    job: VizJob,
    overviewStill?: { mimeType: string; base64: string } | null,
  ): Promise<FloorplanVizImage | null> => {
    try {
      const attachments = await attachmentsForJob(
        job,
        { base64, mimeType },
        ink,
        massing,
        vizLayout,
        overviewStill,
      );
      const img = await generateAuditedImage(job, attachments, aspectRatio, {
        layout: vizLayout,
        plan: { base64, mimeType },
        haredi: options?.styleKit?.audience === "haredi",
      });
      // Stamped after the audit, never before: the auditor fails a still that
      // has letters in it, and this caption is letters on purpose.
      const stamped = await stampFloorplanStill(img, stampFieldsFromLayout(layout));
      return {
        viewId: job.viewId,
        labelHe: job.labelHe,
        roomName: job.roomName,
        mimeType: stamped.mimeType,
        base64: stamped.base64,
      } satisfies FloorplanVizImage;
    } catch (err: unknown) {
      log.warn("view generation skipped", {
        view: job.labelHe,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const overviewJobs = jobs.filter((j) => j.viewId === "overview");
  const restJobs = jobs.filter((j) => j.viewId !== "overview");
  const overviewOut = await runPool(overviewJobs, 1, (job) => runJob(job));
  const overviewStill = overviewOut[0] ?? null;
  const restOut = await runPool(restJobs, IMAGE_CONCURRENCY, (job) => runJob(job, overviewStill));
  const out = [...overviewOut, ...restOut];

  if (out.length === 0) {
    throw new Error("יצירת ההדמיות נכשלה — לא התקבלה אף תמונה");
  }
  return out;
}
