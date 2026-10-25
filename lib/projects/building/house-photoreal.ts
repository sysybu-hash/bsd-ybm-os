import type { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import {
  aspectRatios,
  finishPass,
  finishPrompt,
  furnitureFaults,
  localMatch,
  massMatch,
  structuralMatch,
  type FinishKind,
  type LocalFault,
} from "@/lib/projects/building/finish";
import { askDrawing } from "@/lib/projects/building/house-ai";
import { HOUSE_EXTERIOR } from "@/lib/projects/building/house-finish";
import {
  formatCost,
  HOUSE_IMAGE_MODELS,
  HOUSE_IMAGE_SIZE,
  houseAttemptsPerPicture,
  housePlanImageSize,
  houseSpend,
  paidAiAllowed,
  reserve,
  withPictureLedger,
  type HouseImageSize,
  type HouseSpend,
} from "@/lib/projects/building/house-cost";
import { paintingKey, type PaintingCache } from "@/lib/projects/building/house-store";
import { FINISH_MIN_EDGES, FINISH_MIN_MASSES } from "@/lib/projects/floorplan-finish-still";
import { materialsStyleBlock, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import { houseKnob } from "@/lib/projects/building/house-knobs";

const log = createLogger("house-photoreal");

/**
 * A private house's booklet pictures painted as photographs, each one only
 * where the painting keeps the measured render: its edges where the render's
 * are, its masses, and part by part nothing added or lost. A refused painting
 * is mended or painted again, three image calls a picture at most, and the
 * render stays where none held it. A storey's
 * plan is painted too, now that its render is furnished from the sheet: an
 * unfurnished storey's painting furnished it at will.
 */
// Worded as a photograph of a built house, not as a "visualization": "luxury",
// "finest quality", "perfect" and "immaculate" drew the airbrushed CG look of
// the booklets of 9/10/2026 — plastic plaster, flat grey glass, empty skies.
// What makes it real is surface and light, never another object: the KEEP
// rules below are unchanged.
const MATERIALS =
  `The walls are coloured mineral plaster in one grey-brown family, tone on tone exactly where the render colours them: the side wings ${HOUSE_EXTERIOR.plasterEn.wing}, the middle volume between them ${HOUSE_EXTERIOR.plasterEn.body} — never brown below and grey above, never a third colour. A thin line of warm hidden LED light glows just under the roof's stone coping all round. Both hand-floated: a fine sandy grain and the soft sheen of real render. The house is newly built: its walls clean and even, no stains, streaks, drips or weathering anywhere. Each wall keeps the tone the render gives it — a deep greige wall stays deep greige in the warm light, never pink or peach. Every window sits in a frame of real Jerusalem limestone — honed cream-to-honey blocks, each a touch different in tone, with fine mortar joints and gently worn arrises. Slim dark anthracite aluminium window frames; real double glazing that reflects the sky and the street, with a glimpse of the dim room behind where the light falls into it. The garden walls are coursed Jerusalem limestone with natural variation, capped with rounded stone copings; on the street wall only, exactly where the render draws them, panels of slim vertical anthracite aluminium slats in a crisp frame stand between square stone pillars. Every other boundary and garden wall — the sides, the back, the wall between the two plots — is plain stone to its coping: no slat panel, fence, railing, post or pillar on it. No iron railing, bars or loose rail anywhere the render does not draw one; a stair's railing the render draws stays as drawn. The bins enclosure's front opening stays open — no door or gate in it — and a gate only where the render draws one. The balcony's railing is clear glass panes in a slim black metal frame, as the render and the architect's facades draw it — a black post about every metre and a black top rail — see-through, the balcony's grey-tiled floor and the wall behind seen through it: never a solid parapet, never bars or balusters. Where the render divides the balcony between the two homes with a plastered wall, that wall stays, its height and depth as drawn. Grey interlocking concrete pavers in the parking bays with slight wear in the tyre tracks; pale stone paving on the paths; a real lawn with natural variation in its green; a dark asphalt road with a grey kerb and sidewalk where the render draws them; every parked car of the render, each where it is, its size and colour, made a real modern family car — real body panels, wheels and tyres, glass, lamps and true reflections — never a toy, a block or a model; keep every car the render parks, and add none.`;

const PHOTOGRAPH =
  "An unretouched photograph of a real, recently built house, taken on a full-frame camera with a tilt-shift lens at f/8, true-to-life colour and a natural dynamic range: real sunlight, soft bounce light from the ground and walls, contact shadows where every frame, sill and wall meets the surface it stands on. It must look photographed, not rendered: no airbrushed surfaces, no bloom or haze over the house, no oversaturation.";

// The plot is painted, not furnished: the pots of olive trees and the
// planting beds it was once asked for stood where the render has bare ground,
// and the invented-object check refused them — a repair paid for each. Life
// comes from the surfaces and the light; the far background lies past the
// plot, low and hazy, so the masses hold.
const KEEP_SITE =
  "Every stair the render draws stays, with its treads and its railing — the side flights down beside the house's walls too, never hidden or removed. Keep the built ground exactly as the render shapes it: every garden wall, step, stair, paving edge, parking bay, bin enclosure, car, tree and planting where it is and its size — nothing added or moved: no wall, low wall, step, gate, railing, car, pot, planter, plant, raised bed, pergola or fence the render does not draw. Paint its surfaces as real: the lawns real, thick and slightly uneven, the planting the render draws in full leaf. No new path, stepping stones, paving or steps across a lawn: paths only where the render paves them. Beyond the plot: the sidewalk and the road as the render draws them, and round the plot, on the same level ground as the plot and the street — never falling away below it, the house never on a mound or a hilltop — the neighbouring houses' gardens and, further off and soft with distance haze, a quiet neighbourhood of similar Jerusalem-stone houses and the rolling Judean hills, out of focus, never in front of the house.";

// A painting of model A's aerial set a wicker lounge suite on its bare roof,
// and the edge and mass scores passed it.
const KEEP_ROOF =
  "No television or screen anywhere, through a window or outside. Keep every roof exactly as the render has it: a flat roof stays bare inside its parapet. Do NOT put anything on a roof or on top of a parapet — no furniture, loungers, umbrellas, pergolas, shades, posts, poles, antennas, dishes, water tanks, solar panels, plants or people. What the render does draw on a roof stays exactly where it is, its size and shape, and nothing else is added. Do not add windows the render does not draw. A railing or fence only where the render draws one: every other garden wall, parapet and step ends at its own bare top — no railing, fence, balustrade, handrail or bars on it.";

// Golden hour, asked for as the user does: "late-afternoon sun" came back a high blue midday.
export const GOLDEN_HOUR_TEXT =
  "Golden hour, the last half hour before sunset: the sun a hand's width above the horizon, its warm amber light raking low across the plaster and the stone so every grain and joint reads, long soft shadows across the paving and the lawn, the shaded faces cool blue and still full of detail. The sky a real evening sky — deep blue overhead fading to warm peach and gold near the horizon, a few thin clouds lit pink from below. The hidden lighting already on: a warm 2700 K glow from LED strips concealed under the stone copings of the garden walls and under each stair tread, soft wall-washers grazing the stone walls from below, warm light in the windows from lamps inside. Every light the render draws is on and glowing warm: the slim dark up-and-down wall light beside each entrance door throwing a soft scallop of light on the wall above and below it, and the small lights set low in the stone garden walls pooling light on the paving and the lawn. Apart from those slim wall lights, which stand as the render draws them, lights are seen only as their glow — no other visible fittings, no spotlights, no glare.";

const EXTERIOR_LOOK = `${PHOTOGRAPH} ${MATERIALS} ${KEEP_SITE} ${KEEP_ROOF} ${GOLDEN_HOUR_TEXT} Tack-sharp from front to back.`;

const TOP_LOOK = `An unretouched drone photograph taken straight down over the plot from high above, perfectly top-down with no perspective, the same frame as the render: like a map, no wall's face or window is seen, only the tops of the roofs, walls and cars. The flat roofs in grey waterproofing membrane with faint seams and weathering inside their lighter plaster parapets, ${MATERIALS} Keep every roof edge, wall, path, lawn, parking bay, car, bin and tree exactly where the render has it and its size; do not add pools, furniture, people or anything the render does not draw. ${KEEP_ROOF} Golden-hour sun low in the west with long warm shadows across the plot, true-to-life colour, tack-sharp.`;

const ELEVATION_LOOK = `An unretouched photograph of the house taken square-on from far across the street with a long lens and rectified, so it stays perfectly flat-on with no perspective, the same frame as the render. ${MATERIALS} ${KEEP_SITE} The plain band along the bottom is the ground cut through in section, seen edge on, exactly as drawn — its top line, its steps and its dips where the render draws them: paint it as smooth earth, never as a street, a lawn, paving or parked cars, and keep its outline exactly. Where a stone garden wall stands in front of the house, it stays a solid wall of the same height and length, hiding what is behind it; do not open it up into a lawn, a drive or a gate. Windows only where the render has them. ${KEEP_ROOF} ${GOLDEN_HOUR_TEXT} Soft shadows under every sill and head, true-to-life colour.`;

const unitLook = (style: FloorplanVizStyleKit) =>
  `A photograph-quality 3D floor plan of a real furnished home, seen straight from above, as a fine architectural model photographed in daylight: real floor finishes with their grain and grout, upholstery with visible weave, made beds with soft creased linen, real kitchen fronts and worktops, white sanitaryware; soft daylight with gentle contact shadows and ambient occlusion in the corners, true-to-life colour, nothing glowing or airbrushed. Keep the background round the house exactly the colour the render has it. ${materialsStyleBlock(style)}`;

/**
 * A part of a storey's plan, the whole of what its painter is told — one
 * text, in order, nothing else around it. Built from the general building
 * rules, the plan's rules, the house style and the audience's modesty list,
 * it asked at once for "nothing added" and for a sefarim cabinet, rugs, a
 * fruit bowl and lamps, named desks a dozen times, and lit each part from its
 * own sun: the paintings added shelves and desks and the halves did not
 * match (Gottlieb, 13/10/2026).
 */
const PLAN_TILE_INPUT = "INPUT: an exact 3D render of part of a house's floor plan, seen straight down from above, the walls cut at about one metre.";
/**
 * One coherent rule set for top-down plan painting (tiles, whole storey, FLUX
 * edit via Replicate). Locked = geometry and inventory from the measured
 * render / DXF; styled = surfaces + one light mode. Soft "improve" / invent
 * language is forbidden here on purpose (Gottlieb, 15–16/10/2026).
 *
 * Light is exclusive: default = warm-bright short shadows (Gottlieb 16/10/2026).
 * HOUSE_PLAN_EVEN=1 = legacy even overhead. Never combine both light paragraphs.
 * HOUSE_PLAN_GOLDEN=1 is accepted as an explicit warm-bright force (same as default).
 */
/** Soft even overhead — only when HOUSE_PLAN_EVEN=1 (legacy). */
export const PLAN_LIGHT_EVEN =
  "LIGHT, THE SAME IN EVERY PART: soft, even, warm daylight from straight above, as the render is lit — only a faint contact shade where an object meets the floor; an even exposure, crisp and sharp. Keep floors, lawns and paving free of cast sunbeams, light streaks through windows, glow and vignette.";

/**
 * Default plan light: short soft shadows, warmer colours, concealed warm fill.
 */
export const PLAN_LIGHT_GOLDEN =
  "LIGHT, WARM AND BRIGHT OVER THE PLAN: keep the whole picture bright and open — warmer colour temperature than the raw render (soft honey / warm white), never cold blue, never dusk, never underexposed. Prefer very short, faint contact shadows under furniture and walls only; almost no cast shadow length across rooms or lawns; no long dark streaks, no heavy shading that darkens floors or grass. Fill the rooms with soft concealed warm lighting — hidden cove / under-cabinet / indirect warm glow along ceilings and worktops that lifts the mid-tones without visible lamp bodies, glare, or burned-in fixtures the render does not draw. No harsh directional sunbeams, no theatrical golden-hour shafts, no vignette. Every outline and count stays exactly as in the render. Shadows must not invent or erase objects.";

/** Legacy even overhead when HOUSE_PLAN_EVEN=1. */
export function housePlanEven(): boolean {
  return houseKnob("HOUSE_PLAN_EVEN") === "1";
}

/** Warm-bright plan light (default). False only when HOUSE_PLAN_EVEN=1. */
export function housePlanGolden(): boolean {
  if (housePlanEven()) return false;
  return true;
}

export function planLightRule(): string {
  return housePlanGolden() ? PLAN_LIGHT_GOLDEN : PLAN_LIGHT_EVEN;
}

const PLAN_RULES_BEFORE_LIGHT = [
  "TASK: re-surface the render only — a real material on every surface and real light — so it reads as a photograph of a fine architectural model of this very plan. The render is the sole authority on layout, inventory and outlines: resurface, do not redesign, do not improve, do not invent.",
  "KEEP EXACTLY, AS IN THE RENDER: the frame, the scale and the view straight down; every wall where it is, its length, its corners, as thin as the render draws it and in the render's own pale warm colour; every door opening and window; every object — where it stands, its outline, its size, its colour and how many there are. Where the render's floor is empty, the photograph's floor is empty.",
  "STRUCTURE LOCK: treat image 1's wall centre-lines as fixed — party wall, bedroom partitions, bathroom boxes and kitchen runs must stay in the same place and thickness as the render. Do not shift, thicken, merge or open walls. Do not reframe, crop, zoom or rotate the plan.",
  "A SHAPE YOU CANNOT NAME stays that shape and colour, given only a real matt surface: leave it anonymous — do not turn it into a fixture or a piece of furniture. A pale square on a floor stays a pale square; a brown box stays a brown box.",
  "STAIRS: exactly the treads the render draws — as many, as wide and running the same way, each tread's pale nosing on the edge the render puts it. The house's stair is a U: two flights side by side climbing in opposite directions, joined at one end by a landing of pale stone (stone, not wood); the thin dark walk line is one continuous stroke — up the first flight, across the landing turn without a gap, then up the second — with a single arrowhead at the tip pointing up the climb. Never break, skip or detach the walk line or its arrow. Keep the slanted dark break line where the render draws one, and the thin black line of a railing. On an upper floor the flight below is seen down through the opening, behind its railing. Keep every flight, landing and tread exactly as drawn. ONLY those U-stairs — typically on the outer walls. Do NOT invent steps, tread bands, landings or a short stair beside a toilet, bathroom, basin or laundry: a flat pale or tiled vestibule / corridor next to wet rooms stays flat floor with no steps. Never turn hatch lines or tile joints into stairs.",
  "VESTIBULE BESIDE A WET ROOM: the narrow flat floor between a bathroom's toilet, basin or shower and its door, and any small circulation patch touching a bath, stays one level floor in the render's pale large-format porcelain or small grey wet-room tile only. It is never a stair: no oak tread bands, no repeated step rectangles, no nosing lines, no walk line, no arrow, no stone landing. Parallel grout lines, tile joints or faint hatch bands on that floor are tiling only — do not turn them into oak treads even when a floorOak swatch is attached or bedrooms nearby are oak.",
  "LAUNDRY / WASHING MACHINE: a white box with a dark strip and a dial along one edge and a pale round lid is a white front-loading washing machine seen from above — paint it as that machine, not as a toilet, basin or shower. A small room the render gives only a washing machine is a laundry: keep that machine alone in it — never add a toilet, cistern, WC bowl or basin beside the machine. Never add a washing machine where the render has none. A small square of the walls' colour standing alone, cut flat like the walls, is a pier — plaster only.",
  "NO SCREENS: never a television, computer monitor, laptop, tablet, display panel or thin grey/black rectangle on a desk, wall, dresser or floor. A desk or nightstand stays furniture with no screen; do not invent TVs or monitors the render lacks.",
  "SINKS: trust the render's bowls. One bowl in one rim stays one single sink. Two bowls in one shared rim stay one double sink (already built that way when the kitchen is haredi and the sheet drew one sink). Two sinks with worktop between them stay two separate single sinks — keep them apart; do not merge them into one double. Do not add a sink the render lacks.",
  "A SOFA is a long upholstered seat with its back cushions along one long side and an arm at each end, all in the render's fabric colours — paint it as a sofa, not as a bed. A bed has a white pillow at a short end and a blanket.",
  "THE BALCONY, where the render has one: its deck of mid-grey tiles, its whole outline, and the plastered wall dividing the two homes' balconies — all stay exactly as drawn. Along every open edge of that deck the clear glass railing in a slim black metal frame is mandatory: from above the top rail is one continuous thin black line, unbroken, about 2–3 cm wide in the picture, readable against the deck, with the glass as a faint cool band just inside it — never omit the railing, never fade it into the deck or the lawn, never turn it into a solid parapet or a white coping. Keep the balcony separate from the paving and the lawn below it.",
  "MATERIALS, ONE SET FOR THE WHOLE HOUSE, BY THE RENDER'S COLOURS: warm light-oak boards only where the render's floor is already light wood (bedrooms); large pale porcelain tiles with fine joints where it is large pale squares; small grey tiles where it is small grey squares; mid-grey 60 cm porcelain tiles on the balcony deck, and on every open edge of that deck a clear glass railing in a slim black frame (top rail a continuous thin black line, glass a faint cool band inside it); oak treads only on tread surfaces the render already draws as the outer-wall U-stair (repeated tread boxes plus walk line / arrow) — never in bathrooms, WC alcoves, or pale or grey tiled circulation beside wet rooms — and pale stone on that stair's landing, pale stone on every step and stair outside its walls; each car a real car in the render's very hue — a dark blue car stays dark blue; white bed linen under the blanket colour the render gives each bed; every cabinet, wardrobe, worktop, table and sofa in its own render colour, in a real matt finish; white ceramic for a bath, basin or toilet only where the render has that very fitting; real lawn where it is green; grey pavers where it is paving; pale Jerusalem stone on the plot's boundary walls. The page colour around the plot and the parking kerb stay the render's.",
] as const;

const PLAN_RULES_AFTER_LIGHT = [
  "INVENTORY LOCK: keep every object, fitting, wall, step and landing the render has, in place; leave out every object, fitting, wall, step, landing and decoration the render does not have — including any toilet in a laundry and any screen or TV. Keep every floor empty where the render's floor is empty. Leave the picture free of room names, dimension text, logos and labels. Keep everything inside the plot's edge; the page around the plot stays the render's plain page colour.",
  "STREET STRIP: the sidewalk, asphalt and parked cars along the bottom of the frame stay continuous and whole as in the render — never crop a bumper, never leave a blank white band under the cars, never invent a second kerb line.",
] as const;

/** Live plan rules for the current env (warm-bright default; HOUSE_PLAN_EVEN=1 for even). */
export function planRules(): string[] {
  return [...PLAN_RULES_BEFORE_LIGHT, planLightRule(), ...PLAN_RULES_AFTER_LIGHT];
}

/**
 * Default snapshot (warm-bright) for tests and imports that expect a const.
 * Runtime painting uses planRules() / planTilePrompt() / planWholePrompt().
 */
export const PLAN_RULES = [...PLAN_RULES_BEFORE_LIGHT, PLAN_LIGHT_GOLDEN, ...PLAN_RULES_AFTER_LIGHT];

export function planTilePrompt(): string {
  return [PLAN_TILE_INPUT, ...planRules()].join("\n");
}

export function planWholePrompt(): string {
  return [
    "INPUT: an exact 3D render of a whole storey's floor plan of a pair of semi-detached homes drawn as mirror images about the party wall between them, with their front yard, seen straight down from above, the walls cut at about one metre.",
    ...planRules(),
    "THE TWO HOMES ARE ONE DESIGN: every room of one home and its mirror room in the other have the very same floor material, colour and tone, and every piece in it the same finish as its mirror piece — never oak in one and stone in the other. Where the render draws the two homes unlike — a stair, a car, a door, a room on one side only — each keeps exactly what the render draws there.",
    "THE YARD: every parked car where the render parks it, each a real modern family car seen whole from directly above in the render's very hue — never crop a bumper at the page edge; grey pavers in the bays; pale stone paths and steps only where the render draws them; real lawn; pale Jerusalem stone only on garden and boundary walls the render already draws — never invent stone beside the bins' enclosure.",
  ].join("\n");
}

export function planYardPrompt(): string {
  const light = housePlanGolden()
    ? "LIGHT, WARM AND BRIGHT OVER THE YARD: keep the yard bright — warmer honey tint, very short faint contact shadows under cars and walls only; soft warm fill, no long dark streaks, no dusk; every outline stays as in the render; crisp and sharp; no harsh midday sun. Bins and boundary walls only where the render draws them — never invent Jerusalem stone the render lacks."
    : "LIGHT, THE SAME IN EVERY PART: soft, even, warm daylight from straight above, as the render is lit — no cast shadows across floors, lawns or paving, only a faint contact shade where an object meets the floor; an even exposure, crisp and sharp.";
  return [
    "INPUT: an exact 3D render of the front yard of a plot, seen straight down from above.",
    "TASK: re-surface the render only — a real material on every surface and real light — so it reads as a drone photograph of this very yard. The render is the sole authority on layout and inventory: resurface, do not redesign, do not improve, do not invent.",
    "KEEP EXACTLY, AS IN THE RENDER: the frame, the scale and the view straight down; every garden wall, step, path, parking bay, lawn, the bins' enclosure and every car — where it is, its outline, its size and how many.",
    "THE BALCONY, where the render has one along the house's front: its deck of mid-grey tiles, its whole outline, and the plastered wall dividing the two homes' balconies — all stay exactly as drawn, never merged into the paving or the lawn below it. Along every open edge draw a clear glass railing in a slim black metal frame: from above the top rail is one continuous thin black line, unbroken, about 2–3 cm wide in the picture, with the glass as a faint cool band just inside it — never omit it, never fade it into the deck or the lawn, never turn it into a solid parapet.",
    "MATERIALS, ONE SET FOR THE WHOLE PLOT: each car a real modern family car seen from directly above, in the render's very hue for it — a dark blue car stays dark blue, never black; grey interlocking pavers in the bays; pale stone paths and steps; real lawn; pale Jerusalem stone on every garden and boundary wall, with its coping; mid-grey 60 cm porcelain tiles on the balcony deck, and on every open edge a clear glass railing in a slim black frame (top rail a continuous thin black line).",
    light,
    "ADD NOTHING AND REMOVE NOTHING: no tree, plant, person, car, wall, step, sign, text or logo the render does not have, and none of its things left out or moved. Nothing beyond the plot's edge.",
  ].join("\n");
}

/** Default warm-bright snapshots. Prefer planTilePrompt() / planWholePrompt() / planYardPrompt() at paint time. */
export const PLAN_TILE_PROMPT = planTilePrompt();
export const PLAN_WHOLE_PROMPT = planWholePrompt();
export const PLAN_YARD_PROMPT = planYardPrompt();
/**
 * Said with a part painted after its partner, the partner's painting given
 * beside it mirrored: each home painted alone came back its own design —
 * grey linen beside white, the boundary wall changing stone at the party
 * fence (Gottlieb A, 14/10/2026).
 */
export const PLAN_PARTNER_PROMPT =
  "IMAGE 2 is the neighbouring part of the same photograph, already finished, shown mirrored. Give image 1 exactly its materials, colours, textures and light, so the two join as one photograph. Take nothing else from it: what stands where is image 1's. The two sides are not drawn alike: a stair, step, wall, car or object image 2 has and image 1 does not, image 1 does not get — where image 1 is lawn, it stays lawn.";


/**
 * A house's room from eye height: a photograph of a real, newly furnished
 * room in the golden hour, every piece the render stands kept where it is.
 */
const roomLook = (style: FloorplanVizStyleKit) =>
  `An unretouched interior photograph of a real, newly built and furnished family home, taken from eye height on a full-frame camera with a 24 mm lens, verticals straight, the same frame as the render. Every piece the render stands — each sofa, armchair, dining table and chair, kitchen worktop, sink, hob, bed, wardrobe and door — stays exactly the piece it is, where it is and its size and count; add no furniture, and no television or screen anywhere. Paint them as real: upholstery with visible weave and soft cushions, solid oak and walnut with their grain, stone worktops, made beds with crisp linen, porcelain floor tiles and oak floors with their joints, smooth white plaster ceilings. Golden hour: warm low evening sun falls through the windows in long soft streaks across the floor and furniture, the view outside the windows a real garden and sky. It must look photographed: true-to-life colour, natural dynamic range, real texture and soft shadow, nothing airbrushed. ${materialsStyleBlock(style)}`;

/**
 * A request the image model never answers held its worker, and the booklet,
 * forever. A 4K picture is drawn in more than twice the time a 1K one is.
 */
export function passTimeoutMs(size: HouseImageSize): number {
  return size === "4K" ? 360_000 : size === "2K" ? 210_000 : 150_000;
}

/** work given a signal that is aborted after `ms`: a pass past its time asks no further model. */
function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new Error(`no answer in ${ms / 1000}s`));
    }, ms);
  });
  return Promise.race([work(abort.signal), late]).finally(() => clearTimeout(timer));
}

