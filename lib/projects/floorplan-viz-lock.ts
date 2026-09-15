import { createHash } from "crypto";

/** Bump when extract prompts or merge rules change — invalidates layout replay. */
export const FLOORPLAN_EXTRACT_LOCK_VERSION = "extract-pixel-v4";
/** Bump when viz prompts or style locks change — invalidates still replay. */
export const FLOORPLAN_VIZ_LOCK_VERSION = "viz-pixel-v49";

const GEMINI_IMAGE_ASPECTS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 3],
  [3, 2],
  [3, 4],
  [4, 3],
  [4, 5],
  [5, 4],
  [9, 16],
  [16, 9],
  [21, 9],
];

/** Closest Gemini image aspect to the sales-sheet raster — keeps framing locked. */
export function nearestGeminiImageAspect(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return "16:9";
  const ratio = width / height;
  let best = "16:9";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const [a, b] of GEMINI_IMAGE_ASPECTS) {
    const diff = Math.abs(ratio - a / b);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = `${a}:${b}`;
    }
  }
  return best;
}

export const EXTRACT_PIXEL_LOCK = `
PIXEL LOCK (extract — non-negotiable):
- Copy only printed ink. Do not guess a typical Israeli apartment. Do not fill unlabeled voids from memory.
- Counts are integers of drawn symbols, not estimates. One bed rectangle = bedCount 1. Two = 2. Empty room = 0.
- islandStoolCount = the drawn half-circle count on the island, or 0 if none. Not dining chairs.
- bbox is the printed room outline on THIS sheet (0–1 of the full image). Do not invent a box.
- Forbidden: approximately, typical, often, around, similar, "about".
`.trim();

export const ORIENTATION_LOCK = `
ORIENTATION LOCK — a mirrored or rotated floor plate is a failed output:
- Fix the orientation BEFORE you draw anything, from one landmark: find the entrance door on the sheet, say which edge of the flat it sits on — left, right, top or bottom — and put it on that same edge of your frame. Then lay every other space out around it in the plan's order. "Do not mirror" alone has not held; naming the side the door is on does.
- Top of the photograph = top of attachment 1. Do not rotate 90° or 180°. Do not mirror left/right.
- The large open living/dining stays on the SAME side of the frame as on the sheet.
- Kitchen stays where the cooktop is drawn. Bedrooms stay where the bed rectangles are drawn. Office stays where the desks are drawn.
- The thick-walled empty ממ"ד stays in its printed location. Do not omit it. Do not fill it with furniture.
`.trim();

export const PIXEL_LOCK = `
PIXEL LOCK — the attached sales sheet is CAD ink, not a mood board:
- Copy the dark wall graph 1:1. Every jog, thickness, and opening stays as printed. Do not straighten, offset, or invent walls.
- Do not invent a generic rectangular apartment. If the printed outline is irregular, the photograph's outline is that same irregular shape — every notch, wing and terrace strip, in those pixels.
- Furniture and fixtures sit on the printed symbols: same room, same integer count, same position and size. Do not restage, center, or "improve" the layout.
- Lived-in props (lamps, fruit bowl, pillows, throws, towels) sit ON drawn furniture only. They never add a sofa, table, bed, sink, or terrace that is not printed.
- Inventory integers are exact. 1 office = 1 desk-only room in the photograph. 1 twin = 1 twin. 0 beds = empty.
- חדר שירות / ח.שרות is laundry (washer, shelves). It is not שירותים. Do not place a toilet, basin, or bathtub there.
- If a symbol is not printed, it does not exist. Do not fill empty rooms from memory.
- Do not copy 2D CAD annotations into the photograph: entrance triangles, north arrows, dimension ticks, hatch as hatch.
- A toilet pan, oval basin, or bathtub on the sheet MUST appear in that wet room. Never an empty tiled bathroom.
- Diagonal hatch on a rectangle is a closet with CLOSED doors, not open hanging rails.
- Forbidden: typical apartments, approximate counts, similar furniture, "around" a measurement.
`.trim();

/**
 * The CAD render already contains the flat. The sales-sheet presentation
 * lock tells the model the attachment is empty wall-tracing and to copy
 * fixtures from a sheet it is not holding — that licenses invention.
 */
export const GEOMETRY_PIXEL_LOCK = `
PIXEL LOCK (absolute — this overrides every later sentence):
- This image is a pixel-registered architectural plate. The output occupies the same pixel grid: same width, same height, same origin.
- Every wall pixel stays a wall pixel. Every doorway gap stays a gap at the same pixels. Every furniture block stays at the same pixels and the same size.
- Do not crop, pad, zoom, pan, rotate, mirror or restretch. If a pixel was floor it stays floor; if it was wall it stays wall.
- You may change only the colour and texture of a pixel, never its role in the plan.
- A result that would not overlay the input with walls lining up is a failed result. Return the painted version of THIS picture, not a new drawing of an apartment.
- Do not invent a rectangular box apartment. The outline is already drawn.
`.trim();

export const GEOMETRY_PRESENTATION_LOCK = `
PRESENTATION LOCK — finished Israeli sales-brochure still, not a CAD dollhouse:
- Forbidden in the photograph: north arrows, black entrance triangles, dimension ticks, 2D hatch patterns, paper title blocks, letters or digits.
- Lighting and materials: soft even brochure daylight, finished millwork, complete wet rooms. Not vacant contractor boxes, not a plastic CGI dollhouse.
`.trim();

export const PRESENTATION_LOCK = `
PRESENTATION LOCK — finished Israeli sales-brochure still, not a CAD dollhouse:
- Forbidden in the photograph: north arrows, black entrance triangles, dimension ticks, 2D hatch patterns, paper title blocks, letters or digits.
- The triangular arrow at the door is a 2D CAD marker. Omit it. Model a real door leaf.
- Hatched closet rectangles = built-in cabinets with CLOSED doors. Never exposed hanging rods. Never a walk-in without doors unless the plan draws an open wardrobe.
- Every bathroom / guest WC with a pan, basin, or tub on the sheet shows those fixtures. Never an empty tiled void. The wall-tracing looks empty — copy wet fixtures from the sales sheet.
- Laundry symbol = one floor-standing washer unless two machines are drawn. Do not invent a stacked dryer.
- Kitchen counters keep their printed shape: L stays L, island stays a separate island. Do not weld an island into a U-kitchen.
- No floor-to-ceiling library, TV niche, or media wall unless that millwork is drawn.
- Lighting and materials: soft even brochure daylight, finished millwork, complete wet rooms. Not vacant contractor boxes, not schematic furniture, not a plastic CGI dollhouse.
`.trim();

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function floorplanExtractFingerprint(input: {
  planBase64: string;
  mimeType: string;
  planKind: string;
}): string {
  return sha256Utf8(
    [
      FLOORPLAN_EXTRACT_LOCK_VERSION,
      input.mimeType.trim(),
      input.planKind.trim() || "auto",
      sha256Utf8(input.planBase64),
    ].join("\n"),
  );
}

export function floorplanVizInputFingerprint(input: {
  planBase64: string;
  mimeType: string;
  planKind: string;
  scope: string;
  styleKit: { id: string; audience: string; promptBlock: string };
}): string {
  return sha256Utf8(
    [
      FLOORPLAN_VIZ_LOCK_VERSION,
      floorplanExtractFingerprint(input),
      input.scope.trim() || "full",
      input.styleKit.id,
      input.styleKit.audience,
      sha256Utf8(input.styleKit.promptBlock),
    ].join("\n"),
  );
}
