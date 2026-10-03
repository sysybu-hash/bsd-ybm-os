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
const JUDGE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-4-7", "claude-sonnet-4-6"];

export async function compareFinishWithClaude(render: Buffer, painting: Buffer, inventory?: string): Promise<FinishComparison | null> {
  if (!isAnthropicConfigured()) return null;
  recordAmbientFloorplanSpend("audit", "claude-finish-judge");
  const key = env.ANTHROPIC_API_KEY!.trim();
  const instruction = INSTRUCTION.replace(
    "{INVENTORY}",
    inventory
      ? `The apartment's furniture, room by room, as measured from the drawing:
${inventory}
Count the PAINTING against this list, room by room. extraPieces: every piece the painting has beyond it — a sofa, armchair, chair, table, coffee table, kitchen island, bed or wardrobe more than listed in a room (plants, rugs, cushions, lamps and small decor do not count). missingPieces: every listed piece the painting lacks. doubleBed: any bed painted two people wide, two pillows side by side.`
      : "extraPieces and missingPieces: leave empty. doubleBed: any bed painted two people wide, two pillows side by side.",
  );
  for (const model of [...new Set([...JUDGE_MODELS, ...getAnthropicModelCandidates().filter((m) => !/haiku/i.test(m))])]) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 400,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [imagePart(render.toString("base64")), imagePart(painting.toString("base64")), { type: "text", text: instruction }],
            },
          ],
        }),
      });
      const body = await res.text().catch(() => res.statusText);
      if (!res.ok) {
        if (isAnthropicEligibleForModelFallback(res.status, body)) continue;
        log.warn("finish comparison failed", { model, status: res.status });
        return null;
      }
      const parsed = JSON.parse(body) as { model?: string; content?: Array<{ type?: string; text?: string }> };
      recordAiUsage(parsed.model ?? model, usageFromAnthropic(parsed));
      const raw = parseModelJsonText(parsed.content?.find((c) => c.type === "text")?.text ?? body);
      const out: FinishComparison = {
        bedWidened: raw.bedWidened === true,
        bedAdded: raw.bedAdded === true,
        bedRemoved: raw.bedRemoved === true,
        furnitureAdded: raw.furnitureAdded === true,
        bedsInRender: Number.isFinite(Number(raw.bedsInRender)) ? Math.round(Number(raw.bedsInRender)) : -1,
        bedsInPainting: Number.isFinite(Number(raw.bedsInPainting)) ? Math.round(Number(raw.bedsInPainting)) : -1,
        sofasInRender: Number.isFinite(Number(raw.sofasInRender)) ? Math.round(Number(raw.sofasInRender)) : -1,
        sofasInPainting: Number.isFinite(Number(raw.sofasInPainting)) ? Math.round(Number(raw.sofasInPainting)) : -1,
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
    } catch (err: unknown) {
      log.warn("finish comparison error", { model, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return null;
}