/**
 * The render in a frame the image model draws exactly, and the painting cut
 * back to the render's. A 2400 × 1500 aerial came back 3:2, its content moved
 * a different few per cent each time, and a faithful painting scored 0.40
 * where the same painting laid back in place scored 0.64. The render's edge
 * rows and columns are carried out to the nearest of the model's ratios —
 * the smallest frame that holds the render — and that band is cut away again.
 */
export async function inModelFrame(render: Buffer, wide = false): Promise<{ image: Buffer; back(painting: Buffer): Promise<Buffer> }> {
  const { width: w = 1, height: h = 1 } = await sharp(render).metadata();
  const ratioOf = (r: string) => {
    const [a, b] = r.split(":").map(Number);
    return a! / b!;
  };
  const frames = aspectRatios(wide).map((r) => {
    const k = ratioOf(r);
    return k >= w / h ? { W: Math.round(h * k), H: h } : { W: w, H: Math.round(w / k) };
  });
  const { W, H } = frames.reduce((best, f) => (f.W * f.H < best.W * best.H ? f : best));
  const left = Math.floor((W - w) / 2);
  const top = Math.floor((H - h) / 2);
  if (W === w && H === h) return { image: render, back: async (painting) => painting };
  const image = await sharp(render)
    .extend({ left, right: W - w - left, top, bottom: H - h - top, extendWith: "copy" })
    .jpeg({ quality: 95 })
    .toBuffer();
  return {
    image,
    back: async (painting) => {
      const pw = (await sharp(painting).metadata()).width ?? W;
      const s = pw / W;
      const width = Math.round(w * s);
      const height = Math.round(h * s);
      return sharp(painting)
        .resize(Math.round(W * s), Math.round(H * s), { fit: "fill" })
        .extract({ left: Math.round(left * s), top: Math.round(top * s), width, height })
        .jpeg({ quality: 92 })
        .toBuffer();
    },
  };
}

