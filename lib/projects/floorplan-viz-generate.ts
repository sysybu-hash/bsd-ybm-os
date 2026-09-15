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
import { overlayKnownSheetProgram } from "@/lib/projects/floorplan-booklet-rooms";
import { hebrewFloorplanAuditIssue as idsHebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";
import {
  auditFloorplanStill,
  gradeFloorplanStill,
  harediModestyFailures,
  surgicallyRemovableFailures,
  type FloorplanVizAudit,
} from "@/lib/projects/floorplan-viz-audit";
import {
  auditStillWithClaude,
  mergeClaudeModestyIntoAudit,
} from "@/lib/projects/floorplan-viz-modesty-claude";
import { isAnthropicConfigured } from "@/lib/ai-providers";
import {
  buildVectorWallJpeg,
  extractFloorplanVectorGeometry,
  extractPdfPageRaster,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";
import { stampFieldsFromLayout, stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import {
  clampFloorplanVizEditRegion,
  editRegionPromptBlock,
  type FloorplanVizEditRegion,
} from "@/lib/projects/floorplan-viz-edit-region";
import { overlayFloorplanVizEditRegion, stripMagentaLocatorFromJpeg, compositeFloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region-overlay";
import {
  buildFootprintSilhouetteJpeg,
  buildInkWallJpeg,
  buildRoomMassingJpeg,
  cropFloorplanRasterToUnit,
} from "@/lib/projects/floorplan-photo-prep";
import {
  HAREDI_BED_PROMPT,
  HAREDI_MODESTY_PROMPT,
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
import { locatorFocusForGeneration } from "@/lib/projects/floorplan-locator";

export type { FloorplanVizScope };
export { listFloorplanVizJobs, parseFloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

const log = createLogger("floorplan-viz-generate");

/**
 * Gemini layout audit (every attempt). Claude is the door judge only —
 * calling it on every re-roll burned money and discarded paid frames when
 * Claude was briefly unavailable.
 */
async function auditStill(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
  _haredi: boolean,
): Promise<FloorplanVizAudit | null> {
  return auditFloorplanStill(still, plan);
}

/**
 * Final grade for a still: Gemini always, Claude merged when configured.
 * Used by the ship gate and by surgical repair so a Claude-only double bed
 * is fixed before we throw away a paid frame.
 */
async function gradeStillForShip(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<{
  gemini: FloorplanVizAudit;
  audit: FloorplanVizAudit;
  grade: ReturnType<typeof gradeFloorplanStill>;
} | null> {
  const gemini = await auditFloorplanStill(still, ctx.plan);
  if (!gemini) return null;
  let audit = gemini;
  if (isAnthropicConfigured()) {
    const claude = await auditStillWithClaude(still, ctx.plan);
    if (claude) audit = mergeClaudeModestyIntoAudit(gemini, claude);
  }
  return {
    gemini,
    audit,
    grade: gradeFloorplanStill(audit, ctx.layout, { haredi: ctx.haredi }),
  };
}

/**
 * Hard fails that still block shipping after repair.
 * Claude-only double-bed / screen flags are dropped — they burned paid frames
 * when Gemini already cleared those props (דירה 19 loops).
 */
function blockingHardFailures(
  hardFailures: string[],
  gemini: FloorplanVizAudit,
): string[] {
  return hardFailures.filter((f) => {
    if (/double bed/i.test(f) && !gemini.hasDoubleBed) return false;
    if (/screen/i.test(f) && gemini.screenCount === 0) return false;
    return true;
  });
}

/**
 * Collect residual audit issues for the UI. Never throws — a paid frame ships
 * with a fix list instead of an empty error.
 */
async function collectShipIssues(
  still: { base64: string; mimeType: string },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  view: string,
): Promise<string[]> {
  const scored = await gradeStillForShip(still, ctx);
  if (!scored) return [];
  const hard = blockingHardFailures(scored.grade.hardFailures, scored.gemini);
  if (hard.length === 0) return [];
  log.warn("shipping photoreal with residual audit issues", { view, failures: hard });
  return hard;
}

/** Re-audit a saved still against its plan — for the UI "סרוק מול תוכנית" button. */
export async function rescanFloorplanStillIssues(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  haredi?: boolean;
}): Promise<string[]> {
  return collectShipIssues(
    params.still,
    {
      layout: params.layout,
      plan: params.plan,
      haredi: params.haredi === true,
    },
    params.still.labelHe,
  );
}

export function hebrewFloorplanAuditIssue(failure: string): string {
  return idsHebrewFloorplanAuditIssue(failure);
}

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
    // The drawing's own bounds beat the page's whenever they can be read. A
    // portrait sheet carrying a flat laid out horizontally used to buy a
    // portrait frame, and the model turned the floor plate on its side to fill
    // it — the audit called that "completely rearranged".
    const fromWalls = await wallBoundsAspect(bytes);
    if (fromWalls) return fromWalls;
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

/**
 * The aspect of the apartment itself, read off the vector walls.
 *
 * Returns null for a scan, for a sheet with too few walls to trust, and for a
 * box so small against the page that it is more likely a stray run of segments
 * than the flat.
 */
async function wallBoundsAspect(pdf: Buffer): Promise<string | undefined> {
  try {
    const geometry = await extractFloorplanVectorGeometry(pdf);
    if (!geometry || geometry.walls.length < 25) return undefined;
    const box = wallBoundingBox(geometry);
    if (!box) return undefined;
    const pageArea = geometry.pageWidth * geometry.pageHeight;
    if (pageArea <= 0) return undefined;
    if ((box.width * box.height) / pageArea < 0.12) return undefined;
    return nearestGeminiImageAspect(box.width, box.height);
  } catch {
    return undefined;
  }
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
    const kind = room.kind ?? inferRoomKind(room.name);
    bits.push(
      room.bedCount === 0
        ? kind === "bedroom"
          ? "copy the drawn bed — never empty"
          : "no beds"
        : room.bedCount === 1
          ? "1 twin bed"
          : `${room.bedCount} twin beds`,
    );
  } else if ((room.kind ?? inferRoomKind(room.name)) === "bedroom") {
    bits.push("copy the drawn bed — never empty");
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
  const bedInventory =
    totalBeds > 0
      ? `TOTAL BEDS IN THE WHOLE APARTMENT: exactly ${totalBeds}. Count every bed you have drawn before finishing: the sum across all rooms must be ${totalBeds}, not ${totalBeds + 1} and not ${totalBeds + 2}. A room listed with 1 twin bed gets one bed and no second one. A bedroom with a drawn rectangle that has no mattress is a failed still.`
      : nBed > 0
        ? `TOTAL BEDS: copy every bed rectangle on the sales sheet. ${nBed} bedroom(s) — none may be an empty floor. A drawn bed missing from the still is a failed result. Do not invent a total of 0.`
        : "TOTAL BEDS: copy bed rectangles from the drawing. Do not invent beds.";
  return [
    "EXACT INVENTORY — copy these enclosed spaces from the drawing, nothing else:",
    `living ${countKind(rooms, "living")}, kitchen ${nKitchen} (exactly ${nKitchen} — do not add another), bedroom ${nBed} (exactly ${nBed}), mmd ${countKind(rooms, "mmd")}, bathroom ${countKind(rooms, "bathroom")}, balcony ${countKind(rooms, "balcony")}, office/study ${nStudy}, storage ${nStorage}`,
    bedInventory,
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
    terraceIndoorLock(rooms),
    "The wall tracing is walls only and looks empty — copy furniture from the sales sheet, not from that tracing.",
  ]
    .filter(Boolean)
    .join("\n");
}

function balconyCount(rooms: FloorplanRoom[]): number {
  return rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony").length;
}

function terraceIndoorLock(rooms: FloorplanRoom[]): string {
  const terraces = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony");
  const figures = terraces
    .map((room) => room.areaM2)
    .filter((n): n is number => n != null && n > 0)
    .map((n) => n.toFixed(2));
  const pockets =
    figures.length > 0
      ? `Printed terrace pockets: ${figures.join(" + ")} m². Each is a SMALL hatched strip (4 m² is about as deep as a doorway), in the printed place, with a railing.`
      : "Terraces exist only where the sheet hatches a pocket with its own area figure.";
  return `${pockets} Brick or paving hatch labelled מרפסת / שטח המרפסת is OUTDOOR: pale paving, a railing, open to the sky. Never furnish it as an indoor sitting room, office, bedroom or hall — no wood floor, no sofa, no desk, no bed. NEVER put stairs on a terrace. Stairs to a higher ⊕ elevation are roof access on another sheet — do not pull that roof terrace into this floor plate, do not invent steps up to it, and do not merge it with a same-level pocket into one patio the size of a bedroom. A 4–5 m² pocket is about as deep as a doorway — if it comes out as large as a bedroom it is wrong. Indoor living, kitchen, hall and entrance (מבואה) stay wood floor under a roof. Do not convert them to outdoor paving. Do not turn the front door / כניסה into a terrace. Do not merge terraces into one deck along the kitchen, living, entrance, or bedroom wall. The large open kitchen/dining/living volume stays one indoor room — do not squeeze the sofas into a narrow strip and pave the rest.`;
}

function internalStairHint(layout: FloorplanLayout): string {
  if (!layoutHasInternalStairs(layout)) {
    return "NO STAIR in this apartment — not indoors, not on a terrace, not to a roof. Building core (מעלית / חדר מדרגות) stays outside the unit. Do not invent treads, steps, or a stair volume on any balcony.";
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
  "Output ONE photorealistic sales-brochure bird's-eye cutaway of this apartment only. Forbidden: collage, grid, triptych, stacked panels (exterior over plan), porch/street elevation of a different house, labeled schematic, CAD arrows, empty tiled bathrooms, open closet rails, dollhouse with room names painted on floors.";

/**
 * First instruction the model reads. Later locks fill details; this settles
 * the CAD-vs-pretty fight: the sheet wins on layout, golden-hour wins on look.
 */
export const SALES_BROCHURE_BRIEF = `
SALES BROCHURE — one job, two authorities:
1. LAYOUT: the attached sales sheet wins. Same walls, same rooms, same doors, same windows, same fixture counts, same furniture symbols. Do not invent a prettier different apartment.
2. LOOK: a photoreal photograph of a lived-in Israeli home at golden hour. Warm oak, cream plaster, lamps ON, rugs and small props on furniture that already exists. Not a CAD colouring page. Not a vacant white model. Not a labeled dollhouse.

If a later sentence argues, layout still wins on walls and counts, and this look still wins on finish and light.
`.trim();

export const GEOMETRY_LOCK = `
GEOMETRY — the sales drawing is the only floor plate:
- Extrude the printed wall graph 1:1, same orientation as the sheet. Do not invent a corridor apartment from memory.
- Do not invent a generic rectangular apartment. If the printed outline is irregular, the still's outline is that same irregular shape.
- Do not mirror the unit. Do not swap kitchen and living. Do not drop the ממ"ד. Do not invent a walk-in closet wing. Do not weld an island into a U-kitchen unless those walls are drawn.
- Kitchen stays where the cooktop/sink run is drawn. Living/dining stays where the dining table and any drawn sofa are. If the sheet draws only a dining table, there is no sofa. Bedrooms stay where the bed rectangles are drawn — a bedroom with a drawn bed is never empty floor.
- Color tints on a copy of the sheet are identification hints only. If a tint rectangle disagrees with a drawn wall, follow the wall.
- Furniture follows CAD symbols: one dining table if one is drawn, island stools as drawn, office = enclosed desks, empty ממ"ד stays empty.
- Indoor rooms stay indoor. Do not convert living, kitchen, hall, entrance (מבואה / כניסה) or bedrooms into outdoor paving or a courtyard. The front door is not a terrace. Terraces exist only where the sheet hatches them with a printed area figure, and they stay that small — never a deck down the kitchen, living, or entrance wall. Never turn a hatched terrace into an indoor sitting room.
- A terrace whose elevation mark differs from the unit's ⊕ is a roof terrace. Do not pull it into this floor as a room. Stairs up to it stay outdoor.
- Do not 3D-print CAD annotations (entrance arrows, north marks, ticks, hatch). Closet hatch = cabinets with doors. Wet pans = toilets/basins/tubs in those rooms.
- ZERO numbers, letters, or color-block captions on the photograph.
`.trim();

/**
 * When CAD massing is attached after the sales sheet: layout lock, not look.
 * Using that JPEG as the only "plan" made the model invent a different unit.
 */
export const CAD_MASSING_LOCK =
  "Attachment order when CAD massing is present: (1) CAD 3D massing of THIS apartment — photograph these walls, rooms, doors and furniture positions at golden hour; (2) original sales sheet — furniture symbols, wet fixtures, and printed terrace pockets; (3) wall tracing if present. The FIRST image is the apartment. Do not invent a different unit. If CAD and the sales sheet disagree on what a space is, the sheet wins: brick-hatched מרפסת stays outdoor even when CAD shows indoor floor there; a toilet/tub/basin the sheet draws is a bathroom even if CAD dropped the wet room; a terrace whose ⊕ differs from the unit's is a roof terrace, not a furnished room on this floor. Do not open a terrace where the CAD shows indoor floor and a front door. The outer-wall door next to the stair/lift core is the entrance hall (מבואה): indoor floor and a door, never paving or planters. Do not copy the CAD colouring-page look or 2D marks (entrance triangles, ticks, hatch).";

/**
 * The front door is indoor. These sheets keep getting a fake terrace there.
 */
export const ENTRANCE_LOCK = `
ENTRANCE (כניסה / מבואה) — non-negotiable:
- Find the front door on the sheet: the swing or triangle in the outer wall next to חדר מדרגות / מעלית / the building corridor.
- That door opens INTO the apartment. The space just inside it is an indoor entrance hall (מבואה): a roof, a door in a solid wall, indoor floor.
- The door LEAF must be visible in the still — ajar or closed in the opening. An unbroken outer wall where the plan draws the entrance is a failed still. A balcony slider is NOT the front door.
- It is NOT a terrace, balcony, courtyard, or open deck. Do not put paving, planters, or open sky where the entrance is.
- Do not replace the entrance with a terrace. Terraces exist only where the sheet hatches a pocket labelled מרפסת with its own area figure, elsewhere on the sheet.
- A black entrance triangle is a 2D drawing mark. Do not paint it on the floor. Build a real door and an indoor hall there.
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
      "Trace the wall graph from the drawing. Continuous walls stay solid. A door exists only where the plan shows a swing — and that door MUST appear as a visible door leaf in the outer wall (כניסה), never sealed shut.",
      "Show ONLY this apartment. Crop away title block, adjacent units, and building core. Do not attach a stair tower to the unit.",
      "NEVER render חדר מדרגות, a lift shaft, grey concrete stairs, OR outdoor stair runs on a terrace. Those are the building or a roof above this floor. If the sheet's מרפסת is at a different ⊕ elevation than the flat, do not pull it onto this plate and do not invent steps up to it. The only stairs allowed are printed מדרגות פנים inside the unit — and only when the layout says so.",
      "Do not invent a terrace on a façade that has no hatched מרפסת pocket. The living room's outer walls stay walls.",
      "Beds only inside rooms listed as bedroom or mmd. No bed in living, hall, kitchen, office, storage, or on a stair.",
      nStudy > 0
        ? `Exactly ${nStudy} office(s). Desk-only rooms (caster chairs, no bed) in the output must equal ${nStudy}. A bedroom with a desk is still a bedroom — put the drawn bed in it. Do not turn it into a second office.`
        : "No office in this unit.",
      internalStairHint(layout),
      terraceIndoorLock(rooms),
      nBalc <= 1
        ? "At most one outdoor terrace, only where the plan shows tiled hatching. No wraparound deck along ANY façade. No glass sunroom."
        : `Exactly ${nBalc} outdoor terraces as drawn — small, in the printed locations. No wraparound deck along ANY façade (kitchen, living, or bedroom). No glass sunroom.`,
      bathrooms.some(isGuestWcRoom)
        ? "A guest WC exists only if the plan draws a toilet pan in a closed cubicle."
        : "No guest WC. Do not invent an entrance sink. A 90 cm mark is a door. A wall niche without an oval basin fixture is empty — not נטילת ידיים, not a toilet room.",
      `Exactly ${countKind(rooms, "kitchen")} kitchen run(s) with cooktop/sink. Do not put a second kitchen in the office, hall, or storage.`,
      nStorage > 0
        ? "חדר שירות / laundry is a washer or shelves. Do not push a toilet into that room."
        : "",
      "Kitchen sinks: copy the plan. A double-bowl sink is ONE fixture on the drawn counter. Do not add a second or third sink. No island sink unless the plan draws a basin on the island. An L-run stays L; do not weld the island into a U-kitchen.",
      "Copy furniture symbols from the plan: dining table size and the exact chair count around it, island stool count, closet blocks, bed rectangles. If the living draws only a dining table, do not add a sofa or armchair. A bedroom with a drawn bed rectangle must have a mattress — never empty floor with only a closet. Empty ממ\"ד stays empty. Style must not change fixture or furniture count.",
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
      nBalc <= 1 ? "Do not invent a second outdoor space or a wraparound deck along ANY façade." : `Keep exactly ${nBalc} small terraces as drawn, no wraparound deck along ANY façade.`,
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
      "Copy wet fixtures from the crop EXACTLY: a bathtub outline stays a bathtub; a washing-machine / כביסה symbol stays a floor washer — NEVER replace a drawn washer with a bathtub. Do not add a walk-in shower unless a shower tray is drawn. One toilet only. The toilet pan, oval basin, and every drawn wet/laundry fixture MUST be visible. Never an empty tiled bathroom.",
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
    /** CAD 3D massing of this same unit is attached after the sheet. */
    geometryLock?: boolean;
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
  const photoBit = options?.geometryLock
    ? "The FIRST attached image is a 3D CAD massing of THIS apartment. Photograph those walls, rooms, doors and furniture positions. The sales sheet after it confirms symbols, wet fixtures and printed terrace pockets — if CAD shows indoor floor where the sheet hatches מרפסת, the sheet wins and that pocket stays outdoor. Do not invent a different unit."
    : options?.photo
      ? "The attached image is a photograph of a paper drawing. Use the thick dark wall lines. Ignore paper texture, shadows, the pale grid, ink blobs, and the table around the sheet."
      : "The attached image is a CAD / sales drawing (not a photo of crumpled paper). Trace the printed wall graph 1:1. Do not reconstruct a generic apartment.";
  const areaBit = layout.grossAreaM2 != null ? `${layout.grossAreaM2.toFixed(2)} m²` : "unknown area";

  if (view.kind === "interior") {
    const focus = view.roomName ?? "";
    const room = rooms.find((r) => r.name === focus);
    const kind = room?.kind ?? inferRoomKind(focus);
    const measure = room ? roomLine(room).replace(/^- /, "") : `${focus} [${kind}]`;
    return `${SALES_BROCHURE_BRIEF}

Photograph the interior of ONE room from the attached Israeli sales-plan crop.

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
  const mapBit = [
    options?.geometryLock
      ? CAD_MASSING_LOCK
      : options?.massingMap
        ? "Attachment order: (1) original sales sheet — walls AND furniture symbols; (2) thickened wall tracing (WALLS ONLY, looks empty — do not copy that emptiness); (3) translucent color tints on the same sheet — identification hints only. Do not paint numbers onto the photograph."
        : options?.inkWall
          ? "Attachment order: (1) original sales sheet — walls AND furniture symbols; (2) thickened wall tracing (WALLS ONLY, looks empty — copy furniture from the sheet, not from the tracing)."
          : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `${SALES_BROCHURE_BRIEF}

${kit.audience === "haredi"
    ? `CLIENT LOCK (non-negotiable — a still that breaks any line below is unusable):\n${HAREDI_MODESTY_PROMPT}\n\n${HAREDI_BED_PROMPT}\n`
    : ""}
${options?.geometryLock
    ? "Photograph the attached CAD 3D massing of this Israeli apartment as a photorealistic golden-hour still. Same walls, same rooms, same doors."
    : "Turn the attached Israeli apartment sales plan into a photorealistic 3D still."}

${PIXEL_LOCK}

${ORIENTATION_LOCK}

${GEOMETRY_LOCK}

${ENTRANCE_LOCK}

${PRESENTATION_LOCK}

FORBIDDEN in the output photograph: letters, digits, captions, room names, dimension strings. The drawing's Hebrew is for you to read only.

${options?.geometryLock
  ? "The CAD massing is the only layout. Copy its walls, rooms, doors and furniture positions 1:1. The sales sheet confirms symbols. Style kit is finishes only. Do not generate a generic apartment from memory."
  : "The attached drawing is the only layout. Copy its walls, rooms, doors, windows, fixtures and stair 1:1. Style kit is finishes only. Do not generate a generic apartment from memory."}
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

export const FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX = 8000;

export function sanitizeFloorplanVizEditInstruction(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, FLOORPLAN_VIZ_EDIT_INSTRUCTION_MAX);
}

export function buildStillEditPrompt(
  _layout: FloorplanLayout,
  _view: { kind: FloorplanVizViewId; roomName?: string },
  instruction: string,
  options?: { styleKit?: FloorplanVizStyleKit; region?: FloorplanVizEditRegion | null },
): string {
  const kit = options?.styleKit ?? resolveFloorplanVizStyle();
  const locator = options?.region ? `\n${editRegionPromptBlock(options.region)}\n` : "";
  const haredi = kit.audience === "haredi";
  const improve = /SURGICAL IMPROVE/i.test(instruction);
  const planRole = options?.region
    ? "The SECOND attached image is a BLACK MASK with a magenta locator rectangle — it is not the apartment. Change ONLY what sits inside that rectangle on the FIRST image. Pixels outside it must match the FIRST image exactly. Do not copy the magenta stroke."
    : improve
      ? "Next attached images include the original sales plan (and optional wall/massing hints). The plan is AUTHORITATIVE for walls, doors, מרפסת pockets and room identity — fix the still TO MATCH the plan. Do not invent a foyer where the sheet draws מרפסת. Do not invent laundry where the sheet draws none."
      : "Next attached image is the original sales plan, for fixture identity only — do not rebuild the flat from it.";
  return `SURGICAL EDIT — the FIRST attached image is the finished still. It is already the apartment. Do not start from scratch. Do not restage.

USER REQUEST (do this, nothing else):
"""
${instruction}
"""
${locator}
Keep the same camera, framing, walls, rooms, furniture, materials and golden-hour light except where the request changes them. A revision that comes back cooler, greyer, or with new furniture the first image did not have is a failed revision.
${planRole}
Do not add a sofa, TV, laptop, extra bed, extra desk, or terrace the first image does not already have, unless the user asked for that OR the sales plan requires restoring a printed מרפסת / door the still got wrong.
${haredi ? HAREDI_MODESTY_PROMPT : "Do not invent a TV, laptop, tablet, or dark rectangular slab on a desk, nightstand or wall unless the user asked for a screen."}

STYLE reminder (finishes of the existing furniture only — do not restage rooms):
${kit.promptBlock}

${ONE_FRAME} No captions. No title block.`;
}

async function stripHarediModestyFromStill(
  still: { mimeType: string; base64: string },
  plan: { mimeType: string; base64: string },
  layout: FloorplanLayout,
): Promise<{ mimeType: string; base64: string }> {
  const before = await auditStill(still, plan, true);
  if (!before) return still;
  const beforeGrade = gradeFloorplanStill(before, layout, { haredi: true });
  const targets = harediModestyFailures(beforeGrade.hardFailures);
  if (targets.length === 0) return still;
  const prompt = `SURGICAL EDIT — the FIRST image is the finished still.
Fix ONLY the modesty failures below. Same camera, same golden-hour light, same walls and rooms.
${targets.map((f) => `- ${f}\n  -> ${remedyFor(f)}`).join("\n")}
${HAREDI_MODESTY_PROMPT}
${HAREDI_BED_PROMPT}
${ONE_FRAME}`;
  try {
    const img = await generateOneImage(prompt, [still, plan], {
      aspectRatio: await aspectRatioForPlan(plan.base64, plan.mimeType),
    });
    const cleaned = await stripMagentaLocatorFromJpeg(img);
    const after = await auditStill(cleaned, plan, true);
    if (!after) return still;
    const afterGrade = gradeFloorplanStill(after, layout, { haredi: true });
    return afterGrade.score < beforeGrade.score ? cleaned : still;
  } catch (err: unknown) {
    log.warn("haredi modesty strip after edit failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return still;
  }
}

export async function editFloorplanStill(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  instruction: string;
  styleKit?: FloorplanVizStyleKit;
  photo?: boolean;
  region?: FloorplanVizEditRegion | null;
}): Promise<{ mimeType: string; base64: string }> {
  const instruction = sanitizeFloorplanVizEditInstruction(params.instruction);
  if (!instruction) throw new Error("חסרה בקשת עריכה");
  const region = clampFloorplanVizEditRegion(params.region);
  const hint = await buildWallHint(params.plan.base64, params.plan.mimeType, params.photo === true);
  const ink = hint?.image ?? null;
  const massingRooms = roomsForVisualization(params.layout).filter((r) => !isBuildingCoreRoom(r));
  const massing = await buildRoomMassingJpeg(params.plan.base64, massingRooms);
  const marked = region ? await overlayFloorplanVizEditRegion(params.still, region) : null;
  const attachments: Array<{ mimeType: string; base64: string }> = [
    { mimeType: params.still.mimeType, base64: params.still.base64 },
    ...(marked ? [marked] : []),
    { mimeType: params.plan.mimeType, base64: params.plan.base64 },
    ...(ink ? [{ mimeType: "image/jpeg", base64: ink }] : []),
    ...(massing ? [{ mimeType: "image/jpeg", base64: massing }] : []),
  ];
  const generated = await generateOneImage(
    buildStillEditPrompt(
      params.layout,
      { kind: params.still.viewId, roomName: params.still.roomName },
      instruction,
      { styleKit: params.styleKit, region },
    ),
    attachments,
    { aspectRatio: await aspectRatioForPlan(params.plan.base64, params.plan.mimeType) },
  );
  let result = await stripMagentaLocatorFromJpeg(generated);
  if (region) {
    result = await compositeFloorplanVizEditRegion(params.still, result, region);
  }
  if (params.styleKit?.audience === "haredi") {
    result = await stripHarediModestyFromStill(result, params.plan, params.layout);
  }
  return result;
}

/** "שפר תמונה" — surgical fix of residual audit issues on the existing frame. */
/** Failures that mean walls/openings must change — not a paint-over. */
function isStructuralFloorplanFailure(failure: string): boolean {
  return /front door missing|stair flight|invented outside|terrace\(s\) invented|terrace\(s\) grown|outdoor paving|indoor room\(s\) rendered|turned into a terrace|entrance turned|roomsOutside|mirrored|turned \d+ degrees|CAD block massing|footprint/i.test(
    failure,
  );
}

function mergeImproveFailures(
  stored: string[],
  fresh: string[],
  layout: FloorplanLayout,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of [...fresh, ...stored]) {
    const key = f.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  const hasStructural = out.some(isStructuralFloorplanFailure);
  const onlyModesty =
    out.length > 0 && out.every((f) => /screen|double bed/i.test(f));
  // When the UI only packed a screen (דירה 21), still force entrance + stairs.
  if (!hasStructural || onlyModesty) {
    if (!out.some((f) => /front door missing/i.test(f))) {
      out.push("front door missing where the plan draws the entrance");
    }
    if (!out.some((f) => /stair flight/i.test(f))) {
      out.push("1 stair flight(s) inside a flat the plan draws on one level");
    }
  }
  // Do not auto-inject "delete terrace" here. On דירה 21 it competed with
  // invented-room fixes; on דירה 22 the sheet prints 3.3+8.0 m² pockets that
  // truth tags as a higher ⊕ — forcing delete wiped a real balcony.
  if (out.length === 0) {
    out.push(
      "front door missing where the plan draws the entrance",
      "1 stair flight(s) inside a flat the plan draws on one level",
    );
  }
  return prioritizeImproveFailures(out);
}

/** Outline / entrance first; terrace deletes last so they cannot steal the edit. */
function prioritizeImproveFailures(failures: string[]): string[] {
  const rank = (f: string): number => {
    if (/invented outside|roomsOutside/i.test(f)) return 0;
    if (/front door missing|stair flight/i.test(f)) return 1;
    if (/washer|bathtub|fridge|wet fixture/i.test(f)) return 2;
    if (/terrace|outdoor paving|indoor room/i.test(f)) return 9;
    return 5;
  };
  return [...failures].sort((a, b) => rank(a) - rank(b));
}

export function buildFloorplanImproveInstruction(failures: string[]): string {
  const fixingInventedRooms = failures.some((f) => /invented outside|roomsOutside/i.test(f));
  const fixingTerrace = failures.some((f) => /terrace|furnished as indoor|outdoor paving/i.test(f));
  const fixingEntrance = failures.some((f) => /front door missing|entrance/i.test(f));
  // While fixing an invented indoor wing, drop terrace-delete lines entirely —
  // they competed with the outline fix and wiped a balcony on דירה 21.
  const focused = fixingInventedRooms
    ? failures.filter((f) => !/terrace\(s\) invented|terrace\(s\) grown|outdoor paving covers/i.test(f))
    : failures;
  const lines = focused
    .slice(0, 4)
    .map((f) => `- ${f}\n  -> ${remedyFor(f)}`)
    .join("\n");
  const keepTerraces = fixingInventedRooms
    ? `
CRITICAL: The defect is an INDOOR wing/corridor glued OUTSIDE the apartment outline (often beside the entrance / stair core). Delete THAT indoor strip only. Do NOT delete, shrink, or erase any מרפסת / balcony as a substitute. Do not trade outdoor paving for the invented rooms.`
    : "";
  const terraceVsEntrance =
    fixingTerrace && fixingEntrance
      ? `
CRITICAL (דירה-style sheets): מרפסת and כניסה are DIFFERENT walls. Find שטח המרפסת hatch on the sheet — restore that pocket as outdoor paving at the printed m². Find the entrance swing on a DIFFERENT outer wall — put the door THERE only. Never turn a balcony into a foyer; never put the front door on a מרפסת façade.`
      : fixingTerrace
        ? `
CRITICAL: Restore printed מרפסת pockets from the sheet (size + place). Delete invented laundry/foyer furniture in those pockets. Do not invent an entrance hall there.`
        : "";
  return `SURGICAL IMPROVE — the FIRST image is the finished still of THIS apartment. The NEXT attachment is the sales plan (authoritative).
Output ONE bird's-eye cutaway frame only — same camera height, same golden-hour light, same overall footprint.
FORBIDDEN: exterior street/porch elevation, duplex collage, two stacked panels, a different house, reinventing the flat from memory, turning מרפסת into מבואה.
Fix ONLY these defects (prefer deleting wrong things over rebuilding rooms):
${lines}
Keep every wall and room the plan already matches. Do not invent a porch, façade of glass doors, or a second building.${keepTerraces}${terraceVsEntrance}`;
}

/**
 * Reject improve outputs that abandoned the sales still (dual panels / house exterior).
 * Cheap pixel heuristic — does not need another paid auditor call.
 */
async function looksLikeAbandonedFloorplanStill(
  before: { base64: string },
  after: { base64: string },
): Promise<boolean> {
  try {
    const [bMeta, aMeta] = await Promise.all([
      sharp(Buffer.from(before.base64, "base64")).metadata(),
      sharp(Buffer.from(after.base64, "base64")).metadata(),
    ]);
    const bw = bMeta.width ?? 0;
    const bh = bMeta.height ?? 0;
    const aw = aMeta.width ?? 0;
    const ah = aMeta.height ?? 0;
    if (aw < 32 || ah < 32) return true;
    // Two-panel brochure (exterior over plan) is much taller than the original cutaway.
    if (bh > 0 && ah / Math.max(bh, 1) > 1.45 && ah / Math.max(aw, 1) > 1.35) return true;
    // Extreme aspect flip vs the source still.
    if (bw > 0 && bh > 0) {
      const bRatio = bw / bh;
      const aRatio = aw / ah;
      if (bRatio > 0.2 && (aRatio / bRatio > 2.2 || bRatio / aRatio > 2.2)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** "שפר תמונה" — surgical fix of residual audit issues on the existing still. */
export async function improveFloorplanStill(params: {
  layout: FloorplanLayout;
  still: FloorplanVizImage;
  plan: { base64: string; mimeType: string };
  styleKit?: FloorplanVizStyleKit;
  photo?: boolean;
  failures?: string[];
  /** When set, fix only these lines — no auto-injected stairs/terrace extras. */
  selectedOnly?: boolean;
}): Promise<{ mimeType: string; base64: string; auditIssues?: string[] }> {
  const haredi = params.styleKit?.audience === "haredi";
  const ctx = {
    layout: params.layout,
    plan: params.plan,
    haredi: haredi === true,
  };
  const fresh = await collectShipIssues(params.still, ctx, params.still.labelHe);
  const selected = (params.failures ?? []).map((f) => f.trim()).filter(Boolean);
  const failures =
    params.selectedOnly && selected.length > 0
      ? prioritizeImproveFailures(selected)
      : mergeImproveFailures(selected.length ? selected : (params.still.auditIssues ?? []), fresh, params.layout);
  const beforeScore = fresh.length;
  const instruction = buildFloorplanImproveInstruction(failures);
  // Never use a free "walls may change / rebuild" path — that produced a
  // different house with an exterior+plan collage on דירה 21.
  const edited = await editFloorplanStill({
    layout: params.layout,
    still: params.still,
    plan: params.plan,
    instruction,
    styleKit: params.styleKit,
    photo: params.photo,
  });
  if (await looksLikeAbandonedFloorplanStill(params.still, edited)) {
    log.warn("improve abandoned the cutaway still; keeping prior frame", {
      view: params.still.labelHe,
    });
    return {
      mimeType: params.still.mimeType,
      base64: params.still.base64,
      auditIssues: failures.length ? failures : params.still.auditIssues,
    };
  }
  const residual = await collectShipIssues(edited, ctx, params.still.labelHe);
  // If the "fix" is worse, keep the paid frame the user already had.
  if (residual.length > beforeScore + 1) {
    log.warn("improve scored worse than before; keeping prior frame", {
      view: params.still.labelHe,
      before: beforeScore,
      after: residual.length,
    });
    return {
      mimeType: params.still.mimeType,
      base64: params.still.base64,
      auditIssues: failures.length ? failures : params.still.auditIssues,
    };
  }
  return {
    ...edited,
    auditIssues: residual.length ? residual : undefined,
  };
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

export function floorplanOverviewAttachments(input: {
  plan: { mimeType: string; base64: string };
  ink?: string | null;
  massing?: string | null;
  geometryLock?: { mimeType: string; base64: string } | null;
}): Array<{ mimeType: string; base64: string }> {
  const inkAtt = input.ink ? [{ mimeType: "image/jpeg" as const, base64: input.ink }] : [];
  const massingAtt = input.massing ? [{ mimeType: "image/jpeg" as const, base64: input.massing }] : [];
  if (input.geometryLock?.base64) {
    return [input.geometryLock, input.plan, ...inkAtt, ...massingAtt];
  }
  return [input.plan, ...inkAtt, ...massingAtt];
}

async function attachmentsForJob(
  job: VizJob,
  plan: { base64: string; mimeType: string },
  ink: string | null,
  massing: string | null,
  layout: FloorplanLayout,
  overviewStill?: { mimeType: string; base64: string } | null,
  geometryLock?: { mimeType: string; base64: string } | null,
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
  const planAtt = floorplanOverviewAttachments({
    plan,
    ink,
    massing,
    geometryLock,
  });
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
    return "Remove every screen AND whatever it rests on. Take the dark panel off the wall, delete the media unit facing the sofa, and clear every desk, shelf and bedside table of anything dark and rectangular — a closed laptop counts. A desk keeps only closed books, a lamp and a pen cup. Put NOTHING in the screen's place: that wall stays bare and the floor in front of it stays clear. Never lay a picture, a canvas or a panel flat on the floor — the only rectangle on a floor is an area rug.";
  }
  if (/kitchen sink basins/i.test(failure)) {
    return "Redraw the kitchen sink with exactly the basin count the plan draws — a double-bowl sink is two basins side by side in one counter cut-out, not one large basin.";
  }
  if (/island stools/i.test(failure)) {
    return "Put exactly the drawn number of stools at the island, evenly spaced along its long side.";
  }
  if (/double bed/i.test(failure)) {
    return "Replace EVERY wide mattress with a single 90x200 twin along the long wall — long narrow rectangle, more than twice as long as it is wide, ONE pillow, ONE headboard, at most ONE nightstand. Remove the second nightstand. Two pillows under one headboard is still a double. The master bedroom is not an exception. Do this in every bedroom that has a wide bed.";
  }
  if (/turned \d+ degrees/i.test(failure)) {
    return "The whole flat is turned the wrong way round. Rebuild it in the plan's orientation: read off the sheet which edge the bathrooms sit against and which edge the kitchen sits against, and put them against those same edges of the frame. Do not rotate the plan by any amount for a better fit to the canvas.";
  }
  if (/mirrored/i.test(failure)) {
    return "The whole flat is flipped. Rebuild it the way round the plan draws it: find the entrance door on the sheet, note which side of the flat it is on, and put it on that same side of the frame — then lay the kitchen, the terrace and the bedrooms out around it in the plan's order, left to right. Do not flip, mirror or reflect the plan for any reason.";
  }
  if (/invented outside|roomsOutside|footprint/i.test(failure)) {
    return "Delete the INDOOR rooms/corridor that sit OUTSIDE the apartment outline on the sheet — usually a long utility strip or wing glued beside the entrance / stair core / elevator that the plan leaves as common space. Trace the printed flat boundary and keep ONLY what is inside it. Do NOT delete a מרפסת / balcony / outdoor paving to 'fix' this — outdoor decks are a different defect. Do not shrink living rooms or erase terraces as a substitute.";
  }
  if (/front door missing|entrance door missing/i.test(failure)) {
    return "Find the entrance swing / door leaf on the SALES PLAN (usually on the outer wall next to חדר מדרגות / מעלית / the corridor — on דירה 22 it is on the living-room side opposite the small מרפסת). Cut ONLY that wall open and put a door leaf there. NEVER put the front door on a façade the plan hatches as מרפסת. NEVER turn a balcony pocket into a foyer / מבואה. A balcony slider is not the front door.";
  }
  if (/furnished as indoor/i.test(failure)) {
    return "The pocket the plan hatches as מרפסת / שטח המרפסת (with a printed m² figure) must be OUTDOOR again: pale paving, railing, open sky — at the printed size only. Take out wood floor, sofas, desks, laundry machines, and any foyer furniture. NEVER convert that pocket into an entrance hall or מבואה — the front door is a different wall on the sheet.";
  }
  if (/indoor room\(s\) rendered as outdoor|paving covers living|merged into one deck|entrance turned into a terrace|grown larger than the printed pocket/i.test(failure)) {
    return "Indoor living/kitchen/hall stay indoor floors under a roof. Terraces are ONLY the hatched pockets with printed area figures — keep each pocket separate at its printed size (e.g. 3.3 m² and 8.0 m² stay two pockets). Do not pull a roof terrace onto this floor or merge pockets into one courtyard. Do not invent a foyer where the sheet draws מרפסת.";
  }
  if (/terrace\(s\) invented|terrace\(s\) grown|outdoor paving covers/i.test(failure)) {
    return "Shrink or split outdoor paving to match the printed מרפסת pockets on the sheet (printed m² and outline). Remove paving, railing and outdoor furniture that sit where the plan has no hatch. Do not delete a pocket the sheet does print. Do not replace a balcony with an entrance hall.";
  }
  if (/left without a bed/i.test(failure)) {
    return "Every bedroom the plan draws a bed rectangle in must have a mattress. The empty room with only a wardrobe is that bedroom — put the drawn bed back. Do not leave bedroom floor empty.";
  }
  if (/beds \d|bedrooms \d/i.test(failure)) {
    return "Count the beds you have drawn before finishing and match the plan exactly — no extra bed to fill a room, no room left without the bed the plan draws in it.";
  }
  if (/opening\(s\) cut into/i.test(failure)) {
    return "Close every opening the plan does not draw. Walk every wall on the sheet, internal ones too: where the hatch runs unbroken the wall is solid, so render solid wall there — no window, no doorway, no pass-through, no matter how dark or closed-in the room looks.";
  }
  if (/printed terrace\(s\) missing/i.test(failure)) {
    return "Restore every מרפסת the plan hatches (printed m² figure). Cut the outdoor pocket back into that façade — pale paving, railing, open sky at the printed size. Do not leave a sealed wall, curtains, or bookcases where the sheet draws שטח המרפסת.";
  }
  if (/invented where the plan has no hatch/i.test(failure)) {
    return "Remove every terrace the plan does not hatch. The living room's outer walls stay walls — no deck glued onto a façade that has no printed מרפסת pocket.";
  }
  if (/stair flight/i.test(failure)) {
    return "Delete EVERY stair flight from the photograph — shaft, grey core, and open outdoor steps on a terrace. This flat is one level: no מדרגות פנים. A roof terrace at a different ⊕ must not appear on this floor with steps. Keep only same-level hatched מרפסת pockets the sheet prints, with a railing and no stairs.";
  }
  if (/wet fixture/i.test(failure)) {
    return "Take every toilet, basin, bath and shower out of the rooms the plan draws dry. A bedroom has a bed, a wardrobe and a bedside table and nothing else — no pan, no basin, no tiled wet floor. Wet fixtures belong only in the rooms the sheet draws pans or basins in.";
  }
  if (/washer\(s\) on a leisure terrace|washers \d/i.test(failure)) {
    return "Match laundry to the plan exactly. If the sheet draws ZERO washers / no חדר שירות / no מרפסת שירות, DELETE every washing machine and the whole invented laundry alcove — that space may be living wall or a printed מרפסת instead. Never invent a laundry room. If the plan draws N machines, keep exactly N in those rooms only.";
  }
  if (/bathtubs \d/i.test(failure)) {
    return "Copy wet fixtures from the plan exactly. If the sheet draws a washing-machine symbol in that wet room (and no bathtub outline), put a washer there — never invent a bathtub. Remove every bathtub the plan does not draw.";
  }
  if (/kitchen fridge missing/i.test(failure)) {
    return "Put a tall fridge / מקרר cabinet back in the kitchen run exactly where the plan draws it. Low counters alone are not enough when the sheet shows a fridge rectangle.";
  }
  if (/furniture in the entrance/i.test(failure)) {
    return "Clear the entrance completely. Take out the table, the desk, the chairs, the console, the shelving and anything else standing on that floor, and leave bare floor. A mirror or coat hooks on the wall may stay; nothing stands.";
  }
  if (/fitted unit/i.test(failure)) {
    return "Remove the fitted units the plan does not draw. A bookcase, sefarim cabinet, sideboard, wardrobe or shelving wall belongs only where the sheet draws a symbol for it; everywhere else, and at the entrance in particular, the floor stays clear.";
  }
  if (/seating group/i.test(failure)) {
    return "Copy lounge seating from the plan. If the living room draws only a dining table, take the sofa and armchairs out — dining chairs around the table are not a lounge. If the plan draws one sofa group, keep only that one in the living room. The entrance stays circulation.";
  }
  if (/unfurnished/i.test(failure)) {
    return "Furnish every enclosed room. An empty floor with bare walls is not acceptable unless the plan draws the room empty.";
  }
  if (/CAD annotation/i.test(failure)) {
    return "Drop every 2D drawing mark: no black entrance triangle, no north arrow, no dimension ticks, no flat hatch on a floor.";
  }
  if (/letters or digits/i.test(failure)) {
    return "Remove every readable letter and digit from the photograph — room names, dimensions, captions. Leave book spines BLANK (no letters). Do not restage furniture.";
  }
  return "Correct this against the plan.";
}

/**
 * How many times a failed audit is worth re-rolling before shipping the least
 * bad frame.
 *
 * Run-to-run spread on the same sheet is wider than the spread inside one run.
 * Two consecutive runs of דירה 14 on identical code and prompts gave a frame
 * with the plan's stepped outline and four bedrooms, and then a plain rectangle
 * with two — so a best-of-three can simply be handed three bad draws. Five buys
 * a materially better chance of a clean frame, and the early exit below means
 * the extra calls are only spent on the runs that are going badly.
 */
const MAX_AUDITED_ATTEMPTS = 5;

/**
 * Good enough to stop paying for re-rolls: nothing disqualifying, and at most a
 * couple of count mismatches. A perfect audit effectively never happens on these
 * sheets, so waiting for one would always burn the full budget.
 */
const GOOD_ENOUGH_SCORE = 2;

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

/**
 * Put a flipped or turned frame back the way the plan draws it.
 *
 * Orientation is the one family of defects with an exact inverse: flop a mirror,
 * rotate a turn, and every room lands back on the side the plan puts it, with
 * nothing else about the still touched. Re-rolling does not have that property —
 * four consecutive runs of דירה 14 came back mirrored, turned, mirrored and
 * turned again, so the retry budget was being spent resampling an orientation
 * the model will not hold. Verified on run three: flopping it took
 * mirroredVsPlan true -> false and the score 302 -> 101.
 *
 * Rotation was the more expensive half to find. The auditor had been writing
 * "the render is rotated 180 degrees" into its notes while every graded field
 * said the frame was clean, footprintMatchesPlan included — a silhouette turned
 * through 180 degrees still matches itself. It needed its own field before it
 * could be corrected.
 *
 * Nothing here reads as text — the caption bar is stamped after the audit — so
 * there is no lettering to come back reversed.
 *
 * Returns null unless the fix actually clears the verdict and improves the
 * score, so a misfired call cannot make a frame worse.
 */
async function reorientToPlan(
  img: { mimeType: string; base64: string },
  audit: { mirroredVsPlan: boolean; rotationVsPlanDegrees: number },
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
  before: { score: number },
  view: string,
): Promise<{ img: { mimeType: string; base64: string }; score: number } | null> {
  let pipeline = sharp(Buffer.from(img.base64, "base64"));
  if (audit.mirroredVsPlan) pipeline = pipeline.flop();
  // The audit reports how far the still is turned from the plan, so turn it back.
  if (audit.rotationVsPlanDegrees !== 0) pipeline = pipeline.rotate(audit.rotationVsPlanDegrees);

  const buf = await pipeline.jpeg({ quality: 94 }).toBuffer();
  const fixed = { mimeType: "image/jpeg", base64: buf.toString("base64") };

  const after = await auditStill(fixed, ctx.plan, ctx.haredi);
  if (!after || after.mirroredVsPlan || after.rotationVsPlanDegrees !== 0) return null;
  const graded = gradeFloorplanStill(after, ctx.layout, { haredi: ctx.haredi });
  if (graded.score >= before.score) return null;
  log.info("reoriented a still to the plan", {
    view,
    flopped: audit.mirroredVsPlan,
    turned: audit.rotationVsPlanDegrees,
    from: before.score,
    to: graded.score,
  });
  return { img: fixed, score: graded.score };
}

/**
 * Audit protects layout. This pass protects the brochure look the audit
 * cannot see: vacant white 3D that scored well still fails the client.
 * Keep the audited frame if the warmth pass makes the audit worse.
 */
async function warmLook(
  img: { mimeType: string; base64: string },
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<{ mimeType: string; base64: string }> {
  const prompt = `${SALES_BROCHURE_BRIEF}

WARMTH FINISH — the FIRST attached image is this apartment, already laid out correctly.
Repaint materials and light only. Do not move walls, doors, windows, furniture, or the camera.
Golden-hour ~3000K. Every lamp ON with a visible amber pool. Honey oak grain, cream plaster, an area rug, pillows, a fruit bowl, a kettle.
Not a vacant white 3D model. Not cooler, greyer or flatter than a family home tonight.
${job.prompt.includes("MODESTY") ? "Keep the modesty rules: no screens, twins only, no people. Do not invent a TV, laptop, or double bed." : ""}
${ONE_FRAME}`;
  try {
    const warmed = await generateOneImage(prompt, [img, ...attachments], { aspectRatio });
    const before = await auditStill(img, ctx.plan, ctx.haredi);
    const after = await auditStill(warmed, ctx.plan, ctx.haredi);
    if (!after) return warmed;
    if (!before) return warmed;
    const beforeGrade = gradeFloorplanStill(before, ctx.layout, { haredi: ctx.haredi });
    const afterGrade = gradeFloorplanStill(after, ctx.layout, { haredi: ctx.haredi });
    if (
      ctx.haredi &&
      harediModestyFailures(afterGrade.hardFailures).length >
        harediModestyFailures(beforeGrade.hardFailures).length
    ) {
      log.warn("warmth pass reintroduced modesty failures; keeping the audited frame", {
        view: job.labelHe,
        failures: harediModestyFailures(afterGrade.hardFailures),
      });
      return img;
    }
    if (
      ctx.haredi &&
      harediModestyFailures(afterGrade.hardFailures).length > 0 &&
      harediModestyFailures(beforeGrade.hardFailures).length === 0
    ) {
      log.warn("warmth pass broke a clean modesty frame; keeping the audited frame", {
        view: job.labelHe,
        failures: harediModestyFailures(afterGrade.hardFailures),
      });
      return img;
    }
    if (afterGrade.score > beforeGrade.score + 15 || afterGrade.hardFailures.length > beforeGrade.hardFailures.length) {
      log.warn("warmth pass hurt the layout audit; keeping the audited frame", {
        view: job.labelHe,
        before: beforeGrade.score,
        after: afterGrade.score,
      });
      return img;
    }
    log.info("warmth pass kept", { view: job.labelHe, before: beforeGrade.score, after: afterGrade.score });
    return warmed;
  } catch (err: unknown) {
    log.warn("warmth pass failed", {
      view: job.labelHe,
      error: err instanceof Error ? err.message : String(err),
    });
    return img;
  }
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
): Promise<{ mimeType: string; base64: string; auditIssues?: string[] }> {
  const auditable = job.viewId === "overview" || job.viewId === "isometric";
  let best: {
    img: { mimeType: string; base64: string };
    score: number;
    failures: string[];
    hardFailures: string[];
    audit: FloorplanVizAudit;
  } | null = null;
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

    const audit = await auditStill(img, ctx.plan, ctx.haredi);
    if (!audit) return img; // No auditor available — ship what we have rather than stall.

    const { failures, hardFailures, score } = gradeFloorplanStill(audit, ctx.layout, {
      haredi: ctx.haredi,
    });
    if (failures.length === 0) {
      log.info("still passed audit", { view: job.labelHe, attempt });
      const issues = await collectShipIssues(img, ctx, job.labelHe);
      return { ...img, auditIssues: issues.length ? issues : undefined };
    }
    log.warn("still failed audit", { view: job.labelHe, attempt, failures, hardFailures });
    lastFailures = failures;
    if (!best || score < best.score) best = { img, score, failures, hardFailures, audit };
    if (score <= GOOD_ENOUGH_SCORE) {
      log.info("still good enough, stopping re-rolls", { view: job.labelHe, attempt, failures });
      const issues = await collectShipIssues(img, ctx, job.labelHe);
      return { ...img, auditIssues: issues.length ? issues : undefined };
    }
  }

  const misoriented = /mirrored|turned \d+ degrees/i;
  if (best?.audit && best.hardFailures.some((f) => misoriented.test(f))) {
    const fixed = await reorientToPlan(best.img, best.audit, ctx, best, job.labelHe);
    if (fixed) {
      best = {
        ...best,
        img: fixed.img,
        score: fixed.score,
        hardFailures: best.hardFailures.filter((f) => !misoriented.test(f)),
        failures: best.failures.filter((f) => !misoriented.test(f)),
      };
    }
  }

  if (best) {
    let candidate = best;
    for (let door = 1; door <= 2; door++) {
      const repaired = await repairRemovableFailures(candidate, job, attachments, aspectRatio, ctx);
      if (repaired) {
        const scored = await gradeStillForShip(repaired, ctx);
        if (scored) {
          const hard = blockingHardFailures(scored.grade.hardFailures, scored.gemini);
          candidate = {
            img: repaired,
            score: scored.grade.score,
            failures: scored.grade.failures,
            hardFailures: hard,
            audit: scored.audit,
          };
          if (hard.length === 0) {
            return { ...repaired, auditIssues: undefined };
          }
          continue;
        }
        candidate = { ...candidate, img: repaired };
      }
      break;
    }
    const issues = await collectShipIssues(candidate.img, ctx, job.labelHe);
    log.warn("shipping least-bad still", {
      view: job.labelHe,
      failures: candidate.failures,
      residual: issues,
    });
    return {
      ...candidate.img,
      auditIssues: issues.length ? issues : undefined,
    };
  }
  throw new Error("יצירת ההדמיה נכשלה");
}

const MAX_SURGICAL_REPAIRS = 3;

/**
 * Surgical pass for hard failures that do not need a full re-roll: burned text,
 * CAD marks, and (for haredi) screens / double beds. Keeps a paid outline that
 * already matches the plan instead of throwing it away.
 */
async function repairRemovableFailures(
  best: {
    img: { mimeType: string; base64: string };
    score: number;
    failures: string[];
    hardFailures: string[];
  },
  job: VizJob,
  attachments: Array<{ mimeType: string; base64: string }>,
  aspectRatio: string | undefined,
  ctx: { layout: FloorplanLayout; plan: { base64: string; mimeType: string }; haredi: boolean },
): Promise<{ mimeType: string; base64: string } | null> {
  let current = best;
  let improvedImg: { mimeType: string; base64: string } | null = null;

  for (let pass = 1; pass <= MAX_SURGICAL_REPAIRS; pass++) {
    const targets = surgicallyRemovableFailures(current.hardFailures, { haredi: ctx.haredi });
    if (targets.length === 0) return improvedImg;

    const prompt = `${job.prompt}

REPAIR PASS — the FIRST attached image is a frame of this apartment that is
correct in every other respect. Reproduce it exactly: same walls, same outline,
same rooms, same furniture, same materials, same camera. Keep its light exactly:
the same golden-hour warmth, the same lit lamps and amber pools, the same warm
white balance — a cooler, greyer or flatter frame is a failed repair.
Change only this:
${targets.map((f) => `- ${f}\n  -> ${remedyFor(f)}`).join("\n")}
Nothing else in the picture may move, appear or disappear.`;

    try {
      const img = await generateOneImage(prompt, [current.img, ...attachments], { aspectRatio });
      // Grade the way the ship gate does (Gemini + Claude) so a Claude-only
      // double bed is still a repair target, not a surprise refuse after pay.
      const scored = await gradeStillForShip(img, ctx);
      if (!scored) return improvedImg;
      const verdict = scored.grade;
      const beforeRemovable = surgicallyRemovableFailures(current.hardFailures, {
        haredi: ctx.haredi,
      }).length;
      const afterRemovable = surgicallyRemovableFailures(verdict.hardFailures, {
        haredi: ctx.haredi,
      }).length;
      if (verdict.score >= current.score && afterRemovable >= beforeRemovable) {
        log.warn("repair pass did not improve the frame", {
          view: job.labelHe,
          pass,
          before: current.score,
          after: verdict.score,
          failures: verdict.failures,
        });
        return improvedImg;
      }
      log.info("repair pass improved the frame", {
        view: job.labelHe,
        pass,
        before: current.score,
        after: verdict.score,
        failures: verdict.failures,
      });
      current = {
        img,
        score: verdict.score,
        failures: verdict.failures,
        hardFailures: verdict.hardFailures,
      };
      improvedImg = img;
    } catch (err: unknown) {
      log.warn("repair pass failed", {
        view: job.labelHe,
        pass,
        error: err instanceof Error ? err.message : String(err),
      });
      return improvedImg;
    }
  }

  return improvedImg;
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
    /** What the run is called, for the caption when the sheet prints no unit. */
    unitTitle?: string;
    /** CAD / prior overview so isometric traces a still that already exists. */
    seedOverview?: { mimeType: string; base64: string };
    /** CAD 3D massing of this unit — attached after the sales sheet, never as the plan. */
    geometryLock?: { mimeType: string; base64: string };
    /** Sales booklet: overview + isometric only. Interiors invent rooms. */
    skipInteriors?: boolean;
  },
): Promise<FloorplanVizImage[]> {
  const vizLayout = overlayKnownSheetProgram(layoutForVisualization(layout));
  const specs = listFloorplanVizJobs(vizLayout, options?.scope ?? "full", options?.existingImages, {
    skipInteriors: options?.skipInteriors,
  });
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
    geometryLock: Boolean(options?.geometryLock?.base64),
    hintKind: hint?.kind,
  };
  const jobs: VizJob[] = specs.map((spec) => ({
    ...spec,
    prompt:
      spec.viewId === "interior"
        ? buildVizPrompt(
            vizLayout,
            { kind: "interior", roomName: spec.roomName },
            {
              photo: options?.photo,
              styleKit: options?.styleKit,
              geometryLock: Boolean(options?.geometryLock?.base64),
            },
          )
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
        options?.geometryLock,
      );
      const audited = await generateAuditedImage(job, attachments, aspectRatio, {
        layout: vizLayout,
        plan: { base64, mimeType },
        haredi: options?.styleKit?.audience === "haredi",
      });
      const haredi = options?.styleKit?.audience === "haredi";
      const auditCtx = {
        layout: vizLayout,
        plan: { base64, mimeType },
        haredi: haredi === true,
      };
      let img: { mimeType: string; base64: string; auditIssues?: string[] } = audited;
      if (job.viewId === "overview" || job.viewId === "isometric") {
        const warmed = await warmLook(audited, job, attachments, aspectRatio, auditCtx);
        if (warmed.base64 !== audited.base64) {
          const warmIssues = await collectShipIssues(warmed, auditCtx, job.labelHe);
          img = { ...warmed, auditIssues: warmIssues.length ? warmIssues : audited.auditIssues };
        } else {
          img = { ...warmed, auditIssues: audited.auditIssues };
        }
      }
      // Stamped after the audit, never before: the auditor fails a still that
      // has letters in it, and this caption is letters on purpose.
      const stamped = await stampFloorplanStill(
        img,
        stampFieldsFromLayout(layout, options?.unitTitle),
      );
      return {
        viewId: job.viewId,
        labelHe: job.labelHe,
        roomName: job.roomName,
        mimeType: stamped.mimeType,
        base64: stamped.base64,
        auditIssues: img.auditIssues,
      } satisfies FloorplanVizImage;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("view generation skipped", {
        view: job.labelHe,
        error: message,
      });
      return null;
    }
  };

  const overviewJobs = jobs.filter((j) => j.viewId === "overview");
  const restJobs = jobs.filter((j) => j.viewId !== "overview");
  const overviewOut = await runPool(overviewJobs, 1, (job) => runJob(job));
  const overviewStill = overviewOut[0] ?? options?.seedOverview ?? null;
  const restOut = await runPool(restJobs, IMAGE_CONCURRENCY, (job) => runJob(job, overviewStill));
  const out = [...overviewOut, ...restOut];

  if (out.length === 0) {
    throw new Error("יצירת ההדמיות נכשלה — לא התקבלה אף תמונה");
  }
  return out;
}
