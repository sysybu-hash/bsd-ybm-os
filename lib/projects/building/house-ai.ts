import sharp from "sharp";

import { parseModelJsonText } from "@/lib/ai-document-json";
import { recordAiUsage, usageFromGemini } from "@/lib/ai-usage";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import { getBlueprintAnalysisModelChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { paidAiAllowed, textCallAffordable } from "@/lib/projects/building/house-cost";
import type { HouseSiteLevelKey, HouseSiteLevels } from "@/lib/projects/building/house-yard";

/** What the vision model read for a house's booklet, and what of it the sheets bore out. */
export type HouseAiReport = {
  /** Each elevation's level marks: how many the model read, how many stand on the sheet's triangles. */
  levels: Array<{ title: string; read: number; kept: number; ok: boolean; why?: string; datum: number | null }>;
  /** Whose the elevations' faces are: the model's, verified, or the hand-set titles. */
  faces: { source: "ai" | "hand"; verified: boolean; titles: string[]; missing: string[]; checks: number; failures: string[]; /** The plan's sides no facade draws, for the booklet to name its own way. */ missingSides?: Array<"north" | "south" | "east" | "west"> };
  site: { values: HouseSiteLevels; from: Record<HouseSiteLevelKey, "ai" | "hand"> };
  yard: { shown: number; laid: number; named: Record<string, number> } | null;
};

/**
 * One look at a drawing by the vision model, its answer as JSON.
 *
 * The model reads and proposes; it measures nothing. Every caller checks what
 * comes back against the sheet's own lines before using any of it, and goes
 * on without it — null — when there is no key, no model answers, or the
 * answer is not JSON.
 */
export async function askDrawing(prompt: string, images: Buffer[]): Promise<Record<string, unknown> | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey || !paidAiAllowed() || !textCallAffordable(images.length)) return null;
  const { GoogleGenAI } = await import("@google/genai");
  const client = new GoogleGenAI({ apiKey });
  const parts = await Promise.all(
    images.map(async (img) => ({ inlineData: { mimeType: "image/jpeg", data: (await sharp(img).jpeg({ quality: 90 }).toBuffer()).toString("base64") } })),
  );
  for (const model of getBlueprintAnalysisModelChain()) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }],
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      recordAiUsage(model, usageFromGemini(res));
      // Answered, and billed: an empty answer is not asked of the next model.
      const text = res.text ?? "";
      return text.trim() ? parseModelJsonText(text) : null;
    } catch (err: unknown) {
      if (isLikelyGeminiModelUnavailable(err)) continue;
      return null;
    }
  }
  return null;
}

/** A box the model gave as [ymin, xmin, ymax, xmax] out of 1000, on a picture of `box`: its middle in page units. */
export function boxCentre(raw: unknown, box: { x: number; y: number; width: number; height: number }): { x: number; y: number } | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = raw as number[];
  return { x: box.x + (((x0! + x1!) / 2) * box.width) / 1000, y: box.y + (((y0! + y1!) / 2) * box.height) / 1000 };
}