/**
 * `attempts` is the picture's image calls, repairs included. `local`: the
 * part-by-part check too — calibrated on the house's views and elevations.
 * `"interior"`: a furnished plan or room — the render already holds the
 * inventory, so only lost structure refuses it (interiorFault); invented
 * soft staging is not requested in PLAN_RULES.
 */
type Kind = {
  kind: FinishKind;
  look: string;
  minEdges: number;
  minMasses: number;
  attempts: number;
  local: boolean | "interior";
  railings: boolean;
  /** The look is the whole of the prompt: no general rules, style or subject round it. */
  whole?: boolean;
  /** The architect's sheet the picture is furnished from, by name: a storey's plan, framed as its sheet is. */
  sheet?: string;
  /** The size it is asked for, where not HOUSE_IMAGE_SIZE: a whole storey's plan at 4K. */
  imageSize?: HouseImageSize;
  /** Framed to the strip ratios too (WIDE_ASPECT_RATIOS). */
  wide?: boolean;
};

/**
 * Calibrated on Gottlieb's twelve furnished plans (booklets of 8–9/10/2026),
 * each painting against its own render and against a neighbour's: every own
 * painting lost at most one patch of the render's lines, at edges 0.69 and
 * up; every neighbour's lost two or more, or one at edges 0.63 and below.
 * Invented objects told nothing — seven of the twelve own paintings had some.
 */
