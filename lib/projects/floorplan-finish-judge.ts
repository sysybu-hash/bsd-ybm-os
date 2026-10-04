import sharp from "sharp";

import { parseModelJsonText } from "@/lib/ai-document-json";
import { getAnthropicModelCandidates, isAnthropicConfigured, isAnthropicEligibleForModelFallback } from "@/lib/ai-providers";
import { recordAiUsage, usageFromAnthropic } from "@/lib/ai-usage";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { recordAmbientFloorplanSpend } from "@/lib/projects/floorplan-spend";

/**
 * Did the painting change the flat?
 *
 * The general still audit judges a picture against a plan, and is told to
 * prefer false alarms; asked about a painting of a measured render it called
 * a single bed with a headboard double, run after run. This asks the narrower
 * question the painting answers to: the render beside the painting, and only
 * what the painting changed — a bed made wider, a second bed, a screen, words,
 * a room or a terrace that is not in the render, the plan turned.
 */

const log = createLogger("floorplan-finish-judge");

export type FinishComparison = {
  bedWidened: boolean;
  bedAdded: boolean;
  bedRemoved: boolean;
  furnitureAdded: boolean;
  /** Beds counted in each: a painting that counts otherwise has lost or made one. */
  bedsInRender: number;
  bedsInPainting: number;
  sofasInRender: number;
  sofasInPainting: number;
  /** Against the measured inventory: pieces the painting has beyond it, and ones it lacks. */
  extraPieces: string[];
  missingPieces: string[];
  /** A bed two people wide: two pillows side by side. */
  doubleBed: boolean;
  screenAdded: boolean;
  textAdded: boolean;
  spaceAdded: boolean;
  turnedOrMirrored: boolean;
  notes: string;
};

const INSTRUCTION = `
Image 1 is an exact architectural RENDER of an apartment seen from above. Image 2 is a PAINTING of that render: the same view repainted with photographic materials.
The painting may change surfaces, colours, textures, light, plants and small decor. It may NOT change the apartment.

Compare image 2 to image 1, bed by bed and room by room. Report only what the painting CHANGED:
- bedWidened: a bed in the painting is clearly wider than the same bed in the render (e.g. a one-person bed painted as a two-person bed, two pillows side by side where the render has one).
- bedAdded: the painting has a bed where the render has none.
- bedRemoved: a bed in the render is missing from the painting, or painted as something else (a sofa, a bench, a table).
- furnitureAdded: the painting has a sofa, armchair, table, bed, cabinet or appliance where the render has NO furniture at all. (Plants, cushions, throws, lamps and small decor on existing furniture do not count.)
- screenAdded: the painting adds a television, monitor or screen.
- textAdded: the painting adds letters, numbers, signs or logos.
- spaceAdded: the painting adds a room, terrace, balcony or outdoor area the render does not have, or opens a wall the render closes.
- turnedOrMirrored: the painting is rotated or mirrored relative to the render.
Also COUNT the beds in each image (a bed is a mattress with a pillow; a sofa has a back and arms): bedsInRender, bedsInPainting; and the sofas and armchairs: sofasInRender, sofasInPainting.
Judge by comparison, not by your idea of a typical flat.
{INVENTORY} If a bed has the same width in both images it is NOT widened, whatever its size.

Return JSON only:
{"bedWidened": false, "bedAdded": false, "bedRemoved": false, "furnitureAdded": false, "screenAdded": false, "textAdded": false, "spaceAdded": false, "turnedOrMirrored": false, "bedsInRender": 0, "bedsInPainting": 0, "sofasInRender": 0, "sofasInPainting": 0, "extraPieces": [], "missingPieces": [], "doubleBed": false, "notes": "one short sentence"}
`;

function imagePart(base64: string) {
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg", data: base64 } };
}

/**
 * The models that judge. A judge has to see a pillow: the fallback chain ends
 * on Haiku, which passed a painting with four sofas, a coffee table and an
 * island where the drawing has two sofas.
 */
