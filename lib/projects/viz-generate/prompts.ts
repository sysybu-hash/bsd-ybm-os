
import sharp from "sharp";

import { placedRoomsExtent, planPositionLabel } from "@/lib/projects/floorplan-plan-guide";
import {
  inferRoomKind,
  isApartmentStairRoom,
  isBuildingCoreRoom,
  isGuestWcRoom,
  isStorageOrServiceRoom,
  isStudyRoom,
  layoutHasInternalStairs,
  canonicalizeFloorplanLayout,
  roomsForVisualization,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanRoomKind,
  type FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";

import {
  extractFloorplanVectorGeometry,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";

import {
  HAREDI_BED_PROMPT,
  HAREDI_MODESTY_PROMPT,
  resolveFloorplanVizStyle,
  stylePromptForView,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";

import {
  nearestGeminiImageAspect,
  ORIENTATION_LOCK,
  PIXEL_LOCK,
  PRESENTATION_LOCK,
} from "@/lib/projects/floorplan-viz-lock";

export type WallHintKind = "vector-walls" | "footprint" | "ink";

/**
 * The aspect ratio has to come from the sheet, not from the model's default.
 *
 * sharp cannot decode a PDF, so this used to return undefined for every PDF
 * upload and Gemini fell back to its own framing — landscape. A portrait sales
 * sheet then came back squeezed into a landscape frame with the flat rotated,
 * which is exactly the ORIENTATION_LOCK the prompt spends a paragraph on.
 * pdf-lib reads the page box without rendering anything.
 */
export async function aspectRatioForPlan(base64: string, mimeType?: string): Promise<string | undefined> {
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

export const ONE_FRAME =
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
    /** The same sheet, with every room named on it, is attached first. */
    planGuide?: boolean;
    /** A schematic plate of this flat — rooms where they were read — leads. */
    schematicPlate?: boolean;
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
  // The same map in words. The picture is the instruction; this is what the
  // model can check itself against while it draws.
  const roomsExtent = placedRoomsExtent(rooms);
  const placedRooms = rooms
    .map((room, i) => ({ room, index: i + 1, where: planPositionLabel(room, roomsExtent) }))
    .filter((row): row is { room: FloorplanRoom; index: number; where: string } => row.where != null);
  const roomMapBlock =
    options?.planGuide && placedRooms.length > 0
      ? `ROOM MAP — attachment 1 is the SAME sheet with every room named in magenta at its own position. Each room below must land in that part of your frame, on that side, with those neighbours. A room drawn on the opposite side is a failed still:
${placedRooms.map((row) => `${row.index}. ${row.room.name} — ${row.where}`).join("\n")}
None of the magenta boxes or their text may appear in the photograph; they are direction for you, not decoration.`
      : "";
  const mapBit = [
    options?.schematicPlate
      ? "Attachment order: (1) a SCHEMATIC PLATE of this apartment — every room as a block, at the position and size it occupies in the flat, with a bed where there is a bed; (2) the same sheet with every room named at its position; (3) the original sales sheet. Take the ARRANGEMENT from the plate: which room is where, what adjoins what, which side the living room is on. Take every detail from the sheet — the true wall jogs, the fixtures, the openings, the furniture. The plate is a diagram of this flat, not a drawing of a different one: do not photograph its blocks as literal boxes, and do not reorganise the flat away from it."
      : options?.planGuide
      ? "Attachment order: (1) the same sheet with every room named at its position — the layout map; (2) the original sales sheet — walls AND furniture symbols."
      : options?.geometryLock
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

${roomMapBlock}

${inventoryBlock(layout, kit.audience === "haredi")}

Rooms (do not write these words on the image):
${roomBlock}

VIEW:
${viewHint(layout, view, kit.audience === "haredi")}

STYLE (finishes only — do not change walls):
${stylePromptForView(kit, { kind: view.kind, roomKind: focusKind })}

${ONE_FRAME} No captions. No title block. ZERO text on floors.`;
}