export const INTERIOR_ONE_LOSS_MIN_EDGES = 0.66;

/** A furnished plan's painting refused for what of the render it lost, or null where it holds. */
export function interiorFault(edges: number, lost: LocalFault[]): string | null {
  if (lost.length >= 2 || (lost.length === 1 && edges < INTERIOR_ONE_LOSS_MIN_EDGES)) {
    return `lost structure at ${[...new Set(lost.map((f) => f.place))].join(", ")}`;
  }
  return null;
}

/**
 * @deprecated Inactive — `houseLookOf` returns null for `view-plan-floor-*`.
 * Kept as an alias of `planWholePrompt()` so old imports cannot revive the
 * conflicting oak/even-light wording (Gottlieb pipeline, 16/10/2026).
 */
export const planLook = (_style: FloorplanVizStyleKit) => planWholePrompt();

/**
 * A storey's plan is the sheet itself, photographed: the architect's drawing
 * is the only picture the model is given, and it is told to build what the
 * drawing draws — every wall, opening, stair, fitting and piece of furniture
 * where it is drawn, its size, its shape and its count — as a 3D cut-away
 * model seen from straight above, in the drawing's own frame. Read by rules
 * into a model first, the plan lost what no rule knew (Gottlieb A: a double
 * sink for two, no kitchen table, tiles read as a bed); given the render
 * beside the sheet, the model mixed the two and drifted. The checks stay:
 * the painting's walls on the measured render's, and the drawing against the
 * painting piece by piece.
 */
export const SHEET_PHOTO = [
  "This image is an architect's floor plan drawing of one storey of a pair of semi-detached houses and the plot round them. Turn it into a photograph of a finely made 3D architectural model of exactly this drawing, seen from straight above with no perspective, in exactly the same frame and scale: every line of the drawing stays where it is.",
  "Build exactly what the drawing draws, and nothing else: every wall, as thick and as long as drawn, cut flat at about one metre; every door opening and window where it is drawn; every stair, its treads where they are drawn. In every room, every piece the drawing draws, where it is drawn, its size, its shape and its count: a row of rectangles with rounded ends is a sofa; each small rounded square at a table is one chair; a rounded box with a dot in a worktop is a sink, and two drawn apart are two separate sinks; four rings on a worktop are a hob; a box with a ring in it is a washing machine; a box with a diagonal is a wardrobe; a bath, a shower, a toilet and a basin each where drawn.",
  "Where a room of the drawing is bare — only its floor's hatching inside its walls — it stays bare floor: never furnish it, and never make any room a kitchen, a dining room or a living room the drawing does not furnish as one. A kitchen is only where the drawing draws a worktop with a sink and a hob; a dining table only where it draws one with its chairs; a sofa only where it draws one. Count the drawing's pieces: the photograph has exactly as many.",
  "The drawing's text, numbers, dimension lines, arrows and labels are not objects: never draw any of them. Its grey hatching is the floor's finish: large pale porcelain tiles in the living rooms, kitchens and halls, small grey tiles in the bathrooms, warm oak boards in the bedrooms. Outside the houses: the plot as drawn — lawn where it is dotted, interlocking pavers where it is herringbone-hatched, paving, the stone garden walls, the parking bays with real cars in them where the drawing marks parking.",
  "Real materials and soft daylight from above with gentle contact shadows and ambient occlusion, true-to-life colour, nothing glowing. No people, no text.",
].join("\n");

