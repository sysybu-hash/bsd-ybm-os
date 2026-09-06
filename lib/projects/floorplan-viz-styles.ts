import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { PRESENTATION_LOCK } from "@/lib/projects/floorplan-viz-lock";

export const FLOORPLAN_VIZ_PRESET_IDS = [
  "contemporary",
  "luxury",
  "scandi",
  "jerusalem_stone",
  "developer_white",
  "haredi_classic",
  "haredi_modern",
] as const;

export type FloorplanVizPresetId = (typeof FLOORPLAN_VIZ_PRESET_IDS)[number];
export type FloorplanVizStyleId = FloorplanVizPresetId | "custom";
export type FloorplanVizAudience = "general" | "haredi";

export type FloorplanVizStyleKit = {
  id: FloorplanVizStyleId;
  audience: FloorplanVizAudience;
  labelHe: string;
  labelEn: string;
  labelRu: string;
  summaryHe: string;
  colors: string[];
  materialsHe: string;
  promptBlock: string;
};

export const DEFAULT_FLOORPLAN_VIZ_STYLE_ID: FloorplanVizPresetId = "contemporary";

export const HAREDI_MODESTY_PROMPT = `
MODESTY (global — every view, every room):
- No people, no mannequins, no human silhouettes.
- NO SCREENS anywhere: no televisions, no computer monitors, no laptops, no tablets, no phones, no glowing displays, no soundbar.
- From bird's-eye a screen reads as a dark rectangular panel. Two places it keeps appearing, both forbidden: a thin black bar lying on a desk or cabinet, and a dark panel mounted flat on a bedroom or living-room wall. A bedroom wall carries a picture, a mirror, a shelf or nothing — never a dark panel. A desk holds unmarked books, a lamp, or a clock, never a monitor.
- If a wall looks bare, leave it bare. A blank wall is correct; a screen to fill it is not.
- Do NOT draw the furniture a screen sits on. No media console, no TV unit, no low cabinet placed facing the sofa, no floating shelf under a living-room wall. The wall the sofa faces holds a framed landscape or nothing at all. Every time a console is drawn there, a screen ends up on it.
- A desk holds exactly this: closed books, a lamp, a pen cup, a notebook. Nothing else goes on a desk. There is no laptop open or closed, no tablet, no keyboard, no dark slab of any size resting on a desk, a shelf, a console, a counter or a bedside table anywhere in this apartment.
- Wall art: landscape or geometric only. No figurative paintings, sculptures, or photographs of people.
- Mezuzah cases on doorposts when a doorway is visible — small physical cases only, no letters.
- The image must contain no readable Hebrew or Latin text (including book spines, covers, mezuzah letters, and wall verses).
`.trim();

export const HAREDI_BED_PROMPT = `
BEDS (haredi — modest AND plan-faithful, non-negotiable):
- THIS SECTION OVERRIDES the "same size" clause of the pixel lock for beds only. An Israeli sales plan draws the master bedroom as one wide double rectangle; that rectangle is a SLEEPING ZONE, not a furniture spec. Render it as a single twin along the long wall. Every other rule — room, position, count, and every non-bed object — still follows the drawing exactly.
- NEVER a double / queen / king, no matter how wide the drawn rectangle is. NEVER two twins pushed together as one bed or one shared headboard.
- Every mattress in the frame is 90 cm wide and 200 cm long. Seen from above it is a long narrow rectangle, more than twice as long as it is wide. A mattress that reads as square-ish, or as wide as the nightstands on either side of it, is a double and is wrong.
- One pillow on each mattress, one headboard per mattress, and no headboard spanning more than one mattress. Two pillows side by side under one headboard is the double bed this rule exists to prevent.
- The master bedroom is NOT an exception. There is no double bed anywhere in this apartment, in any room, in any view.
- Copy the NUMBER and POSITION of bed rectangles from the plan. One drawn bed → one twin. Two drawn twins → two twins with the printed gap in those drawn positions.
- Do NOT add a second bed to a room that has only one rectangle. Do NOT fill an empty ממ"ד with beds. Do NOT turn every bedroom into a twin dormitory.
- Two twins side-by-side only if the plan draws them that way. A bedroom whose printed width fits one rectangle gets ONE twin along the long wall, with walkable floor.
- ONLY inside rooms whose kind is bedroom or mmd. Never in an office/study, storage, kitchen, living, hall, or bathroom.
`.trim();

