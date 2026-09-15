import { GoogleGenAI } from "@google/genai";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  getFloorplanVizModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-viz-generate");
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

export async function generateOneImage(
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