export function houseLookOf(name: string, style: FloorplanVizStyleKit): Kind | null {
  const held = { minEdges: FINISH_MIN_EDGES, minMasses: FINISH_MIN_MASSES, attempts: houseAttemptsPerPicture() };
  // A storey's plan a part at a time (plan-tiles.ts): one home's back or
  // front half, checked piece by piece inside the house; and its front yard.
  const tile = /^view-plantile-(floor-\d+)-(back|front|back-r|front-r|yard-[ab])\.jpg$/.exec(name);
  if (tile) {
    if (tile[2]!.startsWith("yard")) return { kind: "exterior", look: planYardPrompt(), whole: true, local: true, railings: false, ...held };
    return { kind: "cutaway", look: planTilePrompt(), whole: true, local: "interior", railings: false, sheet: `mask-${tile[1]}-${tile[2]}.png`, ...held };
  }
  // A storey's plan in one call (housePlanWhole), cut into the parts' places afterwards (plan-tiles wholeParts).
  const whole = /^view-planwhole-(floor-\d+)\.jpg$/.exec(name)?.[1];
  if (whole) {
    return { kind: "cutaway", look: planWholePrompt(), whole: true, local: "interior", railings: false, sheet: `mask-${whole}.png`, imageSize: housePlanImageSize(), wide: houseKnob("HOUSE_PLAN_WIDE") === "1", ...held };
  }
  const storey = /^view-plan-(floor-\d+)\.jpg$/.exec(name)?.[1];
  // A storey's sheet-framed plan is not Gemini-painted as `view-plan-*`: paint
  // goes through view-planwhole / plantile only. Measured plan stays in the booklet.
  if (storey) return null;
  if (name === "view-aerial-top.jpg") return { kind: "exterior", look: TOP_LOOK, local: true, railings: false, ...held };
  // The railings check is asked of the views from above, where a painting set
  // railings on bare parapets. From the street it refused every painting of a
  // front that has railings of its own — the balcony's glass, the street
  // wall's bars, painted with their posts (pilot of 10/10/2026).
  if (name === "view-hero.jpg") return { kind: "exterior", look: EXTERIOR_LOOK, local: true, railings: false, ...held };
  // A house's street corners from eye height (dwf-views): photographs as a passer-by takes them.
  if (/^view-corner-[a-z]+\.jpg$/.test(name)) return { kind: "exterior", look: EXTERIOR_LOOK, local: true, railings: false, ...held };
  if (/^view-aerial-[a-z]+\.jpg$/.test(name)) return { kind: "exterior", look: EXTERIOR_LOOK, local: true, railings: true, ...held };
  if (/^view-elev-[a-z]+\.jpg$/.test(name)) return { kind: "elevation", look: ELEVATION_LOOK, local: true, railings: false, ...held };
  // From eye height: not "apartment", whose rules see the plan straight from above.
  if (/^view-room-[a-z]+(-\d+)?\.jpg$/.test(name)) return { kind: "interior", look: roomLook(style), local: "interior", railings: false, ...held };
  if (/^unit-.+\.jpg$/.test(name)) return { kind: "apartment", look: unitLook(style), local: "interior", railings: false, ...held };
  return null;
}

export type Verdict = {
  edges: number;
  masses: number;
  /** The whole frame's edges and masses on the render's. */
  global: boolean;
  /** Null where the global check failed first, or the kind is not checked part by part. */
  local: { invented: LocalFault[]; lost: LocalFault[]; railings: LocalFault[]; reason: string | null } | null;
  held: boolean;
};

export async function judgePainting(kind: Pick<Kind, "minEdges" | "minMasses" | "local" | "railings"> & { kind?: Kind["kind"] }, render: Buffer, painting: Buffer): Promise<Verdict> {
  // An elevation is judged on the house above its ground line: the band of
  // earth under it is the section's abstraction, and every painting of model
  // A's street front gave it the front garden that stands there instead —
  // faithful houses, refused as drifted five times over (12/10/2026).
  if (kind.kind === "elevation") {
    // A hand above it: the garden at the house's foot — its walls, its planting, the bays beside it — is the painting's to make real.
    const line = await groundLine(render);
    if (line != null) [render, painting] = await Promise.all([cropTop(render, line - 0.06), cropTop(painting, line - 0.06)]);
  }
  const edges = await structuralMatch(render, painting);
  const masses = await massMatch(render, painting);
  const global = edges >= kind.minEdges && masses >= kind.minMasses;
  let local = global && kind.local ? await localMatch(render, painting, { railings: kind.railings }) : null;
  if (local && kind.local === "interior") local = { invented: [], lost: local.lost, railings: [], reason: interiorFault(edges, local.lost) };
  // Painted at all: a repair that handed the render back unchanged matched it
  // perfectly and held — model A's top view of 12/10/2026 differed from its
  // render by 4.7 in 255 a pixel, its painted neighbours by 35 to 72.
  if (global && !local?.reason && (await meanDifference(render, painting)) < UNPAINTED_DIFF) {
    local = { invented: local?.invented ?? [], lost: local?.lost ?? [], railings: local?.railings ?? [], reason: "not painted: the render came back almost unchanged — paint it as a photograph" };
  }
  return { edges, masses, global, local, held: global && !local?.reason };
}

/** The top of an elevation render's band of earth, as a share of its height: the first row from the top mostly in the section's earth colour. */
export async function groundLine(render: Buffer): Promise<number | null> {
  const W = 200;
  const { width = W, height = W } = await sharp(render).metadata();
  const H = Math.max(10, Math.round((W * height) / width));
  const px = await sharp(render).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const earth = (i: number) => {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    return r >= 125 && r <= 170 && g >= 112 && g <= 158 && b >= 95 && b <= 140 && r - b >= 18 && r - b <= 40;
  };
  // The band runs on to the frame's foot: the first row from which, down to
  // the bottom, rows are mostly earth — not a brown wall halfway up.
  const rows: boolean[] = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (earth((y * W + x) * 3)) n++;
    rows.push(n >= W * 0.3);
  }
  for (let y = Math.floor(H * 0.6); y < H - 2; y++) {
    if (!rows[y]) continue;
    const below = rows.slice(y);
    if (below.filter(Boolean).length >= below.length * 0.8) return y / H;
  }
  return null;
}

/** The picture above a share of its height. */
async function cropTop(image: Buffer, share: number): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(image).metadata();
  return sharp(image).extract({ left: 0, top: 0, width, height: Math.max(1, Math.round(height * share)) }).jpeg({ quality: 92 }).toBuffer();
}

/** Below this mean difference a pixel, 0–255, a painting is the render handed back. */
export const UNPAINTED_DIFF = 10;

/** The mean absolute difference a pixel between two pictures, at 400 px wide. */
export async function meanDifference(a: Buffer, b: Buffer): Promise<number> {
  const { width = 400, height = 400 } = await sharp(a).metadata();
  const h = Math.max(1, Math.round((400 * height) / width));
  const [x, y] = await Promise.all([a, b].map((buf) => sharp(buf).resize(400, h, { fit: "fill" }).removeAlpha().raw().toBuffer()));
  let sum = 0;
  for (let i = 0; i < x!.length; i++) sum += Math.abs(x![i]! - y![i]!);
  return sum / x!.length;
}

/**
 * What the painting changed that the pixel checks do not see: an object of the
 * render gone, or one put where the render has none. Writing is a few small
 * strokes — the edge and mass checks passed a "דגם A" plaque on a stone wall
 * (9/10/2026) — and a car is a small mass on a big picture: the pilot of
 * 10/10/2026 painted model A's ground floor without the two cars of its left
 * bays, and held. The vision model is asked only this, with both pictures;
 * null where it found nothing or did not answer.
 */
const FIDELITY_PROMPT = [
  "Image 1 is a measured architectural render of a pair of semi-detached houses and their plot. Image 2 is a photographic painting of it. Image 1 is the authority on what stands where.",
  "Compare them object by object and report ONLY a real difference in what is there — not colour, material, texture, light, shadow, sky or the cars' make: a parked car (count every car in image 1 and check each is in image 2 at the same place), a building wall or volume, a window, a door, a balcony, a stair or step, a railing, a garden wall or fence, a gate, a tree, a bin enclosure, furniture standing outdoors, and any writing, sign, plaque, logo or house number (a car's number plate is not writing).",
  'A see-through glass railing in image 1 that image 2 makes a solid wall or parapet is a fault: report it as {"kind": "missing", "what": "glass railing"}. Planting, pots, flowers and climbing plants in the garden, light and glow, and the far hazy background are not faults.',
  'Answer JSON only: {"faults": [{"kind": "missing" or "added", "what": short name, "where": one of "top-left", "top", "top-right", "left", "middle", "right", "bottom-left", "bottom", "bottom-right", "text": the writing if it is writing, else ""}]} — an empty list where image 2 holds every object of image 1 and adds none.',
].join("\n");