export const PLAN_TRACE_LOCK = `
PLAN TRACE (every style, every view — non-negotiable):
- The attached sales plan is the only layout. Copy walls, doors, windows, room shapes, kitchen run, island, closets, and fixtures 1:1.
- Style changes finishes, lighting, and textiles ONLY. It must not add, remove, or move rooms, walls, doors, windows, sinks, toilets, bathtubs, stairs, or terraces.
- Furniture count and placement follow the drawing symbols. Do not invent a second kitchen, a second cooktop, a second office, an island sink, an entrance basin, a guest WC, a wraparound deck, an extra bedroom, or a stairwell.
- An office/study is desks. A storage room is shelves. Neither is a kitchen or a bedroom. Do not duplicate either.
- A 90 cm mark is a door width. Hatched rectangles are closets with CLOSED cabinet doors. An oval basin is a sink. A toilet pan is a toilet. If it is not drawn, do not add it.
- A brick or paving hatch outside the wall line — usually labelled מרפסת with its own area figure — is a TERRACE, not a room. Open floor, a railing, at most one planter. It never becomes a bathroom, a bedroom or a store, and it never gets a bath, toilet, basin, bed or wardrobe. Render exactly as many terraces as the plan draws, in the places it draws them.
- Output photograph: ZERO letters, digits, room names, CAD arrows, or 2D hatch on floors or walls.
`.trim();

export const KITCHEN_SINK_LOCK = `
KITCHEN / ENTRANCE FIXTURES (non-negotiable):
- Kitchen sinks: copy the plan only. A double-bowl sink (כיור כפול) is ONE fixture — two basins side by side on that counter. Do not add a second or third sink location. Do not put a sink on the island unless the plan draws a basin on the island.
- Entrance: do NOT add a sink, vanity, or נטילת ידיים basin unless the plan draws an oval/round basin fixture. A 90 cm mark is a door width. A wall niche or closet (hatched) is not a sink.
`.trim();

export const HAREDI_INNOVATIVE_PROMPT = `
AESTHETIC (haredi — both kits, non-negotiable):
- Contemporary 2020s Israeli architecture: innovative, clean, high-end modest.
- NOT antique, NOT baroque, NOT carved period furniture, NOT Victorian library, NOT shtetl, NOT museum Judaica, NOT gold-ornate hotel-classic, NOT heavy velvet drapes.
- Modern millwork, large-format tile or pale parquet, slim profiles, recessed lighting.
- Built-in sefarim as ONE modest flush contemporary cabinet on a living-room wall that already has millwork — not a floor-to-ceiling library covering an entire façade, not a wall that splits kitchen from dining.
- Simple modern Shabbat table in living only.
- No screens in any room (TV, monitor, laptop).
`.trim();