const JUDGE_MODELS = ["claude-sonnet-4-6", "claude-opus-4-7"];

async function askClaude(key: string, content: unknown[], maxTokens: number): Promise<{ raw: Record<string, unknown>; model: string } | null> {
  for (const model of [...new Set([...JUDGE_MODELS, ...getAnthropicModelCandidates().filter((m) => !/haiku/i.test(m))])]) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, messages: [{ role: "user", content }] }),
      });
      const body = await res.text().catch(() => res.statusText);
      if (!res.ok) {
        if (isAnthropicEligibleForModelFallback(res.status, body)) {
          log.info("finish judge model unavailable; next", { model, status: res.status });
          continue;
        }
        log.warn("finish judge failed", { model, status: res.status });
        return null;
      }
      const parsed = JSON.parse(body) as { model?: string; content?: Array<{ type?: string; text?: string }> };
      recordAiUsage(parsed.model ?? model, usageFromAnthropic(parsed));
      return { raw: parseModelJsonText(parsed.content?.find((c) => c.type === "text")?.text ?? body), model };
    } catch (err: unknown) {
      log.warn("finish judge error", { model, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return null;
}

export async function compareFinishWithClaude(render: Buffer, painting: Buffer, inventory?: string): Promise<FinishComparison | null> {
  if (!isAnthropicConfigured()) return null;
  recordAmbientFloorplanSpend("audit", "claude-finish-judge");
  const key = env.ANTHROPIC_API_KEY!.trim();
  const instruction = INSTRUCTION.replace(
    "{INVENTORY}",
    inventory
      ? `The apartment's furniture as measured from the drawing, with where each piece stands on the plan (seen from above, north up):
${inventory}
Count the PAINTING against this list, place by place. extraPieces: every piece the painting has beyond it — a sofa, armchair, chair, table, coffee table, kitchen island, bed or wardrobe more than listed at a place (plants, rugs, cushions, lamps and small decor do not count). missingPieces: every listed piece the painting lacks. doubleBed: any bed painted two people wide, two pillows side by side.`
      : "extraPieces and missingPieces: leave empty. doubleBed: any bed painted two people wide, two pillows side by side.",
  );
  // Room-by-room lists and a note: 400 tokens cut the JSON off mid-list.
  const asked = await askClaude(key, [imagePart(render.toString("base64")), imagePart(painting.toString("base64")), { type: "text", text: instruction }], 1500);
  if (!asked) return null;
  const { raw, model } = asked;
  const count = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : -1);
  const out: FinishComparison = {
    bedWidened: raw.bedWidened === true,
    bedAdded: raw.bedAdded === true,
    bedRemoved: raw.bedRemoved === true,
    furnitureAdded: raw.furnitureAdded === true,
    bedsInRender: count(raw.bedsInRender),
    bedsInPainting: count(raw.bedsInPainting),
    sofasInRender: count(raw.sofasInRender),
    sofasInPainting: count(raw.sofasInPainting),
    extraPieces: Array.isArray(raw.extraPieces) ? raw.extraPieces.map(String).slice(0, 12) : [],
    missingPieces: Array.isArray(raw.missingPieces) ? raw.missingPieces.map(String).slice(0, 12) : [],
    doubleBed: raw.doubleBed === true,
    screenAdded: raw.screenAdded === true,
    textAdded: raw.textAdded === true,
    spaceAdded: raw.spaceAdded === true,
    turnedOrMirrored: raw.turnedOrMirrored === true,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 200) : "",
  };
  log.info("finish comparison", { model, ...out });
  return out;
}

/** A spot in the design where the layout has a piece: its box in the layout's frame, pixels. */
export type PieceSpot = { kind: string; place: string; x: number; y: number; w: number; h: number; chairs?: number };

const CHAIRS = `
This is a top-down picture of a dining table. Count every chair, stool and bench seat standing round it, one by one.
Return JSON only: {"chairs": 0}
`;