export type PaintingFault = { kind: "missing" | "added"; what: string; where: string; text: string };
export type FidelityCheck = (render: Buffer, painting: Buffer) => Promise<PaintingFault[] | null>;

const PLACES = new Set(["top-left", "top", "top-right", "left", "middle", "right", "bottom-left", "bottom", "bottom-right"]);

export const paintingFaults: FidelityCheck = async (render, painting) => {
  const answer = await askDrawing(FIDELITY_PROMPT, [render, painting]).catch(() => null);
  const raw = answer && Array.isArray(answer.faults) ? (answer.faults as unknown[]) : [];
  const faults = raw.flatMap((f): PaintingFault[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    if (o.kind !== "missing" && o.kind !== "added") return [];
    const where = typeof o.where === "string" && PLACES.has(o.where) ? o.where : "middle";
    return [{ kind: o.kind, what: typeof o.what === "string" ? o.what : "object", where, text: typeof o.text === "string" ? o.text : "" }];
  });
  // Only what the vision model answers the same way twice: writing, a car,
  // furniture out of doors. Asked of stairs, doors, windows and trees it said
  // "missing" of one painting and "added" of its repair (pilot of 10/10/2026),
  // and refused seven pictures of ten the pixel checks had held or mended.
  const kept = faults.filter((f) => f.text || TRUSTED.test(f.what));
  return kept.length ? kept : null;
};

// A glass railing painted solid: model A's aerial of 11/10/2026 held with its balcony walled in.
const TRUSTED = /(car|cars|vehicle|writing|text|sign|plaque|logo|lettering|number|furniture|bed|sofa|couch|table|chair|stool|glass railing)/i;

/**
 * A storey's painting against its sheet, room by room: every piece the sheet
 * draws there, and nothing it does not. The sheet is the authority on what
 * stands in a room; the vision model reads both and lists what differs.
 */
const FURNISHING_PROMPT = [
  "Image 1 is an architect's floor plan drawing of one storey of a pair of semi-detached houses. Image 2 is a photographic 3D plan of the same storey, in the same frame.",
  "Go room by room. For every piece image 1 draws — bed, wardrobe, sofa, armchair, dining or kitchen table, each chair, kitchen worktop, each sink (two sinks drawn apart are two sinks), hob, fridge, bath, shower, toilet, basin, washing machine, stair — check image 2 has it in the same place, and that image 2 adds no piece image 1 does not draw. A toilet added next to a washing machine in a laundry is an added fault. A television, monitor or screen image 1 lacks is an added fault. Text, numbers, dimensions and hatching in image 1 are not pieces.",
  'Answer JSON only: {"faults": [{"kind": "missing" or "added", "what": the piece, "where": one of "top-left", "top", "top-right", "left", "middle", "right", "bottom-left", "bottom", "bottom-right", "text": ""}]} — an empty list where image 2 furnishes every room exactly as image 1 draws it.',
].join("\n");

export const furnishingFaults: FidelityCheck = async (sheet, painting) => {
  const answer = await askDrawing(FURNISHING_PROMPT, [sheet, painting]).catch(() => null);
  const raw = answer && Array.isArray(answer.faults) ? (answer.faults as unknown[]) : [];
  const faults = raw.flatMap((f): PaintingFault[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    if (o.kind !== "missing" && o.kind !== "added") return [];
    return [{ kind: o.kind, what: typeof o.what === "string" ? o.what : "piece", where: typeof o.where === "string" && PLACES.has(o.where) ? o.where : "middle", text: "" }];
  });
  return faults.length ? faults : null;
};

/**
 * A storey's painting against its render, piece by piece (furnitureFaults):
 * the render is furnished from the sheet, so a piece it stands that the
 * painting lost, turned to another thing, or a piece it added, is a fault.
 */
/** A frame place ("top centre", "middle left") in the fault list's words ("top", "left"). */
const placeWord = (place: string) => (place.startsWith("middle ") ? place.slice(7) : place.endsWith(" centre") ? place.slice(0, -7) : place.replace(" ", "-"));

export async function pieceFaults(render: Buffer, painting: Buffer, mask?: Buffer): Promise<PaintingFault[] | null> {
  const { lost, changed, added } = await furnitureFaults(render, painting, mask);
  const faults: PaintingFault[] = [
    ...lost.map((f): PaintingFault => ({ kind: "missing", what: "piece of furniture", where: placeWord(f.place), text: "" })),
    ...changed.map((f): PaintingFault => ({ kind: "missing", what: "piece painted as another thing", where: placeWord(f.place), text: "" })),
    ...added.map((f): PaintingFault => ({ kind: "added", what: "piece of furniture", where: placeWord(f.place), text: "" })),
  ];
  return faults.length ? faults : null;
}

/** A held verdict refused for what the painting lost or added: mended as the pixel checks' own faults are, at their places. */
export function withFaults(v: Verdict, faults: PaintingFault[]): Verdict {
  const at = (f: PaintingFault): LocalFault => ({ place: f.where, box: { x: 0, y: 0, w: 1, h: 1 } });
  const added = faults.filter((f) => f.kind === "added");
  const missing = faults.filter((f) => f.kind === "missing");
  const said = (f: PaintingFault) => `${f.what} ${f.kind} at the ${f.where}${f.text ? ` ("${f.text}")` : ""}`;
  return {
    ...v,
    held: false,
    local: {
      invented: [...(v.local?.invented ?? []), ...added.map(at)],
      lost: [...(v.local?.lost ?? []), ...missing.map(at)],
      railings: v.local?.railings ?? [],
      reason: faults.map(said).join("; "),
    },
  };
}

/**
 * A storey photographed from its sheet, judged on the sheet: its edges must
 * fall on the drawing's — walls, openings, the pieces in the rooms — and no
 * part of the drawing may go missing. The masses are not asked: the drawing's
 * grey hatching is a floor's finish, not a mass.
 */