const HAREDI_STAGING: Record<"overview" | FloorplanRoomKind, string> = {
  overview:
    "STAGE BY ROOM KIND: Shabbat table and ONE modest sefarim cabinet ONLY in living/dining — not a full-wall library. Kitchen = kosher family kitchen in use (fruit bowl, kettle) — copy the kitchen sink from the plan, copy island stool count, no extra sinks, no second kitchen. Bathroom = wet room with towels. Bedrooms copy the drawn bed rectangles (one stays one twin; two stay two twins with a gap; empty ממ\"ד stays empty). Office = desks and chairs in THAT one room only — never clone a second office, never beds, never a cooktop. Storage / חדר שירות = washer or shelves only, never a toilet. No TV or monitor in any room. Do NOT put a dining table or bookshelves in a bathroom or kitchen.",
  living:
    "STAGING (living / dining only): one modest contemporary sefarim cabinet (flush millwork, unmarked spines) — not a floor-to-ceiling library wall that fills a façade or splits kitchen from dining; a simple modern Shabbat table with challah covers and candles — not antique, not carved, not museum Judaica. Warm 2020s family seating with an area rug, throw pillows, and a coffee-table tray. Copy the dining table size and chair count from the plan. No TV, no monitor, no laptop. No heavy velvet drapes.",
  kitchen:
    "STAGING (kitchen only): kosher family kitchen that is in use — fruit bowl, kettle, dish towel. Copy the sink from the plan (double-bowl = one fixture). Copy island stool count from the half-circles. No extra sink, no island sink unless drawn. No mixed meat/dairy serving display. Do NOT place a Shabbat table, sefarim wall, sofa, or bed in the kitchen.",
  bathroom:
    "STAGING (bathroom only): sanitary wet room — toilet, basin, and tub/shower as on the plan MUST be visible. Never an empty tiled box. Modest tiles, folded towels. Do NOT place a Shabbat table, bookshelves, sofa, or kitchen cabinets in this room.",
  bedroom:
    "STAGING (bedroom only): copy drawn bed rectangles — one twin or two twins with a gap in the drawn positions. Leave walkable floor. Do not pack extra beds. Desk if drawn: books and a lamp only, never a computer. No double bed. No TV, no dining table, no kitchen.",
  mmd:
    "STAGING (safe room / ממ\"ד only): copy the drawing. If empty, leave empty — no beds. If beds are drawn, twins with a gap, never a double. Heavy door if drawn. Desk if drawn: books and a lamp only, never a computer. No TV, no dining table.",
  balcony:
    "STAGING (balcony/terrace only): outdoor space matching the plan, one planter if the terrace is large enough. Keep it open to the sky if the drawing shows an open terrace (sukkah-capable). No living-room furniture, no kitchen, no bathroom fixtures.",
  circulation: "STAGING (circulation): stair/core only. No dining table, no bed.",
  utility:
    "STAGING (utility): storage/laundry / חדר שירות only — washer or shelves. NEVER a toilet, basin, or bathtub. This is not שירותים. No dining table, no kitchen, no beds.",
  other: "STAGING: furniture that matches this enclosed room only. Office = desks, never a kitchen, never beds. Do not import another room's furniture.",
};

const GENERAL_STAGING: Record<"overview" | FloorplanRoomKind, string> = {
  overview:
    "STAGE BY ROOM KIND from the plan: kitchen fixtures as drawn — exactly the printed kitchen count, no second kitchen in an office, L-run stays L; bathroom wet fixtures as drawn (never empty tiled rooms); bedrooms copy bed count from the plan; living keeps the open volume; closets have closed doors; the single office stays desks. Do not clone a second office. חדר שירות is laundry, never a toilet. Do not put a dining table in a bathroom or kitchen.",
  living:
    "STAGING (living / dining only): copy the dining table and seating from the plan symbols. Keep the living/kitchen opening if drawn. Do not add a partition wall. No bed.",
  kitchen:
    "STAGING (kitchen only): copy the drawn run and island. Sink only where drawn (double-bowl = one fixture). No island sink unless drawn. No bed, no dining table from the living room.",
  bathroom:
    "STAGING (bathroom only): copy tub/toilet/sink from the plan — they MUST be visible. Never an empty tiled bathroom. Do not add a walk-in shower unless a tray is drawn. No dining table, sofa, or kitchen.",
  bedroom:
    "STAGING (bedroom only): copy bed count and placement from the plan — one drawn bed stays one bed; two twins stay two twins with the drawn gap. Do not replace twins with a double. No kitchen.",
  mmd:
    "STAGING (safe room / ממ\"ד only): copy the drawn bed if present. Small protected window, not a sliding terrace wall. No kitchen.",
  balcony:
    "STAGING (balcony/terrace only): outdoor space matching the plan. Keep it open to the sky if the drawing shows an open terrace. No kitchen, no bathroom fixtures.",
  circulation: "STAGING (circulation): stair/core only. No dining table, no bed.",
  utility:
    "STAGING (utility): storage/laundry / חדר שירות only — washer or shelves. NEVER a toilet, basin, or bathtub. This is not שירותים. No dining table, no kitchen, no beds.",
  other: "STAGING: furniture that matches this enclosed room only. Office = desks, never a kitchen. Do not import another room's furniture.",
};