const SEATS = `
This is a top-down picture of a living room's seating. Count the separate sofas and armchairs, one by one: a long sofa is one piece, two sofas set end to end are two. Do not count cushions, side tables or coffee tables.
Return JSON only: {"chairs": 0}
`;

async function cropSpot(sized: Buffer, frame: { width: number; height: number }, s: PieceSpot, pad: number) {
  const left = Math.max(0, s.x - pad);
  const top = Math.max(0, s.y - pad);
  const width = Math.min(frame.width - left, s.w + 2 * pad);
  const height = Math.min(frame.height - top, s.h + 2 * pad);
  const crop = await sharp(sized).extract({ left, top, width, height }).resize(420, 420, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  return imagePart(crop.toString("base64"));
}

const SPOTS = `
Each image is a crop of a top-down picture of an apartment, centred on one spot. For each image, list every piece that stands in its MIDDLE HALF (the centre area, not the margins), in these words:
bed, sofa, armchair, ottoman, chair, dining table, coffee table, side table, lamp, wardrobe, cabinet, kitchen counter, kitchen island, toilet, bath, shower, basin, television, plant, rug, empty floor, wall, other.
Return JSON only, one list per image in order: {"answers": [["bed", "wall"], ["empty floor"], ...]}
`;

/** What each layout piece may be seen as in the design. */
const SEEN_AS: Record<string, string[]> = {
  beds: ["bed"],
  sofas: ["sofa"],
  // A seat for one is the designer's to style: a pouf is one.
  armchairs: ["armchair", "sofa", "chair", "ottoman", "other"],
  "dining tables": ["dining table", "coffee table"],
  // A WC the layout draws small, in its wall's shadow, the design may draw as
  // any sanitary piece; a bed, a sofa or open floor there is what it may not.
  toilets: ["toilet", "basin", "bath", "shower", "cabinet", "wall", "other"],
};

/**
 * A kitchen run is looked for only as something there: cut to its spot, a run
 * against the wall reads as the wall and an island with its stools as a
 * table and chairs. What counts is that it was not taken away — דירה 22's
 * island came back as open floor.
 */
const GONE = new Set(["empty floor", "rug", "plant"]);

/** What a design may put on the layout's open floor: decor, never furniture. */
const DECOR = new Set(["empty floor", "rug", "plant", "lamp", "side table", "wall", "other"]);

/**
 * Each piece the layout has, looked for where it stands in the design: the
 * design cut to that spot, and a call shown the crops alone asked what is at
 * each centre. Shown the whole flat, judges counted beds as one and missed an
 * added sofa; a crop has one thing in the middle. Answers the pieces missing,
 * or null when nobody answered.
 */
export async function checkSpotsWithClaude(design: Buffer, layout: Buffer, spots: PieceSpot[]): Promise<string[] | null> {
  const checked = spots.filter((s) => (SEEN_AS[s.kind] || s.kind === "open floor" || s.kind === "kitchen counters") && s.w > 4 && s.h > 4);
  const sets = spots.filter((s) => (s.kind === "dining set" || s.kind === "seating group") && s.chairs != null && s.w > 4 && s.h > 4);
  if (checked.length === 0) return [];
  if (!isAnthropicConfigured()) return null;
  recordAmbientFloorplanSpend("audit", "claude-finish-spots");
  const meta = await sharp(layout).metadata();
  const frame = { width: meta.width ?? 0, height: meta.height ?? 0 };
  const sized = await sharp(design).resize(frame.width, frame.height, { fit: "fill" }).toBuffer();
  // Open floor with half a square round it, so the crop's middle half — what
  // the question looks at — is the square itself, to the wall it stands
  // against; a piece with room round it, for a design that moved it a little.
  const crops = await Promise.all(
    checked.map((s) => cropSpot(sized, frame, s, s.kind === "open floor" ? Math.round(Math.max(s.w, s.h) / 2) : Math.max(40, Math.round(Math.max(s.w, s.h) * 0.35)))),
  );
  // Each dining set's chairs, counted by a call of its own: asked alongside
  // the spots, the count came back 4 for a table with eight round it.
  const key = env.ANTHROPIC_API_KEY!.trim();
  const counting = Promise.all(
    sets.map(async (s) => {
      const crop = await cropSpot(sized, frame, s, Math.round(Math.max(s.w, s.h) * 0.12));
      const said = await askClaude(key, [crop, { type: "text", text: s.kind === "seating group" ? SEATS : CHAIRS }], 200);
      const n = Number(said?.raw.chairs);
      return said && Number.isFinite(n) ? n : null;
    }),
  );
  // Eight crops a call: asked about thirty at once, the judge saw chairs on
  // squares of bare floor.
  const BATCH = 8;
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(crops.length / BATCH) }, (_, k) =>
      askClaude(key, [...crops.slice(k * BATCH, (k + 1) * BATCH), { type: "text", text: SPOTS }], 900),
    ),
  );
  const counts = await counting;
  if (batches.some((asked) => !asked || !Array.isArray(asked.raw.answers))) return null;
  const asked = batches[0];
  const answers = batches.flatMap((said, k) => {
    const list = (said!.raw.answers as unknown[]).map((a) => (Array.isArray(a) ? a : [a]).map((w) => String(w).toLowerCase().trim()));
    // A batch that answered for fewer crops than it was shown is padded, not shifted.
    const expected = Math.min(BATCH, crops.length - k * BATCH);
    return Array.from({ length: expected }, (_, i) => list[i] ?? []);
  });
  /** What is wrong at a spot, given what was seen there; null when nothing is. */
  const verdict = (s: PieceSpot, seen: string[]): string | null => {
    if (s.kind === "kitchen counters") {
      return seen.length > 0 && seen.every((w) => GONE.has(w)) ? `kitchen run at the ${s.place} (the design has ${seen.join(", ")} there)` : null;
    }
    if (s.kind === "open floor") {
      const added = seen.filter((w) => !DECOR.has(w));
      return added.length > 0 ? `open floor at the ${s.place} (the design added ${added.join(", ")} there)` : null;
    }
    return seen.some((w) => SEEN_AS[s.kind]!.includes(w)) ? null : `${s.kind.replace(/s$/, "")} at the ${s.place} (the design has ${seen.join(", ") || "nothing"} there)`;
  };
  // A spot that fails is asked about again on its own, and fails only if the
  // second look agrees: in a batch the judge listed a sofa and a lamp for a
  // crop whose middle is a bed.
  const failed = checked.map((s, i) => (verdict(s, answers[i] ?? []) ? i : -1)).filter((i) => i >= 0);
  const second = await Promise.all(
    failed.map(async (i) => {
      const said = await askClaude(key, [crops[i]!, { type: "text", text: SPOTS }], 200);
      const list = Array.isArray(said?.raw.answers) ? (said!.raw.answers as unknown[])[0] : null;
      return list == null ? null : (Array.isArray(list) ? list : [list]).map((w) => String(w).toLowerCase().trim());
    }),
  );
  const missing: string[] = [];
  failed.forEach((i, k) => {
    const again = second[k];
    // No second answer: the first stands.
    const wrong = verdict(checked[i]!, again ?? answers[i] ?? []);
    if (wrong) missing.push(wrong);
  });
  sets.forEach((s, i) => {
    const n = counts[i];
    if (n == null || n === s.chairs) return;
    missing.push(
      s.kind === "seating group"
        ? `sofas and armchairs at the ${s.place}: ${n} pieces (the layout has ${s.chairs})`
        : `dining table at the ${s.place} with ${n} chairs (the layout has ${s.chairs})`,
    );
  });
  log.info("finish spots", { model: asked?.model, checked: checked.length, calls: batches.length, missing });
  return missing;
}