export async function judgeOnSheet(kind: Pick<Kind, "minEdges">, sheet: Buffer, painting: Buffer): Promise<Verdict> {
  const { width = 1, height = 1 } = await sharp(painting).metadata();
  const drawn = await sharp(sheet).resize(width, height, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
  const edges = await structuralMatch(drawn, painting);
  const masses = 1;
  const global = edges >= SHEET_MIN_EDGES;
  return { edges, masses, global, local: null, held: global };
}

/** A photograph's edges against a line drawing's: lower than a render's against its painting, calibrated on Gottlieb A. */
export const SHEET_MIN_EDGES = 0.45;

export function verdictText(v: Verdict): string {
  const scores = `edges ${v.edges.toFixed(2)} masses ${v.masses.toFixed(2)}`;
  if (v.held) return `${scores} — held`;
  return `${scores} — refused: ${v.global ? v.local!.reason : "drifted from the render's frame"}`;
}

/**
 * What the next image call is, from the last painting's verdict. A painting
 * off the render's frame is not mended — every part of it is somewhere else
 * — but painted afresh, told it drifted. One that holds the frame and fails
 * in a part is handed back with the render, and that part named.
 */
export type NextPass =
  | { how: "paint" }
  | { how: "repaint"; edges: number; masses: number }
  | { how: "repair"; invented: LocalFault[]; lost: LocalFault[]; railings: LocalFault[]; reason: string };

export function nextPass(last: Verdict | null): NextPass {
  if (!last) return { how: "paint" };
  if (!last.global) return { how: "repaint", edges: last.edges, masses: last.masses };
  if (last.local?.reason) return { how: "repair", invented: last.local.invented, lost: last.local.lost, railings: last.local.railings, reason: last.local.reason };
  return { how: "paint" };
}

const placesOf = (faults: LocalFault[]) => [...new Set(faults.map((f) => f.place))].join(", ");

export function repaintPrompt(kind: Pick<Kind, "kind" | "look" | "whole">, subject: string, pass: Extract<NextPass, { how: "repaint" }>): string {
  return [
    kind.whole ? kind.look : finishPrompt(kind.kind, subject, { look: kind.look }),
    `A painting of this render before this one drifted off its frame: only ${Math.round(pass.edges * 100)}% of its lines fell on the render's, and its masses matched ${Math.round(pass.masses * 100)}%. Lay every line exactly over the render's: the same camera, horizon and scale, every roof edge, wall corner, window and garden wall at the same place in the frame. Do not zoom, crop, recentre, straighten or widen the view.`,
  ].join("\n");
}

/** The painting first: the model edits the first image it is given (correctionPrompt). */
export function repairPrompt(kind: Pick<Kind, "kind">, pass: Extract<NextPass, { how: "repair" }>): string {
  const what = kind.kind === "elevation" ? "elevation" : "house";
  return [
    `Image 1 is your photorealistic painting of a ${what}. Image 2 is the exact measured render it was painted over: it is the authority on what stands where.`,
    `The painting was refused against the render: ${pass.reason}.`,
    ...(pass.invented.length
      ? [
          `At the ${placesOf(pass.invented)} of image 1 there is something image 2 does not have there — furniture, a post, a railing, a window, a plant or any other object. Take it out completely and continue there the surface image 2 has — the bare roof, the wall, the paving or the lawn — in image 1's materials and light.`,
        ]
      : []),
    ...(pass.railings.length
      ? [
          `At the ${placesOf(pass.railings)} of image 1 a railing or fence stands on a wall where image 2 has none. Take the railing out completely: the wall ends at its own stone top, bare, exactly as image 2 draws it, with what image 2 has behind it showing above.`,
        ]
      : []),
    ...(pass.lost.length
      ? [
          `At the ${placesOf(pass.lost)} of image 1, a line of image 2 — a wall, a roof or parapet edge, a window, a step or a garden wall — was lost or changed. Put it back exactly where and as big as image 2 draws it, in image 1's materials.`,
        ]
      : []),
    KEEP_ROOF,
    "Change nothing else: keep image 1's materials, colours, light, shadows, sky and finish quality, and keep image 2's camera and framing exactly — every line where image 2 has it. Do not draw any frame, mark or text. No people.",
  ].join("\n");
}

type PictureSet = { names(): string[]; get(name: string): Buffer | undefined };

function paintingJobs(pictures: PictureSet, style: FloorplanVizStyleKit) {
  const names = new Set(pictures.names());
  return pictures
    .names()
    // The booklet shows an elevation beside its sheet only (dwf-booklet-html): one no sheet draws is not paid for.
    .filter((name) => {
      const side = /^view-(elev-[a-z]+)\.jpg$/.exec(name)?.[1];
      return !side || names.has(`sheet-${side}.jpg`);
    })
    .map((name) => {
      const kind = houseLookOf(name, style);
      const storey = /^view-plan(?:whole)?-(floor-\d+)\.jpg$/.exec(name)?.[1];
      const tile = /^view-plantile-(floor-\d+-(?:back|front)(?:-r)?)\.jpg$/.exec(name)?.[1];
      const mask = tile ? pictures.get(`mask-${tile}.png`) : storey ? pictures.get(`mask-${storey}.png`) : undefined;
      return { name, kind, render: pictures.get(name), sheet: kind?.sheet ? pictures.get(kind.sheet) : undefined, mask };
    })
    .filter((j): j is { name: string; kind: Kind; render: Buffer; sheet: Buffer | undefined; mask: Buffer | undefined } => j.kind != null && j.render != null);
}


/** What a painting is keyed by besides its render and model: the subject and the look it was asked in. */
export function paintingPrompt(subject: string, kind: Kind): string {
  if (kind.whole) return kind.imageSize ? `${kind.look}\u0000${kind.imageSize}` : kind.look;
  return `${subject}\u0000${kind.look}${kind.sheet ? `\u0000${SHEET_PHOTO}` : ""}`;
}

/**
 * The pictures a painting run would paint, before any call: the ones it
 * paints, and those whose render is unchanged since a painting held it —
 * reused, unpaid. For the estimate the run is approved on.
 */
export async function paintingPlan(
  pictures: PictureSet,
  options: { subject: string; style: FloorplanVizStyleKit; models?: string[]; cache?: PaintingCache },
): Promise<{ names: string[]; reused: string[] }> {
  const model = (options.models?.length ? options.models : HOUSE_IMAGE_MODELS)[0] ?? "unknown";
  const jobs = paintingJobs(pictures, options.style);
  const reused: string[] = [];
  for (const job of jobs) {
    if (options.cache && (await options.cache.get(paintingKey(job.render, paintingPrompt(options.subject, job.kind), model)))) reused.push(job.name);
  }
  return { names: jobs.map((j) => j.name), reused };
}

export async function paintHousePictures(
  pictures: PictureSet & { set(name: string, data: Buffer): void },
  options: {
    subject: string;
    style: FloorplanVizStyleKit;
    say?: (step: string) => void;
    concurrency?: number;
    /** The job's spend and budget; without one, the pictures are costed but not capped. */
    spend?: HouseSpend;
    client?: GoogleGenAI;
    /** The image models to ask, in order: HOUSE_IMAGE_MODELS where not given. */
    models?: string[];
    /** Paintings already held, by their render's key: a render that has not changed is not painted again. */
    cache?: PaintingCache;
    /** The house model the pictures are of, for the cost report. */
    group?: string;
    /** What a painting lost or added beyond the pixel checks (paintingFaults): asked of every picture that otherwise holds. */
    fidelity?: FidelityCheck;
    /** What a storey's painting furnished unlike its sheet (furnishingFaults). */
    furnishing?: FidelityCheck;
    /**
     * A storey's painting against its render, room by room (plan-function-gate):
     * asked of every cut-away plan that otherwise holds. Its faults are mended
     * like the pixel checks' own.
     */
    semantic?: (render: Buffer, painting: Buffer, name: string) => Promise<PaintingFault[] | null>;
    /** Each attempt's painting as it came back, before it is judged: for looking at what was refused. */
    keep?: (name: string, attempt: number, painting: Buffer) => void;
    /** Image calls a picture, where not the look's own. */
    attempts?: number;
    /** Only these pictures are painted (a trial of a new look on a few); the rest keep their renders. */
    only?: (name: string) => boolean;
    /** A picture's partner already painted, mirrored to it: its materials and light are matched (PLAN_PARTNER_PROMPT). */
    partner?: (name: string) => Buffer | undefined;
    /**
     * Pictures sent after a picture's own on every pass, and what to say of
     * them given where they start and where the picture is (a storey's floor
     * swatches, swatchPrompt): reserved against the ceiling with it.
     */
    references?: (name: string) => { images: Buffer[]; prompt: (first: number, picture: number) => string } | undefined;
    /**
     * Extra prompt lines for a picture (DXF inventory lock for whole-floor
     * plans). Appended to the paint/repair text after the look.
     */
    promptExtra?: (name: string) => string | undefined;
    /**
     * One attempt a picture, kept whatever the checks say, their verdict
     * reported: for a person who compares each painting with its sheet. The
     * checks refused every plan painting of 14/10/2026, the faithful ones too.
     */
    humanReview?: boolean;
  },
): Promise<string[]> {
  const say = options.say ?? (() => undefined);
  const spend = options.spend ?? houseSpend();
  const paid = options.client != null || paidAiAllowed();
  if (!paid) say("photoreal: paid image calls are off in this process (set ALLOW_PAID_AI=1 to allow them); only paintings already held are used, the other renders are kept");
  let client: GoogleGenAI | null = options.client ?? null;
  const models = options.models?.length ? options.models : [...HOUSE_IMAGE_MODELS];
  const model = models[0] ?? "unknown";
  const group = options.group ?? "";
  const jobs = paintingJobs(pictures, options.style).filter((j) => options.only?.(j.name) ?? true);
  const painted: string[] = [];
  const free = { calls: 0, images: 0, usd: 0, ils: 0 };
  let next = 0;
  const work = async () => {
    for (;;) {
      const job = jobs[next++];
      if (!job) return;
      const key = paintingKey(job.render, paintingPrompt(options.subject, job.kind), model);
      // A held painting is reused only if it was painted at all: one the
      // render was handed back as was kept before that was checked.
      const cached = await options.cache?.get(key);
      const kept = cached && (await meanDifference(job.render, cached)) >= UNPAINTED_DIFF ? cached : null;
      if (kept) {
        pictures.set(job.name, kept);
        painted.push(job.name);
        spend.pictures.push({ group, name: job.name, outcome: "reused", ...free });
        say(`photoreal ${job.name}: the render is unchanged — its approved painting is reused, no call made`);
        continue;
      }
      if (!paid) {
        spend.pictures.push({ group, name: job.name, outcome: "kept-render", ...free });
        continue;
      }
      client ??= await geminiClient();
      if (spend.stopped) {
        spend.skipped.push(job.name);
        spend.pictures.push({ group, name: job.name, outcome: "budget", ...free });
        say(`photoreal ${job.name}: not painted — the budget of ₪${spend.budgetIls} is reached; the measured render is kept`);
        continue;
      }
      const size = job.kind.imageSize ?? HOUSE_IMAGE_SIZE;
      const frame = await inModelFrame(job.render, job.kind.wide);
      // A storey's plan is painted with its sheet beside it: the walls the render's, what stands in the rooms the sheet's.
      // The sheet photographed alone was invented over (Gottlieb A, 11/10/2026: cars
      // in the yard beside an upper floor, two of four bays emptied): a plan is
      // painted from its render like every picture, and its sheet checks it.
      const drawing: Buffer | null = null;
      let unpaid = false;
      const { result: best, cost } = await withPictureLedger(spend, async (): Promise<Buffer | null> => {
        let last: { raw: Buffer; verdict: Verdict; paintedness: number } | null = null;
        const partner = options.partner?.(job.name);
        const refs = options.references?.(job.name);
        const refCount = refs?.images.length ?? 0;
        for (let attempt = 1; attempt <= (options.humanReview ? 1 : (options.attempts ?? job.kind.attempts)); attempt++) {
          const pass = nextPass(last?.verdict ?? null);
          const sent = (pass.how === "repair" || partner ? 2 : 1) + refCount;
          const release = reserve(spend, model, sent, undefined, size);
          if (!release) {
            unpaid = true;
            if (attempt === 1) spend.skipped.push(job.name);
            say(`photoreal ${job.name}: no ${pass.how} — the next call would pass the budget of ₪${spend.budgetIls}; the measured render is kept`);
            return null;
          }
          const step = pass.how === "repair" ? `repair ${attempt} (${pass.reason})` : pass.how === "repaint" ? `repaint ${attempt} (drifted)` : `paint ${attempt}`;
          let cutOff = false;
          try {
            const base =
              pass.how === "repair" ? repairPrompt(job.kind, pass) : pass.how === "repaint" ? repaintPrompt(job.kind, options.subject, pass) : job.kind.whole ? job.kind.look : finishPrompt(job.kind.kind, options.subject, { look: job.kind.look });
            // A storey's plan: the drawing alone, photographed (SHEET_PHOTO); a repair, the painting and the drawing.
            const said = drawing
              ? pass.how === "repair"
                ? [
                    "Image 1 is your photograph of a 3D model of an architect's floor plan. Image 2 is the drawing itself: it is the authority on every wall, opening, stair and piece of furniture, in the same frame.",
                    `The photograph was refused: ${pass.reason}. Put right exactly that, as image 2 draws it, and change nothing else — keep image 1's materials and light, and every line where image 2 has it. Never draw the drawing's text, numbers or hatching.`,
                  ].join("\n")
                : pass.how === "repaint"
                  ? `${SHEET_PHOTO}\nA photograph of this drawing before this one drifted off its frame: lay every line exactly over the drawing's — the same frame and scale, nothing zoomed, cropped or moved.`
                  : SHEET_PHOTO
              : partner && pass.how !== "repair"
                ? `${base}\n${PLAN_PARTNER_PROMPT}`
                : base;
            const own: Buffer[] = drawing
              ? pass.how === "repair" ? [last!.raw, drawing] : [drawing]
              : pass.how === "repair" ? [last!.raw, frame.image] : partner ? [frame.image, partner] : [frame.image];
            const picture = !drawing && pass.how === "repair" ? 2 : 1;
            const extra = options.promptExtra?.(job.name)?.trim();
            const withExtra = extra ? `${said}\n${extra}` : said;
            const prompt = refs && refCount ? `${withExtra}\n${refs.prompt(own.length + 1, picture)}` : withExtra;
            const images: Buffer | Buffer[] = refCount ? [...own, ...refs!.images] : own.length === 1 ? own[0]! : own;
            const done: { image: Buffer } | null = await withTimeout((signal): Promise<{ image: Buffer; model: string } | null> => finishPass(client!, prompt, images, models, size, signal, job.kind.wide), passTimeoutMs(size));
            if (!done) {
              say(`photoreal ${job.name} ${step}: no picture came back`);
              continue;
            }
            const painting = await frame.back(done.image);
            options.keep?.(job.name, attempt, painting);
            // A plan photographed from its sheet is laid over the sheet's lines: its colours are its own, not the render's.
            let verdict = await judgePainting(job.kind, job.render, painting);
            // A repair given the render beside the painting can copy the render
            // back in: model A's aerial of 12/10/2026 came back from its repair
            // with the render's toy cars, flat lawn and bare slope pasted over a
            // fine photograph, matched the render — and held. A repair keeps at
            // least three quarters of the painting it mends.
            const paintedness = await meanDifference(job.render, painting);
            if (verdict.held && pass.how === "repair" && last && paintedness < 0.75 * last.paintedness) {
              verdict = { ...verdict, held: false, local: { invented: [], lost: [], railings: [], reason: "the repair handed back the render — repaint it as a photograph" } };
            }
            // The vision check knows the house and its plot from outside: a room or a unit's plan is held by its pieces.
            if (verdict.held && job.kind.kind !== "apartment" && job.kind.kind !== "interior") {
              const faults = job.sheet ? await (options.furnishing ? options.furnishing(job.sheet, painting) : pieceFaults(job.render, painting, job.mask)) : await (options.fidelity ?? paintingFaults)(job.render, painting);
              if (faults) verdict = withFaults(verdict, faults);
            }
            if (verdict.held && options.semantic && job.kind.kind === "cutaway") {
              const faults = await options.semantic(job.render, painting, job.name);
              if (faults) verdict = withFaults(verdict, faults);
            }
            say(`photoreal ${job.name} ${step}: ${verdictText(verdict)}${options.humanReview ? " — kept for review" : ""}`);
            if (verdict.held || options.humanReview) return painting;
            last = { raw: done.image, verdict, paintedness };
          } catch (err: unknown) {
            const error = err instanceof Error ? err.message : String(err);
            log.warn("photoreal pass failed", { name: job.name, error });
            say(`photoreal ${job.name} ${step}: ${error}`);
            // A call cut off at its time may still be billed: its share stays held against the ceiling.
            if (/^no answer in /.test(error)) cutOff = true;
          } finally {
            if (!cutOff) release();
          }
        }
        return null;
      });
      say(`photoreal ${job.name} cost: ${formatCost(cost)}`);
      spend.pictures.push({ group, name: job.name, outcome: best ? "painted" : unpaid && cost.calls === 0 ? "budget" : "kept-render", ...cost });
      if (best) {
        pictures.set(job.name, best);
        painted.push(job.name);
        // Kept for a person's review is not approved: a later run must not take it as held.
        if (!options.humanReview) await options.cache?.put(key, best);
      } else if (!unpaid) {
        say(`photoreal ${job.name}: no painting held the render; the render is kept`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, work));
  return painted;
}

async function geminiClient(): Promise<GoogleGenAI> {
  const { GoogleGenAI } = await import("@google/genai");
  const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
  return new GoogleGenAI({ apiKey: getGeminiApiKey() });
}