export const LIVED_IN_STAGING = `
LIVED-IN HOME (every view — not a vacant show unit):
- Photograph a family apartment that is already lived in. Forbidden: sterile CAD dollhouse, empty contractor white-box, furniture catalog with bare counters, empty tiled bathrooms, closets without doors.
- Lighting and warmth are specified in their own section below; follow it.
- Layered textiles in the rooms they belong: area rug under living seating, pillows and a throw on sofas and beds, bath towels on a rail, curtains only on windows that exist in the plan.
- Small life props: fruit bowl, kettle and cutting board on kitchen counters; place setting or candles on the dining table; bedside lamp and folded blanket in bedrooms; one potted plant by a real window or on a drawn terrace.
- Props and textiles only on furniture that exists on the sales sheet. Do not add a sofa, dining table, TV, media wall, extra vanity, walk-in shower, double sink, or extra desk that is not drawn.
- Visible wood grain and fabric weave — photoreal, not plastic CGI. Do not clutter every surface.
- Do not add people. Do not hide walls, doors, or windows. Do not add extra rooms or openings.
`.trim();

export const WARM_INVITING_LIGHT = `
LIGHT AND WARMTH (every view — a brochure hero shot, not a survey drawing):
- Golden-hour interior light, warm white balance near 3000K. Honey highlights on wood, plaster that reads warm cream rather than grey, soft amber pooling across the floor.
- Lamps are staging, not architecture: a pendant over the dining table, under-cabinet strips in the kitchen, bedside lamps, a floor lamp beside the living seating, warm cove light along millwork. Add them and switch them ON — they are expected in a brochure still and they do not change the plan.
- Each lit fixture must read as lit: a visible warm halo on the wall or ceiling behind it and a soft pool of amber spilling onto the floor or counter below. Light that leaves no pool has not been rendered.
- The floor must not be one flat even sheet of beige. Break it with warm pools under the fixtures, daylight falling from the drawn windows, and soft shadow between them.
- Daylight arrives through the drawn windows and terraces as warm, diffused light with gentle directional shadows. No blown highlights, no cold overcast flatness, no harsh raking sun that washes out the floor plate.
- Materials read warm and tactile: honey and caramel oak, warm cream stone, brushed brass or warm nickel, textiles with visible weave and soft drape.
- The result should feel like a home someone wants to walk into: rich, layered, glowing. Avoid grey-blue shadow, cold white LED, flat grey ambient occlusion, uniform brightness edge to edge, and the over-bright empty look of a showroom.
- Warmth is finish and lighting ONLY. It never changes walls, openings, fixtures, furniture counts, or positions.
`.trim();

const NO_LAYOUT_CHANGE =
  "Finishes and furniture only. Do not change walls, doors, windows, or room proportions. Do not invent openings, arches, or extra rooms.";

function kit(partial: FloorplanVizStyleKit): FloorplanVizStyleKit {
  if (partial.audience !== "haredi") return partial;
  return applyHarediModesty(partial);
}

export function applyHarediModesty(input: FloorplanVizStyleKit): FloorplanVizStyleKit {
  if (input.audience !== "haredi") return input;
  let promptBlock = input.promptBlock.trim();
  if (!promptBlock.includes("MODESTY (global")) {
    promptBlock = `${promptBlock}\n\n${HAREDI_MODESTY_PROMPT}`;
  }
  if (!promptBlock.includes("AESTHETIC (haredi")) {
    promptBlock = `${promptBlock}\n\n${HAREDI_INNOVATIVE_PROMPT}`;
  }
  return {
    ...input,
    audience: "haredi",
    promptBlock,
  };
}

export const SCALE_LOCK = `
SCALE / LIVABILITY (every view — non-negotiable):
- Furniture must leave walkable floor. This is a family apartment, not a hostel or dormitory.
- Copy bed rectangles from the plan. Do not add extra beds to make rooms look "full".
- A bedroom whose printed width fits one bed symbol gets ONE twin. Two twins only where two rectangles are drawn.
- An empty ממ"ד stays empty. An office is desks, never beds.
- Island stools = the drawn half-circle count. Dining chairs = the chairs around the drawn table.
- Do not invent a floor-to-ceiling library covering an entire wall. Do not oversize the dining table or island relative to the symbols.
- Closets stay as the hatched blocks, rendered as cabinets with CLOSED doors. Do not turn every wall into millwork. Do not turn a closet into an open walk-in.
`.trim();

export const CONTENTS_LOCK = `
CONTENTS (every view — non-negotiable):
- Furniture and fixtures come from the original sales sheet, not from interior-design memory.
- The wall-tracing attachment is WALLS ONLY and looks empty. Do not copy that emptiness into rooms that have furniture symbols on the sheet. ממ"ד that is drawn empty stays empty.
- Copy each room's listed contents. Do not merge an office into a bedroom or a bedroom into a bathroom.
- Desk-only rooms (no bed) must match the office count. A second room of desks without a bed is a failed clone — that room is a bedroom if a bed rectangle is drawn.
- Do not add a TV, media wall, extra sofa, second dining table, hallway vanity, double sink, glass walk-in shower, or extra desk unless that symbol is drawn.
- Bathroom fixtures follow the pans and MUST be visible: bathtub stays a bathtub, toilet pan stays a toilet, oval basin stays a basin. Never an empty tiled wet room. No extra shower stall. Guest WC keeps its drawn basin.
- Storage / laundry / חדר שירות / ח.שרות stay a washer or shelves. One washer unless two are drawn — no invented stacked dryer. NEVER a toilet, basin, bathtub, or shower. Hebrew שירות here means service/laundry, not שירותים. Do not restage them as bedrooms or as a WC.
`.trim();

export const OVERVIEW_FURNITURE_LOCK = `
FURNITURE LOCK (cutaway / isometric — non-negotiable):
- Place a bed ONLY inside rooms whose kind is bedroom or mmd. Never put a bed in living, kitchen, hall, office, storage, stair, or bathroom.
- Living = sofa + dining table as drawn (rug and table styling allowed). No bed in the living room or corridor.
- Kitchen = counters and island as drawn (small kitchen props allowed). No bed. No extra sink. Exactly the kitchen count from the inventory — never a second cooktop in another room.
- Office / study = desks and chairs in the ONE listed office. No second office. No cooktop, no kitchen sink, no beds.
- Storage / laundry / חדר שירות = washer or shelves only. No kitchen, no toilet, no basin, no bathtub, no shower, no beds. This is not שירותים.
- Stair = treads and landing only. If inventory says no internal stair, do not model a stair at all.
- Entrance / hall = no bed and no extra bedroom. No entrance sink unless the plan draws a basin.
- Copy closet blocks as cabinets with closed doors. Copy island stools, dining-table size, and bed rectangles from the drawing symbols. Do not pack extra beds into a narrow room.
- Omit CAD entrance arrows. Show wet fixtures in every bathroom that has pans on the sheet.
`.trim();

/** גימורים לכל תמונה + בימוי רהוט רק לסוג החלל של המבט */
export function stylePromptForView(
  kit: FloorplanVizStyleKit,
  view: { kind: "overview" | "isometric" | "interior"; roomKind?: FloorplanRoomKind },
): string {
  const parts = [kit.promptBlock.trim()];
  parts.push(PLAN_TRACE_LOCK);
  parts.push(KITCHEN_SINK_LOCK);
  parts.push(SCALE_LOCK);
  parts.push(CONTENTS_LOCK);
  parts.push(PRESENTATION_LOCK);
  if (kit.id !== "developer_white") {
    parts.push(LIVED_IN_STAGING);
    // developer_white is deliberately a bare contractor handover, so it stays cold.
    parts.push(WARM_INVITING_LIGHT);
  }
  if (kit.audience === "haredi") {
    if (!kit.promptBlock.includes("MODESTY (global")) parts.push(HAREDI_MODESTY_PROMPT);
    if (!kit.promptBlock.includes("AESTHETIC (haredi")) parts.push(HAREDI_INNOVATIVE_PROMPT);
    parts.push(HAREDI_BED_PROMPT);
  }
  if (view.kind === "overview" || view.kind === "isometric") {
    parts.push(kit.audience === "haredi" ? HAREDI_STAGING.overview : GENERAL_STAGING.overview);
    parts.push(OVERVIEW_FURNITURE_LOCK);
  } else {
    const kind = view.roomKind ?? "other";
    const staging = kit.audience === "haredi" ? HAREDI_STAGING : GENERAL_STAGING;
    parts.push(staging[kind] ?? staging.other);
  }
  return parts.filter(Boolean).join("\n\n");
}

export const FLOORPLAN_VIZ_PRESETS: Record<FloorplanVizPresetId, FloorplanVizStyleKit> = {
  contemporary: {
    id: "contemporary",
    audience: "general",
    labelHe: "עכשווי ישראלי",
    labelEn: "Contemporary Israeli",
    labelRu: "Современный израильский",
    summaryHe: "פרקט בהיר, אור חם, בית שגרים בו",
    colors: ["#f5f0e8", "#d6c4a8", "#6b7c6a", "#2f3430"],
    materialsHe: "פרקט אלון בהיר · קירות טיח לבן · שיש קרם במטבח",
    promptBlock: [
      "STYLE KIT — contemporary Israeli apartment:",
      "Light oak parquet, white plaster walls, cream stone kitchen counters, matte nickel hardware.",
      "Warm late-afternoon daylight, contemporary sofas with a throw, a lived-in dining table, not empty showroom staging.",
      "TV only if the plan draws a TV or media unit. Do not invent a media-wall partition.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  },
  luxury: {
    id: "luxury",
    audience: "general",
    labelHe: "פרמיום / יוקרתי",
    labelEn: "Luxury",
    labelRu: "Премиум",
    summaryHe: "שיש ואבן, מטבח גבוה, תאורת נסתרת",
    colors: ["#ece8e1", "#b7a48a", "#5c5348", "#1f1c19"],
    materialsHe: "שיש פורצלן · אבן טבעית · גופי תאורה שקועים · מטבח גבוה",
    promptBlock: [
      "STYLE KIT — luxury Israeli apartment:",
      "Large-format porcelain or marble, fluted wood, full-height kitchen, recessed cove lighting, slim black or brass profiles.",
      "High-end lived-in furniture: a rug, table styling, lamps on. Soft evening-neutral daylight, not a nightclub.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  },
  scandi: {
    id: "scandi",
    audience: "general",
    labelHe: "סקנדינבי-מינימל",
    labelEn: "Scandinavian minimal",
    labelRu: "Скандинавский минимализм",
    summaryHe: "לבן, עץ בהיר, קווים נקיים",
    colors: ["#f7f7f4", "#e4ddd2", "#a3b5a2", "#2c2c2c"],
    materialsHe: "עץ ליבנה · קירות לבנים · טקסטיל פשתן",
    promptBlock: [
      "STYLE KIT — Scandinavian minimal:",
      "White walls, pale birch wood, linen textiles, a few plants and a wool rug — airy, not a vacant loft.",
      "Soft north daylight, no gold bling, no heavy drapes.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  },
  jerusalem_stone: {
    id: "jerusalem_stone",
    audience: "general",
    labelHe: "אבן ירושלמי",
    labelEn: "Jerusalem stone",
    labelRu: "Иерусалимский камень",
    summaryHe: "אבן טבעי חם, תריסים — בלי להמציא פתחים",
    colors: ["#e8dcc8", "#c9b396", "#8a7358", "#4a4036"],
    materialsHe: "אבן ירושלמית · עץ אלון · תריסי עץ רק אם יש חלון בתוכנית",
    promptBlock: [
      "STYLE KIT — Jerusalem stone / Eretz-Israel:",
      "Warm limestone or Jerusalem-stone wall cladding, oak wood, terracotta or stone floors.",
      "Wooden shutters ONLY on windows that exist in the attached plan. Do NOT add arches, extra windows, or decorative openings.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  },
  developer_white: {
    id: "developer_white",
    audience: "general",
    labelHe: "דירת קבלן",
    labelEn: "Developer white box",
    labelRu: "Квартира от застройщика",
    summaryHe: "קירות לבנים, ריהוט דליל לקנה־מידה, מראה מכירה",
    colors: ["#f4f4f2", "#e0e0dc", "#b0b0aa", "#4d4d4d"],
    materialsHe: "קירות גבס לבנים · ריצוף פורצלן אפור בהיר · מטבח סטנדרטי",
    promptBlock: [
      "STYLE KIT — Israeli developer / contractor finish (white box):",
      "Plain white walls, light grey porcelain tile, basic white kitchen cabinets, almost empty rooms.",
      "Only a few pieces of anonymous scale furniture. No luxury staging, no heavy décor.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  },
  haredi_classic: kit({
    id: "haredi_classic",
    audience: "haredi",
    labelHe: "חרדי חדשני",
    labelEn: "Haredi innovative",
    labelRu: "Инновационный хареди",
    summaryHe: "עכשווי וחם, ארון ספרים מובנה, שולחן שבת מודרני — לא עתיק",
    colors: ["#c4a574", "#f4efe6", "#5c6b5a", "#2c332c"],
    materialsHe: "אלון חם עכשווי · ריצוף גדול · תאורה שקועה · ארון ספרים מובנה",
    promptBlock: [
      "STYLE KIT — innovative contemporary haredi family apartment (warm oak, NOT antique):",
      "2020s Israeli architecture. Clean millwork, warm contemporary oak — not carved baroque, not Victorian, not shtetl.",
      "Large-format warm-toned tile or honey parquet, warm recessed lighting, slim profiles.",
      "Built-in flush sefarim cabinet in living (modest, not a full-wall library). Simple modern Shabbat table — not a museum piece, not gold-ornate.",
      "Warm family home at golden hour: rug, pillows, fruit bowl in the kitchen, every lamp glowing. NOT a vacant 3D model.",
      "NO antique furniture, NO heavy velvet drapes, NO carved period wood.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  }),
  haredi_modern: kit({
    id: "haredi_modern",
    audience: "haredi",
    labelHe: "חרדי מינימל חדשני",
    labelEn: "Haredi innovative minimal",
    labelRu: "Минимальный инновационный хареди",
    summaryHe: "בהיר, קווים נקיים, צנוע וחדשני — לא עתיק",
    colors: ["#f6f1e8", "#cbb892", "#6f7d6a", "#2f3a32"],
    materialsHe: "אלון בהיר · טיח לבן · פרופילים דקים · ספרים מובנים",
    promptBlock: [
      "STYLE KIT — innovative minimal haredi apartment (NOT antique):",
      "Pale oak, warm off-white walls, slim profiles, lots of daylight. 2020s Israeli modest-modern — not a secular design-magazine loft, not a period interior.",
      "Lived-in: linen throw, a plant, lamps on. NOT an empty white model.",
      "NO heavy drapes, NO carved wood, NO baroque, NO museum Judaica.",
      NO_LAYOUT_CHANGE,
    ].join(" "),
  }),
};

export function isFloorplanVizPresetId(value: string): value is FloorplanVizPresetId {
  return (FLOORPLAN_VIZ_PRESET_IDS as readonly string[]).includes(value);
}

export function listFloorplanVizPresets(): FloorplanVizStyleKit[] {
  return FLOORPLAN_VIZ_PRESET_IDS.map((id) => FLOORPLAN_VIZ_PRESETS[id]);
}

export function floorplanVizStyleThumbSrc(id: FloorplanVizStyleId): string | null {
  if (!isFloorplanVizPresetId(id)) return null;
  return `/floorplan-viz/styles/${id}.jpg`;
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

function asColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!HEX.test(s)) return null;
  return s.startsWith("#") ? s.toLowerCase() : `#${s.toLowerCase()}`;
}

export function parseCustomStyleKit(raw: unknown): FloorplanVizStyleKit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const promptBlock = String(r.promptBlock ?? "").trim();
  if (!promptBlock) return null;
  const audience: FloorplanVizAudience = r.audience === "haredi" ? "haredi" : "general";
  const colors = Array.isArray(r.colors)
    ? r.colors.map(asColor).filter((c): c is string => c != null).slice(0, 6)
    : [];
  const kitRow: FloorplanVizStyleKit = {
    id: "custom",
    audience,
    labelHe: String(r.labelHe ?? "סגנון אישי").slice(0, 80) || "סגנון אישי",
    labelEn: String(r.labelEn ?? "Custom style").slice(0, 80) || "Custom style",
    labelRu: String(r.labelRu ?? "Свой стиль").slice(0, 80) || "Свой стиль",
    summaryHe: String(r.summaryHe ?? "").slice(0, 200),
    colors,
    materialsHe: String(r.materialsHe ?? "").slice(0, 200),
    promptBlock: promptBlock.slice(0, 4000),
  };
  return applyHarediModesty(kitRow);
}

export function resolveFloorplanVizStyle(
  styleId?: string | null,
  customKit?: unknown,
): FloorplanVizStyleKit {
  if (styleId === "custom" || customKit != null) {
    const parsed = parseCustomStyleKit(customKit);
    if (parsed) return parsed;
  }
  if (styleId && isFloorplanVizPresetId(styleId)) return FLOORPLAN_VIZ_PRESETS[styleId];
  return FLOORPLAN_VIZ_PRESETS[DEFAULT_FLOORPLAN_VIZ_STYLE_ID];
}

export type CustomStyleAnswers = {
  freeText?: string;
  audience?: FloorplanVizAudience;
  mood?: "light" | "dark" | "luxury" | "developer";
  dominantColor?: string;
  mustHave?: string;
  mustNot?: string;
};

const MOOD_PROMPT: Record<NonNullable<CustomStyleAnswers["mood"]>, string> = {
  light: "Light wood, airy off-white walls, soft daylight.",
  dark: "Dark stained wood, warmer lamps, heavier textiles.",
  luxury: "Premium stone, full-height millwork, recessed lighting.",
  developer: "Plain contractor white-box finishes, sparse anonymous furniture.",
};

/** בניית סל בלי LLM — משמש גם כגיבוי לסייען */
export function buildCustomStyleKitFromAnswers(answers: CustomStyleAnswers): FloorplanVizStyleKit {
  const audience: FloorplanVizAudience = answers.audience === "haredi" ? "haredi" : "general";
  const mood = answers.mood && MOOD_PROMPT[answers.mood] ? answers.mood : "light";
  const color = asColor(answers.dominantColor);
  const free = String(answers.freeText ?? "").trim().slice(0, 800);
  const must = String(answers.mustHave ?? "").trim().slice(0, 400);
  const mustNot = String(answers.mustNot ?? "").trim().slice(0, 400);
  const parts = [
    "STYLE KIT — custom user briefing:",
    free || "Follow the mood and constraints below.",
    audience === "haredi" && mood === "dark"
      ? "Warm contemporary dark oak millwork — 2020s Israeli, not Victorian or carved antiques."
      : MOOD_PROMPT[mood],
    audience === "haredi"
      ? "Contemporary 2020s Israeli modest interior — innovative, not antique. No carved period furniture, no heavy velvet, no museum Judaica."
      : "",
    color ? `Dominant accent colour hex ${color}.` : "",
    must ? `Must include: ${must}.` : "",
    mustNot ? `Must NOT include: ${mustNot}.` : "",
    NO_LAYOUT_CHANGE,
    "Furniture must not hide walls or openings. Copy fixture and furniture count from the plan. Stage a lived-in home — rugs, lamps, small props — only in the furniture that belongs in THIS view's room kind.",
  ].filter(Boolean);
  const summaryBits = [free, must].filter(Boolean);
  return applyHarediModesty({
    id: "custom",
    audience,
    labelHe: audience === "haredi" ? "סגנון אישי · חרדי" : "סגנון אישי",
    labelEn: audience === "haredi" ? "Custom · haredi" : "Custom style",
    labelRu: audience === "haredi" ? "Свой стиль · хареди" : "Свой стиль",
    summaryHe: (summaryBits.join(" · ") || "סל לפי בחירת המשתמש").slice(0, 200),
    colors: color ? [color] : ["#f5f0e8", "#6b7c6a", "#2f3430"],
    materialsHe: [MOOD_PROMPT[mood], must].filter(Boolean).join(" · ").slice(0, 200),
    promptBlock: parts.join(" "),
  });
}
